const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Utilise un salon d\'entraînement disponible'),

    async execute(interaction) {
        // Noms des salons fixes
        const trainingChannels = ['Entraînement 1', 'Entraînement 2', 'Entraînement 3', 'Entraînement 4'];
        
        // Trouver un salon vide
        const channel = interaction.guild.channels.cache.find(c => 
            trainingChannels.includes(c.name) && c.members.size === 0
        );

        if (!channel) {
            return interaction.reply({ content: "⚠️ Tous les salons d'entraînement sont occupés.", ephemeral: true });
        }

        // 1. Création du Modal
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('chanson1').setLabel('Titre n°1').setStyle(TextInputStyle.Short).setRequired(true);
        const input2 = new TextInputBuilder()
            .setCustomId('chanson2').setLabel('Titre n°2').setStyle(TextInputStyle.Short).setRequired(false);
        const input3 = new TextInputBuilder()
            .setCustomId('chanson3').setLabel('Titre n°3').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input1),
            new ActionRowBuilder().addComponents(input2),
            new ActionRowBuilder().addComponents(input3)
        );

        await interaction.showModal(modal);

        // 2. Attente de la soumission
        const submitted = await interaction.awaitModalSubmit({
            time: 60000,
            filter: i => i.customId === `modal_train_${interaction.user.id}`
        }).catch(() => null);

        if (!submitted) return;

        await submitted.deferReply({ ephemeral: true });

       // 3. Définition de la variable SONGS (Formatée pour éviter l'erreur de slugify)
       const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info !== ""); // On garde ceux qui ont un titre saisi

        // 4. Attribution du salon
        await channel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true
        });

        // 5. Enregistrement de la session dans la Map globale
        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs, // Plus de ReferenceError ici !
            startTime: Date.now()
        });

        // 6. Sécurité 20 min (Option B)
        setTimeout(async () => {
            const session = global.trainingSessions.get(interaction.user.id);
            if (session) {
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member?.voice.channelId === channel.id) member.voice.disconnect();
            }
        }, 20 * 60 * 1000);

        // 7. Envoi de l'interface dans le salon
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `🎤 <@${interaction.user.id}>, ce salon est à toi !`, 
            embeds: [new EmbedBuilder().setTitle("Mode Entraînement").setDescription("Utilise les boutons pour vérifier tes musiques.")],
            components: [buttons] 
        });

        await submitted.editReply({ content: `✅ Salon réservé : <#${channel.id}>` });
    }
};
