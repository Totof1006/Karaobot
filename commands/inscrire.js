const { 
    SlashCommandBuilder, EmbedBuilder, ModalBuilder, 
    TextInputBuilder, TextInputStyle, ActionRowBuilder 
} = require('discord.js');
const play = require('play-dl');

const { 
    getEvent, registerPlayer, setPlayerSongs 
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
    if (!event) return interaction.reply({ 
        embeds: [errorEmbed('Aucun événement planifié !')], 
        flags: 64 // ✅ CORRECTION
    });

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
                .setLabel(`Chanson n°${i + 1} (Titre Artiste)`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Ailleurs Orelsan ou Lose Yourself Eminem')
                .setValue(value)
                .setRequired(i === 0)
        );
    });

    modal.addComponents(...fields);
    
    // Pas de deferReply ici (impossible avec showModal)
    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
    // ✅ CORRECTION : Utilisation de flags: 64 pour la réponse différée du formulaire
    await interaction.deferReply({ flags: 64 });

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

            if (input.includes('spotify.com')) {
                const spType = play.is_spotify_res(input);
                if (spType && spType !== 'search') {
                    const spData = await play.spotify(input).catch(() => null);
                    if (spData) {
                        const query = `${spData.name} ${spData.artists[0]?.name || ''}`;
                        const search = await play.search(query, { limit: 1 });
                        if (search[0]) {
                            title = search[0].title;
                            url = search[0].url;
                        }
                    }
                }
            } 
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

            finalSongs.push({ 
                title: title || input, 
                url: url || "", 
                verified: false 
            });
            
        } catch (e) {
            console.error(`Erreur recherche pour "${input}":`, e.message);
            finalSongs.push({ title: input, url: "", verified: false });
        }
    }

    if (!event.registrations.find(r => r.userId === interaction.user.id)) {
        registerPlayer(guildId, interaction.user.id, interaction.user.username);
    }
    setPlayerSongs(guildId, interaction.user.id, finalSongs);
    
    await refreshAnnouncement(interaction, guildId);

    const embed = new EmbedBuilder()
        .setTitle('🎤 Inscription Enregistrée !')
        .setColor(0x57F287)
        .setDescription("Tes musiques ont été enregistrées avec succès.")
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
        if (!guard.ok) return interaction.reply({ 
            embeds: [errorEmbed(guard.reason)], 
            flags: 64 // ✅ CORRECTION
        });
        await showRegistrationModal(interaction);
    },
    showRegistrationModal,
    handleModalSubmit,
    refreshAnnouncement
};
