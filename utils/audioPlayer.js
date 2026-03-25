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
 * @param {VoiceChannel} voiceChannel - Le salon
 * @param {string} audioUrl - Le lien
 * @param {Function} onFinish - Callback fin
 * @param {Function} onError - Callback erreur
 * @param {string} singerId - ID du chanteur (Optionnel pour l'étape 1)
 */
async function playAudio(voiceChannel, audioUrl, onFinish, onError, singerId = null) {
  const guildId = voiceChannel.guild.id;
  stopAudio(guildId);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false, // INDISPENSABLE : Le bot doit entendre
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, AUDIO_CONNECT_TIMEOUT_MS);
    
    // --- INTÉGRATION ÉTAPE 1 ---
    // Si on a un singerId, on active l'écoute immédiatement après la connexion
    if (singerId) {
      const receiver = setupUserReceiver(connection, singerId);
      // On stocke le receiver dans la map pour pouvoir le fermer plus tard si besoin
      const currentData = activeConnections.get(guildId) || {};
      activeConnections.set(guildId, { ...currentData, connection, receiver });
    }
    // ----------------------------

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
    
    // Mise à jour de la map avec le player
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
    active.player.stop(true);
    // Le receiver se coupe automatiquement quand la connexion est détruite
    active.connection.destroy();
  } catch (_) {}
  activeConnections.delete(guildId);
}

// ... (isValidAudioUrl et playLocalAudio restent inchangés)

module.exports = { playAudio, playLocalAudio, stopAudio, isValidAudioUrl };
