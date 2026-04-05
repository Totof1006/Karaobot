const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const play = require('play-dl');

// --- IMPORTS DES UTILITAIRES ---
const { getSession, addPlayer, addVote } = require('../utils/gameState'); 
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { joinButton, startButton } = require('../utils/buttons');
const { getLyrics } = require('../utils/lyricsSync'); 

const { 
    getEvent, unregisterPlayer, 
    isRegistrationOpen, setPlayerSongs 
} = require('../utils/eventDB');

const { refreshAnnouncement, showRegistrationModal, handleModalSubmit } = require('../commands/inscrire');
const { assignSpectatorRole, removeKaraokeRoles } = require('../utils/roleManager');
const { checkAnnouncementButton, checkCommandChannel } = require('../utils/channelGuard');

// --- FONCTIONS UTILITAIRES ---

/**
 * Récupère la durée YouTube avec sécurité Railway
 */
async function getAudioDuration(input) {
    if (!input) return 180;
    try {
        if (process.env.YT_COOKIES_BASE64) {
            const decoded = Buffer.from(process.env.YT_COOKIES_BASE64.trim(), 'base64')
                .toString('utf-8')
                .replace(/[\n\r]/g, '')
                .trim();
            await play.setToken({ youtube: { cookie: decoded } });
        }

        let videoUrl = input.trim();
        if (!videoUrl.startsWith('http')) {
            const search = await play.search(videoUrl, { limit: 1 });
            if (search.length === 0) return 180;
            videoUrl = search[0].url;
        }

        const info = await play.video_info(videoUrl);
        const duration = info.video_details.durationInSec;
        return (duration && duration > 0) ? duration : 180;
    } catch (e) {
        console.error(`[AudioDuration Error] ${e.message}`);
        return 180; 
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const { guildId, user, customId } = interaction;

        // ── 1. COMMANDES SLASH ──────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`[Slash Error] ${interaction.commandName}:`, error);
                const payload = { embeds: [errorEmbed('Une erreur est survenue.')], flags: 64 };
                if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
                else await interaction.reply(payload);
            }
            return;
        }

        // ── 2. SOUMISSION DE MODAL ──────────────────────────────────────
        if (interaction.type === InteractionType.ModalSubmit) {
            if (interaction.customId === 'modal_register_songs') {
                if (interaction.replied || interaction.deferred) return;
                await handleModalSubmit(interaction);
            }
            return;
        }

        // ── 3. FILTRE BOUTONS ───────────────────────────────────────────
        if (!interaction.isButton()) return;

        try {
            // ✅ BOUTONS : SYSTÈME DE VOTE
            if (customId.startsWith('vote_')) {
                const score = parseInt(customId.split('_')[1]);
                const session = getSession(guildId);
                if (!session) return interaction.reply({ content: "❌ Aucune session active.", flags: 64 });
                const success = addVote(session, user.id, score);
                if (success) {
                    return await interaction.reply({ content: `✅ Vote de **${score} ⭐** enregistré !`, flags: 64 });
                } else {
                    return await interaction.reply({ content: "⚠️ Vous avez déjà voté ou vous êtes le chanteur actuel.", flags: 64 });
                }
            }

            // ✅ BOUTONS : MODE ENTRAÎNEMENT (VÉRIFICATION DOUBLE DURÉE)
            if (customId.startsWith('check_train_')) {
                await interaction.deferReply({ flags: 64 });

                const parts = customId.split('_');
                const songIndex = parseInt(parts[2]) - 1;
                const userId = parts[3];

                if (user.id !== userId) return interaction.editReply({ content: "❌ Ce n'est pas votre session." });

                const session = global.trainingSessions?.get(userId);
                if (!session || !session.songs[songIndex]) return interaction.editReply({ content: "❌ Musique introuvable." });

                const songQuery = session.songs[songIndex];

                // 1. Durée YouTube (Sécurité)
                const youtubeDuration = await getAudioDuration(songQuery);

                // 2. Durée du fichier .lrc (Ton GitHub)
                const lyricsData = getLyrics(songQuery);
                const lrcDuration = lyricsData ? Math.floor(lyricsData.durationMs / 1000) : null;

                const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

                const embed = new EmbedBuilder()
                    .setTitle(`Vérification : ${songQuery}`)
                    .setColor(lrcDuration ? 0x00FF00 : 0xFFAA00)
                    .addFields(
                        { 
                            name: '⏱️ Durée .lrc (GitHub)', 
                            value: lrcDuration ? `✅ **${formatTime(lrcDuration)}**` : '❌ Fichier introuvable', 
                            inline: true 
                        },
                        { 
                            name: '📺 Durée YouTube', 
                            value: youtubeDuration === 180 ? '⚠️ 3:00 (Bloqué/Défaut)' : `✅ **${formatTime(youtubeDuration)}**`, 
                            inline: true 
                        }
                    );

                // Verdict final pour éviter le crash
                if (!lrcDuration) {
                    embed.setDescription("⚠️ **Attention :** Le fichier lyrics est introuvable sur GitHub. Le test risque de ne pas afficher de paroles.");
                } else {
                    const diff = Math.abs(lrcDuration - youtubeDuration);
                    embed.setDescription(diff > 15 ? `⚠️ Écart de **${diff}s** détecté entre les paroles et la vidéo.` : "✅ Les durées correspondent. Prêt pour `/lancer-test` !");
                }

                return await interaction.editReply({ embeds: [embed] });
            }

            // ── 4. BOUTONS : GESTION ÉVÉNEMENT ──────────────────────────────
            if (customId === 'event_register') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], flags: 64 });
                await showRegistrationModal(interaction);
            }
            
            if (customId === 'event_unregister') {
                const event = getEvent(guildId);
                if (!event || !isRegistrationOpen(event)) return interaction.reply({ embeds: [errorEmbed('Inscriptions fermées.')], flags: 64 });
                if (unregisterPlayer(guildId, user.id)) {
                    await removeKaraokeRoles(interaction.guild, user.id);
                    await refreshAnnouncement(interaction, guildId);
                    return interaction.reply({ embeds: [successEmbed('Désinscrit.')], flags: 64 });
                }
            }

        } catch (err) {
            console.error('[Global Button Error]', err);
        }
    },
};
