const { 
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits 
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

if (!global.trainingSessions) global.trainingSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Inscription (3 musiques) et connexion automatique'),

    async execute(interaction) {
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => c.name === channelName);

        if (!channel) return interaction.reply({ content: "⚠️ Salon introuvable.", ephemeral: true });

        // 1. CRÉATION DU MODAL AVEC 3 CHAMPS
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder().setCustomId('chanson1').setLabel('Musique 1').setStyle(TextInputStyle.Short).setRequired(true);
        const input2 = new TextInputBuilder().setCustomId('chanson2').setLabel('Musique 2').setStyle(TextInputStyle.Short).setRequired(false);
        const input3 = new TextInputBuilder().setCustomId('chanson3').setLabel('Musique 3').setStyle(TextInputStyle.Short).setRequired(false);

        // Chaque champ DOIT être dans sa propre ActionRow
        modal.addComponents(
            new ActionRowBuilder().addComponents(input1),
            new ActionRowBuilder().addComponents(input2),
            new ActionRowBuilder().addComponents(input3)
        );
        
        await interaction.showModal(modal);

        // 2. RÉCEPTION DU FORMULAIRE
        const submitted = await interaction.awaitModalSubmit({ 
            time: 60000, 
            filter: i => i.customId === `modal_train_${interaction.user.id}` 
        }).catch(() => null);

        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        // 3. RÉCUPÉRATION DES VALEURS
        const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info.trim() !== ""); // On ne garde que les champs remplis

        // 4. CONNEXION VOCALE
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        // 5. ENREGISTREMENT DE LA SESSION
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            connection: connection,
            active: true
        });

        console.log(`✅ [SESSION START] Utilisateur: ${interaction.user.id} avec ${songs.length} musiques`);

        // 6. ENVOI DE L'INTERFACE AVEC LES 3 BOUTONS
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`check_train_1_${interaction.user.id}`)
                .setLabel('Vérifier 1')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`check_train_2_${interaction.user.id}`)
                .setLabel('Vérifier 2')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(songs.length < 2),
            new ButtonBuilder()
                .setCustomId(`check_train_3_${interaction.user.id}`)
                .setLabel('Vérifier 3')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎤 Session d'entraînement prête")
                    .setDescription(`Bot connecté. **${songs.length}** musique(s) enregistrée(s).\nTape \`/lancer-test\` pour démarrer la lecture.`)
                    .setColor(0x5865F2)
            ],
            components: [row]
        });

        await submitted.editReply("✅ Inscription réussie ! Rejoins le salon vocal.");
    }
};
