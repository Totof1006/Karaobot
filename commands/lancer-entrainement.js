const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d\'entraînement'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session || !session.connection) {
            return interaction.reply({ content: "❌ Session introuvable. Fais `/entrainement`.", ephemeral: true });
        }

        await interaction.reply("🎤 Analyse des titres et lancement du test...");

        for (let i = 0; i < session.songs.length; i++) {
            const trackText = session.songs[i];
            session.precisionTicks = 0;

            await interaction.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle(`🎶 Musique ${i + 1}`)
                    .setDescription(`Préparation de : **${trackText}**`)
                    .setColor(0xFF69B4)] 
            });

            // On lance la recherche et la lecture
            await new Promise(resolve => playAudio(session, trackText, resolve));

            // Calcul du score après la fin de la musique
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            await interaction.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle(`📊 Résultat : ${trackText}`)
                    .setDescription(`Précision : **${score}%**`)
                    .setColor(score >= 50 ? 0x57F287 : 0xED4245)] 
            });
        }
        await interaction.channel.send("🎉 **Session terminée !**");
    }
};
