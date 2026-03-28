const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

// --- MODULE DE TEST ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement (3 musiques)'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        // ── 1. VÉRIFICATIONS DE SÉCURITÉ ─────────────────────────────────────
        if (!session) {
            return interaction.reply({ 
                content: "❌ Aucune session d'entraînement trouvée. Tape `/entrainement` d'abord.", 
                ephemeral: true 
            });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ 
                content: "❌ Tu dois être dans ton salon vocal d'entraînement pour lancer le test.", 
                ephemeral: true 
            });
        }

        // On informe l'utilisateur (ephemeral: false pour que le message reste visible)
        await interaction.reply({ content: "🚀 Connexion au salon et préparation du matériel...", ephemeral: false });

        // ── 2. CONNEXION VOCALE RENFORCÉE ────────────────────────────────────
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        try {
            // FIX : Augmentation du délai à 30s pour éviter l'erreur "Aborted"
            // On utilise une promesse de timeout pour garantir que le bot ne reste pas bloqué
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Ready, 30_000),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de connexion')), 30_500))
            ]);
            console.log("✅ Connexion vocale stabilisée !");
        } catch (error) {
            console.error("❌ Échec de stabilisation :", error.message);
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            
            // Message d'erreur précis basé sur tes logs
            return interaction.followUp({ 
                content: "❌ Impossible de stabiliser la connexion vocale après 30s. Vérifie mes permissions dans ce salon." 
            });
        }

        // ── 3. CYCLE D'ENTRAÎNEMENT ──────────────────────────────────────────
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            
            // Nettoyage propre du nom de la chanson
            const songName = song.info.split('=')[0].split('+')[0].trim();
            const songUrl = song.info.split('=')[1]?.trim() || "";

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Préparation : **${songName}**\nDébut du test dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            
            // Pause de préparation
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Initialisation de l'analyse vocale
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, (energy) => {
                session.precisionTicks++; 
            });

            await interaction.channel.send(`🎶 Lecture en cours : **${songName}**`);
            
            // Lecture audio via l'utilitaire
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => {
                    resolve(); 
                }, (err) => {
                    console.error("Erreur Audio:", err);
                    resolve();
                }, interaction.user.id);
            });

            // ── 4. CALCUL DU SCORE ───────────────────────────────────────────
            const duration = 180; // Base de calcul 3 minutes
            const rawScore = Math.min(Math.round((session.precisionTicks / (duration * 2)) * 100), 100);
            const rating = rawScore > 80 ? "⭐ Divin" : rawScore > 50 ? "✅ Pas mal" : "📉 À bosser";

            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Chanteur : <@${interaction.user.id}>\nScore : **${rawScore}%**\nVerdict : **${rating}**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            // Petite pause entre les musiques si ce n'est pas la dernière
            if (i < session.songs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // ── 5. FIN DE SESSION ────────────────────────────────────────────────
        await interaction.channel.send("🎉 **Séquence terminée !** Merci pour ton entraînement.");
        
        // On laisse 5 secondes avant de couper pour éviter les coupures brutes
        setTimeout(() => {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            // Note : On ne supprime pas la session ici pour laisser le temps au timer de 20min 
            // de faire son nettoyage de salon global défini dans entrainement.js
        }, 5000);
    }
};
