const { SlashCommandBuilder }              = require('discord.js');
const { getSession, setPlayerSongs }       = require('../utils/gameState');
const { errorEmbed, successEmbed,
        registrationEmbed }                = require('../utils/embeds');
const { joinButton, startButton }          = require('../utils/buttons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chansons')
    .setDescription('🎵 Soumets tes 3 chansons pour la session karaoké')
    .addStringOption(opt =>
      opt.setName('chanson1').setDescription('Première chanson').setRequired(true))
    .addStringOption(opt =>
      opt.setName('chanson2').setDescription('Deuxième chanson').setRequired(true))
    .addStringOption(opt =>
      opt.setName('chanson3').setDescription('Troisième chanson').setRequired(true)),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const session = getSession(guildId);

    if (!session) {
      return interaction.reply({ embeds: [errorEmbed('Aucune session en cours. Lance-en une avec `/karaoke` !')], ephemeral: true });
    }

    if (session.phase !== 'registration') {
      return interaction.reply({ embeds: [errorEmbed('Tu ne peux plus changer tes chansons, la session a déjà commencé !')], ephemeral: true });
    }

    const player = session.players.find(p => p.userId === interaction.user.id);
    if (!player) {
      return interaction.reply({ embeds: [errorEmbed('Tu n\'es pas inscrit à cette session. Clique sur "Rejoindre" d\'abord !')], ephemeral: true });
    }

    const songs = [
      { title: interaction.options.getString('chanson1').trim(), url: null },
      { title: interaction.options.getString('chanson2').trim(), url: null },
      { title: interaction.options.getString('chanson3').trim(), url: null },
    ];

    setPlayerSongs(session, interaction.user.id, songs);

    if (session.registrationMessage) {
      await session.registrationMessage.edit({
        embeds: [registrationEmbed(session)],
        components: [joinButton(), startButton()],
      }).catch(e => console.warn('[Chansons] Impossible de mettre à jour le message d\'inscription:', e.message));
    }

    return interaction.reply({
      embeds: [successEmbed(`Tes chansons ont été enregistrées :\n${songs.map(s => `🎵 ${s.title}`).join('\n')}`)],
      ephemeral: true,
    });
  },
};
