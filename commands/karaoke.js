const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSession, getSession } = require('../utils/gameState');
const { registrationEmbed, errorEmbed } = require('../utils/embeds');
const { joinButton, startButton } = require('../utils/buttons');
const { resetRematchCount } = require('../utils/persist');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('karaoke')
    .setDescription('🎤 Démarre une session karaoké (Leader/Modo uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent démarrer une session.')],
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;

    if (getSession(guildId)) {
      return interaction.reply({
        embeds: [errorEmbed('Une session est déjà en cours ! Utilisez `/stop` pour l\'arrêter.')],
        ephemeral: true,
      });
    }

    resetRematchCount(guildId);

    const session = createSession(guildId, interaction.user.id, interaction.channelId);

    const embed = registrationEmbed(session);
    const message = await interaction.reply({
      embeds: [embed],
      components: [joinButton(), startButton()],
      fetchReply: true,
    });

    session.registrationMessage = message;
    // channelId déjà défini dans createSession — pas besoin de le réassigner

    console.log(`[Karaoké] Session créée sur ${guildId} par ${interaction.user.username}`);
  },
};
