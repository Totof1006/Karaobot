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
        .setDescription('🎤 Prépare ta session (Recherche automatique)'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) {
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, flags: 64 });
        }

        // --- MODAL ---
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Tes Musiques');

        const s1 = new TextInputBuilder().setCustomId('s1').setLabel('Musique 1').setPlaceholder('Ex: Orelsan Ailleurs').setStyle(TextInputStyle.Short).setRequired(true);
        const s2 = new TextInputBuilder().setCustomId('s2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false);
        const s3 = new TextInputBuilder().setCustomId('s3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(s1),
            new ActionRowBuilder().addComponents(s2),
            new ActionRowBuilder().addComponents(s3)
        );

        await interaction.showModal(modal);

        // --- COLLECTEUR ---
        try {
            const submitted = await interaction.awaitModalSubmit({ 
                time: 60000, 
                filter: i => i.customId === `modal_train_${interaction.user.id}` 
            });

            // On acquitte immédiatement la soumission du modal
            await submitted.deferReply({ flags: 64 });

            const songs = [
                submitted.fields.getTextInputValue('s1'),
                submitted.fields.getTextInputValue('s2'),
                submitted.fields.getTextInputValue('s3')
            ].filter(s => s && s.trim().length > 2);

            if (!global.trainingSessions) global.trainingSessions = new Map();
            
            const session = { 
                userId: interaction.user.id, 
                songs: songs, 
                connection: null, 
                precisionTicks: 0 
            };
            global.trainingSessions.set(interaction.user.id, session);

            // --- VOCAL ---
            let connection = getVoiceConnection(interaction.guild.id);
            if (!connection || connection.joinConfig.channelId !== channel.id) {
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                    selfDeaf: false, 
                    selfMute: false
                });
            }

            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            session.connection = connection;
            setupUserReceiver(session, interaction.user.id);

            // --- BOUTONS (TES ORIGINAUX) ---
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
                new ButtonBuilder().setCustomId(`check_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 3)
            );

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🎤 Prêt pour l'entraînement")
                .setDescription(`Bonjour <@${interaction.user.id}> !\n\n1. Rejoins <#${channel.id}>\n2. Clique sur un bouton.`);

            // On envoie le message dans le salon vocal
            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
            
            // ON RÉPOND ENFIN À L'INTERACTION DU MODAL (pour enlever le "réfléchit")
            await submitted.editReply({ content: `✅ Session prête dans <#${channel.id}>` });

        } catch (err) {
            // Si timeout ou erreur, on ne crash pas
            console.error("Erreur Modal Entraînement:", err);
        }
    }
};
