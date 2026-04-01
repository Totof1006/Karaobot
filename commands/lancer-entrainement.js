const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d\'entraînement'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);
        
        // Vérification de la connexion et de l'état
        if (!session || !session.connection) {
            return interaction.reply({ content: "❌ Session introuvable. Fais `/entrainement`.", ephemeral: true });
        }

        // On informe l'utilisateur que le test commence
        await interaction.reply({ content: "🎤 Analyse des titres et lancement du test...", ephemeral: true });

        for (let i = 0; i < session.songs.length; i++) {
            // Sécurité : Si l'utilisateur a supprimé la session entre deux musiques
            if (!global.trainingSessions.has(interaction.user.id)) break;

            const trackText = session.songs[i];
            session.precisionTicks = 0;

            const startEmbed = new EmbedBuilder()
                .setTitle(`🎶 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Lecture de : **${trackText}**`)
                .setColor(0xFF69B4)
                .setFooter({ text: "Le bot synchronise les paroles..." });

            await interaction.channel.send({ embeds: [startEmbed] });

            // On utilise la fonction playAudio (qui gère déjà play-dl en interne)
            // On attend la fin de la musique (resolve) avant de passer à la suivante
            await new Promise(resolve => {
                playAudio(session, trackText, () => {
                    resolve();
                });
            });

            // --- CALCUL DU SCORE ---
            // On ajuste le diviseur (350) selon tes tests de précision
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            
            const resultEmbed = new EmbedBuilder()
                .setTitle(`📊 Résultat : ${trackText}`)
                .setDescription(`Précision du chant : **${score}%**`)
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTimestamp();

            await interaction.channel.send({ embeds: [resultEmbed] });

            // Petite pause de 2 secondes entre les musiques pour laisser respirer le flux audio
            if (i < session.songs.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        await interaction.channel.send("🎉 **Session d'entraînement terminée !** Tu peux relancer avec `/entrainement`.");
    }
};
