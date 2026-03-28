const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Utilise un salon d\'entraînement disponible'),

    async execute(interaction) {
        // Noms des salons fixes
        const trainingChannels = ['Entraînement 1', 'Entraînement 2', 'Entraînement 3', 'Entraînement 4'];
        
        // Trouver un salon vide (sans membres)
        const channel = interaction.guild.channels.cache.find(c => 
            trainingChannels.includes(c.name) && c.members.size === 0
        );

        if (!channel) {
            return interaction.reply({ content: "⚠️ Tous les salons d'entraînement sont occupés. Réessaie plus tard.", ephemeral: true });
        }

        // 1. Affichage du Modal (réutilise ton code de formulaire précédent)
        // ... (Code du Modal identique à avant) ...
        
        // 2. Traitement après soumission du Modal
        // ... (Code de récupération des chansons identique) ...

        // 3. Attribution du salon (Permission Edit)
        await channel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true
        });

        // 4. Enregistrement de la session
        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            startTime: Date.now()
        });

        // --- OPTION B : TIMER DE SÉCURITÉ (20 MIN) ---
        setTimeout(async () => {
            const session = global.trainingSessions.get(interaction.user.id);
            if (session && session.channelId === channel.id) {
                // Réinitialisation des permissions
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
                // Optionnel : Kick l'utilisateur s'il est encore dedans
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member?.voice.channelId === channel.id) member.voice.disconnect();
            }
        }, 20 * 60 * 1000);

        // 5. Envoi de l'interface de vérification
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>, ce salon est à toi pour 20 min !`, 
            embeds: [new EmbedBuilder().setTitle("🎤 Mode Entraînement").setDescription("Vérifie tes musiques ci-dessous :")],
            components: [row] 
        });

        await submitted.editReply({ content: `✅ Salon réservé : <#${channel.id}>` });
    }
};
