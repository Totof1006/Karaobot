const { createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const fs = require('fs');
const path = require('path');

// --- AJOUT : IMPORT DES UTILITAIRES DE SYNCHRO ---
const { getLyrics, startLyricsStream } = require('./lyricsSync');

const VOLUME_PATH = '/data/playlist_cache.json';

// --- LOGIQUE DE CACHE ---
const ensureDirectory = () => {
    const dir = path.dirname(VOLUME_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

function getCachedPlaylist() {
    try {
        if (fs.existsSync(VOLUME_PATH)) return JSON.parse(fs.readFileSync(VOLUME_PATH, 'utf8'));
    } catch (e) { console.error("[Cache] Erreur lecture :", e.message); }
    return {};
}

function saveToCache(songName, url) {
    try {
        ensureDirectory();
        const cache = getCachedPlaylist();
        const videoId = play.extractID(url); 
        if (videoId) {
            cache[songName.toLowerCase().trim()] = videoId;
            fs.writeFileSync(VOLUME_PATH, JSON.stringify(cache, null, 2));
            console.log(`💾 [Cache] ID sauvegardé : ${videoId} pour ${songName}`);
        }
    } catch (e) { console.error("[Cache] Erreur écriture :", e.message); }
}

// --- COEUR DE LECTURE ---
async function playAudio(session, input, onFinish) {
    try {
        if (!input || input.trim().length === 0) return onFinish();

        // 1. COOKIES
        if (process.env.YT_COOKIES_BASE64) {
            try {
                const decoded = Buffer.from(process.env.YT_COOKIES_BASE64.trim(), 'base64')
                    .toString('utf-8')
                    .replace(/[\n\r]/g, '')
                    .trim(); 
                await play.setToken({ youtube: { cookie: decoded } });
            } catch (e) { console.error("[Cookies] Erreur formatage :", e.message); }
        }

        // 2. INITIALISATION DU PLAYER
        if (!session.player) {
            session.player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play }
            });
            if (session.connection) session.connection.subscribe(session.player);
        }

        let urlToPlay = input.trim();
        const songKey = input.trim().toLowerCase();

        // 3. RECHERCHE / CACHE
        if (!urlToPlay.startsWith('http')) {
            const cache = getCachedPlaylist();
            if (cache[songKey]) {
                urlToPlay = `https://www.youtube.com/watch?v=${cache[songKey]}`;
                console.log(`📦 [Cache] URL reconstruite : ${urlToPlay}`);
            } else {
                console.log(`🔎 [YouTube] Recherche : ${input}`);
                const results = await play.search(`${input} audio lyrics`, { limit: 1 });
                if (results?.length > 0) {
                    urlToPlay = results[0].url;
                    saveToCache(input, urlToPlay);
                } else {
                    console.error("❌ Aucun résultat YouTube.");
                    return onFinish();
                }
            }
        }

        // 4. CRÉATION DU STREAM
        let stream;
        try {
            stream = await play.stream(urlToPlay, { 
                discordPlayerCompatible: true,
                quality: 1 
            });
        } catch (err) {
            console.error(`❌ [Stream] Erreur play-dl: ${err.message}`);
            return onFinish();
        }

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        resource.volume.setVolume(0.5);

        // 5. GESTION DES ÉVÉNEMENTS
        session.player.removeAllListeners();

        // ✅ AJOUT : DÉCLENCHEMENT AU MOMENT DU "PLAYING" RÉEL
        session.player.once(AudioPlayerStatus.Playing, () => {
            console.log(`🎤 [Sync] Lecture réelle commencée pour : ${input}`);
            
            // On active le flag pour le calcul du score dans voiceReceiver
            session.isRecording = true;

            // Lancement des paroles synchronisées
            const lyricsData = getLyrics(input);
            if (lyricsData) {
                // On stocke la fonction d'arrêt dans la session pour pouvoir la couper plus tard
                session.stopLyrics = startLyricsStream(session.textChannel, lyricsData);
            }
        });

        session.player.once(AudioPlayerStatus.Idle, () => {
            console.log("🎵 [AudioPlayer] Fin de lecture.");
            // ✅ Nettoyage des paroles et du score
            if (session.stopLyrics) session.stopLyrics();
            session.isRecording = false;
            onFinish();
        });

        session.player.on('error', (error) => {
            console.error(`❌ [AudioPlayer] Erreur sur ${urlToPlay}:`, error.message);
            // ✅ Nettoyage en cas d'erreur
            if (session.stopLyrics) session.stopLyrics();
            session.isRecording = false;
            onFinish();
        });

        // ✅ LANCEMENT
        session.player.play(resource);

    } catch (error) {
        console.error("[AudioPlayer] Erreur critique :", error);
        onFinish();
    }
}

module.exports = { playAudio };
