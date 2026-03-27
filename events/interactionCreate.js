const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const ytdl = require('@distube/ytdl-core'); // Utilisation de la version patchée

// --- IMPORTS DES UTILITAIRES ---
const {
    getSession, addPlayer, getCurrentSinger,
    getSongTitle,
    addVote, advanceToNextSinger,
    deleteSession, shufflePlayers,
} = require('../utils/gameState');
const {
    registrationEmbed, votingEmbed, errorEmbed, successEmbed,
} = require('../utils/embeds');
const { joinButton, startButton, voteButtons } = require('../utils/buttons');

const { 
    getEvent, registerPlayer, unregisterPlayer, 
    isRegistrationOpen, formatDate, setPlayerSongs 
} = require('../utils/eventDB');

const { refreshAnnouncement, showRegistrationModal, handleModalSubmit } = require('../commands/inscrire');
const {
    assignSpectatorRole, removeKaraokeRoles,
    ROLE_LEADER, ROLE_MODO, hasRole,
} = require('../utils/roleManager');
const {
    findVoiceChannel, unmuteSingersOnly,
} = require('../utils/voiceManager');
const { checkAnnouncementButton, checkCommandChannel } = require('../utils/channelGuard');
const { playLocalAudio } = require('../utils/audioPlayer');
const { startBreakThenSing, revealResults, endSession } = require('../utils/sessionFlow');
const { updateProgressEmbed } = require('../utils/progressEmbed');
const { VOTE_DURATION_MS, APPLAUSE_FILE } = require('../utils/constants');

// --- FONCTIONS UTILITAIRES (CONTRÔLE : CONTOURNE LE BLOCAGE YOUTUBE) ---

async function getAudioDuration(url) {
    if (!url || !ytdl.validateURL(url)) return 0;
    try {
        // Ajout d'un User-Agent pour éviter l'erreur 429 (Too Many Requests)
        const info = await ytdl.getBasicInfo(url, {
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            }
        });
        return parseInt(info.videoDetails.lengthSeconds) || 0;
    } catch (e) {
        // Log précis de l'erreur pour Railway
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
    name: Events.InteractionCreate, // Utilisation de l'énumération officielle pour éviter les warnings
    async execute(interaction, client) {

        // ── 1. SLASH COMMANDS ────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error('[Slash Command Error]', err);
                const msg = { embeds: [errorEmbed('Une erreur est survenue lors de la commande.')], ephemeral: true };
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
                const msg = { embeds: [errorEmbed('Erreur lors du traitement du formulaire.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
                else await interaction.reply(msg).catch(() => {});
            }
            return;
        }

        // ── 3. BOUTONS (VÉRIFICATION DE DURÉE) ──────────────────────────────
        if (!interaction.isButton()) return;

        const session = getSession(interaction.guildId);
        const { customId, user } = interaction;

        try {
            // VÉRIFICATION DE CONFORMITÉ (LE BOUTON BLEU)
            if (customId.startsWith('verify_song_')) {
                // IMPORTANT : On stoppe le timeout de 3s immédiatement
                await interaction.deferReply({ ephemeral: true }).catch(() => {});

                const songIndex = parseInt(customId.split('_')[2]);
                const event = getEvent(interaction.guildId);
                const registration = event?.registrations.find(r => r.userId === user.id);
                const song = registration?.songs[songIndex];

                if (!song || !song.url) {
                    return interaction.editReply({ content: "❌ Chanson ou lien YouTube introuvable." });
                }

                // Récupération sécurisée de la durée YouTube
                const youtubeDuration = await getAudioDuration(song.url);
                const apiDuration = song.apiDuration || 0;
                
                // Calcul du verdict
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

            // --- AUTRES BOUTONS D'INSCRIPTION ---
            if (customId === 'event_register') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                await showRegistrationModal(interaction);
                return;
            }

            if (customId === 'event_spectator') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                const event = getEvent(interaction.guildId);
                if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement actif.')], ephemeral: true });
                
                if (event.registrations.find(r => r.userId === user.id)) {
                    return interaction.reply({ embeds: [errorEmbed('Tu es déjà inscrit comme chanteur !')], ephemeral: true });
                }

                await assignSpectatorRole(interaction.guild, user.id);
                return interaction.reply({ embeds: [successEmbed(`Tu es maintenant spectateur !`)], ephemeral: true });
            }

            if (customId === 'event_unregister') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                const event = getEvent(interaction.guildId);
                if (!event || !isRegistrationOpen(event)) {
                    return interaction.reply({ embeds: [errorEmbed('Les inscriptions sont fermées.')], ephemeral: true });
                }
                
                if (unregisterPlayer(interaction.guildId, user.id)) {
                    await removeKaraokeRoles(interaction.guild, user.id);
                    await refreshAnnouncement(interaction, interaction.guildId);
                    return interaction.reply({ embeds: [successEmbed('Désinscription confirmée.')], ephemeral: true });
                }
                return interaction.reply({ embeds: [errorEmbed('Tu n\'es pas inscrit.')], ephemeral: true });
            }

            if (customId === 'karaoke_join') {
                if (!session || session.phase !== 'registration') return interaction.reply({ embeds: [errorEmbed('La session est complète.')], ephemeral: true });
                if (addPlayer(session, user.id, user.username)) {
                    await interaction.update({ 
                        embeds: [registrationEmbed(session)], 
                        components: [joinButton(), startButton()] 
                    });
                }
                return;
            }

        } catch (err) {
            console.error('[Global Button Error]', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [errorEmbed('Une erreur technique est survenue.')], ephemeral: true }).catch(() => {});
            }
        }
    },
};
