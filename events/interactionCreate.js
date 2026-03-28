const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const ytdl = require('@distube/ytdl-core');

// --- IMPORTS DES UTILITAIRES ---
const { getSession, addPlayer } = require('../utils/gameState');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { joinButton, startButton } = require('../utils/buttons');
const { getLyrics } = require('../utils/lyricsSync'); // Import pour l'entraînement

const { 
    getEvent, unregisterPlayer, 
    isRegistrationOpen, setPlayerSongs 
} = require('../utils/eventDB');

const { refreshAnnouncement, showRegistrationModal, handleModalSubmit } = require('../commands/inscrire');
const { assignSpectatorRole, removeKaraokeRoles } = require('../utils/roleManager');
const { checkAnnouncementButton, checkCommandChannel } = require('../utils/channelGuard');

// --- FONCTIONS UTILITAIRES ---

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
        console.error(`[ytdl-core] Erreur sur ${url} :`, e.message);
        return 0;
    }
}

const formatTime = (s) => {
    if (!s || s <= 0) return "Incalculable";
    const min = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

// --- MODULE PRINCIPAL ---

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        // ── 1. SLASH COMMANDS ────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error('[Slash Command Error]', err);
                const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
                else await interaction.reply(msg);
            }
            return;
        }

        // ── 2. MODALS ───────────────────────────────────────────────────────
        if (interaction.type === InteractionType.ModalSubmit) {
            try {
                if (interaction.customId === 'modal_register_songs') {
                    const guard = checkCommandChannel(interaction);
                    if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                    await handleModalSubmit(interaction);
                }
            } catch (err) {
                console.error('[Modal Error]', err);
                await interaction.reply({ embeds: [errorEmbed('Erreur formulaire.')], ephemeral: true }).catch(() => {});
            }
            return;
        }

        // ── 3. BOUTONS ──────────────────────────────────────────────────────
        if (!interaction.isButton()) return;

        const { customId, user, guildId } = interaction;

        try {
            // 🔹 VÉRIFICATION MODE ENTRAÎNEMENT (AMÉLIORÉ)
if (customId.startsWith('check_train_')) {
    await interaction.deferReply({ ephemeral: true });

    const [,, index, userId] = customId.split('_');
    const session = global.trainingSessions?.get(userId);
    
    if (!session) return interaction.editReply({ content: "❌ Session d'entraînement expirée." });

    const song = session.songs[parseInt(index) - 1];
    if (!song) return interaction.editReply({ content: "❌ Données introuvables." });

    // 1. Durée YouTube
    const youtubeDuration = await getAudioDuration(song.url);

    // 2. Recherche des paroles (Local d'abord, puis API LRCLIB)
    let apiDuration = 0;
    const localLyrics = getLyrics(song.info);
    
    if (localLyrics) {
        apiDuration = Math.round(localLyrics.durationMs / 1000);
    } else {
        // Si pas de fichier local, on interroge LRCLIB directement
        try {
            const query = encodeURIComponent(song.info.split('=')[0].trim());
            const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            const results = await response.json();
            if (results && results.length > 0) {
                apiDuration = results[0].duration; // Durée en secondes de LRCLIB
            }
        } catch (e) {
            console.error("Erreur LRCLIB:", e);
        }
    }

    const diff = Math.abs(youtubeDuration - apiDuration);
    const isMatch = youtubeDuration > 0 && apiDuration > 0 && diff <= 15;

    const embed = new EmbedBuilder()
        .setTitle(`🔍 Rapport : ${song.info.split('+')[0].trim()}`)
        .setColor(isMatch ? 0x57F287 : 0xED4245)
        .addFields(
            { name: '🎙️ Paroles (API/LRCLIB)', value: formatTime(apiDuration), inline: true },
            { name: '📺 Vidéo (YouTube)', value: formatTime(youtubeDuration), inline: true }
        )
        .setFooter({ text: "Si YouTube est 'Incalculable', réessaie dans 1 min." });

    // Verdict dynamique
    if (apiDuration === 0) {
        embed.setDescription("❌ **Verdict**\nImpossible de trouver la durée (ni en local, ni sur LRCLIB).");
    } else if (isMatch) {
        embed.setDescription("✅ **Verdict**\n**Correspondance validée !**");
    } else {
        embed.setDescription(`⚠️ **Verdict**\n**Écart de ${Math.round(diff)}s détecté.**`);
    }

    return await interaction.editReply({ embeds: [embed] });
}

            // 🔹 VÉRIFICATION MODE ÉVÉNEMENT (Existant)
            if (customId.startsWith('verify_song_')) {
                await interaction.deferReply({ ephemeral: true });

                const songIndex = parseInt(customId.split('_')[2]);
                const event = getEvent(guildId);
                const registration = event?.registrations.find(r => r.userId === user.id);
                const song = registration?.songs[songIndex];

                if (!song) return interaction.editReply({ content: "❌ Chanson introuvable." });

                const youtubeDuration = await getAudioDuration(song.url);
                const apiDuration = song.apiDuration || 0;
                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = youtubeDuration > 0 && diff < 30;

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Rapport de conformité : ${song.title}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '⏱️ Paroles (API)', value: formatTime(apiDuration), inline: true },
                        { name: '📺 Vidéo (YouTube)', value: formatTime(youtubeDuration), inline: true },
                        { name: '📊 Verdict', value: isMatch ? '✅ **Correspondance validée !**' : `⚠️ **Écart de ${Math.round(diff)}s détecté.**` }
                    )
                    .setFooter({ text: "Si YouTube affiche 'Incalculable', réessaie dans 1 minute." });

                return await interaction.editReply({ embeds: [embed] });
            }

            // --- AUTRES BOUTONS (Inscription Event) ---
            if (customId === 'event_register') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                await showRegistrationModal(interaction);
            }
            
            if (customId === 'event_unregister') {
                const event = getEvent(guildId);
                if (!event || !isRegistrationOpen(event)) return interaction.reply({ embeds: [errorEmbed('Inscriptions fermées.')], ephemeral: true });
                if (unregisterPlayer(guildId, user.id)) {
                    await removeKaraokeRoles(interaction.guild, user.id);
                    await refreshAnnouncement(interaction, guildId);
                    return interaction.reply({ embeds: [successEmbed('Désinscrit.')], ephemeral: true });
                }
            }

        } catch (err) {
            console.error('[Global Button Error]', err);
        }
    },
};
