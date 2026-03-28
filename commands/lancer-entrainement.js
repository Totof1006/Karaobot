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

        await interaction.reply({ content: "🚀 Connexion et préparation du test...", ephemeral: false });

        // --- CONNEXION STABILISÉE ---
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        try {
            // On attend uniquement l'état READY (plus simple et robuste pour Railway)
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
            console.log("✅ Connexion vocale établie !");
        } catch (error) {
            console.error("❌ Échec de stabilisation :", error.message);
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            return interaction.followUp("❌ Impossible de stabiliser la voix. Vérifie que je peux parler dans ce salon.");
        }

        // --- BOUCLE DES MUSIQUES ---
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            
            // Extraction du nom (pour l'affichage)
            const songName = song.info.split('=')[0].split('+')[0].trim();
            const songUrl = song.info.split('=')[1]?.trim() || "";

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Préparation : **${songName}**\nDébut dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Analyse vocale
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, (energy) => {
                session.precisionTicks++; 
            });

            await interaction.channel.send(`🎶 Lecture en cours : **${songName}**`);
            
            // Lecture
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => {
                    resolve(); 
                }, (err) => {
                    console.error("Erreur Audio:", err);
                    resolve();
                }, interaction.user.id);
            });

            // Score (On simule une base de 180s si la durée n'est pas calculée)
            const duration = 180; 
            const rawScore = Math.min(Math.round((session.precisionTicks / (duration * 2)) * 100), 100);
            const rating = rawScore > 80 ? "⭐ Divin" : rawScore > 50 ? "✅ Pas mal" : "📉 À bosser";

            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Chanteur : <@${interaction.user.id}>\nScore : **${rawScore}%**\nPrécision : **${rating}**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            if (i < session.songs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // --- NETTOYAGE FINAL ---
        await interaction.channel.send("🎉 **Entraînement terminé !**");
        
        setTimeout(() => {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            global.trainingSessions.delete(interaction.user.id);
        }, 5000);
    }
};
