Voici le dernier fichier, audioPlayer.js, corrigé avec les sécurités nécessaires pour éviter l'erreur Invalid URL et garantir que tes cookies sont utilisés correctement.

JavaScript
const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');

// CORRECTION : Chemin calqué sur ton Mount Path Railway (/data)
const VOLUME_PATH = '/data/playlist_cache.json';

// S'assurer que le dossier existe (sécurité au démarrage)
const ensureDirectory = () => {
    const dir = path.dirname(VOLUME_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Charger le cache depuis le volume
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

// Sauvegarder dans le volume
function saveToCache(songName, url) {
    try {
        ensureDirectory();
        const cache = getCachedPlaylist();
        cache[songName.toLowerCase()] = url;
        fs.writeFileSync(VOLUME_PATH, JSON.stringify(cache, null, 2));
        console.log(`💾 [Volume] Sauvegardé : ${songName}`);
    } catch (e) {
        console.error("[Cache] Erreur écriture :", e.message);
    }
}

async function playAudio(session, input, onFinish) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        // 1. Cookies avec nettoyage strict
        if (process.env.YT_COOKIES_BASE64) {
            try {
                const b64 = process.env.YT_COOKIES_BASE64.replace(/\s/g, '');
                let decoded = Buffer.from(b64, 'base64').toString('utf-8');
                decoded = decoded.replace(/[\r\n\t]/gm, '').trim();
                await play.setToken({ youtube: { cookie: decoded } });
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

        // 2. Stratégie de recherche : Cache d'abord, YouTube ensuite
        if (!urlToPlay.startsWith('http')) {
            const cache = getCachedPlaylist();
            
            if (cache[songKey]) {
                urlToPlay = cache[songKey];
                console.log(`📦 [Cache] URL récupérée : ${urlToPlay}`);
            } else {
                const searchQuery = `${input} audio lyrics`;
                console.log(`🔎 [YouTube] Recherche : ${searchQuery}`);
                
                const results = await play.search(searchQuery, { limit: 1 });
                
                if (results && results.length > 0 && results[0].url) {
                    urlToPlay = results[0].url;
                    saveToCache(input, urlToPlay);
                    console.log(`✅ [YouTube] Trouvé et mémorisé : ${results[0].title}`);
                } else {
                    console.error("❌ Aucun résultat YouTube.");
                    return onFinish();
                }
            }
        }

        // --- SÉCURITÉ CRITIQUE : Vérifier que l'URL est valide et est une string ---
        if (!urlToPlay || urlToPlay === 'undefined' || typeof urlToPlay !== 'string') {
            console.error("❌ Erreur : URL de lecture invalide (undefined ou vide).");
            return onFinish();
        }

        // 3. Streaming (CORRECTION : Gestion d'erreur robuste sur le stream)
        let stream;
        try {
            stream = await play.stream(urlToPlay, { 
                discordPlayerCompatible: true,
                htm: true // Indispensable pour utiliser l'agent htm avec les cookies
            });
        } catch (streamErr) {
            console.error(`❌ [YouTube] Échec du stream pour ${urlToPlay}:`, streamErr.message);
            return onFinish();
        }

        if (!stream || !stream.stream) {
            console.error("❌ [YouTube] Le flux audio n'a pas pu être généré.");
            return onFinish();
        }

        const resource = createAudioResource(stream.stream, { 
            inputType: stream.type, 
            inlineVolume: true 
        });

        session.player.removeAllListeners();
        session.player.play(resource);

        session.player.once(AudioPlayerStatus.Idle, onFinish);
        session.player.once('error', (err) => {
            console.error("[AudioPlayer] Erreur pendant la lecture :", err.message);
            session.player.stop(); 
            onFinish();
        });

    } catch (error) {
        console.error("[AudioPlayer] Erreur critique système :", error);
        onFinish();
    }
}

module.exports = { playAudio };
