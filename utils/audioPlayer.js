const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, url, onFinish, onError) {
    try {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return onFinish(); // On passe à la suite si l'URL est cassée
        }

        if (!session.player) {
            session.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let stream;
        // GESTION SPOTIFY : Si c'est un lien Spotify, on cherche sur YouTube
        if (url.includes('spotify.com')) {
            const searchResults = await play.search(url, { limit: 1, source: { youtube: 'video' } });
            if (searchResults.length > 0) {
                stream = await play.stream(searchResults[0].url, { discordPlayerCompatible: true });
            } else {
                throw new Error("Impossible de trouver cette musique Spotify sur YouTube.");
            }
        } else {
            stream = await play.stream(url, { discordPlayerCompatible: true });
        }

        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        session.player.removeAllListeners(AudioPlayerStatus.Idle);
        session.player.removeAllListeners('error');

        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, () => onFinish());
        session.player.once('error', (err) => {
            console.error("[AudioPlayer] Erreur :", err.message);
            onFinish();
        });
    } catch (e) {
        console.error("[AudioPlayer] Erreur critique :", e.message);
        onFinish();
    }
}

module.exports = { playAudio };
