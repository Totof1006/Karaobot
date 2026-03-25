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
        ephemeral: true,
      });
    }

    const session = getSession(interaction.guildId);

    if (!session) {
      return interaction.reply({ embeds: [errorEmbed('Aucune session en cours.')], ephemeral: true });
    }

    if (!session.paused) {
      return interaction.reply({ embeds: [errorEmbed('La session n\'est pas en pause.')], ephemeral: true });
    }

    if (session.phase !== 'paused') {
      return interaction.reply({
        embeds: [errorEmbed(
          'La pause n\'est pas encore active — le vote est peut-être encore en cours.\n' +
          'Attends la fin du vote puis réessaie.'
        )],
        ephemeral: true,
      });
    }

    // Réactiver la session
    session.paused = false;
    session.phase  = 'singing';

    // Acquitter l'interaction en premier
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('▶️ Reprise de la session !')
          .setDescription(`La session reprend ! La pause de ${BREAK_SECONDS} secondes démarre maintenant.`),
      ],
    });

    // Passer un contexte channel/guild plutôt que l'interaction déjà acquittée
    // pour éviter un double-reply dans startBreakThenSing
    const fakeCtx = {
      guild    : interaction.guild,
      channel  : interaction.channel,
      guildId  : interaction.guildId,
      update   : null,        // désactive interaction.update dans startBreakThenSing
      deferUpdate: null,
    };
    await startBreakThenSing(fakeCtx, session, false);
  },
};
