const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, url, onFinish, onError) {
    try {
        if (!session.player) {
            session.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
            if (session.connection) session.connection.subscribe(session.player);
        }

        const stream = await play.stream(url, { discordPlayerCompatible: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        // IMPORTANT : On vide les anciens écouteurs avant de rejouer
        session.player.removeAllListeners(AudioPlayerStatus.Idle);
        session.player.removeAllListeners('error');

        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, () => onFinish());
        session.player.once('error', (err) => {
            console.error(err);
            onFinish(); // On force la suite même si erreur
        });
    } catch (e) {
        console.error("Erreur AudioPlayer:", e.message);
        onFinish();
    }
}

module.exports = { playAudio };
