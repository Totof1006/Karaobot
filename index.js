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

// ─── 4. GESTION DES INTERACTIONS (MODALS & BOUTONS) ─────────────────────────
// On importe le fichier inscrire pour utiliser ses fonctions de traitement
const inscrire = require('./commands/inscrire'); 

client.on(Events.InteractionCreate, async interaction => {
    try {
        // Traitement des Commandes Slash
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        }

        // Traitement des Soumissions de Formulaires (Modals)
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_register_songs') {
                await inscrire.handleModalSubmit(interaction);
            }
        }

        // Traitement des Boutons
        if (interaction.isButton()) {
            // Bouton "S'inscrire" sur l'annonce de l'événement
            if (interaction.customId === 'btn_register') {
                await inscrire.showRegistrationModal(interaction);
            }
        }
    } catch (error) {
        console.error('❌ Erreur interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Une erreur est survenue lors de cette interaction.', ephemeral: true }).catch(() => null);
        }
    }
});

// ─── 5. CONNEXION ───────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ [LOGIN ERROR]:', err.message);
});
