const fs   = require('fs');
const path = require('path');
const { MAX_SINGERS } = require('./constants');

const DB_PATH = path.join(__dirname, '../data/events.json');

// ─── LECTURE / ÉCRITURE ───────────────────────────────────────────────────────

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

// ─── FONCTION DE FORMATAGE (Celle qui manquait !) ────────────────────────────

function formatDate(dateInput) {
    if (!dateInput) return "Date inconnue";
    const date = (typeof dateInput === 'string') ? new Date(dateInput) : dateInput;
    
    return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(':', 'h');
}

// ─── CRUD ÉVÉNEMENTS ──────────────────────────────────────────────────────────

function createEvent(guildId, opts) {
    const db = loadDB();
    if (!db[guildId]) db[guildId] = {};

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
    return db[guildId]?.event || null;
}

function saveEvent(guildId, eventData) {
    const db = loadDB();
    if (!db[guildId]) db[guildId] = {};
    db[guildId].event = eventData;  
    saveDB(db);
}

function deleteEvent(guildId) {
    const db = loadDB();
    if (db[guildId]) {
        delete db[guildId].event; 
        saveDB(db);
    }
}

// ─── INSCRIPTIONS & CHANSONS ──────────────────────────────────────────────────

function registerPlayer(guildId, userId, username) {
    const db    = loadDB();
    const event = db[guildId]?.event;
    if (!event) return { ok: false, reason: 'no_event' };

    if (event.registrations.find(r => r.userId === userId)) return { ok: false, reason: 'already' };
    if (event.registrations.length >= MAX_SINGERS) return { ok: false, reason: 'full' };

    event.registrations.push({ userId, username, songs: [] });
    saveDB(db);
    return { ok: true };
}

function setPlayerSongs(guildId, userId, songs) {
    const db    = loadDB();
    const event = db[guildId]?.event;
    if (!event) return false;
    
    const reg = event.registrations.find(r => r.userId === userId);
    if (!reg)  return false;
    
    reg.songs = songs.map(s => ({
        title: s.title || "Inconnu",
        artist: s.artist || "Inconnu",
        url: s.url || null,
        apiDuration: s.apiDuration || 0,
        verified: s.verified || false
    }));
    
    saveDB(db);
    return true;
}

function unregisterPlayer(guildId, userId) {
    const db    = loadDB();
    const event = db[guildId]?.event;
    if (!event) return false;
    
    const before = event.registrations.length;
    event.registrations = event.registrations.filter(r => r.userId !== userId);
    
    saveDB(db);
    return event.registrations.length < before;
}

function isRegistrationOpen(event) {
    if (!event) return false;
    const now = new Date();
    const start = new Date(event.registrationStart);
    const end = new Date(event.registrationEnd);
    return now >= start && now <= end;
}

function getAllEvents() {
    const db = loadDB();
    const list = [];
    for (const guildId in db) {
        if (db[guildId].event) {
            list.push({ guildId, ...db[guildId].event });
        }
    }
    return list;
}

// ─── EXPORTS (VÉRIFIÉ) ────────────────────────────────────────────────────────

module.exports = {
    createEvent, 
    getEvent, 
    deleteEvent, 
    saveEvent,
    registerPlayer, 
    unregisterPlayer, 
    setPlayerSongs,
    getAllEvents,
    isRegistrationOpen, // Ajouté pour interactionCreate
    formatDate          // Ajouté pour evenement.js et interactionCreate
};
