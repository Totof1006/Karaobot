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

// --- AJOUT ÉTAPE 1 ---
const { setupUserReceiver } = require('./voiceReceiver');
// ----------------------

const SOUNDS_DIR = path.join(__dirname, '../sounds');
const activeConnections = new Map();

/**
 * Rejoindre le salon vocal et jouer un lien (YouTube ou Direct).
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError, singerId = null) {
  const guildId = voiceChannel.guild.id;
  stopAudio(guildId);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, AUDIO_CONNECT_TIMEOUT_MS);
    
    // --- INTÉGRATION ÉTAPE 1 ---
    if (singerId) {
      const receiver = setupUserReceiver(connection, singerId);
      activeConnections.set(guildId, { connection, receiver });
    } else {
      activeConnections.set(guildId, { connection });
    }
  } catch (err) {
    connection.destroy();
    if (onError) onError(new Error('Impossible de rejoindre le salon vocal.'));
    return () => {};
  }

  const player = createAudioPlayer();
  let resource;

  try {
    if (play.yt_validate(audioUrl)) {
      const stream = await play.stream(audioUrl, {
        quality: 0,
        discordPlayerCompatibility: true
      });
      resource = createAudioResource(stream.stream, { inputType: stream.type });
    } else {
      resource = createAudioResource(audioUrl, { inputType: StreamType.Arbitrary });
    }

    player.play(resource);
    connection.subscribe(player);
    
    const existing = activeConnections.get(guildId);
    activeConnections.set(guildId, { ...existing, player });

  } catch (err) {
    console.error('[AudioPlayer] Erreur ressource :', err);
    stopAudio(guildId);
    if (onError) onError(err);
    return () => {};
  }

  player.on(AudioPlayerStatus.Idle, () => {
    stopAudio(guildId);
    if (onFinish) onFinish();
  });

  player.on('error', err => {
    console.error('[Audio] Erreur lecteur :', err.message);
    stopAudio(guildId);
    if (onError) onError(err);
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    activeConnections.delete(guildId);
  });

  return () => stopAudio(guildId);
}

/**
 * Arrête la lecture et déconnecte.
 */
function stopAudio(guildId) {
  const active = activeConnections.get(guildId);
  if (!active) return;
  try {
    if (active.player) active.player.stop(true);
    if (active.connection) active.connection.destroy();
  } catch (_) {}
  activeConnections.delete(guildId);
}

/**
 * Validation URL
 */
function isValidAudioUrl(url) {
  if (!url) return false;
  try {
    if (play.yt_validate(url)) return true;
    const u = new URL(url);
    const ext = u.pathname.split('.').pop().toLowerCase().split('?')[0];
    return ['mp3', 'ogg', 'wav', 'flac', 'aac', 'opus', 'webm', 'm4a'].includes(ext);
  } catch {
    return false;
  }
}

/**
 * Joue un fichier local (ex: applaudissements).
 */
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
    if (existing.player) existing.connection.subscribe(existing.player);
  };

  ambientPlayer.on(AudioPlayerStatus.Idle, () => {
    cleanup();
    if (onFinish) onFinish();
  });

  return cleanup;
}

module.exports = { playAudio, playLocalAudio, stopAudio, isValidAudioUrl };
