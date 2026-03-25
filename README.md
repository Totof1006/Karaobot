# 🎤 Karaobot — Bot Discord Karaoké

Bot Discord complet pour organiser des soirées karaoké.

## Fonctionnalités

- 📅 Événements planifiés avec inscriptions et rappels automatiques
- 🎵 3 chansons par chanteur, tirées au sort à chaque tour
- 🗳️ Votes 1-5 étoiles après chaque passage
- 🏆 Classements, médailles et statistiques
- 🎶 Paroles synchronisées en direct (via lrclib.net)
- 🔊 Lecture audio automatique dans le salon vocal
- 3 tours maximum par soirée (session + 2 revanches)

## Installation

### Prérequis
- Node.js >= 20
- Un bot Discord (https://discord.com/developers/applications)

### Configuration
1. Copier `.env.example` en `.env`
2. Remplir `DISCORD_TOKEN`, `CLIENT_ID` et `GUILD_ID`
3. Créer le dossier `sounds/` et y placer `applause.mp3`

### Démarrage
```bash
npm install
node deploy-commands.js   # enregistrer les slash commands (une seule fois)
node index.js             # démarrer le bot
```

### Déploiement Railway
Voir le fichier `Procfile` — Railway détecte automatiquement la configuration.
Ajouter les variables d'environnement dans l'onglet Variables de Railway.

## Structure
```
commands/    → 23 slash commands
events/      → interactionCreate + ready
utils/       → modules métier (session, audio, rôles, paroles...)
data/        → base de données JSON (créée automatiquement)
lyrics/      → fichiers .lrc des paroles
sounds/      → applause.mp3
```

## Commandes principales

| Commande | Rôle requis | Description |
|---|---|---|
| `/evenement` | Leader | Créer un événement planifié |
| `/lancer-evenement` | Leader/Modo | Lancer la session |
| `/rejouer` | Leader/Modo | Lancer une revanche |
| `/fermer-evenement` | Leader/Modo | Nettoyer après la soirée |
| `/inscrire` | Tous | S'inscrire + soumettre ses chansons |
| `/help` | Tous | Afficher les commandes disponibles |
