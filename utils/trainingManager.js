/**
 * trainingManager.js
 * Gère la mémoire des sessions d'entraînement actives.
 */

// On utilise un Map global pour suivre qui est en train de s'entraîner
// Cela permet de limiter à 4 personnes simultanément.
if (!global.trainingSessions) {
    global.trainingSessions = new Map();
}

module.exports = {
    trainingSessions: global.trainingSessions
};
