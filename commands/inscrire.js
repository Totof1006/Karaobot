const { 
    SlashCommandBuilder, EmbedBuilder, ModalBuilder, 
    TextInputBuilder, TextInputStyle, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle 
} = require('discord.js');
const { getEvent, registerPlayer, setPlayerSongs } = require('../utils/eventDB');
const { errorEmbed } = require('../utils/embeds');
const { checkCommandChannel } = require('../utils/channelGuard');
const { MAX_SINGERS } = require('../utils/constants');

// Fonction utilitaire pour rafraîchir l'affichage des participants
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
        const value = ex ? `${ex.title} + ${ex.artist} = ${ex.url}` : '';
        return new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(`song_${i}`)
                .setLabel(`Chanson n°${i + 1} (Titre + Artiste = Lien)`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Soulman + Ben l\'Oncle Soul = https://...')
                .setValue(value)
                .setRequired(i === 0)
        );
    });

    modal.addComponents(...fields);
    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
    // Étape 1 : Réponse différée (Sécurité 3s Discord)
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const event = getEvent(guildId);
    if (!event) return interaction.editReply({ embeds: [errorEmbed('Événement introuvable.')] });

    // Étape 2 : Extraction des données du formulaire
    const songs = [0, 1, 2].map(i => {
        const raw = interaction.fields.getTextInputValue(`song_${i}`).trim();
        if (!raw) return null;
        
        const eqSplit = raw.split('=');
        const infoPart = eqSplit[0].trim();
        const url = eqSplit[1] ? eqSplit[1].trim() : null;
        
        const plusSplit = infoPart.split('+');
        const title = plusSplit[0]?.trim() || "Inconnu";
        const artist = plusSplit[1]?.trim() || "Inconnu";
        
        return { title, artist, url };
    }).filter(s => s !== null);

    // Étape 3 : Recherche rapide des paroles (Sans calcul de temps YouTube)
    const validationResults = await Promise.all(songs.map(async (s) => {
        try {
            const query = encodeURIComponent(`${s.title} ${s.artist}`);
            const response = await fetch(`https://lrclib.net/api/search?q=${query}`);
            const results = await response.json();
            
            if (Array.isArray(results) && results.length > 0) {
                const best = results[0];
                return { 
                    ok: true, 
                    apiDuration: best.duration, 
                    hasLyrics: !!(best.syncedLyrics || best.plainLyrics) 
                };
            }
            return { ok: false, apiDuration: 0, hasLyrics: false };
        } catch (e) {
            return { ok: false, apiDuration: 0, hasLyrics: false };
        }
    }));

    // Étape 4 : Mise à jour des données (On inclut apiDuration pour le bouton futur)
    const finalSongs = songs.map((s, i) => ({
        ...s,
        apiDuration: validationResults[i].apiDuration,
        verified: false
    }));

    if (!event.registrations.find(r => r.userId === interaction.user.id)) {
        registerPlayer(guildId, interaction.user.id, interaction.user.username);
    }
    setPlayerSongs(guildId, interaction.user.id, finalSongs);
    await refreshAnnouncement(interaction, guildId);

    // Étape 5 : Construction de la réponse avec boutons de vérification
    const embed = new EmbedBuilder()
        .setTitle('🎤 Inscription Enregistrée !')
        .setColor(0x57F287)
        .setDescription("Tes chansons ont été ajoutées. Clique sur les boutons ci-dessous pour vérifier si la durée de ta vidéo correspond aux paroles trouvées.")
        .addFields(finalSongs.map((s, i) => ({
            name: `Chanson ${i + 1}`,
            value: `**${s.title}** (${s.artist})\nParoles : ${validationResults[i].hasLyrics ? '✅ Trouvées' : '❌ Non trouvées'}`,
            inline: false
        })));

    const row = new ActionRowBuilder();
    finalSongs.forEach((s, i) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`verify_song_${i}`)
                .setLabel(`Vérifier n°${i + 1}`)
                .setStyle(ButtonStyle.Primary)
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
