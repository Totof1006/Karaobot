const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getSession }             = require('../utils/gameState');
const { errorEmbed }             = require('../utils/embeds');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('⏸️ Mettre la session en pause après le vote en cours (Leader/Modo)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent mettre en pause.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    const session = getSession(interaction.guildId);

    if (!session) {
      return interaction.reply({
        embeds: [errorEmbed('Aucune session en cours.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    if (session.paused) {
      return interaction.reply({
        embeds: [errorEmbed('La session est déjà en pause ! Utilise `/reprise` pour continuer.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    if (session.phase === 'registration') {
      return interaction.reply({
        embeds: [errorEmbed('La session n\'a pas encore démarré.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    // Activer le flag pause
    session.paused = true;

    // Message selon la phase actuelle
    const phaseMsg = session.phase === 'voting'
      ? 'La pause sera effective **après la fin du vote en cours**.'
      : session.phase === 'singing'
      ? 'La pause sera effective **après le prochain vote**.'
      : 'La pause sera effective au **prochain passage**.\n_Clique sur [⏭️ Chanteur suivant] pour l\'activer._';

    // ✅ NOTE : On laisse en public pour informer tout le salon de la pause à venir
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF9900)
          .setTitle('⏸️ Pause programmée !')
          .setDescription(
            `${phaseMsg}\n\n` +
            `🎙️ Les micros des chanteurs seront **ouverts** pendant la pause.\n` +
            `Utilise \`/reprise\` pour reprendre la session.`
          ),
      ],
    });
  },
};
