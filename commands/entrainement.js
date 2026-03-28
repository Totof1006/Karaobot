const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

// Initialisation sécurisée de la Map globale
if (!global.trainingSessions) global.trainingSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Prépare le salon et connecte le bot'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) return interaction.reply({ content: `⚠️ Salon introuvable.`, ephemeral: true });

        // MODAL
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder().setCustomId('chanson1').setLabel('Musique 1').setStyle(TextInputStyle.Short).setRequired(true);
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

        // Permissions
        await channel.permissionOverwrites.set([
            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] }
        ]);

        // Connexion vocale
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        // --- STOCKAGE PERSISTANT ---
        const sessionId = Date.now(); // Identifiant unique de session
        global.trainingSessions.set(interaction.user.id, { 
            userId: interaction.user.id, 
            channelId: channel.id, 
            songs: songs,
            connection: connection,
            sessionId: sessionId 
        });

        console.log(`✅ [SESSION START] Utilisateur: ${interaction.user.id} | ID: ${sessionId}`);

        // --- NETTOYAGE APRÈS 20 MINUTES (VALEUR FIXE EN MS) ---
        const VINGT_MINUTES = 20 * 60 * 1000; 
        
        setTimeout(async () => {
            const sessionToCheck = global.trainingSessions.get(interaction.user.id);
            
            // On vérifie que c'est toujours la MÊME session avant de supprimer
            if (sessionToCheck && sessionToCheck.sessionId === sessionId) {
                console.log(`🧹 [SESSION END] Nettoyage auto pour ${interaction.user.id}`);
                
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    connection.destroy();
                }
                
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                
                try {
                    const msgs = await channel.messages.fetch({ limit: 50 });
                    if (msgs.size > 0) await channel.bulkDelete(msgs, true);
                } catch (e) {}
                
                global.trainingSessions.delete(interaction.user.id);
            }
        }, VINGT_MINUTES);

        // Envoi de l'interface
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier 1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier 2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier 3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Salon prêt").setDescription("Tape `/lancer-test` pour commencer.")],
            components: [row]
        });

        await submitted.editReply({ content: "✅ Session activée !" });
    }
};
