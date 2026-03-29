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

// On garde ta gestion de cookies
async function activateYoutubeCookies() {
    try {
        await play.setToken({ youtube: { cookie: "/data/youtube_cookies.txt" } });
        console.log("✅ [YouTube] Cookies activés.");
    } catch (err) { console.error("❌ [YouTube] Erreur cookies:", err.message); }
}
activateYoutubeCookies();

const { setupUserReceiver } = require('./voiceReceiver');
const activeConnections = new Map();

/**
 * Jouer un son sans détruire la connexion à chaque fois
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError, singerId = null) {
  const guildId = voiceChannel.guild.id;
  let active = activeConnections.get(guildId);

  // 1. GESTION DE LA CONNEXION (On ne rejoint que si nécessaire)
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
      connection.destroy();
      if (onError) onError(new Error('Connexion impossible.'));
      return;
    }
  }

  // 2. STOPPER LA MUSIQUE PRÉCÉDENTE MAIS GARDER LA CONNEXION
  active.player.stop(true);

  // 3. ATTACHE DU RECEIVER (Une seule fois par session si possible)
  if (singerId && !active.receiver) {
    active.receiver = setupUserReceiver(active.connection, singerId);
  }

  // 4. PRÉPARATION DE LA RESSOURCE
  try {
    let resource;
    if (play.yt_validate(audioUrl)) {
      const stream = await play.stream(audioUrl, { quality: 1, discordPlayerCompatibility: true });
      resource = createAudioResource(stream.stream, { inputType: stream.type });
    } else {
      resource = createAudioResource(audioUrl, { inputType: StreamType.Arbitrary });
    }

    // 5. LECTURE
    active.player.play(resource);

    // Nettoyage des anciens écouteurs pour éviter les fuites de mémoire
    active.player.removeAllListeners(AudioPlayerStatus.Idle);
    active.player.removeAllListeners('error');

    active.player.on(AudioPlayerStatus.Idle, () => {
      if (onFinish) onFinish();
    });

    active.player.on('error', err => {
      console.error('[AudioPlayer] Erreur:', err.message);
      if (onError) onError(err);
    });

  } catch (err) {
    console.error('[AudioPlayer] Erreur ressource:', err);
    if (onError) onError(err);
  }
}

/**
 * Arrête tout et QUITTE le salon (à utiliser uniquement à la fin du test ou /stop)
 */
function stopAudio(guildId) {
  const active = activeConnections.get(guildId);
  if (!active) return;
  
  try {
    active.player.stop(true);
    if (active.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      active.connection.destroy();
    }
  } catch (e) { console.error("[AudioPlayer] Erreur stop:", e.message); }
  activeConnections.delete(guildId);
}

module.exports = { playAudio, stopAudio };
