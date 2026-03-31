const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder().setName('lancer-test').setDescription('▶️ Lance la séquence avec recherche auto'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session || !session.connection) return interaction.reply({ content: "❌ Fais /entrainement", ephemeral: true });

        await interaction.reply("🎤 Lancement de la séquence (recherche automatique active)...");

        for (let i = 0; i < session.songs.length; i++) {
            const searchText = session.songs[i]; // Plus besoin de split('=') !

            session.precisionTicks = 0;
            await interaction.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle(`🎶 Recherche : ${searchText}`)
                    .setColor(0xFF69B4)
                    .setFooter({ text: "Le bot cherche la meilleure version sur YouTube..." })] 
            });

            // On envoie le texte brut à playAudio qui s'occupe de la recherche
            await new Promise(resolve => playAudio(session, searchText, resolve, resolve));

            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            await interaction.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle(`📊 Résultat : ${searchText}`)
                    .setDescription(`Précision : **${score}%**`)
                    .setColor(score >= 50 ? 0x57F287 : 0xED4245)] 
            });
        }
        await interaction.channel.send("🎉 **Séquence terminée !**");
    }
};
