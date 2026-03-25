const { SlashCommandBuilder, EmbedBuilder,
        PermissionFlagsBits }                = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { slugify }                         = require('../utils/lyricsSync');
const { errorEmbed }                      = require('../utils/embeds');
const { LYRICS_FETCH_TIMEOUT_MS }         = require('../utils/constants');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paroles-ajouter')
    .setDescription('🎵 Télécharger les paroles d\'une chanson depuis lrclib.net (Modo/Leader)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o
      .setName('titre')
      .setDescription('Titre de la chanson')
      .setRequired(true))
    .addStringOption(o => o
      .setName('artiste')
      .setDescription('Nom de l\'artiste')
      .setRequired(true))
    .addStringOption(o => o
      .setName('album')
      .setDescription('Album (optionnel, aide à trouver la bonne version)')
      .setRequired(false)),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent ajouter des paroles.')],
        ephemeral: true,
      });
    }

    const titre   = interaction.options.getString('titre').trim();
    const artiste = interaction.options.getString('artiste').trim();
    const album   = interaction.options.getString('album')?.trim() || null;

    await interaction.deferReply({ ephemeral: true });

    // ── Appel API lrclib.net ──────────────────────────────────────────────────
    let data;
    try {
      // Construction de l'URL avec paramètres
      const params = new URLSearchParams({
        track_name : titre,
        artist_name: artiste,
        ...(album ? { album_name: album } : {}),
      });

      const res = await fetch(`https://lrclib.net/api/get?${params}`, {
        headers: { 'User-Agent': 'KaraokeDiscordBot/1.0' },
        signal : AbortSignal.timeout(LYRICS_FETCH_TIMEOUT_MS),
      });

      if (res.status === 404) {
        return interaction.editReply({
          embeds: [errorEmbed(
            `Aucune parole trouvée pour **${titre}** de **${artiste}**.\n\n` +
            `💡 Essaie avec un titre ou un artiste légèrement différent, ou ajoute l'album.\n` +
            `Tu peux aussi chercher manuellement sur [lrclib.net](https://lrclib.net).`
          )],
        });
      }

      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      data = await res.json();

    } catch (err) {
      return interaction.editReply({
        embeds: [errorEmbed(`Erreur lors de la connexion à lrclib.net : ${err.message}`)],
      });
    }

    // ── Vérifier qu'on a bien des paroles synchronisées ───────────────────────
    const lrcContent = data.syncedLyrics || data.plainLyrics;
    const isSynced   = !!data.syncedLyrics;

    if (!lrcContent) {
      return interaction.editReply({
        embeds: [errorEmbed(
          `Les paroles de **${data.trackName}** ont été trouvées mais ne sont pas disponibles.\n` +
          `Essaie une autre version ou ajoute le fichier manuellement.`
        )],
      });
    }

    // ── Sauvegarder le fichier .lrc ───────────────────────────────────────────
    if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });

    const slug     = slugify(data.trackName || titre);
    const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);

    // Construire le contenu LRC avec métadonnées
    const lrcHeader = [
      `[ti:${data.trackName || titre}]`,
      `[ar:${data.artistName || artiste}]`,
      data.albumName ? `[al:${data.albumName}]` : null,
      data.duration  ? `[length:${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')}]` : null,
      '',
    ].filter(l => l !== null).join('\n');

    // Si paroles non synchronisées → les convertir en format LRC basique (une ligne toutes les 3s)
    let finalContent;
    if (isSynced) {
      finalContent = lrcHeader + lrcContent;
    } else {
      // Paroles brutes → ajouter timestamps estimés
      const lines = lrcContent.split('\n').filter(l => l.trim());
      let timeMs  = 0;
      const lrcLines = lines.map(line => {
        const mm  = String(Math.floor(timeMs / 60000)).padStart(2, '0');
        const ss  = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0');
        const cs  = String(Math.floor((timeMs % 1000) / 10)).padStart(2, '0');
        timeMs   += 3000; // 3 secondes par ligne
        return `[${mm}:${ss}.${cs}] ${line}`;
      });
      finalContent = lrcHeader + lrcLines.join('\n');
    }

    try {
      fs.writeFileSync(filePath, finalContent, 'utf-8');
    } catch (writeErr) {
      return interaction.editReply({
        embeds: [errorEmbed(`Impossible d'écrire le fichier de paroles : ${writeErr.message}`)],
      });
    }

    // ── Réponse ───────────────────────────────────────────────────────────────
    const lineCount = (lrcContent.match(/\n/g) || []).length + 1;

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Paroles téléchargées !')
          .addFields(
            { name: '🎵 Titre',    value: data.trackName  || titre,   inline: true },
            { name: '🎤 Artiste',  value: data.artistName || artiste, inline: true },
            { name: '💿 Album',    value: data.albumName  || '_N/A_', inline: true },
            { name: '⏱️ Durée',    value: data.duration ? `${Math.floor(data.duration/60)}:${String(data.duration%60).padStart(2,'0')}` : '_N/A_', inline: true },
            { name: '📄 Paroles',  value: isSynced ? `✅ Synchronisées (${lineCount} lignes)` : `⚠️ Non synchronisées (timestamps estimés)`, inline: true },
            { name: '💾 Fichier',  value: `\`lyrics/${slug}.lrc\``, inline: false },
          )
          .setFooter({ text: 'Source : lrclib.net • La chanson est maintenant disponible dans /chansons-liste' }),
      ],
    });
  },
};
