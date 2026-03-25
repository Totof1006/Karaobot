const { getEvent } = require('./eventDB');
const { ChannelType } = require('discord.js'); // Ajout de l'import pour la sécurité

// ... (garder checkAnnouncementButton et checkCommandChannel identiques)

/**
 * Vérifie que /karaoke, /lancer-evenement, /rejouer
 * sont tapées dans le salon vocal karaoké (ou son chat textuel).
 */
function checkSessionChannel(interaction) {
  const event = getEvent(interaction.guildId);

  // Si pas d'événement planifié, on autorise partout (session libre)
  if (!event || !event.channelId) return { ok: true };

  const expectedChannelId = event.channelId;

  // Vérification de l'ID du salon
  // Note : interaction.channelId dans un chat vocal est égal à l'ID du salon vocal.
  if (interaction.channelId !== expectedChannelId) {
    return {
      ok: false,
      reason: `Cette commande doit être utilisée dans le salon vocal <#${expectedChannelId}> (ou dans son chat textuel).`,
    };
  }

  // Sécurité supplémentaire : vérifier que l'utilisateur est bien dans un salon vocal 
  // ou dans le chat dédié d'un salon vocal.
  const isVoiceSelected = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(interaction.channel.type);

  if (!isVoiceSelected) {
     return {
         ok: false,
         reason: `Pour lancer la session, tu dois être dans le chat du salon vocal <#${expectedChannelId}>.`
     };
  }

  return { ok: true };
}

module.exports = { checkAnnouncementButton, checkCommandChannel, checkSessionChannel };
