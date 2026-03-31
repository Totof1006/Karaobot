const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, input, onFinish, onError) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        if (!session.player) {
            session.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let songInfo;
        // Si l'entrée n'est pas un lien HTTP, on fait une recherche YouTube
        if (!input.startsWith('http')) {
            console.log(`🔎 Recherche YouTube pour : ${input}`);
            const searchResults = await play.search(input, { limit: 1, source: { youtube: 'video' } });
            
            if (searchResults.length === 0) {
                console.error("❌ Aucun résultat trouvé.");
                return onFinish();
            }
            songInfo = searchResults[0];
        }

        // On génère le flux à partir de l'URL trouvée ou fournie
        const urlToPlay = songInfo ? songInfo.url : input;
        const stream = await play.stream(urlToPlay, { discordPlayerCompatible: true });
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
