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
const play = require('play-dl'); // <--- Ajouté pour YouTube
const fs   = require('fs');
const path = require('path');

const SOUNDS_DIR = path.join(__dirname, '../sounds');
const activeConnections = new Map();

/**
 * Rejoindre le salon vocal et jouer un lien (YouTube ou Direct).
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError) {
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
  } catch (err) {
    connection.destroy();
    if (onError) onError(new Error('Impossible de rejoindre le salon vocal.'));
    return () => {};
  }

  const player = createAudioPlayer();
  let resource;

  try {
    // SI C'EST DU YOUTUBE
    if (play.yt_validate(audioUrl)) {
      const stream = await play.stream(audioUrl, {
        quality: 0,
        discordPlayerCompatibility: true
      });
      resource = createAudioResource(stream.stream, { inputType: stream.type });
    } 
    // SINON SI C'EST UN LIEN DIRECT
    else {
      resource = createAudioResource(audioUrl, { inputType: StreamType.Arbitrary });
    }

    player.play(resource);
    connection.subscribe(player);
    activeConnections.set(guildId, { connection, player });

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
    active.player.stop(true);
    active.connection.destroy();
  } catch (_) {}
  activeConnections.delete(guildId);
}

/**
 * Nouvelle version de validation : accepte YouTube + fichiers audio.
 */
function isValidAudioUrl(url) {
  if (!url) return false;
  try {
    // Vérification YouTube
    if (play.yt_validate(url)) return true;
    
    // Vérification Extension fichier
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
