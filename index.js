const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- SYNCHRONISATION DES COOKIES YOUTUBE ---
const rawCookies = process.env.YT_COOKIES_BASE64;
if (rawCookies) {
    try {
        const cookieContent = Buffer.from(rawCookies, 'base64').toString('utf-8');
        const volumePath = '/data'; 
        if (!fs.existsSync(volumePath)) fs.mkdirSync(volumePath, { recursive: true });
        fs.writeFileSync(path.join(volumePath, 'youtube_cookies.txt'), cookieContent);
        console.log("✅ Fichier youtube_cookies.txt généré dans le volume.");
    } catch (err) {
        console.error("❌ Erreur cookies :", err.message);
    }
}

// --- CONTRÔLE ANTI-CRASH ---
process.on('unhandledRejection', (reason) => console.error('❌ [ERREUR PROMESSE]', reason));
process.on('uncaughtException', (err) => console.error('❌ [ERREUR FATALE]', err.message));

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

// Chargement des commandes
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.execute) client.commands.set(command.data.name, command);
    }
}

// Chargement des événements
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
        else client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.login(process.env.DISCORD_TOKEN);
