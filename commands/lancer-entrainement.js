const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder().setName('lancer-test').setDescription('▶️ Lance le test vocal'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session || !session.connection) return interaction.reply({ content: "❌ Fais /entrainement", ephemeral: true });

        await interaction.reply("🎤 Préparation de la séquence...");

        for (let i = 0; i < session.songs.length; i++) {
            const rawText = session.songs[i];
            let songName = `Musique ${i + 1}`;
            let targetUrl = "";

            // Découpage blindé (Gère le texte avec espaces et le "=")
            if (rawText.includes('=')) {
                const parts = rawText.split('=');
                songName = parts[0].trim();
                targetUrl = parts.slice(1).join('=').trim(); 
            } else {
                targetUrl = rawText.trim();
            }

            if (!targetUrl.startsWith('http')) continue;

            session.precisionTicks = 0; // Reset score
            await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(`🎶 ${songName}`).setColor(0xFF69B4)] });

            // Lecture attendue
            await new Promise(resolve => playAudio(session, targetUrl, resolve, resolve));

            // Score
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            const scoreEmbed = new EmbedBuilder()
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Précision : **${score}%**`)
                .setColor(score >= 50 ? 0x57F287 : 0xED4245);

            await interaction.channel.send({ embeds: [scoreEmbed] });
        }
        await interaction.channel.send("🎉 **Séquence terminée !**");
    }
};
