const { 
    SlashCommandBuilder, EmbedBuilder, ModalBuilder, 
    TextInputBuilder, TextInputStyle, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle 
} = require('discord.js');
const play = require('play-dl');

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

        const updatedEmbed = EmbedBuilder.from(msg.embeds[0]);
        
        const participantFieldName = `👥 Participants (${event.registrations.length}/${MAX_SINGERS})`;
        const fields = updatedEmbed.data.fields || [];
        const participantFieldIndex = fields.findIndex(f => f.name && f.name.includes('Participants'));

        if (participantFieldIndex !== -1) {
            updatedEmbed.spliceFields(participantFieldIndex, 1, { name: participantFieldName, value: playerList });
        } else {
            updatedEmbed.addFields({ name: participantFieldName, value: playerList });
        }

        await msg.edit({ embeds: [updatedEmbed] });
    } catch (e) { 
        console.error('Erreur refresh announcement:', e.message); 
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
        const value = ex ? ex.title : ''; 
        return new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(`song_${i}`)
                .setLabel(`Chanson n°${i + 1} (Titre ou URL)`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Orelsan Ailleurs ou lien YouTube/Spotify')
                .setValue(value)
                .setRequired(i === 0)
        );
    });

    modal.addComponents(...fields);
    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
    // 1. On diffère TOUJOURS la réponse pour éviter le timeout de 3s
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const event = getEvent(guildId);
    if (!event) return interaction.editReply({ embeds: [errorEmbed('Événement introuvable.')] });

    const rawInputs = [0, 1, 2]
        .map(i => interaction.fields.getTextInputValue(`song_${i}`).trim())
        .filter(s => s.length > 0);

    const finalSongs = [];

    for (const input of rawInputs) {
        try {
            let title = input;
            let url = "";

            // GESTION SPOTIFY : On transforme le lien en recherche YouTube
            if (input.includes('spotify.com')) {
                if (play.is_spotify_res(input)) {
                    const spData = await play.spotify(input);
                    const searchQuery = `${spData.name} ${spData.artists[0].name}`;
                    const search = await play.search(searchQuery, { limit: 1 });
                    if (search[0]) {
                        title = search[0].title;
                        url = search[0].url;
                    }
                }
            } 
            // GESTION YOUTUBE ET RECHERCHE TEXTE
            else if (!input.startsWith('http')) {
                const search = await play.search(input, { limit: 1 });
                if (search && search.length > 0) {
                    title = search[0].title;
                    url = search[0].url;
                }
            } else {
                url = input;
                const info = await play.video_info(input).catch(() => null);
                if (info) title = info.video_details.title;
            }

            // Sécurité : Si l'URL est toujours vide, on met une erreur au lieu de undefined
            finalSongs.push({ title, url: url || "", verified: false });
            
        } catch (e) {
            console.error(`Erreur recherche pour "${input}":`, e.message);
            finalSongs.push({ title: input, url: "", verified: false });
        }
    }

    // Sauvegarde en base de données
    if (!event.registrations.find(r => r.userId === interaction.user.id)) {
        registerPlayer(guildId, interaction.user.id, interaction.user.username);
    }
    setPlayerSongs(guildId, interaction.user.id, finalSongs);
    
    // Mise à jour de l'annonce publique
    await refreshAnnouncement(interaction, guildId);

    const embed = new EmbedBuilder()
        .setTitle('🎤 Inscription Enregistrée !')
        .setColor(0x57F287)
        .setDescription("Tes musiques ont été traitées. Le bot a cherché la meilleure version audio disponible.")
        .addFields(finalSongs.map((s, i) => ({
            name: `Chanson ${i + 1}`,
            value: `**Titre :** ${s.title}\n**Lien :** ${s.url ? `[Lien YouTube](${s.url})` : '❌ Non trouvé'}`,
            inline: false
        })));

    return interaction.editReply({ embeds: [embed] });
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
