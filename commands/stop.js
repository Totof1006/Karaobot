const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getSession, deleteSession }                = require('../utils/gameState');
const { errorEmbed, successEmbed }                 = require('../utils/embeds');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { findVoiceChannel, unmuteSingersOnly }      = require('../utils/voiceManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('🛑 Arrête la session karaoké en cours (Leader/Modo uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const session = getSession(interaction.guildId);

    if (!session) {
      return interaction.reply({ embeds: [errorEmbed('Aucune session en cours.')], ephemeral: true });
    }

    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);
    const isHost   = session.hostId === interaction.user.id;

    if (!isLeader && !isModo && !isHost) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑, **Modo** 🛡️ ou l\'hôte peuvent arrêter la session.')],
        ephemeral: true,
      });
    }

    // Récupérer les IDs des chanteurs avant de supprimer la session
    const singerIds = session.players.map(p => p.userId);

    deleteSession(interaction.guildId);

    // Réactiver les micros des chanteurs dans le salon vocal
    try {
      const voiceChannel = await findVoiceChannel(interaction.guild);
      if (voiceChannel && singerIds.length > 0) {
        await unmuteSingersOnly(interaction.guild, voiceChannel, singerIds);
      }
    } catch (e) {
      console.warn('[Stop] Erreur démute salon vocal :', e.message);
    }

    return interaction.reply({
      embeds: [successEmbed(
        '🛑 Session arrêtée !\n\n' +
        '🎙️ Les micros des **chanteurs** sont réactivés.\n' +
        '_Le salon et l\'événement restent actifs._'
      )],
    });
  },
};
