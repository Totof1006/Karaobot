const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = '/data/scores.json';
require('dotenv').config();

// --- SYNCHRONISATION DES COOKIES YOUTUBE ---
if (process.env.YT_COOKIES_BASE64) {
    try {
        const cookieContent = Buffer.from(process.env.YT_COOKIES_BASE64, 'base64').toString('utf-8');
        // ✅ Point validé : Création du dossier /data si inexistant pour éviter le crash Railway
        if (!fs.existsSync('/data')) {
            fs.mkdirSync('/data', { recursive: true });
        }
        fs.writeFileSync('/data/youtube_cookies.txt', cookieContent);
        console.log("✅ Fichier youtube_cookies.txt généré dans le volume.");
    } catch (err) {
        console.error("❌ Erreur lors de la génération des cookies :", err.message);
    }
}

// ─── 1. CONTRÔLE ANTI-CRASH (LOGS) ──────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [ERREUR PROMESSE]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ [ERREUR FATALE]', err.message);
    // On ne coupe pas le processus pour que Railway ne redémarre pas en boucle
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildPresences, // ✅ Point validé : Nécessaire pour la gestion des rôles
    ],
});

client.commands = new Collection();

// ─── 2. CHARGEMENT DES COMMANDES ─────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
        }
    } catch (error) {
        // CONTRÔLE : Si une commande a un "require" mort, elle n'empêche pas le bot de démarrer
        console.error(`⚠️ Impossible de charger la commande ${file}:`, error.message);
    }
}

// ─── 3. CHARGEMENT DES ÉVÉNEMENTS ───────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
    try {
        const event = require(path.join(eventsPath, file));
        // CONTRÔLE : Correction du Warning "ready" renommé en "ClientReady"
        const eventName = event.name === 'ready' ? Events.ClientReady : event.name;
        
        if (event.once) {
            client.once(eventName, (...args) => event.execute(...args, client));
        } else {
            client.on(eventName, (...args) => event.execute(...args, client));
        }
    } catch (error) {
        console.error(`⚠️ Erreur sur l'événement ${file}:`, error.message);
    }
}

// ─── 4. CONTRÔLE DE CONNEXION ────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
