const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core'); 
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { slugify } = require('../utils/lyricsSync');
const { errorEmbed } = require('../utils/embeds');
const { LYRICS_FETCH_TIMEOUT_MS } = require('../utils/constants');
const { getSession } = require('../utils/gameState'); 

const LYRICS_DIR = path.join(__dirname, '../lyrics');

// --- FONCTION UTILITAIRE SÉCURISÉE (SIMULATION NAVIGATEUR) ---
async function getAudioDuration(url) {
    if (!url || !ytdl.validateURL(url)) return 0;
    try {
        const info = await ytdl.getBasicInfo(url, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            }
        });
        return parseInt(info.videoDetails.lengthSeconds) || 0;
    } catch (e) {
        console.error("[paroles-ajouter] Erreur durée YouTube:", e.message);
        return 0;
    }
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
                flags: 64, // ✅ CORRECTION
            });
        }

        const titre = interaction.options.getString('titre').trim();
        const artiste = interaction.options.getString('artiste').trim();
        const album = interaction.options.getString('album')?.trim() || null;

        // ✅ CORRECTION : Utilisation de flags: 64 pour le deferReply
        await interaction.deferReply({ flags: 64 });

        // 1. Récupération de la durée de la musique en cours
        const session = getSession(interaction.guildId);
        let currentAudioDuration = 0;
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

            if (currentAudioDuration > 0) {
                params.append('duration', Math.round(currentAudioDuration));
            }

            const res = await fetch(`https://lrclib.net/api/get?${params}`, {
                headers: { 'User-Agent': 'KaraokeDiscordBot/1.0' },
                signal: AbortSignal.timeout(LYRICS_FETCH_TIMEOUT_MS),
            });

            if (res.status === 404) {
                return interaction.editReply({
                    embeds: [errorEmbed(`Aucune parole trouvée pour **${titre}**.`)],
                });
            }

            if (!res.ok) throw new Error(`Erreur API (${res.status})`);
            data = await res.json();

        } catch (err) {
            return interaction.editReply({
                embeds: [errorEmbed(`Erreur de connexion : ${err.message}`)],
            });
        }

        // 3. Vérification de l'écart de durée (Sécurité Scoring)
        if (currentAudioDuration > 0 && data.duration) {
            const diff = Math.abs(data.duration - currentAudioDuration);
            if (diff > 25) { 
                return interaction.editReply({
                    embeds: [errorEmbed(`⚠️ **Écart trop important !**\n\nYouTube : ${currentAudioDuration}s\nParoles : ${Math.round(data.duration)}s\n\nCherche une version plus proche.`)],
                });
            }
        }

        // 4. Préparation et Sauvegarde du fichier .lrc
        const lrcContent = data.syncedLyrics || data.plainLyrics;
        if (!lrcContent) return interaction.editReply({ embeds: [errorEmbed(`Paroles vides.`)] });

        if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });
        
        const slug = slugify(data.trackName || titre);
        const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);

        const lrcHeader = [
            `[ti:${data.trackName || titre}]`,
            `[ar:${data.artistName || artiste}]`,
            data.duration ? `[length:${formatTime(data.duration)}]` : '',
            '',
        ].join('\n');

        try {
            fs.writeFileSync(filePath, lrcHeader + lrcContent, 'utf-8');
        } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed(`Erreur écriture : ${e.message}`)] });
        }

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Paroles synchronisées !')
                    .addFields(
                        { name: '🎵 Titre', value: data.trackName || titre, inline: true },
                        { name: '⏱️ Durée', value: formatTime(data.duration), inline: true }
                    )
            ],
        });
    },
};

function formatTime(s) {
    if (!s) return "Inconnu";
    const min = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}
