const { EndBehaviorType } = require('@discordjs/voice');

/**
 * Initialise un receiver PRO pour un utilisateur donné
 * - Écoute uniquement userId
 * - Incrémente session.precisionTicks à chaque paquet audio
 * - Ne se recrée pas entre les musiques
 */
function setupUserReceiver(session, userId) {
    try {
        const receiver = session.connection.receiver;

        // On s'abonne au flux vocal de l'utilisateur
        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.Manual
            }
        });

        // Détection simple : si data arrive → l’utilisateur chante
        audioStream.on('data', () => {
            session.precisionTicks++;
        });

        audioStream.on('error', err => {
            console.error("[Receiver] Erreur flux vocal :", err);
        });

        // On stocke le flux pour pouvoir le stopper proprement
        session.receiverStream = audioStream;

    } catch (err) {
        console.error("[Receiver] setupUserReceiver error:", err);
    }
}

/**
 * Stop PRO
 * - Détruit uniquement le flux audio
 * - Ne détruit PAS la connexion
 * - Ne détruit PAS le player
 */
function stopReceiver(session) {
    try {
        if (session.receiverStream) {
            session.receiverStream.destroy();
            session.receiverStream = null;
        }
    } catch (e) {
        console.error("[Receiver] stopReceiver error:", e);
    }
}

module.exports = { setupUserReceiver, stopReceiver };
