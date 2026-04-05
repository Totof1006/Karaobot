const fs   = require('fs');
const path = require('path');
const { MAX_SINGERS } = require('./constants');

const DB_PATH = '/data/events.json';

// ─── LECTURE / ÉCRITURE ───────────────────────────────────────────────────────

function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        // ✅ Sécurité : S'assurer que le dossier parent existe
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, JSON.stringify({}));
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (err) {
        console.error('[eventDB] Fichier JSON corrompu, réinitialisation :', err.message);
        return {};
    }
}

function saveDB(db) {
    try {
        const tmp = DB_PATH + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
        fs.renameSync(tmp, DB_PATH);
    } catch (err) {
        console.error('[eventDB] Erreur lors de la sauvegarde :', err.message);
    }
}

// ─── FONCTION DE FORMATAGE ───────────────────────────────────────────────────

function formatDate(dateInput) {
    if (!dateInput) return "Date inconnue";
    // ✅ Conversion forcée en objet Date si c'est une string ISO provenant du JSON
    const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    
    // Vérification de la validité de la date
    if (isNaN(date.getTime())) return "Date invalide";

    return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris' // ✅ Recommandé pour éviter les décalages serveur
    }).replace(':', 'h');
}

// ─── CRUD ÉVÉNEMENTS ──────────────────────────────────────────────────────────

function createEvent(guildId, opts) {
    const db = loadDB();
    
    // ✅ Conversion systématique en ISOString pour le stockage JSON
    const toISO = (d) => (d instanceof Date) ? d.toISOString() : d;

    db[guildId] = {
        event: {
            hostId            : opts.hostId,
            channelId         : opts.channelId, 
            announceChannelId : opts.announceChannelId || opts.channelId,
            title             : opts.title,
            eventDate         : toISO(opts.eventDate),
            registrationStart : toISO(opts.registrationStart),
            registrationEnd   : toISO(opts.registrationEnd),
            announceMsgId     : opts.announceMsgId  || null,
            discordEventId    : opts.discordEventId || null,
            reminderSent      : false,
            closeSent         : false,
            registrations     : [],
        }
    };

    saveDB(db);
    return db[guildId].event;
}

// ... (getEvent, saveEvent, deleteEvent restent identiques et corrects)

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

    // ✅ Normalisation du userId (String) pour éviter les types discord.js complexes
    const uid = String(userId);
    if (event.registrations.find(r => String(r.userId) === uid)) {
        return { ok: false, reason: 'already' };
    }
    
    if (event.registrations.length >= MAX_SINGERS) return { ok: false, reason: 'full' };

    event.registrations.push({ userId: uid, username, songs: [] });
    saveDB(db);
    return { ok: true };
}

// ... (setPlayerSongs, unregisterPlayer, isRegistrationOpen restent corrects)

function setPlayerSongs(guildId, userId, songs) {
    const db    = loadDB();
    const event = db[guildId]?.event;
    if (!event) return false;
    
    const reg = event.registrations.find(r => String(r.userId) === String(userId));
    if (!reg)  return false;
    
    reg.songs = songs.map(s => ({
        title: s.title || "Inconnu",
        url: s.url || null,
        apiDuration: s.apiDuration || 0,
        verified: !!s.verified
    }));
    
    saveDB(db);
    return true;
}

function unregisterPlayer(guildId, userId) {
    const db    = loadDB();
    const event = db[guildId]?.event;
    if (!event) return false;
    
    const countBefore = event.registrations.length;
    event.registrations = event.registrations.filter(r => String(r.userId) !== String(userId));
    
    saveDB(db);
    return event.registrations.length < countBefore;
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
    return Object.entries(db)
        .filter(([_, data]) => data.event)
        .map(([guildId, data]) => ({ guildId, ...data.event }));
}

module.exports = {
    createEvent, 
    getEvent, 
    deleteEvent, 
    saveEvent,
    registerPlayer, 
    unregisterPlayer, 
    setPlayerSongs,
    getAllEvents,
    isRegistrationOpen,
    formatDate 
};
