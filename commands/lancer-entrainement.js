const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder().setName('lancer-test').setDescription('▶️ Lance la séquence'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        if (!session) return interaction.reply({ content: "❌ Session introuvable.", ephemeral: true });

        await interaction.reply("🎤 Analyse et lancement des pistes...");

        for (let i = 0; i < session.songs.length; i++) {
            const rawText = session.songs[i];
            let songName = `Piste ${i + 1}`;
            let targetUrl = "";

            // Nettoyage complet pour éviter le "undefined" des logs Railway
            if (rawText.includes('=')) {
                const parts = rawText.split('=');
                songName = parts[0].trim();
                targetUrl = parts.slice(1).join('=').trim(); // Gère les URL contenant des '='
            } else {
                targetUrl = rawText.trim();
            }

            // On vérifie le résultat avant d'appeler l'audio
            if (!targetUrl || !targetUrl.startsWith('http')) {
                await interaction.channel.send(`❌ Erreur format sur : **${rawText}** (URL non détectée)`);
                continue;
            }

            session.precisionTicks = 0;
            await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(`🎶 ${songName}`).setColor(0xFF69B4)] });

            // On attend la fin réelle
            await new Promise(resolve => {
                playAudio(session, targetUrl, resolve, (err) => {
                    interaction.channel.send(`⚠️ Erreur de lecture pour **${songName}**`);
                    resolve();
                });
            });

            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            await interaction.channel.send({ 
                embeds: [new EmbedBuilder()
                    .setTitle(`📊 Résultat : ${songName}`)
                    .setDescription(`Précision : **${score}%**`)
                    .setColor(score >= 50 ? 0x57F287 : 0xED4245)] 
            });
        }
        await interaction.channel.send("🎉 **Séquence terminée.**");
    }
};
