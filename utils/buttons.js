const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function joinButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('karaoke_join')
      .setLabel('🎤 Rejoindre la session')
      .setStyle(ButtonStyle.Primary),
  );
}

function startButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('karaoke_start')
      .setLabel('▶️ Lancer la session')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('karaoke_cancel')
      .setLabel('❌ Annuler')
      .setStyle(ButtonStyle.Danger),
  );
}

function voteButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vote_1').setLabel('1 ⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vote_2').setLabel('2 ⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vote_3').setLabel('3 ⭐⭐⭐').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vote_4').setLabel('4 ⭐⭐⭐⭐').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vote_5').setLabel('5 ⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Success),
  );
}

function nextSingerButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('karaoke_next')
      .setLabel('⏭️ Chanteur suivant')
      .setStyle(ButtonStyle.Primary),
  );
}

// Bouton cliqué par l'hôte quand le chanteur a terminé sa chanson
function endSongButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('karaoke_end_song')
      .setLabel('🎤 Fin de la chanson → Ouvrir les votes')
      .setStyle(ButtonStyle.Danger),
  );
}

// Boutons de l'annonce d'événement planifié
// singerDisabled = true si 8 chanteurs inscrits OU inscriptions fermées
function eventRegistrationButtons(singerDisabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('event_register')
        .setLabel(singerDisabled ? '🎤 Complet' : '🎤 S\'inscrire comme chanteur')
        .setStyle(singerDisabled ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(singerDisabled),
      new ButtonBuilder()
        .setCustomId('event_spectator')
        .setLabel('👁️ Rejoindre en spectateur')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false),       // toujours actif
      new ButtonBuilder()
        .setCustomId('event_unregister')
        .setLabel('❌ Se désinscrire')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false),       // toujours actif
    ),
  ];
}

module.exports = {
  joinButton, startButton, voteButtons,
  nextSingerButton, endSongButton,
  eventRegistrationButtons,
};
