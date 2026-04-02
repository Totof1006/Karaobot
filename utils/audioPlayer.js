const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

async function playAudio(session, input, onFinish) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        // Configuration des cookies YouTube avec nettoyage strict des caractères invisibles
        if (process.env.YT_COOKIES_BASE64) {
            try {
                // Le .trim() sur la variable d'env ET sur le résultat décodé supprime les espaces/sauts de ligne parasites
                const decodedCookies = Buffer.from(process.env.YT_COOKIES_BASE64.trim(), 'base64').toString('utf-8').trim();
                
                await play.setToken({
                    youtube: {
                        cookie: decodedCookies
                    }
                });
            } catch (cookieError) {
                console.error("[AudioPlayer] Erreur de décodage des cookies :", cookieError.message);
            }
        }

        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let urlToPlay = input.trim();

        if (!urlToPlay.startsWith('http')) {
            // Ajout de " audio lyrics" pour éviter les clips vidéos avec intros
            const searchQuery = `${urlToPlay} audio lyrics`;
            console.log(`🔎 Recherche YouTube pour : ${searchQuery}`);
            
            const results = await play.search(searchQuery, { limit: 1 });
            
            if (results && results.length > 0) {
                urlToPlay = results[0].url; 
                console.log(`✅ Trouvé : ${results[0].title}`);
            } else {
                console.error("❌ Aucun résultat trouvé.");
                return onFinish();
            }
        }

        const stream = await play.stream(urlToPlay, { discordPlayerCompatible: true });
        
        const resource = createAudioResource(stream.stream, { 
            inputType: stream.type, 
            inlineVolume: true 
        });

        session.player.removeAllListeners();
        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, () => {
            onFinish();
        });

        session.player.once('error', (err) => {
            console.error("[AudioPlayer] Erreur :", err.message);
            session.player.stop(); 
            onFinish();
        });

    } catch (error) {
        console.error("[AudioPlayer] Erreur critique :", error);
        onFinish();
    }
}

module.exports = { playAudio };
