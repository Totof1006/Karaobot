const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
// On cible le dossier 'commands' à la racine (comme vu sur ton GitHub)
const commandsPath = path.join(__dirname, 'commands');

// 1. Vérification de sécurité pour éviter le déploiement "vide"
if (!fs.existsSync(commandsPath)) {
    console.error("❌ ERREUR : Le dossier 'commands' est introuvable à la racine !");
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 2. Chargement et log de chaque commande trouvée
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if (command.data && command.execute) {
        commands.push(command.data.toJSON());
        console.log(`✅ Commande détectée : ${file}`);
    } else {
        console.log(`⚠️ La commande ${file} a été ignorée (manque 'data' ou 'execute').`);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        if (commands.length === 0) {
            console.error("❌ Aucune commande valide trouvée. Annulation du déploiement.");
            return;
        }

        console.log(`🔄 Déploiement de ${commands.length} commandes vers le serveur...`);

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('✅ Toutes les commandes ont été enregistrées sur Discord !');
    } catch (err) {
        console.error('❌ Erreur lors du déploiement :', err);
    }
})();
