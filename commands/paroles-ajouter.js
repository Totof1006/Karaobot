const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg'); // Nécessite ffmpeg/ffprobe sur Railway
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { slugify } = require('../utils/lyricsSync');
const { errorEmbed } = require('../utils/embeds');
const { LYRICS_FETCH_TIMEOUT_MS } = require('../utils/constants');
const { getSession } = require('../utils/gameState'); 

const LYRICS_DIR = path.join(__dirname, '../lyrics');

// Fonction utilitaire pour obtenir la durée de l'audio
async function getAudioDuration(url) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(url, (err, metadata) => {
            if (err) return resolve(0);
            resolve(metadata.format.duration);
        });
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('paroles-ajouter')
        .setDescription('🎵 Télécharger les paroles avec vérification de durée (Modo/Leader)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .addStringOption(o => o.setName('titre').setDescription('Titre de la chanson').setRequired(true))
        .addStringOption(o => o.setName('artiste').setDescription('Nom de l\'artiste').setRequired(true))
        .addStringOption(o => o.setName('album').setDescription('Album (optionnel)').setRequired(false)),

    async execute(interaction) {
        const isLeader = hasRole(interaction.member, ROLE_LEADER);
        const isModo = hasRole(interaction.member, ROLE_MODO);

        if (!isLeader && !isModo) {
            return interaction.reply({
                embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent ajouter des paroles.')],
                ephemeral: true,
            });
        }

        const titre = interaction.options.getString('titre').trim();
        const artiste = interaction.options.getString('artiste').trim();
        const album = interaction.options.getString('album')?.trim() || null;

        await interaction.deferReply({ ephemeral: true });

        // 1. Récupération de la durée de la musique en cours pour filtrer
        const session = getSession(interaction.guildId);
        let currentAudioDuration = null;
        if (session?.currentSong?.url) {
            currentAudioDuration = await getAudioDuration(session.currentSong.url);
        }

        // 2. Appel API lrclib.net
        let data;
        try {
            const params = new URLSearchParams({
                track_name: titre,
                artist_name: artiste,
                ...(album ? { album_name: album } : {}),
            });

            // On ajoute la durée à la recherche si on l'a (Best Match)
            if (currentAudioDuration) {
                params.append('duration', Math.round(currentAudioDuration));
            }

            const res = await fetch(`https://lrclib.net/api/get?${params}`, {
                headers: { 'User-Agent': 'KaraokeDiscordBot/1.0' },
                signal: AbortSignal.timeout(LYRICS_FETCH_TIMEOUT_MS),
            });

            if (res.status === 404) {
                return interaction.editReply({
                    embeds: [errorEmbed(`Aucune parole trouvée pour **${titre}**. Vérifie l'orthographe ou la durée.`)],
                });
            }

            if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
            data = await res.json();

        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed(`Erreur de connexion à lrclib : ${err.message}`)],
            });
        }

        // 3. Vérification de l'écart de durée (Sécurité Scoring)
        if (currentAudioDuration && data.duration) {
            const diff = Math.abs(data.duration - currentAudioDuration);
            if (diff > 15) {
                return interaction.editReply({
                    embeds: [errorEmbed(`⚠️ **Écart trop important !**\n\nMusique : ${Math.round(currentAudioDuration)}s\nParoles : ${Math.round(data.duration)}s\n\nLe scoring serait faussé. Cherche une autre version.`)],
                });
            }
        }

        const lrcContent = data.syncedLyrics || data.plainLyrics;
        const isSynced = !!data.syncedLyrics;

        if (!lrcContent) {
            return interaction.editReply({ embeds: [errorEmbed(`Paroles trouvées mais vides.`)] });
        }

        // 4. Sauvegarde du fichier
        if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });
        const slug = slugify(data.trackName || titre);
        const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);

        const lrcHeader = [
            `[ti:${data.trackName || titre}]`,
            `[ar:${data.artistName || artiste}]`,
            data.duration ? `[length:${Math.floor(data.duration / 60)}:${String(Math.floor(data.duration % 60)).padStart(2, '0')}]` : null,
            '',
        ].filter(l => l !== null).join('\n');

        let finalContent = isSynced ? lrcHeader + lrcContent : lrcHeader + lrcContent.split('\n').map((line, i) => `[${String(Math.floor((i * 3000) / 60000)).padStart(2, '0')}:${String(Math.floor(((i * 3000) % 60000) / 1000)).padStart(2, '0')}.00] ${line}`).join('\n');

        try {
            fs.writeFileSync(filePath, finalContent, 'utf-8');
        } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed(`Erreur écriture : ${e.message}`)] });
        }

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Paroles synchronisées !')
                    .setDescription(`Le fichier a été validé par rapport à la durée de l'audio actuel.`)
                    .addFields(
                        { name: '🎵 Titre', value: data.trackName, inline: true },
                        { name: '⏱️ Durée', value: `${Math.floor(data.duration/60)}:${String(Math.floor(data.duration%60)).padStart(2, '0')}`, inline: true }
                    )
            ],
        });
    },
};
