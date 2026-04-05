const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- SYNCHRONISATION DES COOKIES YOUTUBE ---
// On vérifie les deux noms possibles pour être sûr
const rawCookies = process.env.YT_COOKIES_BASE64 || process.env.YOUTUBE_COOKIES;

if (rawCookies) {
    try {
        let cookieContent;
        
        // Si c'est du Base64 (on vérifie s'il y a des caractères typiques ou si c'est YT_COOKIES_BASE64)
        if (process.env.YT_COOKIES_BASE64) {
            cookieContent = Buffer.from(rawCookies, 'base64').toString('utf-8');
        } else {
            cookieContent = rawCookies; // Texte brut
        }

        // Définition du chemin (Volume Railway /data ou local /app/data)
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        const cookiePath = path.join(dataDir, 'youtube_cookies.txt');
        fs.writeFileSync(cookiePath, cookieContent);
        
        console.log(`✅ Fichier youtube_cookies.txt généré avec succès dans : ${cookiePath}`);
    } catch (err) {
        console.error("❌ Erreur lors de la génération des cookies :", err.message);
    }
} else {
    console.warn("⚠️ Aucune variable de cookies (YT_COOKIES_BASE64 ou YOUTUBE_COOKIES) trouvée.");
}

// ─── 1. CONTRÔLE ANTI-CRASH ──────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
    console.error('❌ [ERREUR PROMESSE]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ [ERREUR FATALE]', err.message);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,        
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,      
        GatewayIntentBits.GuildVoiceStates,    
        GatewayIntentBits.GuildScheduledEvents, 
        GatewayIntentBits.GuildPresences,      
    ],
});

client.commands = new Collection();

// ─── 2. CHARGEMENT DES COMMANDES ────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
            }
        } catch (error) {
            console.error(`⚠️ Impossible de charger la commande ${file}:`, error.message);
        }
    }
}

// ─── 3. CHARGEMENT DES ÉVÉNEMENTS ───────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            // Correction de la récupération du nom pour éviter l'erreur "Events is not defined"
            const eventName = event.name; 
            
            if (eventName) {
                if (event.once) {
                    client.once(eventName, (...args) => event.execute(...args, client));
                } else {
                    client.on(eventName, (...args) => event.execute(...args, client));
                }
            }
        } catch (error) {
            console.error(`⚠️ Erreur sur l'événement ${file}:`, error.message);
        }
    }
}

// ─── 4. CONNEXION ───────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ [LOGIN ERROR]:', err.message);
});
