const { EndBehaviorType } = require('@discordjs/voice');
const { analyzeVoiceActivity } = require('./voiceAnalyzer'); // Import en haut pour éviter les répétitions

/**
 * Initialise un receiver PRO pour un utilisateur donné
 */
function setupUserReceiver(session, userId) {
    try {
        // --- SÉCURITÉ : NETTOYAGE PRÉALABLE ---
        // Si un flux existe déjà pour cette session, on le ferme proprement avant de recommencer
        if (session.receiverStream) {
            stopReceiver(session);
        }

        if (!session.connection) return;

        const receiver = session.connection.receiver;

        // On s'abonne au flux vocal de l'utilisateur
        // Utilisation de Manual pour garder le contrôle total sur la durée de vie du flux
        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.Manual
            }
        });

        // Analyse de l'activité vocale
        // On passe par un wrapper pour s'assurer que l'incrémentation est stable
        analyzeVoiceActivity(audioStream, (energy) => {
            // On ne compte les ticks que si une musique est en cours de lecture
            if (session.player && session.player.state.status === 'playing') {
                session.precisionTicks++;
            }
        });

        audioStream.on('error', err => {
            if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return; // Ignorer les fermetures normales
            console.error("[Receiver] Erreur flux vocal :", err.message);
        });

        // On stocke le flux pour pouvoir le stopper proprement
        session.receiverStream = audioStream;

    } catch (err) {
        console.error("[Receiver] setupUserReceiver error:", err);
    }
}

/**
 * Stop PRO
 */
function stopReceiver(session) {
    try {
        if (session.receiverStream) {
            // On enlève les listeners pour éviter les fuites de mémoire (Memory Leaks)
            session.receiverStream.removeAllListeners();
            
            // On détruit le flux
            session.receiverStream.destroy();
            session.receiverStream = null;
            
            console.log("[Receiver] Flux vocal stoppé proprement.");
        }
    } catch (e) {
        console.error("[Receiver] stopReceiver error:", e);
    }
}

module.exports = { setupUserReceiver, stopReceiver };
