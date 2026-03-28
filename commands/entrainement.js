const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Prépare le salon et connecte le bot'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.type === ChannelType.GuildVoice
        );

        if (!channel) return interaction.reply({ content: `⚠️ Salon "${channelName}" introuvable.`, ephemeral: true });

        // Vérification d'occupation (image_a8c496)
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            const hasBot = channel.members.has(interaction.client.user.id);
            // Si le bot est seul, on considère le salon libre
            if (channel.members.size > (hasBot ? 1 : 0)) {
                return interaction.reply({ content: "⚠️ Le salon est déjà occupé par un autre chanteur.", ephemeral: true });
            }
        }

        // --- 1. OUVERTURE DU MODAL ---
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('chanson1').setLabel('Musique 1 (Nom = URL)').setStyle(TextInputStyle.Short).setRequired(true);
        const input2 = new TextInputBuilder().setCustomId('chanson2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false);
        const input3 = new TextInputBuilder().setCustomId('chanson3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2), new ActionRowBuilder().addComponents(input3));
        await interaction.showModal(modal);

        // --- 2. RÉCEPTION ET CONNEXION ---
        const submitted = await interaction.awaitModalSubmit({ time: 60000, filter: i => i.customId === `modal_train_${interaction.user.id}` }).catch(() => null);
        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info.trim() !== "");

        // Réglage des permissions (Bot + User)
        await channel.permissionOverwrites.set([
            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages] }
        ]);

        // --- AUTO-CONNEXION DU BOT ICI ---
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        // On tente de stabiliser en arrière-plan pendant que l'utilisateur lit les instructions
        entersState(connection, VoiceConnectionStatus.Ready, 20_000).catch(() => console.log("⏳ Stabilisation vocale en cours..."));

        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, { 
            userId: interaction.user.id, 
            channelId: channel.id, 
            songs: songs,
            connection: connection // On stocke la connexion pour lancer-test
        });

        // Nettoyage final après 20 min
        setTimeout(async () => {
            const session = global.trainingSessions?.get(interaction.user.id);
            if (session) {
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                try {
                    const msgs = await channel.messages.fetch({ limit: 100 });
                    if (msgs.size > 0) await channel.bulkDelete(msgs, true).catch(() => {});
                } catch (e) {}
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 20 * 60 * 1000);

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [new EmbedBuilder().setTitle("🎤 Salon prêt").setDescription("Je suis déjà connecté dans le salon vocal. Tape `/lancer-test` dès que tu es prêt !")],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier 1').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier 2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
                new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier 3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
            )]
        });

        await submitted.editReply({ content: `✅ Inscription réussie. Rejoins-moi dans <#${channel.id}> !` });
    }
};
