const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { setupUserReceiver } = require('../utils/voiceReceiver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Utilise le salon d\'entraînement disponible'),

    async execute(interaction) {
        // 1. CIBLAGE DU SALON
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) {
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });
        }

        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
        }

        // 2. MODAL
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('chanson1').setLabel('Musique 1 (Nom = URL)').setPlaceholder('Ex: Lose Yourself = https://youtube.com/...').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('chanson2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('chanson3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false)
            )
        );

        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({
            time: 60000,
            filter: i => i.customId === `modal_train_${interaction.user.id}`
        }).catch(() => null);

        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info.trim() !== "");

        // ── 3. PERMISSIONS (ON DONNE L'ACCÈS TOUT DE SUITE) ──────────────────
        // Comme dans ton ancien code, on assure l'accès avant toute chose
        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false, Connect: false });
            await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, Connect: true, Speak: true, Stream: true });
            await channel.permissionOverwrites.edit(interaction.client.user.id, { ViewChannel: true, Connect: true, Speak: true, ManageMessages: true });
        } catch (e) { console.error("Erreur perms:", e); }

        // ── 4. INITIALISATION SESSION ───────────────────────────────────────
        if (!global.trainingSessions) global.trainingSessions = new Map();
        const session = {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            connection: null,
            precisionTicks: 0
        };
        global.trainingSessions.set(interaction.user.id, session);

        // ── 5. CONNEXION VOCALE (SÉCURISÉE) ──────────────────────────────────
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
            session.connection = connection;
            // On prépare l'écoute du micro
            setupUserReceiver(session, interaction.user.id);
        } catch (err) {
            console.error("Le bot n'a pas pu rejoindre, mais l'utilisateur a ses accès.");
        }

        // ── 6. INTERFACE ────────────────────────────────────────────────────
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Entraînement Ouvert").setDescription("Le salon est à toi ! Lance `/lancer-test` quand tu es prêt.")],
            components: [buttons]
        });

        await submitted.editReply({ content: `✅ Salon réservé : <#${channel.id}>` });
    }
};
