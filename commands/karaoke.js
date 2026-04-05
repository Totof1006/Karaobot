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

    // ✅ CORRECTION : Erreur de permission en privé
    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent démarrer une session.')],
        flags: 64,
      });
    }

    const guildId = interaction.guildId;

    // ✅ CORRECTION : Alerte session déjà en cours en privé
    if (getSession(guildId)) {
      return interaction.reply({
        embeds: [errorEmbed('Une session est déjà en cours ! Utilisez `/stop` pour l\'arrêter.')],
        flags: 64,
      });
    }

    resetRematchCount(guildId);

    const session = createSession(guildId, interaction.user.id, interaction.channelId);

    const embed = registrationEmbed(session);
    
    // ✅ NOTE : Pas de flags: 64 ici car l'embed d'inscription doit être visible par TOUS le monde
    const message = await interaction.reply({
      embeds: [embed],
      components: [joinButton(), startButton()],
      fetchReply: true,
    });

    session.registrationMessage = message;

    console.log(`[Karaoké] Session créée sur ${guildId} par ${interaction.user.username}`);
  },
};
