const fs   = require('fs');
const path = require('path');

const DB_PATH = '/data/scores.json';
const HISTORY_PATH = '/data/history.json';

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('[scoreDB] Fichier scores.json corrompu, réinitialisation :', err.message);
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
    return {};
  }
}

function saveDB(db) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function saveHistory(h) {
  const tmp = HISTORY_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(h, null, 2));
  fs.renameSync(tmp, HISTORY_PATH);
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({}));
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch (err) {
    console.error('[scoreDB] Fichier history.json corrompu, réinitialisation :', err.message);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({}));
    return {};
  }
}

// Mettre à jour les scores globaux après une session
function updateGlobalScores(guildId, players) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};

  for (const player of players) {
    if (!db[guildId][player.userId]) {
      db[guildId][player.userId] = {
        username: player.username,
        totalScore: 0,
        gamesPlayed: 0,
        wins: 0,
        bestScore: 0,
      };
    }
    const entry = db[guildId][player.userId];
    entry.username    = player.username;
    entry.totalScore += player.score;
    entry.gamesPlayed++;
    if (player.score > entry.bestScore) entry.bestScore = player.score;
  }

  // ── Mise à jour du gagnant ──
  const sorted = [...players].sort((a, b) => b.score - a.score);
  
  if (sorted.length > 0 && sorted[0].score > 0) { // On ne gagne que si on a des points
    const winnerEntry = db[guildId][sorted[0].userId];
    if (winnerEntry) {
        winnerEntry.wins = (winnerEntry.wins || 0) + 1;
    }
  }

  saveDB(db);

  // ── Sauvegarder dans l'historique des sessions ────────────────────────────
  const h = loadHistory();
  if (!h[guildId]) h[guildId] = [];
  h[guildId].unshift({
    date    : new Date().toISOString(),
    winner  : sorted[0] ? { userId: sorted[0].userId, username: sorted[0].username, score: sorted[0].score } : null,
    players : sorted.map(p => ({ userId: p.userId, username: p.username, score: p.score })),
  });
  h[guildId] = h[guildId].slice(0, 10); // garder les 10 dernières
  saveHistory(h);
}

function getGlobalLeaderboard(guildId, limit = 10) {
  const db    = loadDB();
  const guild = db[guildId] || {};
  return Object.entries(guild)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit)
    .map((entry, i) => ({ rank: i + 1, ...entry }));
}

function getWeeklyStar(guildId) {
  const db      = loadDB();
  const guild   = db[guildId] || {};
  const entries = Object.entries(guild).map(([userId, data]) => ({ userId, ...data }));
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b.wins - a.wins)[0];
}

function getPlayerStats(guildId, userId) {
  const db = loadDB();
  return db[guildId]?.[userId] || null;
}

function getSessionHistory(guildId, limit = 5) {
  const h = loadHistory();
  return (h[guildId] || []).slice(0, limit);
}

module.exports = {
  updateGlobalScores, getGlobalLeaderboard,
  getPlayerStats, getSessionHistory,
};
