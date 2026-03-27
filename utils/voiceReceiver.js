const { EndBehaviorType } = require('@discordjs/voice');

/**
 * Prépare la réception audio pour un utilisateur spécifique
 * @param {VoiceConnection} connection - La connexion vocale active
 * @param {string} userId - L'ID du chanteur à écouter
 * @returns {AudioReceiveStream|null}
 */
function setupUserReceiver(connection, userId) {
    if (!connection) return null;

    try {
        const receiver = connection.receiver.subscribe(userId, {
            mode: 'opus', // Précise le mode explicitement
            end: {
                behavior: EndBehaviorType.Manual,
            },
        });

        // Gestion d'erreur sur le flux
        receiver.on('error', (err) => {
            console.error(`[Audio Receiver] Erreur flux pour ${userId}:`, err.message);
        });

        console.log(`[Audio] Écoute activée pour l'utilisateur : ${userId}`);
        return receiver;
    } catch (error) {
        console.error(`[Audio Receiver] Échec de l'abonnement pour ${userId}:`, error.message);
        return null;
    }
}
