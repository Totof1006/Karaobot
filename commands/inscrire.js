const { 
  SlashCommandBuilder, EmbedBuilder, 
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, 
} = require('discord.js');
const { getEvent, registerPlayer, setPlayerSongs } = require('../utils/eventDB');
const { errorEmbed } = require('../utils/embeds');
const { checkCommandChannel } = require('../utils/channelGuard');
const { MAX_SINGERS } = require('../utils/constants');

// 1. Définition des fonctions utilitaires
async function getAudioDuration(url) {
    try {
        const ffmpeg = require('fluent-ffmpeg');
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(0), 5000);
            ffmpeg.ffprobe(url, (err, metadata) => {
                clearTimeout(timeout);
                if (err || !metadata) return resolve(0);
                resolve(metadata.format.duration || 0);
            });
        });
    } catch (e) { return 0; }
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
    } catch (e) { console.error('Erreur refresh:', e.message); }
}

// 2. Définition des gestionnaires de Modal
async function showRegistrationModal(interaction) {
    const event = getEvent(interaction.guildId);
    if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement !')], ephemeral: true });

    const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
    const existing = alreadyRegistered?.songs || [];

    const modal = new ModalBuilder()
        .setCustomId('modal_register_songs')
        .setTitle('Inscription Karaoke');

    const fields = [0, 1, 2].map((i) => {
        const ex = existing[i];
        const value = ex ? `${ex.title} + ${ex.artist} = ${ex.url}` : '';
        return new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(`song_${i}`)
                .setLabel(`Chanson n°${i + 1} (Titre + Artiste = Lien)`)
                .setStyle(TextInputStyle.Short)
                .setValue(value)
                .setRequired(i === 0)
        );
    });

    modal.addComponents(...fields);
    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const event = getEvent(guildId);

    const songs = [0, 1, 2].map(i => {
        const raw = interaction.fields.getTextInputValue(`song_${i}`).trim();
        if (!raw) return null;
        const eqSplit = raw.split('=');
        const info = eqSplit[0].split('+');
        return {
            title: info[0]?.trim() || "Inconnu",
            artist: info[1]?.trim() || "Inconnu",
            url: eqSplit[1]?.trim() || null
        };
    }).filter(s => s !== null);

    const validationResults = await Promise.all(songs.map(async (s) => {
        if (!s.url) return { ok: false };
        try {
            let duration = await getAudioDuration(s.url);
            const query = encodeURIComponent(`${s.title} ${s.artist}`);
            const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            const results = await response.json();
            
            // --- LA CORRECTION EST ICI ---
            const match = Array.isArray(results) && results.find(l => 
                Math.abs(l.duration - duration) < 30 && (l.syncedLyrics || l.lineLyrics || l.plainLyrics)
            );
            return { ok: !!match };
            // -----------------------------
            
        } catch (e) { return { ok: false }; }
    }));

    if (!event.registrations.find(r => r.userId === interaction.user.id)) {
        registerPlayer(guildId, interaction.user.id, interaction.user.username);
    }
    setPlayerSongs(guildId, interaction.user.id, songs);
    await refreshAnnouncement(interaction, guildId);

    const songLines = songs.map((s, i) => 
        `🎵 **${s.title}** — ${validationResults[i].ok ? '✅ Sync' : '❌ Non sync'}`
    ).join('\n');

    return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('Inscription traitée !').setDescription(songLines).setColor(0x57F287)]
    });
}

// 3. Export final
module.exports = {
    data: new SlashCommandBuilder()
        .setName('inscrire')
        .setDescription('🎤 S\'inscrire à l\'événement karaoké'),
    async execute(interaction) {
        const guard = checkCommandChannel(interaction);
        if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
        await showRegistrationModal(interaction);
    },
    showRegistrationModal,
    handleModalSubmit,
    refreshAnnouncement
};
