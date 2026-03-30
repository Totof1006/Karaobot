const { SlashCommandBuilder } = require('discord.js');
const { stopReceiver } = require('../utils/voiceReceiver');
const { stopAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('🛑 Arrête proprement l’entraînement vocal'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        if (!session) {
            return interaction.reply({
                content: "❌ Aucune session d’entraînement active.",
                ephemeral: true
            });
        }

        // Stop audio player
        stopAudio(session);

        // Stop receiver
        stopReceiver(session);

        // Déconnexion vocale propre
        try {
            if (session.connection) {
                session.connection.destroy();
            }
        } catch (err) {
            console.error("[STOP] Erreur destruction connexion :", err);
        }

        // Suppression de la session
        global.trainingSessions.delete(interaction.user.id);

        return interaction.reply("🛑 Entraînement arrêté proprement !");
    }
};
