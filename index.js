const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- SYNCHRONISATION DES COOKIES YOUTUBE (Version Volume /data) ---
const rawCookies = process.env.YT_COOKIES_BASE64 || process.env.YOUTUBE_COOKIES;

if (rawCookies) {
    try {
        let cookieContent;
        if (process.env.YT_COOKIES_BASE64) {
            cookieContent = Buffer.from(rawCookies, 'base64').toString('utf-8');
        } else {
            cookieContent = rawCookies;
        }

        // On utilise ici le chemin ABSOLU /data correspondant à ta capture n°2
        const volumePath = '/data';
        if (!fs.existsSync(volumePath)) {
            fs.mkdirSync(volumePath, { recursive: true });
        }
        
        const cookieFile = path.join(volumePath, 'youtube_cookies.txt');
        fs.writeFileSync(cookieFile, cookieContent);
        
        console.log(`✅ Fichier généré dans le volume : ${cookieFile}`);
    } catch (err) {
        console.error("❌ Erreur cookies :", err.message);
    }
} else {
    console.warn("⚠️ YT_COOKIES_BASE64 est vide ou non détecté par Railway.");
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
            console.error(`⚠️ Commande ${file}:`, error.message);
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
            if (event.name) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args, client));
                } else {
                    client.on(event.name, (...args) => event.execute(...args, client));
                }
            }
        } catch (error) {
            console.error(`⚠️ Événement ${file}:`, error.message);
        }
    }
}

client.login(process.env.DISCORD_TOKEN);
