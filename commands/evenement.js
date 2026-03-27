const { SlashCommandBuilder, PermissionFlagsBits, ChannelType,
        EmbedBuilder, GuildScheduledEventEntityType,
        GuildScheduledEventPrivacyLevel }                         = require('discord.js');
const { getEvent, createEvent, saveEvent, formatDate }            = require('../utils/eventDB');
const { errorEmbed }                                              = require('../utils/embeds');
const { eventRegistrationButtons }                                = require('../utils/buttons');
const { loadVoiceChannel }                                        = require('../utils/persist');
const { MAX_SINGERS }                                             = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evenement')
    .setDescription('📅 Crée un événement karaoké planifié avec période d\'inscription')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o
      .setName('titre')
      .setDescription('Nom de l\'événement (ex: Karaoké du vendredi)')
      .setRequired(true))
    .addStringOption(o => o
      .setName('date_session')
      .setDescription('Date/heure de la session (JJ/MM/AAAA HH:MM) — ex: 28/03/2025 20:30')
      .setRequired(true))
    .addStringOption(o => o
      .setName('ouverture')
      .setDescription('Ouverture des inscriptions (JJ/MM/AAAA HH:MM) — ex: 23/03/2025 12:00')
      .setRequired(true))
    .addStringOption(o => o
      .setName('fermeture')
      .setDescription('Fermeture des inscriptions (JJ/MM/AAAA HH:MM) — ex: 27/03/2025 12:00')
      .setRequired(true))
    .addChannelOption(o => o
      .setName('salon_annonces')
      .setDescription('Salon où poster l\'annonce — texte ou vocal avec chat (ex: #karaoké)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
      .setRequired(false)),

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (getEvent(guildId)) {
      return interaction.reply({
        embeds: [errorEmbed('Un événement existe déjà ! Utilisez `/annuler-evenement` avant d\'en créer un nouveau.')],
        ephemeral: true,
      });
    }

    const titre      = interaction.options.getString('titre');
    const rawSession = interaction.options.getString('date_session');
    const rawOpen    = interaction.options.getString('ouverture');
    const rawClose   = interaction.options.getString('fermeture');
    const targetChannel = interaction.options.getChannel('salon_annonces') || interaction.channel;

    const eventDate         = parseFrDate(rawSession);
    const registrationStart = parseFrDate(rawOpen);
    const registrationEnd   = parseFrDate(rawClose);

    if (!eventDate || !registrationStart || !registrationEnd) {
      return interaction.reply({
        embeds: [errorEmbed('Format de date invalide. Utilise **JJ/MM/AAAA HH:MM** (ex: `28/03/2025 20:30`)')],
        ephemeral: true,
      });
    }

    if (registrationStart >= registrationEnd) {
      return interaction.reply({
        embeds: [errorEmbed('La date d\'ouverture doit être avant la date de fermeture.')],
        ephemeral: true,
      });
    }

    if (registrationEnd >= eventDate) {
      return interaction.reply({
        embeds: [errorEmbed('La fermeture des inscriptions doit être avant la date de la session.')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // ── Poster le message d'annonce dans le salon cible (#karaoké) ────────────
    const embed = buildAnnouncementEmbed(titre, eventDate, registrationStart, registrationEnd);
    const msg   = await targetChannel.send({
      embeds    : [embed],
      components: eventRegistrationButtons(),
    });
    await msg.pin().catch(e => console.warn('[Événement] Impossible d\'épingler l\'annonce (50 épingles max ?) :', e.message));

    // ── Créer l'événement natif Discord ───────────────────────────────────────
    let discordEventId   = null;
    let discordEventUrl  = null;
    const savedVoiceId   = loadVoiceChannel(guildId);
    const voiceChannel   = savedVoiceId
      ? await interaction.guild.channels.fetch(savedVoiceId).catch(() => null)
      : null;

    try {
      const scheduledEvent = await interaction.guild.scheduledEvents.create({
        name        : `🎤 ${titre}`,
        scheduledStartTime: eventDate,
        scheduledEndTime  : new Date(eventDate.getTime() + 4 * 60 * 60 * 1000), // +4h par défaut
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType  : voiceChannel
          ? GuildScheduledEventEntityType.Voice
          : GuildScheduledEventEntityType.External,
        description :
          `Soirée karaoké ! Inscris-toi dans <#${targetChannel.id}> avant le ${formatDate(registrationEnd)}.\n\n` +
          `📬 Inscriptions du ${formatDate(registrationStart)} au ${formatDate(registrationEnd)}\n` +
          `🎤 Session le ${formatDate(eventDate)} entre 21h et 21h30\n` +
          `👉 Rends-toi dans <#${targetChannel.id}> pour t'inscrire !`,
        ...(voiceChannel
          ? { channel: voiceChannel }
          : { entityMetadata: { location: `Salon karaoké Discord` } }
        ),
        // Image optionnelle — à décommenter si tu veux une bannière
        // image: 'https://...url-image...',
      });

      discordEventId  = scheduledEvent.id;
      discordEventUrl = `https://discord.com/events/${guildId}/${scheduledEvent.id}`;
      console.log(`[Événement] Événement natif Discord créé : ${scheduledEvent.id}`);
    } catch (err) {
      console.error('[Événement] Erreur création événement natif:', err.message);
      // Non bloquant — on continue même si ça échoue
    }

    // ── Sauvegarder l'événement bot ───────────────────────────────────────────
    // channelId         = salon vocal karaoké (session, micros, votes en direct)
    // announceChannelId = salon texte annonces (inscriptions, boutons, récaps)
    const savedVoiceChId = loadVoiceChannel(guildId);

// Sécurité : on vérifie que le salon vocal est bien en mémoire
if (!savedVoiceChId) {
    return interaction.editReply({
        embeds: [errorEmbed("❌ Aucun salon vocal n'est configuré. Utilisez d'abord la commande de configuration du salon vocal.")],
        ephemeral: true
    });
}

createEvent(guildId, {
    hostId            : interaction.user.id,
    channelId         : savedVoiceChId, // On utilise UNIQUEMENT l'ID en mémoire
    announceChannelId : targetChannel.id, 
    title             : titre,
    eventDate,
    registrationStart,
    registrationEnd,
    announceMsgId     : msg.id,
    discordEventId,
});

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Événement créé !')
          .setDescription(
            `**${titre}** est prêt !\n\n` +
            `📢 Annonce postée dans <#${targetChannel.id}> et épinglée\n` +
            `📅 Événement Discord natif créé${discordEventUrl ? ` → [Voir l'événement](${discordEventUrl})` : ' (échec — à créer manuellement)'}\n` +
            `🔒 Salon vocal verrouillé jusqu'à \`/ouvrir-salon\` le jour J`
          ),
      ],
    });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFrDate(str) {
  const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const d = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
  return isNaN(d.getTime()) ? null : d;
}

function buildAnnouncementEmbed(titre, eventDate, regStart, regEnd) {
  return new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle(`🎤 ${titre}`)
    .setDescription('Une session karaoké est organisée ! Inscris-toi ci-dessous et choisis tes 3 chansons avant la date limite.')
    .addFields(
      { name: '🗓️ Date de la session',        value: `**${formatDate(eventDate)}**`,      inline: false },
      { name: '📬 Ouverture des inscriptions', value: `**${formatDate(regStart)}**`,        inline: true  },
      { name: '🔒 Fermeture des inscriptions', value: `**${formatDate(regEnd)}**`,          inline: true  },
      { name: '👥 Participants',               value: '_Aucun inscrit pour l\'instant_',    inline: false },
      { name: '📋 Comment participer ?',
        value: `1️⃣ Clique sur **S'inscrire** ci-dessous\n2️⃣ Remplis le formulaire avec tes 3 chansons\n3️⃣ Sois là le jour J entre **21h et 21h30** ! 🎶` },
    )
    .setFooter({ text: `Max ${MAX_SINGERS} chanteurs • Rappel automatique 24h avant fermeture` })
    .setTimestamp();
}
