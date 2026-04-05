const fs   = require('fs');
const path = require('path');

const DB_PATH = '/data/scores.json';
const HISTORY_PATH = '/data/history.json';

// ─── LECTURE / ÉCRITURE ───────────────────────────────────────────────────────

function loadJSON(filePath) {
    if (!fs.existsSync(filePath)) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({}));
        return {};
    }
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data || '{}'); // ✅ Sécurité si le fichier est vide
    } catch (err) {
        console.error(`[scoreDB] Erreur sur ${path.basename(filePath)} :`, err.message);
        return {};
    }
}

function saveJSON(filePath, data) {
    try {
        const tmp = filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, filePath);
    } catch (err) {
        console.error(`[scoreDB] Erreur écriture sur ${path.basename(filePath)} :`, err.message);
    }
}

// ─── LOGIQUE DES SCORES ───────────────────────────────────────────────────────

function updateGlobalScores(guildId, players) {
    if (!players || players.length === 0) return;

    const db = loadJSON(DB_PATH);
    if (!db[guildId]) db[guildId] = {};

    // 1. Mise à jour des stats individuelles
    for (const player of players) {
        const uid = String(player.userId);
        if (!db[guildId][uid]) {
            db[guildId][uid] = {
                username: player.username,
                totalScore: 0,
                gamesPlayed: 0,
                wins: 0,
                bestScore: 0,
            };
        }
        
        const entry = db[guildId][uid];
        entry.username    = player.username; // ✅ Update username si changé
        entry.totalScore += (player.score || 0);
        entry.gamesPlayed++;
        
        if (player.score > (entry.bestScore || 0)) {
            entry.bestScore = player.score;
        }
    }

    // 2. Détermination du gagnant (celui qui a le plus gros score cette session)
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    if (sorted[0] && sorted[0].score > 0) {
        const winnerId = String(sorted[0].userId);
        if (db[guildId][winnerId]) {
            db[guildId][winnerId].wins = (db[guildId][winnerId].wins || 0) + 1;
        }
    }

    saveJSON(DB_PATH, db);

    // 3. Mise à jour de l'historique
    const history = loadJSON(HISTORY_PATH);
    if (!Array.isArray(history[guildId])) history[guildId] = [];

    history[guildId].unshift({
        date    : new Date().toISOString(),
        winner  : sorted[0] ? { userId: String(sorted[0].userId), username: sorted[0].username, score: sorted[0].score } : null,
        players : sorted.map(p => ({ userId: String(p.userId), username: p.username, score: p.score })),
    });

    // On garde les 20 dernières sessions (plus généreux que 10)
    history[guildId] = history[guildId].slice(0, 20);
    saveJSON(HISTORY_PATH, history);
}

// ─── RÉCUPÉRATION DES DONNÉES ─────────────────────────────────────────────────

function getGlobalLeaderboard(guildId, limit = 10) {
    const db = loadJSON(DB_PATH);
    const guildData = db[guildId] || {};
    
    return Object.entries(guildData)
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit)
        .map((entry, i) => ({ rank: i + 1, ...entry }));
}

function getPlayerStats(guildId, userId) {
    const db = loadJSON(DB_PATH);
    return db[guildId]?.[String(userId)] || null;
}

function getSessionHistory(guildId, limit = 5) {
    const history = loadJSON(HISTORY_PATH);
    const guildHistory = history[guildId] || [];
    return Array.isArray(guildHistory) ? guildHistory.slice(0, limit) : [];
}

module.exports = {
    updateGlobalScores,
    getGlobalLeaderboard,
    getPlayerStats,
    getSessionHistory,
};
