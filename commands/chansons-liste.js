const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAvailableSongs }                 = require('../utils/songList');
const { errorEmbed }                        = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chansons-liste')
    .setDescription('🎵 Voir la liste des chansons disponibles avec paroles synchronisées'),

  async execute(interaction) {
    const songs = getAvailableSongs();

    if (songs.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Aucune chanson avec paroles disponible pour le moment.\n' +
          'Un Modo/Leader peut ajouter des fichiers `.lrc` dans le dossier `lyrics/`.'
        )],
        ephemeral: true,
      });
    }

    // Découper en pages de 20 si beaucoup de chansons
    const pageSize = 20;
    const pages    = [];
    for (let i = 0; i < songs.length; i += pageSize) {
      pages.push(songs.slice(i, i + pageSize));
    }

    const embeds = pages.map((page, idx) => {
      const list = page.map((s, i) => `${idx * pageSize + i + 1}. 🎵 **${s.title}** ✅ paroles`).join('\n');
      return new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`🎵 Chansons disponibles avec paroles (${songs.length} au total)`)
        .setDescription(list)
        .setFooter({
          text: pages.length > 1
            ? `Page ${idx + 1}/${pages.length} • Tu peux quand même saisir n'importe quelle chanson !`
            : `Tu peux aussi saisir n'importe quelle chanson — sans paroles elle sera quand même acceptée.`,
        });
    });

    return interaction.reply({ embeds: [embeds[0]], ephemeral: true });
  },
};
