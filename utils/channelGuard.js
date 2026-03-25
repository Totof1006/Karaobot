const { getEvent } = require('./eventDB');

/**
 * Deux salons distincts dans le système :
 *
 * event.announceChannelId → #karaoké-annonces (texte, visible par tous)
 *   Utilisé pour : message d'inscription, boutons, /inscrire, /inscrire-chansons,
 *                  récapitulatifs, classements, annonces du bot
 *
 * event.channelId → 🔊 karaoké-vocal (invisible hors soirée)
 *   Utilisé pour : /karaoke, /lancer-evenement, /ouvrir-salon,
 *                  paroles en direct, votes en session, /rejouer
 */

/**
 * Vérifie qu'un bouton du message d'annonce vient bien du bon salon texte.
 */
function checkAnnouncementButton(interaction) {
  const event = getEvent(interaction.guildId);

  if (!event) {
    return { ok: false, reason: 'Aucun événement karaoké en cours sur ce serveur.' };
  }

  // Vérifier que le bouton vient du salon annonces
  const expectedChannelId = event.announceChannelId || event.channelId;
  if (expectedChannelId && interaction.channelId !== expectedChannelId) {
    return {
      ok    : false,
      reason: `Ce bouton n'appartient pas à l'événement karaoké actuel.\nRendez-vous dans <#${expectedChannelId}>.`,
    };
  }

  // Vérifier que c'est bien le message d'annonce officiel
  if (event.announceMsgId && interaction.message?.id !== event.announceMsgId) {
    return {
      ok    : false,
      reason: 'Ce bouton ne correspond pas à l\'annonce officielle de l\'événement actuel.',
    };
  }

  return { ok: true };
}

/**
 * Vérifie que /inscrire, /inscrire-chansons, /voir-evenement
 * sont tapées dans le salon annonces (#karaoké-annonces).
 */
function checkCommandChannel(interaction) {
  const event = getEvent(interaction.guildId);

  if (!event) return { ok: true }; // pas d'événement = pas de restriction

  const expectedChannelId = event.announceChannelId || event.channelId;
  if (expectedChannelId && interaction.channelId !== expectedChannelId) {
    return {
      ok    : false,
      reason: `Cette commande doit être utilisée dans <#${expectedChannelId}>.`,
    };
  }

  return { ok: true };
}

/**
 * Vérifie que /karaoke, /lancer-evenement, /rejouer
 * sont tapées dans le salon vocal karaoké.
 */
function checkSessionChannel(interaction) {
  const event = getEvent(interaction.guildId);

  if (!event) return { ok: true }; // pas d'événement = session libre, pas de restriction

  const expectedChannelId = event.channelId;
  if (expectedChannelId && interaction.channelId !== expectedChannelId) {
    return {
      ok    : false,
      reason: `Cette commande doit être utilisée dans le salon vocal karaoké <#${expectedChannelId}>.`,
    };
  }

  return { ok: true };
}

module.exports = { checkAnnouncementButton, checkCommandChannel, checkSessionChannel };
