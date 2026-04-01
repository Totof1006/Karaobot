const { 
    SlashCommandBuilder, EmbedBuilder, ModalBuilder, 
    TextInputBuilder, TextInputStyle, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle 
} = require('discord.js');
const play = require('play-dl'); // AJOUT : Pour la recherche auto

const { 
    getEvent, registerPlayer, setPlayerSongs, 
    isRegistrationOpen, formatDate 
} = require('../utils/eventDB');

const { errorEmbed } = require('../utils/embeds');
const { checkCommandChannel } = require('../utils/channelGuard');
const { MAX_SINGERS } = require('../utils/constants');

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
    } catch (e) { 
        console.error('Erreur refresh:', e.message); 
    }
}

async function showRegistrationModal(interaction) {
    const event = getEvent(interaction.guildId);
    if (!event) return interaction.reply({ embeds: [errorEmbed('Aucun événement planifié !')], ephemeral: true });

    const alreadyRegistered = event.registrations.find(r => r.userId === interaction.user.id);
    const existing = alreadyRegistered?.songs || [];

    const modal = new ModalBuilder()
        .setCustomId('modal_register_songs')
        .setTitle('🎤 Inscription Karaoke');

    const fields = [0, 1, 2].map((i) => {
        const ex = existing[i];
        // MODIF : On n'affiche plus le format complexe, juste le titre ou l'url
        const value = ex ? ex.title : ''; 
        return new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(`song_${i}`)
                .setLabel(`Chanson n°${i + 1} (Titre ou URL)`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Orelsan Ailleurs ou un lien YouTube')
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
    if (!event) return interaction.editReply({ embeds: [errorEmbed('Événement introuvable.')] });

    const rawInputs = [0, 1, 2].map(i => interaction.fields.getTextInputValue(`song_${i}`).trim()).filter(s => s.length > 0);

    const finalSongs = [];

    // Étape : Recherche et Validation (Comme Pancake)
    for (const input of rawInputs) {
        let title = input;
        let url = "";
        let apiDuration = 0;

        try {
            // 1. Recherche YouTube automatique
            if (!input.startsWith('http')) {
                const search = await play.search(input, { limit: 1 });
                if (search[0]) {
                    title = search[0].title;
                    url = search[0].url;
                }
            } else {
                url = input;
                const info = await play.video_info(input);
                title = info.video_details.title;
            }

            // 2. Recherche Paroles (LRCLIB)
            const query = encodeURIComponent(title);
            const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            const lyricsData = await response.json();
            if (lyricsData?.[0]) {
                apiDuration = lyricsData[0].duration;
            }

            finalSongs.push({ title, url, apiDuration, verified: false });
        } catch (e) {
            console.error("Erreur validation musique:", e.message);
            finalSongs.push({ title: input, url: "", apiDuration: 0, verified: false });
        }
    }

    // Sauvegarde DB
    if (!event.registrations.find(r => r.userId === interaction.user.id)) {
        registerPlayer(guildId, interaction.user.id, interaction.user.username);
    }
    setPlayerSongs(guildId, interaction.user.id, finalSongs);
    await refreshAnnouncement(interaction, guildId);

    // Réponse
    const embed = new EmbedBuilder()
        .setTitle('🎤 Inscription Validée !')
        .setColor(0x57F287)
        .setDescription("Le bot a trouvé tes musiques. Vérifie les détails ci-dessous.")
        .addFields(finalSongs.map((s, i) => ({
            name: `Chanson ${i + 1}`,
            value: `**Titre :** ${s.title}\n**Lien :** ${s.url ? '[Lien YouTube](' + s.url + ')' : '❌ Non trouvé'}\n**Paroles :** ${s.apiDuration > 0 ? '✅ Disponibles' : '❌ Non trouvées'}`,
            inline: false
        })));

    const row = new ActionRowBuilder();
    finalSongs.forEach((s, i) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`verify_song_${i}`)
                .setLabel(`Vérifier n°${i + 1}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!s.url)
        );
    });

    return interaction.editReply({ embeds: [embed], components: [row] });
}

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
