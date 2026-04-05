const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d\'entraînement'),

    async execute(interaction) {
        // ✅ Utilisation de flags: 64 (nombre entier sans crochet) pour le standard v14
        // On prévient Discord que le traitement peut être long (jusqu'à 15min)
        await interaction.deferReply({ flags: 64 });

        const session = global.trainingSessions?.get(interaction.user.id);
        
        // Vérification de la session et de la présence d'une connexion vocale active
        if (!session || !session.connection) {
            return interaction.editReply({ content: "❌ Session introuvable ou bot non connecté. Fais `/entrainement` d'abord." });
        }

        // Vérification que la liste des chansons n'est pas vide pour éviter l'erreur Invalid URL
        if (!session.songs || session.songs.length === 0) {
            return interaction.editReply({ content: "❌ Ta liste de chansons est vide. Relance `/entrainement`." });
        }

        await interaction.editReply({ content: "🎤 Analyse des titres et lancement du test..." });

        for (let i = 0; i < session.songs.length; i++) {
            // Sécurité : Si la session a été nettoyée entre temps
            if (!global.trainingSessions.has(interaction.user.id)) break;

            const trackText = session.songs[i];
            
            // Initialisation des données de score pour cette piste
            session.precisionTicks = 0;

            const startEmbed = new EmbedBuilder()
                .setTitle(`🎶 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Lecture de : **${trackText}**`)
                .setColor(0xFF69B4)
                .setFooter({ text: "Le bot synchronise les paroles..." });

            // Envoi dans le salon textuel (le deferReply occupe déjà la réponse privée)
            await interaction.channel.send({ embeds: [startEmbed] });

            // ✅ Gestion robuste de la lecture
            await new Promise(resolve => {
                // On définit un timeout de sécurité (ex: 10 minutes) pour ne pas bloquer le bot
                // si playAudio n'appelle jamais le callback onFinish
                const safetyTimeout = setTimeout(() => {
                    console.error(`⚠️ Timeout de sécurité pour : ${trackText}`);
                    resolve();
                }, 600000); 

                playAudio(session, trackText, () => {
                    clearTimeout(safetyTimeout);
                    resolve();
                });
            });

            // --- CALCUL DU SCORE ---
            // Calcul basé sur les ticks de détection vocale
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);
            
            const resultEmbed = new EmbedBuilder()
                .setTitle(`📊 Résultat : ${trackText}`)
                .setDescription(`Précision du chant : **${score}%**`)
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTimestamp();

            await interaction.channel.send({ embeds: [resultEmbed] });

            // Pause de transition entre les musiques
            if (i < session.songs.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        await interaction.channel.send("🎉 **Session d'entraînement terminée !** Tu peux relancer avec `/entrainement`.");
        
        // On ferme proprement l'état "Le bot réfléchit"
        await interaction.editReply({ content: "✅ Test terminé avec succès." });
    }
};
