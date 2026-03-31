const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, input, onFinish) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let urlToPlay = input.trim();

        // RECHERCHE AUTOMATIQUE : Si ce n'est pas un lien, on cherche sur YouTube
        if (!urlToPlay.startsWith('http')) {
            console.log(`🔎 Recherche YouTube pour : ${urlToPlay}`);
            const results = await play.search(urlToPlay, { limit: 1 });
            
            if (results && results.length > 0) {
                urlToPlay = results[0].url; // On extrait l'URL du résultat
                console.log(`✅ Trouvé : ${results[0].title}`);
            } else {
                console.error("❌ Aucun résultat trouvé.");
                return onFinish();
            }
        }

        // Lecture du flux (compatible avec les nouvelles normes Discord)
        const stream = await play.stream(urlToPlay, { discordPlayerCompatible: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        session.player.removeAllListeners();
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
