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
