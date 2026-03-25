const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPlayerStats } = require('../utils/scoreDB');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('📊 Affiche tes statistiques karaoké')
    .addUserOption(opt =>
      opt.setName('joueur').setDescription('Joueur à consulter (toi par défaut)').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('joueur') || interaction.user;
    const stats = getPlayerStats(interaction.guildId, target.id);

    if (!stats) {
      return interaction.reply({
        embeds: [errorEmbed(`<@${target.id}> n'a pas encore joué sur ce serveur !`)],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`🎤 Stats de ${stats.username}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: '🎮 Parties jouées', value: `${stats.gamesPlayed}`, inline: true },
        { name: '🏆 Victoires', value: `${stats.wins}`, inline: true },
        { name: '📊 Score total', value: `${stats.totalScore} pts`, inline: true },
        { name: '⭐ Meilleur score', value: `${stats.bestScore} pts`, inline: true },
        {
          name: '📈 Moyenne par partie',
          value: stats.gamesPlayed > 0 ? `${Math.round(stats.totalScore / stats.gamesPlayed)} pts` : 'N/A',
          inline: true,
        },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },
};
