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

        if (!channel) return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });

        // Vérification d'occupation
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
        }

        // --- MODAL SIMPLIFIÉ ---
        const modal = new ModalBuilder().setCustomId(`modal_train_${interaction.user.id}`).setTitle('Tes Musiques');
        modal.addComponents(
            // On change le label pour dire à l'utilisateur qu'il peut juste taper le nom
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s1').setLabel('Musique 1 (Titre ou URL)').setPlaceholder('Ex: Orelsan Ailleurs').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s2').setLabel('Musique 2').setPlaceholder('Ex: Eminem Lose Yourself').setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s3').setLabel('Musique 3').setPlaceholder('Ex: https://youtube.com/...').setStyle(TextInputStyle.Short).setRequired(false))
        );

        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_train_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        // On récupère les textes bruts
        const songs = [
            submitted.fields.getTextInputValue('s1'),
            submitted.fields.getTextInputValue('s2'),
            submitted.fields.getTextInputValue('s3')
        ].filter(s => s && s.trim().length > 2);

        // --- SESSION ---
        if (!global.trainingSessions) global.trainingSessions = new Map();
        const session = { 
            userId: interaction.user.id, 
            songs: songs, 
            connection: null, 
            precisionTicks: 0 
        };
        global.trainingSessions.set(interaction.user.id, session);

       // --- CONNEXION (Version optimisée) ---
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

        try {
            // On attend que la connexion soit prête
            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            session.connection = connection;
            setupUserReceiver(session, interaction.user.id);
        } catch (err) {
            // MODIFICATION ICI : Si ça échoue, on détruit la connexion propre
            console.error("Échec de la connexion vocale:", err);
            if (connection) connection.destroy();
            session.connection = null;
        }

        // --- INTERFACE ---
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Tester n°1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Tester n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_3_${interaction.user.id}`).setLabel('Tester n°3').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 3)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎤 Prêt pour l'entraînement")
            .setDescription(`Bonjour <@${interaction.user.id}> !\n\nTes musiques ont été ajoutées. Le bot cherchera automatiquement la meilleure version.\n\n**Actions :**\n1. Rejoins <#${channel.id}>\n2. Utilise \`/lancer-test\` pour démarrer.`);

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
        await submitted.editReply(`✅ Inscription réussie dans <#${channel.id}>`);
    }
};
