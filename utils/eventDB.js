const fs   = require('fs');
const path = require('path');
const { MAX_SINGERS } = require('./constants');

const DB_PATH = path.join(__dirname, '../data/events.json');

// ─── Lecture / écriture ───────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('[eventDB] Fichier JSON corrompu, réinitialisation :', err.message);
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
    return {};
  }
}

function saveDB(db) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// ─── CRUD événements ──────────────────────────────────────────────────────────

function createEvent(guildId, opts) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};

  // On range tout dans le tiroir .event
  db[guildId].event = {
    hostId            : opts.hostId,
    channelId         : opts.channelId, 
    announceChannelId : opts.announceChannelId || opts.channelId,
    title             : opts.title,
    eventDate         : (opts.eventDate instanceof Date) ? opts.eventDate.toISOString() : opts.eventDate,
    registrationStart : (opts.registrationStart instanceof Date) ? opts.registrationStart.toISOString() : opts.registrationStart,
    registrationEnd   : (opts.registrationEnd instanceof Date) ? opts.registrationEnd.toISOString() : opts.registrationEnd,
    announceMsgId     : opts.announceMsgId  || null,
    discordEventId    : opts.discordEventId || null,
    reminderSent      : false,
    closeSent         : false,
    registrations     : [],
  };

  saveDB(db);
  return db[guildId].event;
}

function getEvent(guildId) {
  const db = loadDB();
  // On lit uniquement dans le tiroir .event
  return db[guildId]?.event || null;
}

function deleteEvent(guildId) {
  const db = loadDB();
  if (db[guildId]) {
    // On supprime proprement UNIQUEMENT le tiroir event
    delete db[guildId].event; 
    saveDB(db);
  }
}

function saveEvent(guildId, eventData) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  
  // TRÈS IMPORTANT : On sauvegarde dans .event pour que getEvent() le retrouve
  db[guildId].event = eventData; 
  
  saveDB(db);
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

function registerPlayer(guildId, userId, username) {
  const db    = loadDB();
  const event = db[guildId]?.event; // On ajoute .event ici
  if (!event) return { ok: false, reason: 'no_event' };

  const now = new Date();
  if (now < new Date(event.registrationStart)) return { ok: false, reason: 'not_open' };
  if (now > new Date(event.registrationEnd))   return { ok: false, reason: 'closed' };
  if (event.registrations.length >= MAX_SINGERS)       return { ok: false, reason: 'full' };
  if (event.registrations.find(r => r.userId === userId)) return { ok: false, reason: 'already' };

  event.registrations.push({ userId, username, songs: [] });
  saveDB(db);
  return { ok: true };
}

function unregisterPlayer(guildId, userId) {
  const db    = loadDB();
  const event = db[guildId]?.event; // On ajoute .event ici
  if (!event) return false;
  
  const before = event.registrations.length;
  event.registrations = event.registrations.filter(r => r.userId !== userId);
  
  saveDB(db);
  return event.registrations.length < before;
}

function setPlayerSongs(guildId, userId, songs) {
  const db    = loadDB();
  const event = db[guildId]?.event; // On ajoute .event ici
  if (!event) return false;
  
  const reg = event.registrations.find(r => r.userId === userId);
  if (!reg)  return false;
  
  reg.songs = songs.slice(0, 3);
  saveDB(db);
  return true;
}

// ─── Helpers dates ────────────────────────────────────────────────────────────

function isRegistrationOpen(event) {
  const now = new Date();
  return now >= new Date(event.registrationStart) && now <= new Date(event.registrationEnd);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  });
}

// Retourne tous les guilds ayant un événement (pour le scheduler)
function getAllEvents() {
  const db = loadDB();
  const list = [];
  
  for (const guildId in db) {
    if (db[guildId].event) {
      // On extrait l'événement du tiroir pour le scheduler
      list.push({ guildId, ...db[guildId].event });
    }
  }
  return list;
}

module.exports = {
  createEvent, getEvent, deleteEvent, saveEvent,
  registerPlayer, unregisterPlayer, setPlayerSongs,
  isRegistrationOpen, formatDate, getAllEvents,
};
