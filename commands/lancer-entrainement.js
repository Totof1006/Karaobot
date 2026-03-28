const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

// --- MODULE DE LANCEMENT ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        if (!session) {
            return interaction.reply({ content: "❌ Fais `/entrainement` d'abord.", ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ content: "❌ Tu n'es pas dans le bon salon vocal.", ephemeral: true });
        }

        await interaction.reply({ content: "🚀 Stabilisation de la voix en cours...", ephemeral: false });

        // ── 1. CONNEXION VOCALE ANTI-ABORT ──────────────────────────────────
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        try {
            // Augmentation à 35s pour compenser les lenteurs Railway (image_aa2c42)
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Ready, 35_000),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Temps dépassé')), 35_500))
            ]);
        } catch (error) {
            console.error("❌ Échec de stabilisation :", error.message);
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
            return interaction.followUp("⚠️ La voix n'a pas pu se stabiliser (Operation Aborted). Réessaie une fois.");
        }

        // ── 2. BOUCLE DE LECTURE ─────────────────────────────────────────────
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            const songName = song.info.split('=')[0].trim();
            const songUrl = song.info.split('=')[1]?.trim() || "";

            await interaction.channel.send({ 
                embeds: [new EmbedBuilder().setColor(0xFF69B4).setTitle(`Musique ${i + 1}`).setDescription(`Préparation : **${songName}**`)] 
            });

            await new Promise(r => setTimeout(r, 10000));

            // Analyse et Lecture
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            analyzeVoiceActivity(voiceStream, () => { session.precisionTicks++; });

            await interaction.channel.send(`🎶 Lecture : **${songName}**`);

            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => resolve(), (err) => resolve(), interaction.user.id);
            });

            // Score simple
            const score = Math.min(Math.round((session.precisionTicks / 360) * 100), 100);
            await interaction.channel.send({ 
                embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`📊 Résultat`).setDescription(`Score : **${score}%**`)] 
            });

            if (i < session.songs.length - 1) await new Promise(r => setTimeout(r, 5000));
        }

        // ── 3. CLÔTURE ───────────────────────────────────────────────────────
        await interaction.channel.send("🎉 **Séquence terminée !**");
        setTimeout(() => {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        }, 5000);
    }
};
