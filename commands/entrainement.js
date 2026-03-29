const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

// On s'assure que la Map est bien globale et persistante
if (!global.trainingSessions) global.trainingSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Inscription et connexion automatique'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => c.name === channelName);

        if (!channel) return interaction.reply({ content: "⚠️ Salon introuvable.", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription');

        const input1 = new TextInputBuilder().setCustomId('chanson1').setLabel('Musique 1').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input1));
        
        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_train_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        // CONNEXION
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        // --- LA CLÉ : ON ÉCRASE TOUTE SESSION EXISTANTE SANS DÉLAI ---
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: [{ info: submitted.fields.getTextInputValue('chanson1') }],
            connection: connection,
            active: true
        });

        console.log(`✅ [SESSION FORCE START] Utilisateur: ${interaction.user.id}`);

        // IMPORTANT : Ne mets PAS de setTimeout ici pour l'instant. 
        // Testons d'abord si la session survit sans le nettoyeur auto.

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier 1').setStyle(ButtonStyle.Primary)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Salon prêt").setDescription("Session activée. Tape `/lancer-test`.")],
            components: [row]
        });

        await submitted.editReply("✅ C'est parti !");
    }
};
