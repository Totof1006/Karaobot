const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const ytdl = require('@distube/ytdl-core');

// --- IMPORTS DES UTILITAIRES ---
const { getSession, addPlayer, addVote } = require('../utils/gameState'); // ✅ addVote rétabli
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
        console.error(`[AudioDuration Error] ${e.message}`);
        return 0;
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
                // ✅ Sécurité anti-crash : évite de répondre deux fois
                if (interaction.replied || interaction.deferred) return;
                await handleModalSubmit(interaction);
            }
            return;
        }

        // ── 3. FILTRE BOUTONS ───────────────────────────────────────────
        if (!interaction.isButton()) return;

        try {
            // ✅ BOUTONS : SYSTÈME DE VOTE (Rétabli)
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

            // ✅ BOUTONS : MODE ENTRAÎNEMENT (Vérification)
            // Harmonisé sur "check_train_" pour correspondre à ton entrainement.js
            if (customId.startsWith('check_train_')) {
                await interaction.deferReply({ flags: 64 }); // ✅ Passage au Flag 64

                const parts = customId.split('_');
                const songIndex = parseInt(parts[2]) - 1; // Ajusté car ID est check_train_index_user
                const userId = parts[3];

                if (user.id !== userId) {
                    return interaction.editReply({ content: "❌ Ce n'est pas votre session." });
                }

                const session = global.trainingSessions?.get(userId);
                if (!session || !session.songs[songIndex]) {
                    return interaction.editReply({ content: "❌ Musique introuvable." });
                }

                const songQuery = session.songs[songIndex];
                const youtubeDuration = await getAudioDuration(songQuery); 
                const apiDuration = 180; // Valeur exemple

                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = diff <= 5;

                const embed = new EmbedBuilder()
                    .setTitle(`Vérification : ${songQuery}`)
                    .setColor(isMatch ? 0x00FF00 : 0xFF0000)
                    .addFields(
                        { name: '⏱️ API', value: `${Math.floor(apiDuration/60)}:${(apiDuration%60).toString().padStart(2, '0')}`, inline: true },
                        { name: '📺 Vidéo', value: `${Math.floor(youtubeDuration/60)}:${(youtubeDuration%60).toString().padStart(2, '0')}`, inline: true },
                        { name: '📊 Verdict', value: is
