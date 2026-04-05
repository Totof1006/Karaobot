const sessions   = new Map();
const { saveLastSession, loadLastSession } = require('./persist');
const { MAX_SINGERS } = require('./constants');

// ─── INITIALISATION ──────────────────────────────────────────────────────────

function createSession(guildId, hostId, channelId) {
  const session = {
    guildId,
    hostId,
    channelId,
    phase: 'registration',
    players: [],
    currentSingerIndex: 0,
    currentSong: null,
    votes: new Map(),
    roundResults: [],
    precisionTicks: 0, // ✅ Initialisation explicite
    timerHandle      : null,
    pauseTimerHandle : null,
    voteTimerHandle  : null,
    voteMessage: null,
    registrationMessage: null,
    stopLyrics        : null,
    stopAudio         : null,
    stopAmbient       : null,
    paused            : false,
    progressMessageId : null,
  };
  sessions.set(guildId, session);
  return session;
}

// ─── GESTION DES JOUEURS & CHANSONS ──────────────────────────────────────────

function addPlayer(session, userId, username) {
  if (session.players.length >= MAX_SINGERS) return false;
  // ✅ Normalisation du userId en String pour éviter les conflits de type
  const uid = String(userId);
  if (session.players.find(p => String(p.userId) === uid)) return false;

  session.players.push({ 
    userId: uid, 
    username, 
    songs: [], 
    score: 0, 
    playedSongs: [] 
  });
  return true;
}

function setPlayerSongs(session, userId, songs) {
  const player = session.players.find(p => String(p.userId) === String(userId));
  if (!player) return false;

  // ✅ Normalisation : Toujours stocker des objets { title, url }
  player.songs = songs.slice(0, 3).map(s => {
    if (typeof s === 'string') return { title: s, url: null };
    return { title: s.title || "Inconnu", url: s.url || null };
  });
  return true;
}

// ─── LOGIQUE DE JEU ──────────────────────────────────────────────────────────

function pickRandomSong(session) {
  const singer = getCurrentSinger(session);
  if (!singer) return null;

  // En mode revanche : chanson déjà fixée
  if (session.isRematch && singer.chosenSong) {
    session.currentSong = singer.chosenSong;
    return session.currentSong;
  }

  // Filtrage des chansons non jouées
  const playedTitles = singer.playedSongs.map(s => typeof s === 'string' ? s : s.title);
  const available = singer.songs.filter(s => {
    const title = typeof s === 'string' ? s : s.title;
    return !playedTitles.includes(title);
  });

  const pool = available.length > 0 ? available : singer.songs;
  const idx = Math.floor(Math.random() * pool.length);
  
  // ✅ On s'assure de retourner un objet normalisé
  const picked = pool[idx];
  session.currentSong = typeof picked === 'string' ? { title: picked, url: null } : picked;
  
  return session.currentSong;
}

function computeRoundScore(session) {
  const singer = getCurrentSinger(session);
  if (!singer) return 0;

  const voteValues = session.votes ? [...session.votes.values()] : [];
  
  // ✅ Moyenne par défaut à 2.5 si aucun vote (évite les scores à 0 par désertion)
  const avg = voteValues.length > 0 
    ? voteValues.reduce((a, b) => a + b, 0) / voteValues.length 
    : 2.5;

  // Précision vocale (Max 2.5 pts bonus)
  const precisionBonus = Math.min((session.precisionTicks || 0) / 25, 2.5);

  // Score sur 100 points
  const points = Math.round((avg + precisionBonus) * 20);
  singer.score = (singer.score || 0) + points;

  // Enregistrement de la chanson jouée
  if (session.currentSong) {
    const currentTitle = getSongTitle(session.currentSong);
    const alreadyPlayed = singer.playedSongs.some(s => getSongTitle(s) === currentTitle);
    if (!alreadyPlayed) {
      singer.playedSongs.push(session.currentSong);
    }
  }

  // Historique du round
  if (!session.roundResults) session.roundResults = [];
  session.roundResults.push({
    userId: singer.userId,
    username: singer.username,
    song: getSongTitle(session.currentSong),
    votes: voteValues.length,
    avgScore: avg.toFixed(2),
    precision: (precisionBonus * 4).toFixed(1), // Note sur 10
    points: points,
    totalScore: singer.score,
  });

  // Nettoyage
  session.precisionTicks = 0;
  session.votes.clear();

  return points;
}

function advanceToNextSinger(session) {
  session.currentSingerIndex++;
  session.votes.clear();
  session.currentSong = null;

  if (session.currentSingerIndex >= session.players.length) {
    session.phase = 'finished';
    // ✅ Persistance automatique pour la commande /rejouer
    saveLastSession(session.guildId, {
      hostId : session.hostId,
      players: session.players.map(p => ({ 
        userId: p.userId, 
        username: p.username, 
        songs: p.songs, 
        playedSongs: [...p.playedSongs] 
      })),
    });
    return false;
  }

  session.phase = 'singing';
  return true;
}

/**
 * Crée une session de revanche à partir des données précédentes
 */
function createRematchSession(guildId, oldData) {
  const session = createSession(guildId, oldData.hostId, null);
  session.isRematch = true;
  session.players = oldData.players.map(p => ({
    userId: p.userId,
    username: p.username,
    songs: p.songs,
    score: 0,
    playedSongs: p.playedSongs || []
  }));
  return session;
}

// ─── UTILITAIRES ─────────────────────────────────────────────────────────────

function getSession(guildId) { return sessions.get(guildId) || null; }

function getCurrentSinger(session) { return session.players[session.currentSingerIndex] || null; }

function getSongTitle(song) { 
  if (!song) return 'Inconnue';
  return typeof song === 'string' ? song : (song.title || 'Inconnue'); 
}

function getSongUrl(song) {
  if (!song || typeof song === 'string') return null;
  return song.url || null;
}

function deleteSession(guildId) {
  const s = sessions.get(guildId);
  if (s) {
    // ✅ Nettoyage systématique des timers pour éviter les fuites mémoire
    [s.pauseTimerHandle, s.voteTimerHandle, s.timerHandle].forEach(h => {
      if (typeof h === 'function') h();
      else if (h) clearTimeout(h);
    });
    if (s.stopLyrics)  s.stopLyrics();
    if (s.stopAudio)   s.stopAudio();
    if (s.stopAmbient) s.stopAmbient();
  }
  sessions.delete(guildId);
}

module.exports = {
  createSession, getSession, deleteSession, addPlayer, setPlayerSongs,
  getCurrentSinger, pickRandomSong, getSongTitle, getSongUrl,
  computeRoundScore, advanceToNextSinger, createRematchSession,
};
