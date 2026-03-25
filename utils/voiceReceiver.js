const { EndBehaviorType } = require('@discordjs/voice');

/**
 * Prépare la réception audio pour un utilisateur spécifique
 * @param {VoiceConnection} connection - La connexion vocale active
 * @param {string} userId - L'ID du chanteur à écouter
 * @returns {AudioReceiveStream|null}
 */
function setupUserReceiver(connection, userId) {
    if (!connection) return null;

    // On s'abonne au flux audio de l'utilisateur
    // On utilise Opus car c'est le format natif de Discord (plus léger)
    const receiver = connection.receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.Manual, // On gère nous-même l'arrêt (fin de chanson)
        },
    });

    console.log(`[Audio] Écoute activée pour l'utilisateur : ${userId}`);
    
    return receiver;
}