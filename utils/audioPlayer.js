const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType
} = require('@discordjs/voice');

const play = require('play-dl');

/**
 * Lecture audio PRO
 * - Utilise la connexion persistante stockée dans session.connection
 * - Utilise un player unique stocké dans session.player
 * - Ne détruit jamais la connexion
 */
async function playAudio(session, audioUrl, onFinish, onError) {
    try {
        // Player unique par session
        let player = session.player;
        if (!player) {
            player = createAudioPlayer();
            session.player = player;

            // On abonne le player à la connexion persistante
            session.connection.subscribe(player);
        }

        let resource;

        // Lecture YouTube via play-dl
        if (play.yt_validate(audioUrl)) {
            const stream = await play.stream(audioUrl, {
                quality: 1,
                discordPlayerCompatibility: true
            });

            resource = createAudioResource(stream.stream, {
                inputType: stream.type
            });
        } else {
            // Lecture d’un lien direct
            resource = createAudioResource(audioUrl, {
                inputType: StreamType.Arbitrary
            });
        }

        player.play(resource);

        // Quand la musique se termine
        player.once(AudioPlayerStatus.Idle, () => {
            if (onFinish) onFinish();
        });

        // Gestion des erreurs
        player.once('error', err => {
            console.error("[AudioPlayer] Erreur :", err);
            if (onError) onError(err);
        });

    } catch (err) {
        console.error("[AudioPlayer] Erreur globale :", err);
        if (onError) onError(err);
    }
}

/**
 * Stop PRO
 * - Arrête la musique
 * - Ne détruit PAS la connexion
 * - Ne détruit PAS le receiver
 */
function stopAudio(session) {
    try {
        if (session.player) {
            session.player.stop(true);
        }
    } catch (e) {
        console.error("[AudioPlayer] stopAudio error:", e);
    }
}

module.exports = { playAudio, stopAudio };
