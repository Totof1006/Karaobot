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

        // ── 1. CIBLAGE DU SALON ─────────────────────────────────────────────
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) {
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });
        }

        // Vérification si occupé
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
        }

        // ── 2. MODAL ────────────────────────────────────────────────────────
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('chanson1')
                    .setLabel('Musique 1 (Nom = URL)')
                    .setPlaceholder('Ex: Lose Yourself = https://youtube.com/...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('chanson2')
                    .setLabel('Musique 2')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('chanson3')
                    .setLabel('Musique 3')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );

        await interaction.showModal(modal);

        // ── 3. VALIDATION ───────────────────────────────────────────────────
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

        // ── 4. PERMISSIONS ──────────────────────────────────────────────────
        await channel.permissionOverwrites.set([
            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] }
        ]);

        // ── 5. CRÉATION DE LA SESSION ───────────────────────────────────────
        if (!global.trainingSessions) global.trainingSessions = new Map();

        const session = {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            connection: null,
            player: null,
            receiverStream: null,
            precisionTicks: 0
        };

        global.trainingSessions.set(interaction.user.id, session);

        // ── 6. CONNEXION VOCALE + RECEIVER PRO ──────────────────────────────
        const voiceConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        try {
            await entersState(voiceConnection, VoiceConnectionStatus.Ready, 5000);
        } catch (err) {
            console.error("[Entrainement] Connexion impossible :", err);
            return submitted.editReply({ content: "❌ Impossible de rejoindre le salon vocal." });
        }

        session.connection = voiceConnection;
        setupUserReceiver(session, interaction.user.id);

        // ── 7. INTERFACE ────────────────────────────────────────────────────
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Entraînement Ouvert").setDescription("Utilise `/lancer-test` quand tu es prêt.")],
            components: [buttons]
        });

        await submitted.editReply({ content: `✅ Salon réservé : <#${channel.id}>` });
    }
};
