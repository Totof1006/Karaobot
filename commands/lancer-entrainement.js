const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d\'entraînement'),

    async execute(interaction) {
        // --- CORRECTION : On informe Discord que le traitement va prendre du temps ---
        // Utilisation de flags: [64] au lieu de ephemeral: true pour les nouveaux standards.
        // Cela donne 15 minutes au bot pour répondre au lieu de 3 secondes.
        await interaction.deferReply({ flags: [64] });

        const session = global.trainingSessions?.get(interaction.user.id);
        
        // Vérification de la connexion et de l'état
        if (!session || !session.connection) {
            return interaction.editReply({ content: "❌ Session introuvable. Fais `/entrainement`." });
        }

        // On informe l'utilisateur via editReply (puisqu'on a fait un deferReply)
        await interaction.editReply({ content: "🎤 Analyse des titres et lancement du test..." });

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

            // On envoie dans le salon car l'interaction principale est "occupée" par le defer
            await interaction.channel.send({ embeds: [startEmbed] });

            // On utilise la fonction playAudio (qui gère déjà play-dl et le volume de cache)
            // On attend la fin de la musique (resolve) avant de passer à la suivante
            await new Promise(resolve => {
                playAudio(session, trackText, () => {
                    resolve();
                });
            });

            // --- CALCUL DU SCORE ---
            // Note : precisionTicks est incrémenté dans le voiceReceiver
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            
            const resultEmbed = new EmbedBuilder()
                .setTitle(`📊 Résultat : ${trackText}`)
                .setDescription(`Précision du chant : **${score}%**`)
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTimestamp();

            await interaction.channel.send({ embeds: [resultEmbed] });

            // Petite pause de 2 secondes entre les musiques
            if (i < session.songs.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        await interaction.channel.send("🎉 **Session d'entraînement terminée !** Tu peux relancer avec `/entrainement`.");
        
        // On finalise l'interaction de l'utilisateur (ferme l'état "Le bot réfléchit")
        await interaction.editReply({ content: "✅ Test terminé avec succès." });
    }
};
