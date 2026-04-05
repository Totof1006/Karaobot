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

// ✅ Ajout de l'import pour le receiver (si non présent dans ta sauvegarde, nécessaire pour l'entraînement)
const { setupUserReceiver } = require('../utils/voiceReceiver');
const { joinVoiceChannel, entersState, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');

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
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, flags: 64 }); // ✅ Flag 64
        }

        // Vérification si occupé
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", flags: 64 }); // ✅ Flag 64
        }

        // ── 2. MODAL D'ENTRÉE (SANS NETTOYAGE PRÉALABLE) ─────────────────────
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('song1')
            .setLabel('Musique 1 (Lien ou Nom)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const input2 = new TextInputBuilder()
            .setCustomId('song2')
            .setLabel('Musique 2 (Optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const input3 = new TextInputBuilder()
            .setCustomId('song3')
            .setLabel('Musique 3 (Optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input1),
            new ActionRowBuilder().addComponents(input2),
            new ActionRowBuilder().addComponents(input3)
        );

        await interaction.showModal(modal);

        // ── 3. RÉCEPTION DU MODAL ────────────────────────────────────────────
        try {
            const submitted = await interaction.awaitModalSubmit({
                time: 60000,
                filter: i => i.customId === `modal_train_${interaction.user.id}`
            });

            await submitted.deferReply({ flags: 64 }); // ✅ Flag 64

            const songs = [
                submitted.fields.getTextInputValue('song1'),
                submitted.fields.getTextInputValue('song2'),
                submitted.fields.getTextInputValue('song3')
            ].filter(s => s && s.trim().length > 2); // ✅ Ton filtre exact préservé

            // ── 4. INITIALISATION SESSION ──────────────────────────────────────
            if (!global.trainingSessions) global.trainingSessions = new Map();

            const session = {
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                channelId: channel.id,
                songs: songs,
                precisionTicks: 0, // ✅ Validé : indispensable
                startTime: Date.now()
            };

            global.trainingSessions.set(interaction.user.id, session);

            // ── 5. CONNEXION ET ÉCOUTE ─────────────────────────────────────────
            let connection = getVoiceConnection(interaction.guild.id);
            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });
            }

            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            
            // ✅ Validé : Activation de l'écoute utilisateur
            setupUserReceiver(session, interaction.user.id);

            // ── 6. ENVOI DE L'INTERFACE ─────────────────────────────────────────
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

            await submitted.editReply({ content: `✅ Salon d'entraînement préparé dans **${channel.name}** !` });

        } catch (err) {
            console.error('[Training Modal Error]', err);
        }
    }
};
