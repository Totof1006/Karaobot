const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  entersState,
  StreamType 
} = require('@discordjs/voice');
const play = require('play-dl');
const { AUDIO_CONNECT_TIMEOUT_MS } = require('./constants');

// --- CONFIGURATION YOUTUBE ---
async function activateYoutubeCookies() {
    try {
        await play.setToken({ youtube: { cookie: "/data/youtube_cookies.txt" } });
        console.log("✅ [AudioPlayer] YouTube Authentifié.");
    } catch (err) { console.error("❌ [AudioPlayer] Erreur Cookies:", err.message); }
}
activateYoutubeCookies();

const activeConnections = new Map();

/**
 * Jouer de l'audio de façon stable
 * @param {VoiceChannel} voiceChannel - Le salon vocal
 * @param {string} audioUrl - Lien YouTube ou direct
 * @param {Function} onFinish - Callback de fin
 * @param {boolean} persistConnection - Si TRUE, ne détruit pas la connexion à la fin
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError, singerId = null, persistConnection = false) {
  const guildId = voiceChannel.guild.id;
  let active = activeConnections.get(guildId);

  // 1. REUTILISATION OU CREATION DE LA CONNEXION
  if (!active || active.connection.state.status === VoiceConnectionStatus.Destroyed) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, AUDIO_CONNECT_TIMEOUT_MS);
      active = { connection, player: createAudioPlayer() };
      connection.subscribe(active.player);
      activeConnections.set(guildId, active);
    } catch (err) {
      if (connection) connection.destroy();
      if (onError) onError(err);
      return;
    }
  }

  // 2. LECTURE DE LA RESSOURCE
  try {
    active.player.stop(true); // Arrête le morceau précédent s'il y en a un
    
    let resource;
    if (play.yt_validate(audioUrl)) {
      const stream = await play.stream(audioUrl, { quality: 1, discordPlayerCompatibility: true });
      resource = createAudioResource(stream.stream, { inputType: stream.type });
    } else {
      resource = createAudioResource(audioUrl, { inputType: StreamType.Arbitrary });
    }

    active.player.play(resource);

    // 3. GESTION DE LA FIN (Événements uniques pour éviter les bugs)
    active.player.removeAllListeners(AudioPlayerStatus.Idle);
    active.player.once(AudioPlayerStatus.Idle, () => {
      if (!persistConnection) {
        stopAudio(guildId); // Mode événement : on quitte
      }
      if (onFinish) onFinish();
    });

  } catch (err) {
    console.error('[AudioPlayer] Erreur flux:', err);
    if (onError) onError(err);
  }
}

/**
 * Arrêt total et déconnexion
 */
function stopAudio(guildId) {
  const active = activeConnections.get(guildId);
  if (!active) return;
  try {
    active.player.stop(true);
    if (active.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      active.connection.destroy();
    }
  } catch (e) {}
  activeConnections.delete(guildId);
}

module.exports = { playAudio, stopAudio };
