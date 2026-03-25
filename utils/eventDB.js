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

/**
 * Crée un événement planifié.
 * @param {string} guildId
 * @param {object} opts
 *   - hostId          : ID Discord de l'hôte
 *   - channelId       : salon d'inscription
 *   - title           : titre de l'événement
 *   - eventDate       : Date JS — quand se déroule la session (vendredi)
 *   - registrationEnd : Date JS — fermeture des inscriptions (jeudi 12h)
 *   - registrationStart : Date JS — ouverture des inscriptions (dimanche 12h)
 *   - announceMsgId   : ID du message d'annonce épinglé
 */
function createEvent(guildId, opts) {
  const db = loadDB();

  // On initialise l'objet du serveur s'il n'existe pas encore
  // pour ne pas perdre ce qui est déjà dedans (comme le salon vocal)
  if (!db[guildId]) db[guildId] = {};

  // On stocke les données dans db[guildId].event au lieu de db[guildId] directement
  db[guildId].event = {
    hostId            : opts.hostId,
    channelId         : opts.channelId, 
    announceChannelId : opts.announceChannelId || opts.channelId,
    title             : opts.title,
    eventDate         : opts.eventDate.toISOString(),
    registrationStart : opts.registrationStart.toISOString(),
    registrationEnd   : opts.registrationEnd.toISOString(),
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
  return db[guildId]?.event || null;
}

function deleteEvent(guildId) {
  const db = loadDB();
  if (db[guildId]) {
    // On ne supprime pas db[guildId] (qui contient peut-être des configs)
    // On remet juste à zéro les infos de l'événement
    db[guildId] = {
      registrations: [],
      // On peut garder d'autres infos ici si besoin
    };
    saveDB(db);
  }
}

function saveEvent(guildId, event) {
  const db = loadDB();
  db[guildId] = event;
  saveDB(db);
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

function registerPlayer(guildId, userId, username) {
  const db    = loadDB();
  const event = db[guildId];
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
  const event = db[guildId];
  if (!event) return false;
  const before = event.registrations.length;
  event.registrations = event.registrations.filter(r => r.userId !== userId);
  saveDB(db);
  return event.registrations.length < before;
}

function setPlayerSongs(guildId, userId, songs) {
  const db    = loadDB();
  const event = db[guildId];
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
  return Object.entries(db).map(([guildId, event]) => ({ guildId, ...event }));
}

module.exports = {
  createEvent, getEvent, deleteEvent, saveEvent,
  registerPlayer, unregisterPlayer, setPlayerSongs,
  isRegistrationOpen, formatDate, getAllEvents,
};
