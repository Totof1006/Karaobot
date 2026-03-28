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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Utilise le salon d\'entraînement disponible'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) return interaction.reply({ content: `⚠️ Salon introuvable.`, ephemeral: true });

        // Vérification d'occupation
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
        }

        // --- MODAL SANS NETTOYAGE (Pour éviter le conflit audio) ---
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('chanson1').setLabel('Musique 1 (Nom = URL)').setStyle(TextInputStyle.Short).setRequired(true);
        const input2 = new TextInputBuilder().setCustomId('chanson2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false);
        const input3 = new TextInputBuilder().setCustomId('chanson3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2), new ActionRowBuilder().addComponents(input3));
        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_train_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info.trim() !== "");

        // --- DROITS D'ACCÈS ---
        await channel.permissionOverwrites.set([
            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] }
        ]);

        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, { userId: interaction.user.id, channelId: channel.id, songs: songs });

        // --- UNIQUE NETTOYAGE : APRÈS 20 MINUTES ---
        setTimeout(async () => {
            const session = global.trainingSessions?.get(interaction.user.id);
            if (session) {
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                try {
                    const msgs = await channel.messages.fetch({ limit: 100 });
                    if (msgs.size > 0) await channel.bulkDelete(msgs, true).catch(() => {});
                    await channel.send("✨ **Session terminée. Salon réinitialisé.**");
                } catch (e) {}
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 20 * 60 * 1000);

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Entraînement").setDescription("Salon prêt. Utilise `/lancer-test`.")],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Vérifier 1').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Vérifier 2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
                new ButtonBuilder().setCustomId(`check_3_${interaction.user.id}`).setLabel('Vérifier 3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
            )]
        });

        await submitted.editReply({ content: `✅ Salon réservé : <#${channel.id}>` });
    }
};
