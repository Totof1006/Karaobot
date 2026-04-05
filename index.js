const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- SYNCHRONISATION DES COOKIES YOUTUBE ---
if (process.env.YT_COOKIES_BASE64) {
    try {
        const cookieContent = Buffer.from(process.env.YT_COOKIES_BASE64, 'base64').toString('utf-8');
        // Vérification du dossier /data pour Railway
        if (!fs.existsSync('/data')) fs.mkdirSync('/data'); 
        fs.writeFileSync('/data/youtube_cookies.txt', cookieContent);
        console.log("✅ Fichier youtube_cookies.txt généré dans le volume.");
    } catch (err) {
        console.error("❌ Erreur lors de la génération des cookies :", err.message);
    }
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
    ],
});

client.commands = new Collection();

// ─── 2. CHARGEMENT SÉCURISÉ DES COMMANDES ────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
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

// ─── 3. CHARGEMENT DES ÉVÉNEMENTS ───────────────────────────────────────────
// ✅ C'est ce bloc qui charge ton fichier events/interactionCreate.js
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
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
}

// ─── 4. CONNEXION ───────────────────────────────────────────────────────────
// ✅ Note : Le bloc client.on(Events.InteractionCreate) a été supprimé ici
// car il faisait doublon avec le dossier /events et causait l'erreur 10062.

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ [LOGIN ERROR]:', err.message);
});
