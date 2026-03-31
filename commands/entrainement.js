const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType 
} = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const { setupUserReceiver } = require('../utils/voiceReceiver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Prépare ta session d\'entraînement'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });

        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
        }

        // --- MODAL ---
        const modal = new ModalBuilder().setCustomId(`modal_train_${interaction.user.id}`).setTitle('Inscription Entraînement');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('chanson1').setLabel('Musique 1 (Nom = URL)').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('chanson2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('chanson3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false))
        );

        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_train_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            submitted.fields.getTextInputValue('chanson1'),
            submitted.fields.getTextInputValue('chanson2'),
            submitted.fields.getTextInputValue('chanson3')
        ].filter(s => s && s.trim().length > 5);

        // --- PERMISSIONS ---
        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false, Connect: false });
            await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, Connect: true, Speak: true, Stream: true });
            await channel.permissionOverwrites.edit(interaction.client.user.id, { ViewChannel: true, Connect: true, Speak: true });
        } catch (e) { console.error("Erreur Perms:", e.message); }

        // --- SESSION ---
        if (!global.trainingSessions) global.trainingSessions = new Map();
        const session = { userId: interaction.user.id, songs: songs, connection: null, player: null, precisionTicks: 0 };
        global.trainingSessions.set(interaction.user.id, session);

        // --- CONNEXION ---
        let connection = getVoiceConnection(interaction.guild.id);
        if (!connection || connection.joinConfig.channelId !== channel.id) {
            connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: false, selfMute: false
            });
        }

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            session.connection = connection;
            setupUserReceiver(session, interaction.user.id);
        } catch (err) { session.connection = connection; }

        // --- INTERFACE (BOUTONS + EMBED) ---
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 3)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎤 Session d'entraînement prête")
            .setDescription(`Bonjour <@${interaction.user.id}> !\n\nTes musiques sont enregistrées. Entre dans <#${channel.id}> et utilise \`/lancer-test\` pour commencer.`);

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
        await submitted.editReply(`✅ Salon déverrouillé : <#${channel.id}>`);
    }
};
