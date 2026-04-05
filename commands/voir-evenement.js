const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getEvent, isRegistrationOpen, formatDate } = require('../utils/eventDB');
const { errorEmbed }                               = require('../utils/embeds');
const { MAX_SINGERS }                              = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voir-evenement')
    .setDescription('👁️ Voir les détails de l\'événement karaoké en cours'),

  async execute(interaction) {
    const event = getEvent(interaction.guildId);

    if (!event) {
      return interaction.reply({
        embeds: [errorEmbed('Aucun événement planifié. Un admin peut en créer un avec `/evenement`.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    const now       = new Date();
    const regStart  = new Date(event.registrationStart);
    const isOpen    = isRegistrationOpen(event);

    let statusLine;
    if (now < regStart) {
      statusLine = `⏳ Inscriptions ouvertes le **${formatDate(event.registrationStart)}**`;
    } else if (isOpen) {
      statusLine = `✅ Inscriptions **ouvertes** jusqu'au **${formatDate(event.registrationEnd)}**`;
    } else {
      statusLine = `🔒 Inscriptions **fermées**`;
    }

    const playerList = event.registrations.length === 0
      ? '_Aucun inscrit pour l\'instant_'
      : event.registrations.map((r, i) => {
          const songsDone = r.songs.length === 3 ? '✅' : `⏳ ${r.songs.length}/3`;
          return `**${i + 1}.** <@${r.userId}> — ${songsDone}`;
        }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle(`🎤 ${event.title}`)
      .setDescription(`${statusLine}\n\n**🗓️ Date de la session :** ${formatDate(event.eventDate)}`)
      .addFields(
        { name: '📬 Inscriptions (Début)', value: formatDate(event.registrationStart), inline: true },
        { name: '🔒 Inscriptions (Fin)', value: formatDate(event.registrationEnd),   inline: true },
        { name: `👥 Participants (${event.registrations.length}/${MAX_SINGERS})`, value: playerList },
      )
      .setFooter({ text: `Organisé par une légende • Karaobot` })
      .setTimestamp();

    // ✅ NOTE : Public pour favoriser l'organisation et l'engouement
    return interaction.reply({ embeds: [embed] });
  },
};
