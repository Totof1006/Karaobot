const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ROLE_LEADER, ROLE_MODO,
        ROLE_SINGER, ROLE_SPECTATOR,
        hasRole }                              = require('../utils/roleManager');

// ─── Définition des commandes par rôle ───────────────────────────────────────

const HELP_LEADER = {
  title : '👑 Commandes Leader',
  color : 0xFFD700,
  groups: [
    {
      name : '📅 Gestion des événements',
      value:
        '`/evenement` — Créer un événement planifié\n' +
        '`/annuler-evenement` — Annuler l\'événement en cours\n' +
        '`/voir-evenement` — Voir les détails de l\'événement',
    },
    {
      name : '🔒 Gestion du salon',
      value:
        '`/verrouiller-salon` — Rendre le salon vocal invisible hors soirée\n' +
        '`/ouvrir-salon` — Ouvrir le salon le soir J\n' +
        '`/definir-vocal` — Définir le salon vocal karaoké',
    },
    {
      name : '▶️ Gestion de la session',
      value:
        '`/lancer-evenement` — Lancer officiellement la session\n' +
        '`/karaoke` — Démarrer une session libre\n' +
        '`/rejouer` — Lancer une revanche (max 2)\n' +
        '`/pause` — Programmer une pause après le vote en cours\n' +
        '`/reprise` — Reprendre après une pause\n' +
        '`/stop` — Arrêter la session (micros réactivés)\n' +
        '`/fermer-evenement` — Tout nettoyer après la soirée',
    },
    {
      name : '🎵 Ordre & Paroles',
      value:
        '`/ordre voir` — Voir l\'ordre de passage\n' +
        '`/ordre changer` — Modifier l\'ordre de passage\n' +
        '`/paroles-ajouter` — Télécharger des paroles depuis lrclib.net',
    },
    {
      name : '📊 Statistiques',
      value:
        '`/classement` — Classement global du serveur\n' +
        '`/historique` — 5 dernières sessions\n' +
        '`/stats [joueur]` — Statistiques d\'un joueur\n' +
        '`/chansons-liste` — Chansons disponibles avec paroles',
    },
  ],
};

const HELP_MODO = {
  title : '🛡️ Commandes Modo',
  color : 0xE67E22,
  groups: [
    {
      name : '🔒 Gestion du salon',
      value:
        '`/verrouiller-salon` — Rendre le salon vocal invisible\n' +
        '`/ouvrir-salon` — Ouvrir le salon le soir J',
    },
    {
      name : '▶️ Gestion de la session',
      value:
        '`/lancer-evenement` — Lancer officiellement la session\n' +
        '`/karaoke` — Démarrer une session libre\n' +
        '`/rejouer` — Lancer une revanche (max 2)\n' +
        '`/pause` — Programmer une pause après le vote en cours\n' +
        '`/reprise` — Reprendre après une pause\n' +
        '`/stop` — Arrêter la session\n' +
        '`/fermer-evenement` — Tout nettoyer après la soirée',
    },
    {
      name : '🎵 Ordre & Paroles',
      value:
        '`/ordre voir` — Voir l\'ordre de passage\n' +
        '`/ordre changer` — Modifier l\'ordre de passage\n' +
        '`/paroles-ajouter` — Télécharger des paroles depuis lrclib.net',
    },
    {
      name : '📊 Statistiques',
      value:
        '`/classement` — Classement global du serveur\n' +
        '`/historique` — 5 dernières sessions\n' +
        '`/stats [joueur]` — Statistiques d\'un joueur\n' +
        '`/chansons-liste` — Chansons disponibles avec paroles',
    },
    {
      name : '❌ Non disponible',
      value: '`/evenement` · `/annuler-evenement` · `/definir-vocal`',
    },
  ],
};

