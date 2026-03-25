const { SlashCommandBuilder } = require('discord.js');
const { getGlobalLeaderboard } = require('../utils/scoreDB');
const { globalLeaderboardEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('classement')
    .setDescription('🏆 Affiche le classement global du serveur'),

  async execute(interaction) {
    const leaderboard = getGlobalLeaderboard(interaction.guildId);

    if (leaderboard.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Aucune partie jouée sur ce serveur pour le moment !')],
        ephemeral: true,
      });
    }

    return interaction.reply({ embeds: [globalLeaderboardEmbed(leaderboard)] });
  },
};
