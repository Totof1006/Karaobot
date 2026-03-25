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
 * Vérifie que les commandes sont utilisées dans
 * le salon Karaoké-annonce ou Karaoke-vocal.
 */

function checkKaraokeChannel(interaction) {
  const event = getEvent(interaction.guildId);

  if (!event) return { ok: true };

  const allowedChannelIds = [
    event.announceChannelId, // Karaoké-annonce
    event.channelId          // Karaoke-vocal
  ].filter(Boolean);

  if (!allowedChannelIds.includes(interaction.channelId)) {
    return {
      ok: false,
      reason: `Cette commande doit être utilisée dans <#${event.announceChannelId}> ou <#${event.channelId}>.`,
    };
  }

  return { ok: true };
}

module.exports = { checkAnnouncementButton, checkKaraokeChannel };
