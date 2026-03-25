const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getEvent, deleteEvent }                    = require('../utils/eventDB');
const { errorEmbed, successEmbed }                 = require('../utils/embeds');
const { ROLE_LEADER, hasRole } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('annuler-evenement')
    .setDescription('🗑️ Annule l\'événement karaoké planifié (Leader uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    // Réservé exclusivement au Leader
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    if (!isLeader) {
      return interaction.reply({
        embeds: [errorEmbed('Seul le **Leader** 👑 peut annuler un événement.')],
        ephemeral: true,
      });
    }

    const event = getEvent(interaction.guildId);

    if (!event) {
      return interaction.reply({
        embeds: [errorEmbed('Aucun événement planifié à annuler.')],
        ephemeral: true,
      });
    }

    // Désépingler et désactiver le message d'annonce dans #karaoké-annonces
    if (event.announceMsgId) {
      try {
        const announceChId = event.announceChannelId || event.channelId;
        const annCh = await interaction.guild.channels.fetch(announceChId).catch(() => null);
        const msg   = annCh
          ? await annCh.messages.fetch(event.announceMsgId).catch(() => null)
          : null;
        if (msg) {
          await msg.edit({ components: [] }).catch(e => console.warn('[Annulation] Edit annonce :', e.message));
          await msg.unpin().catch(e => console.warn('[Annulation] Désépingle annonce :', e.message));
        }
      } catch (e) { console.warn('[Annulation] Erreur traitement message annonce :', e.message); }
    }

    // Supprimer l'événement natif Discord
    if (event.discordEventId) {
      try {
        const scheduledEvent = await interaction.guild.scheduledEvents
          .fetch(event.discordEventId).catch(() => null);
        if (scheduledEvent) await scheduledEvent.delete();
      } catch (e) { console.warn('[Annulation] Erreur suppression événement Discord natif :', e.message); }
    }

    deleteEvent(interaction.guildId);

    return interaction.reply({
      embeds: [successEmbed(`L'événement **${event.title}** a été annulé.`)],
    });
  },
};
