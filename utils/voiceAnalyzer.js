/**
 * Analyse le flux audio pour détecter l'activité vocale (VAD simplifiée)
 */
function analyzeVoiceActivity(receiverStream, onActivity) {
    if (!receiverStream) return;

    let packetCount = 0;

    receiverStream.on('data', (chunk) => {
        // Ignorer les paquets de silence ou trop petits (Discord envoie parfois des paquets de 3 octets)
        if (!chunk || chunk.length < 20) return;

        // Calcul de l'énergie moyenne du paquet compressé
        let sum = 0;
        for (let i = 0; i < chunk.length; i++) {
            sum += chunk[i];
        }
        
        // Moyenne d'énergie (valeur absolue)
        const averageEnergy = Math.abs(sum / chunk.length);

        // SEUIL DE DÉTECTION (Ajustable)
        // Sur Opus, un silence se situe souvent en dessous de 5-8.
        // Si > 12, c'est presque certainement une voix ou un souffle proche du micro.
        if (averageEnergy > 12) {
            onActivity(averageEnergy);
        }
        
        // Log de debug optionnel (à commenter en production)
        packetCount++;
        if (packetCount % 500 === 0) {
            console.log(`[Analyzer] Flux actif, énergie moyenne : ${averageEnergy.toFixed(2)}`);
        }
    });

    receiverStream.on('error', (err) => {
        // Évite le crash du bot si le flux se coupe brutalement
        console.error("[Analyzer] Flux audio interrompu :", err.message);
    });

    // Nettoyage automatique à la fin du flux
    receiverStream.on('end', () => {
        console.log("[Analyzer] Fin de l'analyse pour ce chanteur.");
    });
}

module.exports = { analyzeVoiceActivity };
