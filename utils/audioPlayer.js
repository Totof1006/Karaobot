const { 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const play = require('play-dl');

/**
 * Lecture audio UNIVERSELLE
 * Gère YouTube, SoundCloud, Spotify (via recherche YT) et liens directs.
 */
async function playAudio(session, audioUrl, onFinish, onError) {
    try {
        // 1. Sécurité anti-undefined
        if (!audioUrl || typeof audioUrl !== 'string') {
            return onError(new Error("URL invalide ou non définie"));
        }

        // 2. Récupération ou création du Player unique
        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            // On l'abonne à la connexion de la session
            if (session.connection) session.connection.subscribe(session.player);
        }

        const player = session.player;
        let resource;

        // 3. LOGIQUE UNIVERSELLE (Détection automatique)
        // play-dl.stream gère presque tout tout seul si on lui laisse faire
        let stream = await play.stream(audioUrl, {
            quality: 1,
            discordPlayerCompatibility: true
        });

        resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        // 4. Lancement
        player.play(resource);

        // 5. GESTION DES ÉVÉNEMENTS (Nettoyage avant de réécouter)
        player.removeAllListeners(AudioPlayerStatus.Idle);
        player.removeAllListeners('error');

        player.once(AudioPlayerStatus.Idle, () => {
            onFinish();
        });

        player.once('error', err => {
            console.error("[AudioPlayer] Erreur de lecture :", err.message);
            player.stop();
            onError(err);
        });

    } catch (err) {
        console.error("[AudioPlayer] Erreur critique :", err.message);
        onError(err);
    }
}

function stopAudio(session) {
    if (session.player) {
        session.player.stop(true);
    }
}

module.exports = { playAudio, stopAudio };
