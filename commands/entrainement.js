const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder().setName('entrainement').setDescription('🎤 Inscription'),
    async execute(interaction) {
        const channel = interaction.guild.channels.cache.find(c => c.name === 'Entraînement 1' && c.type === ChannelType.GuildVoice);
        if (!channel) return interaction.reply({ content: "⚠️ Salon introuvable.", ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`modal_${interaction.user.id}`).setTitle('Tes Musiques');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s1').setLabel('Musique 1 (Nom = URL)').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false))
        );

        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            submitted.fields.getTextInputValue('s1'),
            submitted.fields.getTextInputValue('s2'),
            submitted.fields.getTextInputValue('s3')
        ].filter(s => s && s.trim().length > 5); // Filtre les entrées trop courtes (ex: juste un espace)

        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            songs: songs,
            connection: getVoiceConnection(interaction.guild.id) || joinVoiceChannel({
                channelId: channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
                selfDeaf: false, selfMute: false
            }),
            precisionTicks: 0
        });

        await submitted.editReply("✅ Prêt ! Entre dans le salon et fais `/lancer-test`.");
    }
};