const HELP_SINGER = {
  title : '🎤 Commandes Chanteur',
  color : 0xFF69B4,
  groups: [
    {
      name : '📝 Inscription',
      value:
        '`/inscrire` — S\'inscrire + soumettre ses 3 chansons (formulaire)\n' +
        '`/inscrire-chansons` — Modifier ses chansons sans lien audio\n' +
        '`/chansons` — Soumettre ses chansons en session libre\n' +
        '_Format : `Titre — Artiste | https://lien-audio.mp3`_\n' +
        '_Le lien audio est optionnel_',
    },
    {
      name : '🗓️ Événement',
      value:
        '`/voir-evenement` — Détails de l\'événement en cours\n' +
        '`/chansons-liste` — Chansons disponibles avec paroles',
    },
    {
      name : '🎯 Session en cours',
      value:
        '`/ordre voir` — Voir l\'ordre de passage\n' +
        '_Votes : utilise les boutons ⭐ dans le chat_',
    },
    {
      name : '📊 Statistiques',
      value:
        '`/classement` — Classement global du serveur\n' +
        '`/historique` — 5 dernières sessions\n' +
        '`/stats [joueur]` — Statistiques d\'un joueur',
    },
    {
      name : '🎙️ Droits vocaux',
      value:
        '✅ Rejoindre le salon vocal\n' +
        '✅ Écrire dans le chat\n' +
        '✅ Micro ouvert pendant les pauses et ton tour\n' +
        '✅ Voter pour les autres chanteurs\n' +
        '❌ Soundboard bloquée',
    },
  ],
};

const HELP_SPECTATOR = {
  title : '👁️ Commandes Spectateur',
  color : 0x5865F2,
  groups: [
    {
      name : '🗓️ Événement',
      value:
        '`/voir-evenement` — Détails de l\'événement en cours\n' +
        '`/chansons-liste` — Chansons disponibles avec paroles',
    },
    {
      name : '📊 Statistiques',
      value:
        '`/classement` — Classement global du serveur\n' +
        '`/historique` — 5 dernières sessions\n' +
        '`/stats [joueur]` — Statistiques d\'un joueur',
    },
    {
      name : '🎙️ Droits vocaux',
      value:
        '✅ Rejoindre le salon vocal\n' +
        '✅ Écrire dans le chat\n' +
        '✅ Voter pour les chanteurs (boutons ⭐)\n' +
        '❌ Micro toujours coupé\n' +
        '❌ Soundboard bloquée',
    },
  ],
};

const HELP_DEFAULT = {
  title : '🎤 Karaobot — Aide',
  color : 0xFF69B4,
  groups: [
    {
      name : 'Aucun rôle karaoké détecté',
      value:
        'Tu n\'as pas encore de rôle karaoké sur ce serveur.\n\n' +
        'Rends-toi dans le salon **#karaoké-annonces** et clique sur :\n' +
        '• **🎤 S\'inscrire** pour participer comme chanteur\n' +
        '• **👁️ Rejoindre en spectateur** pour regarder\n\n' +
        '_Les inscriptions s\'ouvrent avant chaque soirée._',
    },
  ],
};

// ─── Commande ─────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('❓ Affiche les commandes disponibles selon ton rôle'),

  async execute(interaction) {
    const isLeader    = hasRole(interaction.member, ROLE_LEADER);
    const isModo      = hasRole(interaction.member, ROLE_MODO);
    const isSinger    = hasRole(interaction.member, ROLE_SINGER);
    const isSpectator = hasRole(interaction.member, ROLE_SPECTATOR);

    // Sélectionner la config selon le rôle le plus élevé
    let config;
    if (isLeader)         config = HELP_LEADER;
    else if (isModo)      config = HELP_MODO;
    else if (isSinger)    config = HELP_SINGER;
    else if (isSpectator) config = HELP_SPECTATOR;
    else                  config = HELP_DEFAULT;

    const embed = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(config.title)
      .setDescription('Voici les commandes disponibles avec ton rôle actuel.')
      .addFields(config.groups)
      .setFooter({ text: 'Karaobot • /help pour revoir cette aide' })
      .setTimestamp();

    // Si Leader, ajouter une note sur les commandes héritées
    if (isLeader) {
      embed.setDescription(
        'Tu as accès à **toutes les commandes** du bot.\n' +
        'Les commandes Modo, Chanteur et Spectateur sont également disponibles.'
      );
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
