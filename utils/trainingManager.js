/**
 * trainingManager.js
 * Gère la mémoire des sessions d'entraînement actives avec auto-nettoyage.
 */

if (!global.trainingSessions) {
    global.trainingSessions = new Map();
}

/**
 * Ajoute une session avec une expiration automatique (30 minutes par défaut)
 */
function createTrainingSession(userId, data) {
    // Nettoyage de l'ancienne session si elle existe
    if (global.trainingSessions.has(userId)) {
        const oldSession = global.trainingSessions.get(userId);
        if (oldSession.timeout) clearTimeout(oldSession.timeout);
    }

    // Création d'un timer pour supprimer la session si l'utilisateur l'oublie
    const timeout = setTimeout(() => {
        if (global.trainingSessions.has(userId)) {
            global.trainingSessions.delete(userId);
            console.log(`[Training] Session de ${userId} expirée et supprimée.`);
        }
    }, 30 * 60 * 1000); // 30 minutes

    global.trainingSessions.set(userId, {
        ...data,
        timeout,
        timestamp: Date.now()
    });
}

/**
 * Supprime proprement une session (annule le timer)
 */
function removeTrainingSession(userId) {
    const session = global.trainingSessions.get(userId);
    if (session && session.timeout) {
        clearTimeout(session.timeout);
    }
    return global.trainingSessions.delete(userId);
}

module.exports = {
    trainingSessions: global.trainingSessions,
    createTrainingSession,
    removeTrainingSession
};
