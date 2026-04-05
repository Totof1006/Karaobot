const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');

// Chemin calqué sur ton Mount Path Railway (/data)
const VOLUME_PATH = '/data/playlist_cache.json';

const ensureDirectory = () => {
    const dir = path.dirname(VOLUME_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

function getCachedPlaylist() {
    try {
        if (fs.existsSync(VOLUME_PATH)) {
            return JSON.parse(fs.readFileSync(VOLUME_PATH, 'utf8'));
        }
    } catch (e) {
        console.error("[Cache] Erreur lecture :", e.message);
    }
    return {};
}

// ✅ CORRECTION : On stocke l'ID unique de la vidéo au lieu de l'URL complète instable
function saveToCache(songName, url) {
    try {
        ensureDirectory();
        const cache = getCachedPlaylist();
        
        // Extraction de l'ID (v=...) ou utilisation de l'URL si l'ID n'est pas trouvable
        const videoId = new URL(url).searchParams.get('v') || url;
        
        cache[songName.toLowerCase().trim()] = videoId;
        fs.writeFileSync(VOLUME_PATH, JSON.stringify(cache, null, 2));
        console.log(`💾 [Cache] ID sauvegardé pour : ${songName}`);
    } catch (e) {
        console.error("[Cache] Erreur écriture :", e.message);
    }
}

async function playAudio(session, input, onFinish) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        // 1. Cookies YouTube
        if (process.env.YT_COOKIES_BASE64) {
            try {
                const b64 = process.env.YT_COOKIES_BASE64.replace(/\s/g, '');
                let decoded = Buffer.from(b64, 'base64').toString('utf-8');
                // Nettoyage plus léger pour ne pas casser le format Netscape
                await play.setToken({ youtube: { cookie: decoded.trim() } });
            } catch (e) { console.error("[Cookies] Erreur :", e.message); }
        }

        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let urlToPlay = input.trim();
        const songKey = input.trim().toLowerCase();

        // 2. Stratégie de recherche : Cache par ID d'abord
        if (!urlToPlay.startsWith('http')) {
            const cache = getCachedPlaylist();
            
            if (cache[songKey]) {
                // ✅ RECONSTRUCTION de l'URL à partir de l'ID mémorisé
                urlToPlay = `https://www.youtube.com/watch?v=${cache[songKey]}`;
                console.log(`📦 [Cache] URL reconstruite : ${urlToPlay}`);
            } else {
                const searchQuery = `${input} audio lyrics`;
                console.log(`🔎 [YouTube] Recherche : ${searchQuery}`);
                
                const results = await play.search(searchQuery, { limit: 1 });
                
                if (results && results.length > 0 && results[0].url) {
                    urlToPlay = results[0].url;
                    saveToCache(input, urlToPlay);
                    console.log(`✅ [YouTube] Trouvé : ${results[0].title}`);
                } else {
                    console.error("❌ Aucun résultat YouTube.");
                    return onFinish();
                }
            }
        }

        // 3. Streaming (CORRECTION : Suppression de l'option htm invalide)
        let stream;
        try {
            stream = await play.stream(urlToPlay, { 
                discordPlayerCompatible: true
                // ✅ htm: true a été supprimé (option inexistante causant des erreurs)
            });
        } catch (streamErr) {
            console.error(`❌ [YouTube] Échec du stream pour ${urlToPlay}:`, streamErr.message);
            return onFinish();
        }

        if (!stream || !stream.stream) {
            console.error("❌ [YouTube] Le flux audio est vide.");
            return onFinish();
        }

        const resource = createAudioResource(stream.stream, { 
            inputType: stream.type, 
            inlineVolume: true 
        });

        session.player.removeAllListeners();
        session.player.play(resource);

        // Une seule écoute pour le passage à la suite
        session.player.once(AudioPlayerStatus.Idle, () => {
            onFinish();
        });

        session.player.once('error', (err) => {
            console.error("[AudioPlayer] Erreur de lecture :", err.message);
            session.player.stop(); 
            onFinish();
        });

    } catch (error) {
        console.error("[AudioPlayer] Erreur critique :", error);
        onFinish();
    }
}

module.exports = { playAudio };
