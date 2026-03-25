const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/session_persist.json');

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ lastSessions: {}, voiceChannels: {}, rematchCount: {} }));
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.rematchCount)  data.rematchCount  = {};
    if (!data.nightResults)  data.nightResults  = {};
    if (!data.voiceChannels) data.voiceChannels = {};
    if (!data.lastSessions)  data.lastSessions  = {};
    return data;
  } catch { return { lastSessions: {}, voiceChannels: {}, rematchCount: {}, nightResults: {} }; }
}

function save(db) {
  // Écriture atomique via fichier temporaire pour éviter la corruption
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// ─── Persistance du lastSession ───────────────────────────────────────────────
function saveLastSession(guildId, snapshot) {
  const db = load();
  db.lastSessions[guildId] = {
    hostId : snapshot.hostId,
    players: snapshot.players.map(p => ({
      userId     : p.userId,
      username   : p.username,
      songs      : p.songs,
      playedSongs: p.playedSongs || [],
    })),
  };
  save(db);
}

function loadLastSession(guildId) {
  const db = load();
  return db.lastSessions[guildId] || null;
}

function clearLastSession(guildId) {
  const db = load();
  delete db.lastSessions[guildId];
  save(db);
}

// ─── Compteur de revanches (max 2 → 3 tours au total) ────────────────────────
// Tour 1 = session normale → rematchCount = 0
// Tour 2 = 1ère revanche  → rematchCount = 1
// Tour 3 = 2ème revanche  → rematchCount = 2  (dernier tour possible)
function getRematchCount(guildId) {
  const db = load();
  return db.rematchCount[guildId] || 0;
}

function incrementRematchCount(guildId) {
  const db = load();
  db.rematchCount[guildId] = (db.rematchCount[guildId] || 0) + 1;
  save(db);
}

function resetRematchCount(guildId) {
  const db = load();
  db.rematchCount[guildId] = 0;
  save(db);
}

// ─── Persistance du salon vocal ───────────────────────────────────────────────
function saveVoiceChannel(guildId, channelId) {
  const db = load();
  db.voiceChannels[guildId] = channelId;
  save(db);
}

function loadVoiceChannel(guildId) {
  const db = load();
  return db.voiceChannels[guildId] || null;
}

// ─── Résultats cumulés de toute la soirée (pour le récap final) ──────────────
function appendNightResults(guildId, roundResults) {
  const db = load();
  if (!db.nightResults) db.nightResults = {};
  if (!db.nightResults[guildId]) db.nightResults[guildId] = [];
  db.nightResults[guildId].push(...roundResults);
  save(db);
}

function getNightResults(guildId) {
  const db = load();
  return db.nightResults?.[guildId] || [];
}

function clearNightResults(guildId) {
  const db = load();
  if (db.nightResults) delete db.nightResults[guildId];
  save(db);
}

module.exports = {
  saveLastSession, loadLastSession, clearLastSession,
  getRematchCount, incrementRematchCount, resetRematchCount,
  saveVoiceChannel, loadVoiceChannel,
  appendNightResults, getNightResults, clearNightResults,
};
