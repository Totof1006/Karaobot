const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType 
} = require('discord.js');
const { joinVoiceChannel, entersState, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');

// Importation sécurisée de ton utilitaire
// Assure-toi que le chemin est correct selon ton arborescence
const voiceReceiver = require('../utils/voiceReceiver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Prépare ta session (Recherche automatique)'),

    async execute(interaction) {
        // --- NOTE : Pas de deferReply() avant un Modal ---
        const guild = interaction.guild;
        const channelName = 'Entraînement 1';
        
        // Recherche du salon
        const channel = guild.channels.cache.find(c => 
            c.name === channelName && (c.type === ChannelType.GuildVoice || c.type === 2)
        );

        if (!channel) {
            return interaction.reply({ 
                content: `⚠️ Salon vocal "${channelName}" introuvable. Vérifiez le nom du salon.`, 
                flags: 64 
            });
        }

        // Vérification d'occupation (Exclure les bots)
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size > 0) {
            // Si le salon est occupé par quelqu'un d'autre que l'utilisateur lui-même
            if (!humanMembers.has(interaction.user.id)) {
                return interaction.reply({ 
                    content: "⚠️ Le salon est déjà occupé par un autre chanteur.", 
                    flags: 64 
                });
            }
        }

        // --- PRÉPARATION DU MODAL ---
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Tes Musiques d\'Entraînement');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s1')
                    .setLabel('Musique 1 (Titre ou URL)')
                    .setPlaceholder('Ex: Orelsan - L\'Enfer')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s2')
                    .setLabel('Musique 2')
                    .setPlaceholder('Optionnel')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('s3')
                    .setLabel('Musique 3')
                    .setPlaceholder('Optionnel')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );

        // Envoi du Modal
        await interaction.showModal(modal);

        // --- COLLECTEUR DE RÉPONSE ---
        try {
            const submitted = await interaction.awaitModalSubmit({ 
                time: 60000, 
                filter: i => i.customId === `modal_train_${interaction.user.id}` 
            });

            // Une fois reçu, on diffère immédiatement pour avoir du temps (Railway peut être lent)
            await submitted.deferReply({ flags: 64 });

            // Extraction des musiques
            const s1 = submitted.fields.getTextInputValue('s1');
            const s2 = submitted.fields.getTextInputValue('s2');
            const s3 = submitted.fields.getTextInputValue('s3');

            const songs = [s1, s2, s3].filter(s => s && s.trim().length > 1);

            // Initialisation de la session globale
            if (!global.trainingSessions) global.trainingSessions = new Map();
            
            const session = { 
                userId: interaction.user.id, 
                songs: songs, 
                connection: null, 
                startTime: Date.now()
            };
            
            global.trainingSessions.set(interaction.user.id, session);

            // --- CONNEXION VOCALE ---
            let connection = getVoiceConnection(guild.id);
            
            if (!connection || connection.joinConfig.channelId !== channel.id) {
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false, 
                    selfMute: false
                });
            }

            // Attente de l'état prêt
            await entersState(connection, VoiceConnectionStatus.Ready, 10000);
            session.connection = connection;

            // Setup du Receiver (si la fonction existe)
            if (voiceReceiver && voiceReceiver.setupUserReceiver) {
                voiceReceiver.setupUserReceiver(session, interaction.user.id);
            }

            // --- INTERFACE FINALE ---
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`check_1_${interaction.user.id}`).setLabel('Lancer n°1').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`check_2_${interaction.user.id}`).setLabel('Lancer n°2').setStyle(ButtonStyle.Secondary).setDisabled(songs.length < 2),
                new ButtonBuilder().setCustomId(`stop_train_${interaction.user.id}`).setLabel('Arrêter').setStyle(ButtonStyle.Danger)
            );

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🎤 Session prête !")
                .setDescription(`Tes musiques sont prêtes, <@${interaction.user.id}>.\n\n**Salon :** <#${channel.id}>\n\n**Liste :**\n${songs.map((s, i) => `**${i+1}.** ${s}`).join('\n')}`)
                .setFooter({ text: "Utilise les boutons ci-dessous pour gérer ton entraînement." });

            // Envoi d'un message de contrôle dans le salon vocal
            await channel.send({ 
                content: `🔔 Session de <@${interaction.user.id}> prête.`, 
                embeds: [embed], 
                components: [buttons] 
            });

            // Confirmation privée
            await submitted.editReply({ 
                content: `✅ Tout est prêt ! Rejoins <#${channel.id}> pour commencer.` 
            });

        } catch (err) {
            // Si l'utilisateur a ignoré le modal ou s'il y a une erreur technique
            if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
                return; // Temps écoulé, pas besoin de log
            }
            console.error("❌ Erreur Entraînement:", err);
            // On essaie de répondre si l'interaction est encore valide
            try {
                await interaction.followUp({ content: "⚠️ Une erreur est survenue (Temps écoulé ou problème de connexion).", flags: 64 });
            } catch (e) {}
        }
    }
};
