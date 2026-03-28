const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

module.exports = {
    data: new SlashCommandBuilder().setName('lancer-test').setDescription('▶️ Démarrer l\'entraînement'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session) return interaction.reply({ content: "❌ Fais `/entrainement` d'abord.", ephemeral: true });

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ content: "❌ Tu n'es pas dans le salon vocal.", ephemeral: true });
        }

        await interaction.reply({ content: "🚀 Stabilisation de la connexion...", ephemeral: false });

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        try {
            // Tentative de stabilisation sur 30 secondes
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (error) {
            console.error("❌ Erreur stabilisation Railway:", error.message);
            connection.destroy();
            return interaction.followUp("⚠️ Connexion interrompue par Discord (Aborted). Attends 2 secondes et relance la commande.");
        }

        for (let i = 0; i < session.songs.length; i++) {
            const songName = session.songs[i].info.split('=')[0].trim();
            const songUrl = session.songs[i].info.split('=')[1]?.trim() || "";

            await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0xFF69B4).setTitle(`Musique ${i+1}`).setDescription(`Prêt pour : **${songName}**`)] });
            await new Promise(r => setTimeout(r, 8000));

            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            analyzeVoiceActivity(voiceStream, () => { session.precisionTicks++; });

            await interaction.channel.send(`🎶 Lecture : **${songName}**`);
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => resolve(), (err) => resolve(), interaction.user.id);
            });

            const score = Math.min(Math.round((session.precisionTicks / 360) * 100), 100);
            await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("📊 Score").setDescription(`Score : **${score}%**`)] });

            if (i < session.songs.length - 1) await new Promise(r => setTimeout(r, 3000));
        }

        await interaction.channel.send("🎉 **Terminé !**");
        setTimeout(() => { if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy(); }, 5000);
    }
};
