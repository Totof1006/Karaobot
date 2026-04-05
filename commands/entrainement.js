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
        // --- NOTE IMPORTANTE ---
        // Le Modal doit être la TOUTE PREMIÈRE réponse. 
        // Pas de deferReply() ici.

        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) {
            // ✅ Utilisation de flags: 64 (Standard v14)
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, flags: 64 });
        }

        // Vérification d'occupation
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size > 0 && (!global.trainingSessions || !global.trainingSessions.has(interaction.user.id))) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", flags: 64 });
        }

        // --- PRÉPARATION DU MODAL ---
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Tes Musiques');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s1')
                    .setLabel('Musique 1 (Titre ou URL)')
                    .setPlaceholder('Ex: Orelsan Ailleurs')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s2')
                    .setLabel('Musique 2')
                    .setPlaceholder('Ex: Eminem Lose Yourself')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s3')
                    .setLabel('Musique 3')
                    .setPlaceholder('Ex: https://youtube.com/...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );

        // --- ENVOI DU MODAL ---
        await interaction.showModal(modal);

        // --- ATTENTE DE LA RÉPONSE (CORRECTION CLIENT) ---
        // ✅ On utilise interaction.client pour une capture plus robuste sur Railway
        const submitted = await interaction.client.awaitModalSubmit({ 
            time: 60000, 
            filter: i => i.customId === `modal_train_${interaction.user.id}` 
        }).catch(() => null);

        // Si l'utilisateur ferme le modal ou attend trop longtemps, on s'arrête.
        if (!submitted) return;

        // --- DÉLAI DE TRAITEMENT ---
        // ✅ Utilisation de flags: 64
        await submitted.deferReply({ flags: 64 });

        // Récupération et nettoyage des textes
        const songs = [
            submitted.fields.getTextInputValue('s1'),
            submitted.fields.getTextInputValue('s2'),
            submitted.fields.getTextInputValue('s3')
        ].filter(s => s && s.trim().length > 2);

        // Initialisation de la session globale (Sécurité au cas où index.js redémarre)
        if (!global.trainingSessions) global.trainingSessions = new Map();
        
        const session = { 
            userId: interaction.user.id, 
            songs: songs, 
            connection: null, 
            precisionTicks: 0 
        };
        global.trainingSessions.set(interaction.user.id, session);

        // --- CONNEXION VOCALE ---
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
            // Attente de la connexion (max 15s)
            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            session.connection = connection;
            setupUserReceiver(session, interaction.user.id);
        } catch (err) {
            console.error("❌ Échec connexion vocale:", err);
            if (connection) connection.destroy();
            global.trainingSessions.delete(interaction.user.id);
            return submitted.editReply("❌ Erreur lors de la connexion au salon vocal.");
        }

        // --- INTERFACE (BOUTONS & EMBED) ---
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Tester n°1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Tester n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_3_${interaction.user.id}`).setLabel('Tester n°3').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 3)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎤 Prêt pour l'entraînement")
            .setDescription(`Bonjour <@${interaction.user.id}> !\n\nTes musiques ont été ajoutées.\n\n**Actions :**\n1. Rejoins <#${channel.id}>\n2. Utilise \`/lancer-test\` pour démarrer.`);

        // Envoi dans le salon vocal
        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
        
        // Finalisation de l'interaction
        await submitted.editReply(`✅ Inscription réussie ! Rendez-vous dans <#${channel.id}>`);
    }
};
