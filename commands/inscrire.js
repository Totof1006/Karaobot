const {
  SlashCommandBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { getEvent, registerPlayer, setPlayerSongs,
        formatDate, isRegistrationOpen }  = require('../utils/eventDB');
const { errorEmbed }                      = require('../utils/embeds');
const { eventRegistrationButtons }        = require('../utils/buttons');
const { assignSingerRole }                = require('../utils/roleManager');
const { autoFetchLyrics }                 = require('../utils/autoLyrics');
const { checkCommandChannel }             = require('../utils/channelGuard');
const { isValidAudioUrl }                 = require('../utils/audioPlayer');

const { MAX_SINGERS }                             = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inscrire')
    .setDescription('🎤 S\'inscrire à l\'événement karaoké planifié'),

  async execute(interaction) {
    const guard = checkCommandChannel(interaction);
    if (!guard.ok) {
      return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
    }
    await showRegistrationModal(interaction);
  },
};

async function showRegistrationModal(interaction) {
  const guildId = interaction.guildId;
  const event   = getEvent(guildId);

  if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement planifié !')], ephemeral: true });

  const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
  const existing = alreadyRegistered?.songs || [];

  const modal = new ModalBuilder()
    .setCustomId('modal_register_songs')
    .setTitle(alreadyRegistered ? '🎵 Modifier tes chansons' : '🎤 Inscription Karaoke');

  const fields = [1, 2, 3].map((num, i) => {
    const ex = existing[i];
    // Reconstruit la valeur avec le nouveau format Titre + Artiste = Lien
    const value = ex ? `${ex.title} + ${ex.artist || ''} ${ex.url ? '= ' + ex.url : ''}`.trim() : '';

    return new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`song_${i}`)
        .setLabel(`Chanson n°${num} (Titre + Artiste = Lien)`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Soul-Man + Ben l\'Oncle Soul = https://youtu.be/...')
        .setValue(value)
        .setRequired(i === 0)
    );
  });

  modal.addComponents(...fields);
  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const guildId = interaction.guildId;
  const event = getEvent(guildId);
  if (!event) return interaction.reply({ embeds: [errorEmbed('Événement introuvable.')], ephemeral: true });

  // --- BLOC EXISTANT : Récupération des saisies ---
  const songs = [0, 1, 2].map(i => {
    const raw = interaction.fields.getTextInputValue(`song_${i}`).trim();
    if (!raw) return null;
    const eqSplit = raw.split('=');
    const infoPart = eqSplit[0].trim();
    const urlPart = eqSplit.length > 1 ? eqSplit[eqSplit.length - 1].trim() : null;
    const plusSplit = infoPart.split('+');
    let title = infoPart;
    let artist = "Inconnu";
    if (plusSplit.length > 1) {
      title = plusSplit[0].trim();
      artist = plusSplit[1].trim();
    }
    const url = urlPart && (isValidAudioUrl(urlPart) || urlPart.includes('youtube.com') || urlPart.includes('youtu.be')) 
                ? urlPart : null;
    return { title, artist, url };
  }).filter(s => s !== null);

  if (songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Inscris au moins une chanson !')], ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  // --- NOUVEAU BLOC : Vérification Intelligente Durée + Paroles ---
  const validationResults = await Promise.all(songs.map(async (s) => {
    if (!s.url) return { ok: false, reason: 'Pas d\'audio' };

    try {
      // 1. On récupère la durée réelle du fichier audio fourni
      const duration = await getAudioDuration(s.url);
      
      // 2. On cherche les paroles sur LRCLIB en filtrant par cette durée
      // On utilise titre + artiste pour la précision de recherche
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(s.title + ' ' + s.artist)}&duration=${Math.round(duration)}`;
      const response = await fetch(searchUrl);
      const results = await response.json();

      // 3. On cherche le "Best Match" (écart < 5 secondes)
      const bestMatch = results.find(l => Math.abs(l.duration - duration) < 15);
      
      return { 
        ok: !!bestMatch, 
        lyrics: bestMatch, 
        durationDiff: bestMatch ? Math.abs(bestMatch.duration - duration) : null 
      };
    } catch (e) {
      return { ok: false, reason: 'Erreur recherche' };
    }
  }));

  // --- SUITE DU CODE : Enregistrement ---
  const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
  if (!alreadyRegistered) {
    registerPlayer(guildId, interaction.user.id, interaction.user.username);
    await assignSingerRole(interaction.guild, interaction.user.id);
  }

  setPlayerSongs(guildId, interaction.user.id, songs);
  await refreshAnnouncement(interaction, guildId);

  // --- MISE À JOUR DE L'AFFICHAGE DU RÉSULTAT ---
  const songLines = songs.map((s, i) => {
    const v = validationResults[i];
    const lrcStatus = v.ok ? '✅ Sync' : '❌ Non sync/Introuvable';
    const audioStatus = s.url ? '🔊' : '🔇';
    
    let warning = "";
    if (!v.ok && s.url) {
      warning = `\n   ⚠️ *Attention : La durée des paroles ne correspond pas à ton lien !*`;
    }

    return `🎵 **${s.title}** (${s.artist}) — Paroles ${lrcStatus} · Audio ${audioStatus}${warning}`;
  }).join('\n');

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Inscription validée !')
        .setDescription(`Tes chansons ont été vérifiées :\n\n${songLines}`)
        .setFooter({ text: 'Le score de précision dépend de la synchronisation Paroles/Audio.' })
    ],
  });
}
async function refreshAnnouncement(interaction, guildId) {
  try {
    const event = getEvent(guildId);
    if (!event?.announceMsgId) return;
    const announceChId = event.announceChannelId || event.channelId;
    const ch = await interaction.client.channels.fetch(announceChId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(event.announceMsgId).catch(() => null);
    if (!msg) return;

    const playerList = event.registrations.length === 0
      ? '_Aucun inscrit_'
      : event.registrations.map((r, i) => `${i + 1}. <@${r.userId}> — ✅`).join('\n');

    const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
      .spliceFields(3, 1, { name: `👥 Participants (${event.registrations.length}/${MAX_SINGERS})`, value: playerList });

    await msg.edit({ embeds: [updatedEmbed] });
  } catch (e) { console.warn('Erreur refresh :', e.message); }
}

async function getAudioDuration(url) {
    // Ici, tu utiliseras ta méthode habituelle (ffprobe ou music-metadata)
    // pour extraire la durée du lien 'url'.
    // Renvoie un nombre (secondes).
}

// Exportation propre de tout ce dont le bot a besoin
module.exports = {
  // Garde la commande slash et sa fonction execute
  data: module.exports.data,
  execute: module.exports.execute,
 
  // Expose les fonctions pour le système de boutons et de modals
  showRegistrationModal,
  handleModalSubmit,
  refreshAnnouncement
};
