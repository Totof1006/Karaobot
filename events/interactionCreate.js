const { EmbedBuilder, InteractionType } = require('discord.js');
const ytdl = require('@distube/ytdl-core'); // IMPORT ESSENTIEL : nécessite npm install ytdl-core

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
const { launchFromEvent } = require('../commands/lancer-evenement');
const { playLocalAudio } = require('../utils/audioPlayer');
const { startBreakThenSing, revealResults, endSession } = require('../utils/sessionFlow');
const { updateProgressEmbed } = require('../utils/progressEmbed');
const { VOTE_DURATION_MS, APPLAUSE_FILE } = require('../utils/constants');

// --- FONCTIONS UTILITAIRES (CONTRÔLE 1 : STABILITÉ) ---

async function getAudioDuration(url) {
    if (!url || !ytdl.validateURL(url)) return 0;
    try {
        // Extraction rapide des métadonnées sans télécharger le flux audio
        const info = await ytdl.getBasicInfo(url);
        return parseInt(info.videoDetails.lengthSeconds) || 0;
    } catch (e) {
        console.error("[ytdl-core] Impossible de lire la durée :", e.message);
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
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── 1. SLASH COMMANDS (CONTRÔLE 2 : GESTION DES ERREURS) ────────────────
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

        // ── 2. MODALS (CONTRÔLE 3 : TYPE D'INTERACTION) ────────────────────────
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

        // ── 3. BOUTONS (CONTRÔLE 4 : TIMEOUT & PERSISTENCE) ───────────────────
        if (!interaction.isButton()) return;

        const session = getSession(interaction.guildId);
        const { customId, user } = interaction;

        try {
            // VÉRIFICATION DE VERSION (BOUTON VERIFY)
            if (customId.startsWith('verify_song_')) {
                // On stoppe le chrono de 3s de Discord immédiatement
                await interaction.deferReply({ ephemeral: true }).catch(() => {});

                const songIndex = parseInt(customId.split('_')[2]);
                const event = getEvent(interaction.guildId);
                const registration = event?.registrations.find(r => r.userId === user.id);
                const song = registration?.songs[songIndex];

                if (!song || !song.url) {
                    return interaction.editReply({ content: "❌ Chanson ou lien YouTube introuvable." });
                }

                // Récupération de la vraie durée via ytdl-core
                const youtubeDuration = await getAudioDuration(song.url);
                const apiDuration = song.apiDuration || 0;
                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = youtubeDuration > 0 && diff < 30;

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Rapport de conformité : ${song.title}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '⏱️ Durée Paroles', value: formatTime(apiDuration), inline: true },
                        { name: '📺 Durée YouTube', value: formatTime(youtubeDuration), inline: true },
                        { name: '📊 Verdict', value: isMatch ? '✅ **Compatible !**' : `⚠️ **Écart de ${Math.round(diff)}s détecté.**` }
                    )
                    .setFooter({ text: "Vérifie l'intro/outro de ta vidéo si l'écart est grand." });

                return await interaction.editReply({ embeds: [embed] });
            }

            // INSCRIPTION AU KARAOKÉ
            if (customId === 'event_register') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                await showRegistrationModal(interaction);
                return;
            }

            // SPECTATEUR
            if (customId === 'event_spectator') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                const event = getEvent(interaction.guildId);
                if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement actif.')], ephemeral: true });
                
                if (event.registrations.find(r => r.userId === user.id)) {
                    return interaction.reply({ embeds: [errorEmbed('Tu es déjà inscrit comme chanteur !')], ephemeral: true });
                }

                await assignSpectatorRole(interaction.guild, user.id);
                return interaction.reply({ embeds: [successEmbed(`Tu es maintenant spectateur de la session !`)], ephemeral: true });
            }

            // DÉSINSCRIRE
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
                    return interaction.reply({ embeds: [successEmbed('Ta désinscription a été prise en compte.')], ephemeral: true });
                }
                return interaction.reply({ embeds: [errorEmbed('Tu n\'es pas dans la liste des participants.')], ephemeral: true });
            }

            // REJOINDRE LA SESSION EN COURS
            if (customId === 'karaoke_join') {
                if (!session || session.phase !== 'registration') return interaction.reply({ embeds: [errorEmbed('La session n\'accepte plus de joueurs.')], ephemeral: true });
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
