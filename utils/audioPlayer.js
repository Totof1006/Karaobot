const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, input, onFinish) {
    try {
        if (!input) return onFinish();

        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let urlToPlay = input.trim();

        // SI CE N'EST PAS UN LIEN (ex: "Ailleurs + Orelsan")
        if (!urlToPlay.startsWith('http')) {
            // On cherche sur YouTube
            const results = await play.search(urlToPlay, { limit: 1 });
            if (results && results.length > 0) {
                urlToPlay = results[0].url; // ON RÉCUPÈRE LE LIEN TROUVÉ
            } else {
                console.error("Rien trouvé pour :", urlToPlay);
                return onFinish();
            }
        }

        // Lecture du flux
        const stream = await play.stream(urlToPlay, { discordPlayerCompatible: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        session.player.removeAllListeners();
        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, () => onFinish());
        session.player.once('error', err => {
            console.error("Erreur lecture :", err.message);
            onFinish();
        });
    } catch (e) {
        console.error("Erreur critique :", e.message);
        onFinish();
    }
}

module.exports = { playAudio };
