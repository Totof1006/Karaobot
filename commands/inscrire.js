const { 
  SlashCommandBuilder, EmbedBuilder, 
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, 
} = require('discord.js');
const { getEvent, registerPlayer, setPlayerSongs } = require('../utils/eventDB');
const { errorEmbed } = require('../utils/embeds');
const { checkCommandChannel } = require('../utils/channelGuard');
const { MAX_SINGERS } = require('../utils/constants');

// --- UTILITAIRES ---

async function getAudioDuration(url) {
    const ffmpeg = require('fluent-ffmpeg');
    return new Promise((resolve) => {
        // Sécurité : si FFmpeg met plus de 5s, on renvoie 0
        const timer = setTimeout(() => resolve(0), 5000);
        ffmpeg.ffprobe(url, (err, metadata) => {
            clearTimeout(timer);
            if (err || !metadata) return resolve(0);
            resolve(metadata.format.duration || 0);
        });
    });
}

async function refreshAnnouncement(interaction, guildId) {
    try {
        const event = getEvent(guildId);
        if (!event?.announceMsgId) return;
        const announceChId = event.announceChannelId || event.channelId;
        const ch = await interaction.client.channels.fetch(announceChId).catch(() => null);
        if (!ch || !event.registrations) return;

        const playerList = event.registrations.length === 0
            ? '_Aucun inscrit_'
            : event.registrations.map((r, i) => `${i + 1}. <@${r.userId}> — ✅`).join('\n');

        const msg = await ch.messages.fetch(event.announceMsgId).catch(() => null);
        if (!msg) return;

        const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
            .spliceFields(3, 1, { name: `👥 Participants (${event.registrations.length}/${MAX_SINGERS})`, value: playerList });

        await msg.edit({ embeds: [updatedEmbed] });
    } catch (e) { console.error('Erreur refresh:', e.message); }
}

// --- LOGIQUE ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inscrire')
        .setDescription('🎤 S\'inscrire à l\'événement karaoké'),

    async execute(interaction) {
        const guard = checkCommandChannel(interaction);
        if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
        
        const event = getEvent(interaction.guildId);
        if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement !')], ephemeral: true });

        // Affichage du modal
        const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
        const existing = alreadyRegistered?.songs || [];
        const modal = new ModalBuilder().setCustomId('modal_register_songs').setTitle('Karaoke');

        const rows = [1, 2, 3].map((num, i) => {
            const ex = existing[i];
            const val = ex ? `${ex.title} + ${ex.artist} = ${ex.url}` : '';
            return new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`song_${i}`).setLabel(`Chanson ${num}`).setStyle(TextInputStyle.Short)
                    .setValue(val).setRequired(i === 0)
            );
        });
        modal.addComponents(...rows);
        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction) {
        // CRITIQUE : On prévient Discord TOUT DE SUITE qu'on va être long
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guildId;
        const event = getEvent(guildId);
        
        const songs = [0, 1, 2].map(i => {
            const raw = interaction.fields.getTextInputValue(`song_${i}`).trim();
            if (!raw) return null;
            const parts = raw.split('=');
            const info = parts[0].split('+');
            return {
                title: info[0]?.trim() || "Inconnu",
                artist: info[1]?.trim() || "Inconnu",
                url: parts[1]?.trim() || null
            };
        }).filter(s => s !== null);

        const validationResults = await Promise.all(songs.map(async (s) => {
            if (!s.url) return { ok: false };
            try {
                const duration = await getAudioDuration(s.url);
                const query = encodeURIComponent(`${s.title} ${s.artist}`);
                const res = await fetch(`https://lrclib.net/api/search?q=${query}`);
                const data = await res.json();
                const match = data.find(l => Math.abs(l.duration - duration) < 30 && (l.syncedLyrics || l.lineLyrics));
                return { ok: !!match };
            } catch (e) { return { ok: false }; }
        }));

        // Sauvegarde
        if (!event.registrations.find(r => r.userId === interaction.user.id)) {
            registerPlayer(guildId, interaction.user.id, interaction.user.username);
        }
        setPlayerSongs(guildId, interaction.user.id, songs);
        await refreshAnnouncement(interaction, guildId);

        const lines = songs.map((s, i) => `🎵 **${s.title}** : ${validationResults[i].ok ? '✅ Sync' : '❌ Non sync'}`).join('\n');
        
        // On utilise editReply car on a fait un deferReply au début
        return interaction.editReply({
            embeds: [new EmbedBuilder().setTitle('Inscription validée !').setDescription(lines).setColor(0x57F287)]
        });
    }
};

// --- EXPORTS ---

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inscrire')
    .setDescription('🎤 S\'inscrire à l\'événement karaoké planifié'),
  async execute(interaction) {
    const guard = checkCommandChannel(interaction);
    if (!guard.ok) return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
    await showRegistrationModal(interaction);
  },
  showRegistrationModal,
  handleModalSubmit,
  refreshAnnouncement
};
