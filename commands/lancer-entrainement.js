const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement (3 musiques)'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        if (!session) {
            return interaction.reply({ content: "❌ Aucune session d'entraînement trouvée. Tape `/entrainement` d'abord.", ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ content: "❌ Tu dois être dans ton salon vocal d'entraînement pour lancer le test.", ephemeral: true });
        }

        // 1. Connexion initiale
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        // Logs de surveillance pour Railway
        connection.on('stateChange', (oldState, newState) => {
            console.log(`[Vocal] Passage de ${oldState.status} à ${newState.status}`);
        });

        await interaction.reply({ content: "🚀 Connexion au salon en cours...", ephemeral: false });

        // 2. FIX : Attente de stabilisation (Délai + double vérification d'état)
        try {
            // Petit répit pour laisser le réseau Railway respirer
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Attente de l'état Signalling (le bot contacte Discord)
            await entersState(connection, VoiceConnectionStatus.Signalling, 5000);
            
            // Attente de l'état Ready (la connexion est stable et prête)
            await entersState(connection, VoiceConnectionStatus.Ready, 25000);
            
            console.log("✅ Connexion vocale établie et prête !");
        } catch (error) {
            console.error("❌ Échec de stabilisation :", error.message);
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            return interaction.followUp("❌ Erreur : Impossible de stabiliser la connexion vocale après 30s. Vérifie les permissions du salon.");
        }

        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            session.currentSongIndex = i;

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/3`)
                .setDescription(`Préparation : **${song.info}**\nDébut du chant dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // 3. Analyse vocale - On souscrit APRÈS stabilisation
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, (energy) => {
                session.precisionTicks++; 
            });

            await interaction.channel.send(`🎶 Lecture en cours : **${song.info}**`);
            
            await new Promise((resolve) => {
                playAudio(voiceChannel, song.url, () => {
                    resolve(); 
                }, (err) => {
                    interaction.channel.send(`❌ Erreur audio : ${err.message}`);
                    resolve();
                }, interaction.user.id);
            });

            // 4. Calcul du score REEL (Basé sur tes precisionTicks)
            // On divise par la durée (estimée à 2 ticks par seconde)
            const rawScore = Math.min(Math.round((session.precisionTicks / (song.duration * 2)) * 100), 100);
            const rating = rawScore > 80 ? "⭐ Divin" : rawScore > 50 ? "✅ Pas mal" : "📉 À bosser";

            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Chanteur : <@${interaction.user.id}>\nScore : **${rawScore}%**\nPrécision : **${rating}**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            if (i < session.songs.length - 1) {
                await interaction.channel.send("⏳ Petite pause de 10 secondes avant la suite...");
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        await interaction.channel.send("🎉 **Entraînement terminé !** Suppression du salon dans 20 secondes.");
        
        setTimeout(async () => {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            await interaction.channel.delete().catch(() => {});
            global.trainingSessions.delete(interaction.user.id);
        }, 20000);
    }
};
