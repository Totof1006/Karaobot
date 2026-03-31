const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, audioUrl, onFinish, onError) {
    try {
        // Sécurité : on vérifie que l'URL existe et est une chaîne
        if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.startsWith('http')) {
            return onError(new Error(`URL Invalide: ${audioUrl}`));
        }

        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        const stream = await play.stream(audioUrl, { discordPlayerCompatible: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        session.player.removeAllListeners(AudioPlayerStatus.Idle);
        session.player.removeAllListeners('error');

        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, () => onFinish());
        session.player.once('error', err => {
            console.error("[AudioPlayer] Erreur de flux:", err.message);
            onFinish(); 
        });
    } catch (err) {
        onError(err);
    }
}

module.exports = { playAudio };
