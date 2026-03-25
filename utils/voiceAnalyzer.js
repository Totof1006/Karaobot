/**
 * Analyse le flux audio pour détecter l'activité vocale (VAD simplifiée)
 * @param {AudioReceiveStream} receiverStream - Le flux audio du chanteur
 * @param {Function} onActivity - Callback appelé quand du son est détecté
 */
function analyzeVoiceActivity(receiverStream, onActivity) {
    if (!receiverStream) return;

    // Discord envoie des paquets Opus. 
    // Pour un score de précision, on écoute les événements 'data'
    receiverStream.on('data', (chunk) => {
        // Un chunk vide ou très petit signifie un silence
        if (!chunk || chunk.length < 10) return;

        // On calcule une amplitude très basique du paquet Opus
        // Plus la valeur est haute, plus le chanteur chante fort
        let sum = 0;
        for (let i = 0; i < chunk.length; i++) {
            sum += Math.abs(chunk[i]);
        }
        const averageEnergy = sum / chunk.length;

        // Seuil de détection (à ajuster selon les tests)
        // Si l'énergie dépasse 10, on considère que l'utilisateur chante
        if (averageEnergy > 10) {
            onActivity(averageEnergy);
        }
    });

    receiverStream.on('error', (err) => {
        console.error("[Analyzer] Erreur flux audio:", err);
    });
}

module.exports = { analyzeVoiceActivity };
