const prism = require('prism-media');

/**
 * Analyse le flux audio pour détecter l'activité vocale (VAD réelle via PCM)
 */
function analyzeVoiceActivity(receiverStream, onActivity) {
    if (!receiverStream) return;

    // --- TRANSFORMATION EN PCM S16LE (Audio Brut) ---
    // On décompresse le flux Opus de Discord pour lire la vraie puissance du son
    const opusDecoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    const pcmStream = receiverStream.pipe(opusDecoder);

    let packetCount = 0;

    pcmStream.on('data', (chunk) => {
        // Un paquet PCM contient des échantillons de 16 bits (2 octets par échantillon)
        if (!chunk || chunk.length < 100) return;

        let sum = 0;
        let sampleCount = 0;

        // On parcourt le buffer par pas de 2 octets pour lire les valeurs 16-bit
        for (let i = 0; i < chunk.length; i += 2) {
            // Lecture de l'échantillon (Int16 Little Endian)
            const sample = chunk.readInt16LE(i);
            sum += Math.abs(sample);
            sampleCount++;
        }
        
        // Volume moyen (RMS simplifié)
        const rms = sum / sampleCount;

        // --- SEUIL DE DÉTECTION PCM ---
        // 0 = Silence absolu | 32767 = Maximum possible
        // Un souffle/bruit ambiant est < 300.
        // Une voix normale se situe entre 800 et 3000.
        if (rms > 850) { 
            onActivity(rms);
        }
        
        // Log de debug tous les 500 paquets (environ toutes les 10 secondes)
        packetCount++;
        if (packetCount % 500 === 0) {
            console.log(`[Analyzer] Analyseur PCM actif - Volume : ${Math.round(rms)}`);
        }
    });

    pcmStream.on('error', (err) => {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
        console.error("[Analyzer] Erreur décodage PCM :", err.message);
    });

    // Nettoyage des ressources quand le flux s'arrête
    receiverStream.on('end', () => {
        opusDecoder.destroy();
        console.log("[Analyzer] Décodeur libéré.");
    });
}

module.exports = { analyzeVoiceActivity };
