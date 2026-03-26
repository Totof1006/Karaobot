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

  const validationResults = await Promise.all(songs.map(async (s) => {
    if (!s.url) return { ok: false };

    try {
      // 1. Récupération de la durée (on s'assure que c'est bien des secondes)
      let duration = await getAudioDuration(s.url);
      if (duration > 10000) duration = duration / 1000; // Correction si millisecondes
      
      // 2. Recherche ultra-large sans le filtre duration direct (on filtrera nous-mêmes)
      const searchQuery = encodeURIComponent(`${s.title} ${s.artist}`);
      const response = await fetch(`https://lrclib.net/api/search?q=${searchQuery}`);
      const results = await response.json();

      if (!results || results.length === 0) return { ok: false };

      // 3. On cherche manuellement la meilleure correspondance avec une marge de 15s
      const bestMatch = results.find(l => {
        const diff = Math.abs(l.duration - duration);
        return diff < 15 && l.syncedLyrics; // On veut impérativement du synchronisé
      });
      
      console.log(`[DEBUG] ${s.title}: Audio=${Math.round(duration)}s, Found=${bestMatch ? Math.round(bestMatch.duration) : 'None'}s`);

      return { ok: !!bestMatch, lyrics: bestMatch };
    } catch (e) {
      console.error(`Erreur validation ${s.title}:`, e.message);
      return { ok: false };
    }
  }));

  // --- Sauvegarde des chansons ---
  const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
  if (!alreadyRegistered) {
    registerPlayer(guildId, interaction.user.id, interaction.user.username);
    await assignSingerRole(interaction.guild, interaction.user.id);
  }

  setPlayerSongs(guildId, interaction.user.id, songs);
  await refreshAnnouncement(interaction, guildId);

  // --- Construction de l'embed ---
  const songLines = songs.map((s, i) => {
    const v = validationResults[i];
    const lrcStatus = v.ok ? '✅ Sync' : '❌ Non sync/Introuvable';
    const warning = !v.ok ? `\n   ⚠️ *Attention : Les paroles synchronisées ne correspondent pas (ou sont introuvables).*` : "";
    return `🎵 **${s.title}** (${s.artist}) — Paroles ${lrcStatus}${warning}`;
  }).join('\n');

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(v.ok ? 0x57F287 : 0xED4245)
        .setTitle('🎤 Inscription traitée !')
        .setDescription(`${songLines}`)
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
