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
        // On NE FAIT PAS de deferReply() ici, car on doit envoyer un Modal.
        // Un Modal doit être la TOUTE PREMIÈRE réponse à une interaction.

        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) {
            return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });
        }

        // Vérification d'occupation
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size > 0 && (!global.trainingSessions || !global.trainingSessions.has(interaction.user.id))) {
            return interaction.reply({ content: "⚠️ Le salon est déjà occupé.", ephemeral: true });
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
        // On l'envoie immédiatement pour éviter le timeout de 3 secondes
        await interaction.showModal(modal);

        // --- ATTENTE DE LA RÉPONSE DU MODAL ---
        const submitted = await interaction.awaitModalSubmit({ 
            time: 60000, 
            filter: i => i.customId === `modal_train_${interaction.user.id}` 
        }).catch(() => null);

        if (!submitted) return;

        // --- MAINTENANT ON DIT À DISCORD DE PATIENTER ---
        // Une fois le modal soumis, on a à nouveau 3 secondes. 
        // Le deferReply ici donne 15 minutes pour la suite (connexion vocale).
        await submitted.deferReply({ ephemeral: true });

        // Récupération des textes
        const songs = [
            submitted.fields.getTextInputValue('s1'),
            submitted.fields.getTextInputValue('s2'),
            submitted.fields.getTextInputValue('s3')
        ].filter(s => s && s.trim().length > 2);

        // Initialisation de la session globale
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
            // On attend que la connexion soit prête (max 15s)
            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
            session.connection = connection;
            setupUserReceiver(session, interaction.user.id);
        } catch (err) {
            console.error("Échec de la connexion vocale:", err);
            if (connection) connection.destroy();
            session.connection = null;
            return submitted.editReply("❌ Erreur lors de la connexion au salon vocal.");
        }

        // --- CRÉATION DE L'INTERFACE (BOUTONS & EMBED) ---
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Tester n°1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Tester n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_3_${interaction.user.id}`).setLabel('Tester n°3').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 3)
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎤 Prêt pour l'entraînement")
            .setDescription(`Bonjour <@${interaction.user.id}> !\n\nTes musiques ont été ajoutées. Le bot utilisera le cache ou YouTube pour les jouer.\n\n**Actions :**\n1. Rejoins <#${channel.id}>\n2. Utilise \`/lancer-test\` pour démarrer.`);

        // Envoi du message récapitulatif dans le salon de vocal (ou salon dédié)
        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
        
        // Confirmation finale à l'utilisateur (fermeture du chargement)
        await submitted.editReply(`✅ Inscription réussie ! Rendez-vous dans <#${channel.id}>`);
    }
};
