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
    const url = urlPart && (urlPart.includes('youtube.com') || urlPart.includes('youtu.be') || urlPart.startsWith('http')) 
                ? urlPart : null;
    return { title, artist, url };
  }).filter(s => s !== null);

  if (songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Inscris au moins une chanson !')], ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const validationResults = await Promise.all(songs.map(async (s) => {
    if (!s.url) return { ok: false };

    try {
      // 1. Récupération de la durée via ffprobe
      let duration = await getAudioDuration(s.url);
      if (duration > 10000) duration = duration / 1000; 
      
      // 2. Recherche sur LRCLIB
      const searchQuery = encodeURIComponent(`${s.title} ${s.artist}`);
      const response = await fetch(`https://lrclib.net/api/search?q=${searchQuery}`);
      const results = await response.json();

      if (!results || !Array.isArray(results) || results.length === 0) return { ok: false };

      // 3. Filtrage manuel avec marge de 15 secondes
      const bestMatch = results.find(l => {
        const diff = Math.abs(l.duration - duration);
        return diff < 15 && (l.syncedLyrics || l.lineLyrics);
      });
      
      console.log(`[DEBUG] ${s.title}: Audio=${Math.round(duration)}s, Found=${bestMatch ? Math.round(bestMatch.duration) : 'None'}s`);

      return { ok: !!bestMatch, lyrics: bestMatch };
    } catch (e) {
      console.error(`Erreur validation ${s.title}:`, e.message);
      return { ok: false };
    }
  }));

  // --- Sauvegarde des données ---
  const { registerPlayer, setPlayerSongs } = require('../utils/eventDB'); // Vérifie tes imports si besoin
  const alreadyRegistered = event.registrations?.find(r => r.userId === interaction.user.id);
  
  if (!alreadyRegistered) {
    registerPlayer(guildId, interaction.user.id, interaction.user.username);
  }

  setPlayerSongs(guildId, interaction.user.id, songs);
  
  // Met à jour l'affichage dans le salon
  const { refreshAnnouncement } = require('../utils/embeds'); 
  await refreshAnnouncement(interaction, guildId);

  // --- Construction de l'Embed de réponse ---
  const songLines = songs.map((s, i) => {
    const v = validationResults[i];
    const status = v.ok ? '✅ Sync' : '❌ Non sync/Introuvable';
    const warning = !v.ok ? `\n   ⚠️ *Attention : Durée incohérente ou paroles absentes.*` : "";
    return `🎵 **${s.title}** (${s.artist}) — ${status}${warning}`;
  }).join('\n');

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(validationResults.every(v => v.ok) ? 0x57F287 : 0xED4245)
        .setTitle('🎤 Inscription traitée !')
        .setDescription(songLines)
        .setFooter({ text: 'Le score dépend de la synchronisation Paroles/Audio.' })
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

// Fonction réelle pour obtenir la durée (Nécessite ffmpeg/ffprobe sur Railway)
async function getAudioDuration(url) {
    try {
        const ffmpeg = require('fluent-ffmpeg');
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(url, (err, metadata) => {
                if (err) return resolve(0);
                // Renvoie la durée en secondes
                resolve(metadata.format.duration || 0);
            });
        });
    } catch (e) {
        return 0;
    }
}

// Exportation UNIQUE et COMPLETE
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

    // Fonctions exportées pour être appelées par ton index.js / interactionCreate
    showRegistrationModal,
    handleModalSubmit,
    refreshAnnouncement
};
