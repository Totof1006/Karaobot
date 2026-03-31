const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder().setName('lancer-test').setDescription('▶️ Lance le test vocal'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session || !session.connection) return interaction.reply({ content: "❌ Session introuvable. Fais `/entrainement`.", ephemeral: true });

        await interaction.reply("🎤 Analyse des pistes et lancement...");

        for (let i = 0; i < session.songs.length; i++) {
            const rawText = session.songs[i];
            let songName = `Musique ${i + 1}`;
            let targetUrl = "";

            // Découpage ultra-sécurisé
            if (rawText.includes('=')) {
                const parts = rawText.split('=');
                songName = parts[0].trim();
                targetUrl = parts.slice(1).join('=').trim(); 
            } else {
                targetUrl = rawText.trim();
            }

            // Si targetUrl est vide ou undefined (vu dans les logs), on ignore proprement
            if (!targetUrl || !targetUrl.startsWith('http')) {
                await interaction.channel.send(`⚠️ Format invalide ignoré : **${rawText}**`);
                continue;
            }

            session.precisionTicks = 0;
            await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(`🎶 ${songName}`).setColor(0xFF69B4)] });

            // On attend la fin de playAudio
            await new Promise(resolve => playAudio(session, targetUrl, resolve, resolve));

            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            const scoreEmbed = new EmbedBuilder()
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Précision vocale : **${score}%**`)
                .setColor(score >= 50 ? 0x57F287 : 0xED4245);

            await interaction.channel.send({ embeds: [scoreEmbed] });
        }
        await interaction.channel.send("🎉 **Séquence d'entraînement terminée !**");
    }
};
