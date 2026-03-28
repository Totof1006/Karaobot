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
            return interaction.reply({ content: "❌ Rejoins ton salon vocal d'entraînement.", ephemeral: true });
        }

        await interaction.reply({ content: "🚀 Préparation de la voix...", ephemeral: false });

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch (error) {
            connection.destroy();
            return interaction.followUp("⚠️ Discord a refusé la connexion (Aborted). Réessaie.");
        }

        for (let i = 0; i < session.songs.length; i++) {
            const songName = session.songs[i].info.split('=')[0].trim();
            const songUrl = session.songs[i].info.split('=')[1]?.trim() || "";

            await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0xFF69B4).setTitle(`Musique ${i+1}`).setDescription(`Prêt : **${songName}**`)] });
            await new Promise(r => setTimeout(r, 8000));

            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            analyzeVoiceActivity(voiceStream, () => { session.precisionTicks++; });

            await interaction.channel.send(`🎶 Lecture : **${songName}**`);
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => resolve(), (err) => resolve(), interaction.user.id);
            });

            // Score indicatif
            const score = Math.min(Math.round((session.precisionTicks / 300) * 100), 100);
            await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("📊 Score").setDescription(`Score : **${score}%**`)] });

            if (i < session.songs.length - 1) await new Promise(r => setTimeout(r, 3000));
        }

        await interaction.channel.send("🎉 **Séquence terminée !**");
        setTimeout(() => { if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy(); }, 5000);
    }
};
