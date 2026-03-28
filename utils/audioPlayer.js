const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  entersState,
  StreamType 
} = require('@discordjs/voice');
const { AUDIO_CONNECT_TIMEOUT_MS } = require('./constants');
const play = require('play-dl');
const fs   = require('fs');
const path = require('path');

const play = require('play-dl');

// Fonction pour activer les cookies
async function activateYoutubeCookies() {
    try {
        await play.setToken({
            youtube: {
                cookie: "/data/youtube_cookies.txt"
            }
        });
        console.log("✅ [YouTube] Authentification réussie avec les cookies !");
    } catch (err) {
        console.error("❌ [YouTube] Erreur d'authentification :", err.message);
    }
}

// Appelle la fonction
activateYoutubeCookies();

// --- IMPORT DU RECEIVER ---
const { setupUserReceiver } = require('./voiceReceiver');

const SOUNDS_DIR = path.join(__dirname, '../sounds');
const activeConnections = new Map();

/**
 * Jouer un lien YouTube ou Direct.
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError, singerId = null) {
  const guildId = voiceChannel.guild.id;
  stopAudio(guildId); // Nettoyage préalable

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, AUDIO_CONNECT_TIMEOUT_MS);
    
    // --- ATTACHE DU RECEIVER POUR LE SCORING ---
    if (singerId) {
      const receiver = setupUserReceiver(connection, singerId);
      activeConnections.set(guildId, { connection, receiver });
    } else {
      activeConnections.set(guildId, { connection });
    }
  } catch (err) {
    if (connection) connection.destroy();
    console.error("[AudioPlayer] Erreur de connexion vocale :", err);
    if (onError) onError(new Error('Impossible de rejoindre le salon vocal.'));
    return () => {};
  }

  const player = createAudioPlayer();
  let resource;

  try {
    // Si c'est du YouTube, on utilise play-dl
    if (play.yt_validate(audioUrl)) {
      // On force le rafraîchissement des tokens YouTube pour éviter les erreurs 403/429
      const stream = await play.stream(audioUrl, {
        quality: 1, // Priorité à l'audio haute qualité
        discordPlayerCompatibility: true
      });
      resource = createAudioResource(stream.stream, { inputType: stream.type });
    } else {
      // Pour les fichiers directs ou liens audio
      resource = createAudioResource(audioUrl, { inputType: StreamType.Arbitrary });
    }

    player.play(resource);
    connection.subscribe(player);
    
    const existing = activeConnections.get(guildId);
    activeConnections.set(guildId, { ...existing, player });

  } catch (err) {
    console.error('[AudioPlayer] Erreur lors de la création de la ressource :', err);
    stopAudio(guildId);
    if (onError) onError(err);
    return () => {};
  }

  // --- ÉVÉNEMENTS ---
  player.on(AudioPlayerStatus.Idle, () => {
    stopAudio(guildId);
    if (onFinish) onFinish();
  });

  player.on('error', err => {
    console.error('[AudioPlayer] Erreur lecteur :', err.message);
    stopAudio(guildId);
    if (onError) onError(err);
  });

  // Sécurité si le bot est déconnecté manuellement
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      // Tentative de reconnexion automatique
    } catch (e) {
      stopAudio(guildId);
    }
  });

  return () => stopAudio(guildId);
}

/**
 * Arrête la lecture et libère les ressources.
 */
function stopAudio(guildId) {
  const active = activeConnections.get(guildId);
  if (!active) return;
  
  try {
    if (active.player) active.player.stop(true);
    if (active.connection && active.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      active.connection.destroy();
    }
  } catch (e) {
    console.error("[AudioPlayer] Erreur lors du stop :", e.message);
  }
  activeConnections.delete(guildId);
}

function isValidAudioUrl(url) {
  if (!url) return false;
  try {
    if (play.yt_validate(url)) return true;
    const u = new URL(url);
    const ext = u.pathname.split('.').pop().toLowerCase().split('?')[0];
    return ['mp3', 'ogg', 'wav', 'flac', 'aac', 'opus', 'webm', 'm4a'].includes(ext);
  } catch { return false; }
}

async function playLocalAudio(voiceChannel, filename, onFinish) {
  const filePath = path.join(SOUNDS_DIR, filename);
  if (!fs.existsSync(filePath)) return () => {};

  const guildId = voiceChannel.guild.id;
  const existing = activeConnections.get(guildId);
  if (!existing?.connection) return () => {};

  const ambientPlayer = createAudioPlayer();
  const resource = createAudioResource(filePath);

  ambientPlayer.play(resource);
  existing.connection.subscribe(ambientPlayer);

  const cleanup = () => {
    try { ambientPlayer.stop(true); } catch (_) {}
    if (existing.player && existing.connection) {
        existing.connection.subscribe(existing.player);
    }
  };

  ambientPlayer.on(AudioPlayerStatus.Idle, () => {
    cleanup();
    if (onFinish) onFinish();
  });

  return cleanup;
}

module.exports = { playAudio, playLocalAudio, stopAudio, isValidAudioUrl };
