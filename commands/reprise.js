const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getSession }              = require('../utils/gameState');
const { errorEmbed }              = require('../utils/embeds');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { startBreakThenSing }      = require('../utils/sessionFlow');
const { BREAK_DURATION_MS }       = require('../utils/constants');

const BREAK_SECONDS = BREAK_DURATION_MS / 1_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reprise')
    .setDescription('▶️ Reprendre la session après une pause (Leader/Modo)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent reprendre la session.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    const session = getSession(interaction.guildId);

    if (!session) {
      return interaction.reply({ embeds: [errorEmbed('Aucune session en cours.')], flags: 64 }); // ✅ CORRECTION
    }

    if (!session.paused) {
      return interaction.reply({ embeds: [errorEmbed('La session n\'est pas en pause.')], flags: 64 }); // ✅ CORRECTION
    }

    if (session.phase !== 'paused') {
      return interaction.reply({
        embeds: [errorEmbed(
          'La pause n\'est pas encore active — le vote est peut-être encore en cours.\n' +
          'Attends la fin du vote puis réessaie.'
        )],
        flags: 64, // ✅ CORRECTION
      });
    }

    // Réactiver la session
    session.paused = false;
    session.phase  = 'singing';

    // ✅ NOTE : Public pour prévenir tout le monde que le karaoké reprend
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('▶️ Reprise de la session !')
          .setDescription(`La session reprend ! La pause de ${BREAK_SECONDS} secondes démarre maintenant.`),
      ],
    });

    // Passer un contexte channel/guild plutôt que l'interaction déjà acquittée
    const fakeCtx = {
      guild    : interaction.guild,
      channel  : interaction.channel,
      guildId  : interaction.guildId,
      update   : null,
      deferUpdate: null,
    };
    await startBreakThenSing(fakeCtx, session, false);
  },
};
