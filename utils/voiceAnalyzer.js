const prism = require('prism-media');

/**
 * Analyse le flux audio pour détecter l'activité vocale (VAD via PCM)
 * @param {ReadableStream} receiverStream - Le flux Opus venant de Discord
 * @param {Function} onActivity - Callback appelé quand une voix est détectée
 */
function analyzeVoiceActivity(receiverStream, onActivity) {
    if (!receiverStream) return;

    // --- TRANSFORMATION EN PCM S16LE (48kHz, 2 canaux) ---
    // On décompresse le flux Opus pour lire la puissance réelle du signal
    const opusDecoder = new prism.opus.Decoder({ 
        frameSize: 960, 
        channels: 2, 
        rate: 48000 
    });

    const pcmStream = receiverStream.pipe(opusDecoder);

    let packetCount = 0;

    pcmStream.on('data', (chunk) => {
        // Un paquet PCM contient des échantillons de 16 bits (2 octets par échantillon)
        if (!chunk || chunk.length < 100) return;

        let sum = 0;
        let sampleCount = 0;

        // OPTIMISATION : On ne parcourt pas chaque échantillon (trop lourd pour le CPU)
        // On saute un échantillon sur deux (pas de 4 octets au lieu de 2)
        // La précision reste suffisante pour détecter le volume global.
        for (let i = 0; i < chunk.length; i += 4) {
            try {
                const sample = chunk.readInt16LE(i);
                sum += Math.abs(sample);
                sampleCount++;
            } catch (e) {
                break; // Fin de buffer inattendue
            }
        }
        
        // Calcul du volume moyen (RMS simplifié)
        const rms = sampleCount > 0 ? sum / sampleCount : 0;

        // --- SEUIL DE DÉTECTION ---
        // 0 = Silence | 32767 = Max
        // Seuil à 850 : Filtre le souffle et les bruits de clavier.
        // Une voix chantée monte facilement à 1500-3000.
        if (rms > 850) { 
            onActivity(rms);
        }
        
        // Log de santé toutes les ~10 secondes de chant
        packetCount++;
        if (packetCount % 500 === 0) {
            console.log(`[Analyzer] PCM OK - Volume moyen actuel : ${Math.round(rms)}`);
        }
    });

    // --- GESTION DES ERREURS ET NETTOYAGE ---
    pcmStream.on('error', (err) => {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
        console.error("[Analyzer] Erreur décodage PCM :", err.message);
    });

    // Crucial pour éviter les fuites de mémoire sur Railway
    receiverStream.on('end', () => {
        if (!opusDecoder.destroyed) {
            opusDecoder.destroy();
            console.log("[Analyzer] Décodeur Opus libéré proprement.");
        }
    });

    receiverStream.on('close', () => {
        if (!opusDecoder.destroyed) opusDecoder.destroy();
    });
}

module.exports = { analyzeVoiceActivity };
