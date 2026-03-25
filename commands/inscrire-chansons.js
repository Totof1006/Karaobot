const { SlashCommandBuilder }      = require('discord.js');
const { getEvent, setPlayerSongs,
        isRegistrationOpen, formatDate } = require('../utils/eventDB');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { refreshAnnouncement }      = require('./inscrire');
const { checkCommandChannel }      = require('../utils/channelGuard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inscrire-chansons')
    .setDescription('🎵 Soumettre tes 3 chansons pour l\'événement karaoké planifié')
    .addStringOption(o => o.setName('chanson1').setDescription('1ère chanson').setRequired(true))
    .addStringOption(o => o.setName('chanson2').setDescription('2ème chanson').setRequired(true))
    .addStringOption(o => o.setName('chanson3').setDescription('3ème chanson').setRequired(true)),

  async execute(interaction) {
    const guard = checkCommandChannel(interaction);
    if (!guard.ok) {
      return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
    }
    const guildId = interaction.guildId;
    const event   = getEvent(guildId);

    if (!event) {
      return interaction.reply({
        embeds: [errorEmbed('Aucun événement planifié en cours.')],
        ephemeral: true,
      });
    }

    // Vérifier que le joueur est inscrit
    const reg = event.registrations.find(r => r.userId === interaction.user.id);
    if (!reg) {
      return interaction.reply({
        embeds: [errorEmbed('Tu n\'es pas inscrit(e) à cet événement ! Utilise `/inscrire` d\'abord.')],
        ephemeral: true,
      });
    }

    // Vérifier que les inscriptions sont encore ouvertes
    if (!isRegistrationOpen(event)) {
      return interaction.reply({
        embeds: [errorEmbed(`Les inscriptions sont fermées depuis le **${formatDate(event.registrationEnd)}**.`)],
        ephemeral: true,
      });
    }

    const songs = [
      { title: interaction.options.getString('chanson1').trim(), url: null },
      { title: interaction.options.getString('chanson2').trim(), url: null },
      { title: interaction.options.getString('chanson3').trim(), url: null },
    ];

    setPlayerSongs(guildId, interaction.user.id, songs);

    await refreshAnnouncement(interaction, guildId);

    return interaction.reply({
      embeds: [
        successEmbed(
          `Tes chansons pour **${event.title}** ont été enregistrées :\n` +
          songs.map(s => `🎵 ${s.title}`).join('\n')
        ),
      ],
      ephemeral: true,
    });
  },
};
