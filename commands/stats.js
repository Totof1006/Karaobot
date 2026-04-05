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
        flags: 64, // ✅ CORRECTION
      });
    }

    const avg = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`📊 Stats de ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎤 Sessions', value: `**${stats.gamesPlayed}**`, inline: true },
        { name: '🏆 Victoires', value: `**${stats.wins}**`, inline: true },
        { name: '🔥 Score Total', value: `**${stats.totalScore}** pts`, inline: true },
        { name: '⭐ Record', value: `**${stats.bestScore}** pts`, inline: true },
        { name: '📈 Moyenne', value: `**${avg}** pts/session`, inline: true }
      )
      .setFooter({ text: 'Karaobot • Statistiques individuelles' })
      .setTimestamp();

    // ✅ NOTE : Public pour permettre aux joueurs de comparer leurs stats dans le chat
    return interaction.reply({ embeds: [embed] });
  },
};
