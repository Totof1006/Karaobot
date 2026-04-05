const { EndBehaviorType } = require('@discordjs/voice');
const { analyzeVoiceActivity } = require('./voiceAnalyzer');

/**
 * Initialise un receiver pour un utilisateur donné
 */
async function setupUserReceiver(session, userId) {
    try {
        // 1. SÉCURITÉ : NETTOYAGE PRÉALABLE
        if (session.receiverStream) {
            stopReceiver(session);
        }

        if (!session.connection || !session.connection.receiver) {
            console.error("[Receiver] Pas de connexion active pour s'abonner.");
            return;
        }

        // 2. ABONNEMENT AU FLUX (Mode Manuel)
        // On s'abonne aux paquets Opus de l'utilisateur
        const audioStream = session.connection.receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.Manual // ✅ Garde le flux ouvert même pendant les silences
            }
        });

        console.log(`🎙️ [Receiver] Écoute démarrée pour l'utilisateur : ${userId}`);

        // 3. ANALYSE ET SCORE
        // On passe le flux à l'analyseur qui va transformer l'Opus en données d'énergie
        analyzeVoiceActivity(audioStream, (energy) => {
            // ✅ SÉCURITÉ : On ne compte les points QUE si la musique tourne
            // Cela évite que le chanteur gagne des points en parlant pendant la pause
            if (session.player && session.player.state.status === 'playing') {
                // Seuil d'énergie minimum pour éviter de compter le bruit de fond
                if (energy > 0.01) { 
                    session.precisionTicks = (session.precisionTicks || 0) + 1;
                }
            }
        });

        // 4. GESTION DES ERREURS DE FLUX
        audioStream.on('error', err => {
            if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
            console.error("[Receiver] Erreur flux vocal :", err.message);
        });

        // ✅ IMPORTANT : Nettoyer si l'utilisateur quitte le vocal subitement
        audioStream.on('end', () => {
            console.log(`[Receiver] Flux terminé pour ${userId}`);
            session.receiverStream = null;
        });

        session.receiverStream = audioStream;

    } catch (err) {
        console.error("[Receiver] Erreur setupUserReceiver:", err);
    }
}

/**
 * Arrêt propre du receiver
 */
function stopReceiver(session) {
    try {
        if (session.receiverStream) {
            // On force la fin du flux Opus
            session.receiverStream.destroy();
            session.receiverStream.removeAllListeners();
            session.receiverStream = null;
            
            console.log("[Receiver] Flux vocal détruit proprement.");
        }
    } catch (e) {
        console.error("[Receiver] Erreur stopReceiver:", e);
    }
}

module.exports = { setupUserReceiver, stopReceiver };
