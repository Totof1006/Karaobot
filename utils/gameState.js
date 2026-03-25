// Gestionnaire d'état des sessions karaoké
const sessions   = new Map();
const { saveLastSession, loadLastSession } = require('./persist');
const { MAX_SINGERS } = require('./constants');

function createSession(guildId, hostId, channelId) {
  const session = {
    guildId,
    hostId,
    channelId,
    phase: 'registration', // registration | singing | voting | results | finished
    players: [],           // [{ userId, username, songs: [], score: 0, playedSongs: [] }]
    currentSingerIndex: 0,
    currentSong: null,
    votes: new Map(),
    roundResults: [],
    timerHandle      : null,  // legacy — ne plus utiliser directement
    pauseTimerHandle : null,  // fonction qui cancel tous les timers de pause (countdowns + main)
    voteTimerHandle  : null,  // setTimeout ID du timer de fermeture du vote
    voteMessage: null,
    registrationMessage: null,
    stopLyrics        : null,
    stopAudio         : null,
    stopAmbient       : null,
    paused            : false,
    progressMessageId : null,  // ID du message de progression épinglé
  };
  sessions.set(guildId, session);
  return session;
}

// ─── Crée une session "revanche" depuis le snapshot persisté ─────────────────
function createRematchSession(guildId, hostId, channelId) {
  const last = loadLastSession(guildId);
  if (!last) return null;

  // Copie puis mélange Fisher-Yates (équitable, contrairement à sort(Math.random))
  const shuffled = [...last.players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const players = shuffled.map(p => {
    const playedTitles = (p.playedSongs || []).map(s => typeof s === 'string' ? s : s.title);
    const remaining    = (p.songs || []).filter(s => {
      const t = typeof s === 'string' ? s : s.title;
      return !playedTitles.includes(t);
    });
    const pool   = remaining.length > 0 ? remaining : (p.songs || []);
    // Guard: si aucune chanson disponible, créer un placeholder
    const picked = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : { title: '?', url: null };
    return {
      userId     : p.userId,
      username   : p.username,
      songs      : [picked],
      chosenSong : picked,
      score      : 0,
      playedSongs: [],
    };
  });

  const session = {
    guildId,
    hostId,
    channelId,
    phase             : 'registration',
    players,
    currentSingerIndex: 0,
    currentSong       : null,
    votes             : new Map(),
    roundResults      : [],
    timerHandle      : null,  // legacy
    pauseTimerHandle : null,
    voteTimerHandle  : null,
    voteMessage       : null,
    registrationMessage: null,
    stopLyrics        : null,
    stopAudio         : null,
    stopAmbient       : null,
    isRematch         : true,
    paused            : false,
    progressMessageId : null,
  };
  sessions.set(guildId, session);
  return session;
}

function getSession(guildId) {
  return sessions.get(guildId) || null;
}

function getLastSession(guildId) {
  return loadLastSession(guildId);
}

function deleteSession(guildId) {
  const s = sessions.get(guildId);
  if (s) {
    // Annuler tous les timers actifs
    if (typeof s.pauseTimerHandle === 'function') s.pauseTimerHandle();
    else if (s.pauseTimerHandle) clearTimeout(s.pauseTimerHandle);
    if (s.voteTimerHandle) clearTimeout(s.voteTimerHandle);
    // Legacy : timerHandle (compatibilité ascendante)
    if (typeof s.timerHandle === 'function') s.timerHandle();
    else if (s.timerHandle) clearTimeout(s.timerHandle);
    if (s.stopLyrics)  s.stopLyrics();
    if (s.stopAudio)   s.stopAudio();
    if (s.stopAmbient) s.stopAmbient();
  }
  sessions.delete(guildId);
}

function addPlayer(session, userId, username) {
  if (session.players.length >= MAX_SINGERS) return false;
  if (session.players.find(p => p.userId === userId)) return false;
  // songs: [{ title, url }]
  session.players.push({ userId, username, songs: [], score: 0, playedSongs: [] });
  return true;
}

function setPlayerSongs(session, userId, songs) {
  const player = session.players.find(p => p.userId === userId);
  if (!player) return false;
  // Accepte soit des strings (rétrocompat) soit des objets { title, url }
  player.songs = songs.slice(0, 3).map(s =>
    typeof s === 'string' ? { title: s, url: null } : s
  );
  return true;
}

function getCurrentSinger(session) {
  return session.players[session.currentSingerIndex] || null;
}

function pickRandomSong(session) {
  const singer = getCurrentSinger(session);
  if (!singer) return null;

  // En mode revanche : chanson déjà tirée au sort à la création
  if (session.isRematch && singer.chosenSong) {
    session.currentSong = singer.chosenSong;
    return session.currentSong;
  }

  // Mode normal : tirage aléatoire parmi les chansons non encore jouées
  const playedTitles = singer.playedSongs.map(s => typeof s === 'string' ? s : s.title);
  const available    = singer.songs.filter(s => {
    const title = typeof s === 'string' ? s : s.title;
    return !playedTitles.includes(title);
  });
  const pool = available.length > 0 ? available : singer.songs;
  const idx  = Math.floor(Math.random() * pool.length);
  session.currentSong = pool[idx];
  return session.currentSong;
}

// Retourne le titre d'une chanson (string ou objet)
function getSongTitle(song) {
  if (!song) return '';
  return typeof song === 'string' ? song : song.title;
}

// Retourne l'URL d'une chanson (null si pas de lien)
function getSongUrl(song) {
  if (!song) return null;
  return typeof song === 'string' ? null : (song.url || null);
}

function addVote(session, voterId, value) {
  const singer = getCurrentSinger(session);
  if (!singer) return false;
  if (voterId === singer.userId) return false;
  if (session.votes.has(voterId)) return false;
  session.votes.set(voterId, value);
  return true;
}

function computeRoundScore(session) {
  const singer = getCurrentSinger(session);
  if (!singer) return 0;
  const voteValues = [...session.votes.values()];
  if (voteValues.length === 0) return 0;
  const avg    = voteValues.reduce((a, b) => a + b, 0) / voteValues.length;
  const points = Math.round(avg * 20);
  singer.score += points;

  // Mémoriser la chanson jouée (stocker l'objet complet)
  const currentTitle = getSongTitle(session.currentSong);
  const alreadyPlayed = singer.playedSongs.some(s =>
    (typeof s === 'string' ? s : s.title) === currentTitle
  );
  if (session.currentSong && !alreadyPlayed) {
    singer.playedSongs.push(session.currentSong);
  }

  session.roundResults.push({
    userId   : singer.userId,
    username : singer.username,
    song     : currentTitle,
    votes    : voteValues.length,
    avgScore : avg.toFixed(2),
    points,
    totalScore: singer.score,
  });
  return points;
}

function advanceToNextSinger(session) {
  session.currentSingerIndex++;
  session.votes      = new Map();
  session.currentSong = null;
  if (session.currentSingerIndex >= session.players.length) {
    session.phase = 'finished';
    // Persister le snapshot pour /rejouer (survit aux redémarrages)
    saveLastSession(session.guildId, {
      hostId : session.hostId,
      players: session.players.map(p => ({ ...p, playedSongs: [...p.playedSongs] })),
    });
    return false;
  }
  session.phase = 'singing';
  return true;
}

// Mélange aléatoire uniforme (Fisher-Yates) — plus équitable que Array.sort()
function shufflePlayers(session) {
  const arr = session.players;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getLeaderboard(session) {
  return [...session.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p }));
}

module.exports = {
  createSession, createRematchSession, getSession, getLastSession, deleteSession,
  addPlayer, setPlayerSongs, getCurrentSinger,
  pickRandomSong, getSongTitle, getSongUrl,
  addVote, computeRoundScore,
  advanceToNextSinger, getLeaderboard, shufflePlayers,
};
