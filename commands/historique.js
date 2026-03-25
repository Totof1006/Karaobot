const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getSessionHistory }                 = require('../utils/scoreDB');
const { errorEmbed }                        = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historique')
    .setDescription('📜 Affiche les 5 dernières sessions jouées sur ce serveur'),

  async execute(interaction) {
    const history = getSessionHistory(interaction.guildId, 5);

    if (history.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Aucune session jouée sur ce serveur pour le moment !')],
        ephemeral: true,
      });
    }

    const fields = history.map((s, i) => {
      const date    = new Date(s.date).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
      });
      const winner  = s.winner ? `🥇 <@${s.winner.userId}> — **${s.winner.score} pts**` : '_Aucun gagnant_';
      const players = s.players.map((p, j) => {
        const medals = ['🥇','🥈','🥉'];
        return `${medals[j] || `${j+1}.`} <@${p.userId}> ${p.score} pts`;
      }).join(' · ');

      return {
        name : `Session #${history.length - i} — ${date}`,
        value: `${winner}\n${players}`,
      };
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('📜 Historique des sessions')
          .addFields(fields)
          .setFooter({ text: 'Les 5 dernières sessions' })
          .setTimestamp(),
      ],
    });
  },
};
