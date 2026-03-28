const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

// --- MODULE PRINCIPAL ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Utilise le salon d\'entraînement disponible'),

    async execute(interaction) {

        // ── 1. RECHERCHE DU SALON UNIQUE ─────────────────────────────────────
        const channelName = 'Entraînement 1'; // Nom visible sur image_a86d4c
        
        // FIX CRASH image_a95703 : Vérification de l'existence du cache
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.isVoice()
        );

        if (!channel) {
            return interaction.reply({ 
                content: `⚠️ Le salon "${channelName}" est introuvable.`, 
                ephemeral: true 
            });
        }

        // Vérification d'occupation (image_a8c496)
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ 
                content: "⚠️ Le salon est déjà occupé.", 
                ephemeral: true 
            });
        }

        // ── 2. NETTOYAGE PRÉVENTIF (AVANT) ───────────────────────────────────
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            if (fetched.size > 0) {
                await channel.bulkDelete(fetched, true).catch(() => {});
            }
        } catch (err) {
            console.error("Erreur nettoyage préventif:", err);
        }

        // ── 3. MODAL (Format "Nom = URL" validé sur image_a86d4c) ──────────────
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('chanson1')
            .setLabel('Titre n°1 (Nom = URL)')
            .setPlaceholder('Ex: Lose Yourself = https://youtube.com/...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const input2 = new TextInputBuilder().setCustomId('chanson2').setLabel('Titre n°2').setStyle(TextInputStyle.Short).setRequired(false);
        const input3 = new TextInputBuilder().setCustomId('chanson3').setLabel('Titre n°3').setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input1),
            new ActionRowBuilder().addComponents(input2),
            new ActionRowBuilder().addComponents(input3)
        );

        await interaction.showModal(modal);

        // ── 4. RÉCEPTION DES DONNÉES ─────────────────────────────────────────
        const submitted = await interaction.awaitModalSubmit({
            time: 60000,
            filter: i => i.customId === `modal_train_${interaction.user.id}`
        }).catch(() => null);

        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [
            { info: submitted.fields.getTextInputValue('chanson1') },
            { info: submitted.fields.getTextInputValue('chanson2') || "" },
            { info: submitted.fields.getTextInputValue('chanson3') || "" }
        ].filter(s => s.info.trim() !== "");

        // ── 5. PERMISSIONS ET SESSION ───────────────────────────────────────
        await channel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true
        });

        if (!global.trainingSessions) global.trainingSessions = new Map();
        
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            startTime: Date.now()
        });

        // ── 6. NETTOYAGE AUTO (APRÈS 20 MIN) ─────────────────────────────────
        setTimeout(async () => {
            const session = global.trainingSessions?.get(interaction.user.id);
            if (session) {
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                
                try {
                    const finalFetch = await channel.messages.fetch({ limit: 100 });
                    if (finalFetch.size > 0) await channel.bulkDelete(finalFetch, true).catch(() => {});
                    await channel.send("✨ **Salon réinitialisé.**");
                } catch (err) {}

                global.trainingSessions.delete(interaction.user.id);
                
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member?.voice.channelId === channel.id) {
                    member.voice.disconnect().catch(() => {});
                }
            }
        }, 20 * 60 * 1000);

        // ── 7. INTERFACE (Boutons Primary vus sur image_a857de) ──────────────
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        await channel.send({ 
            content: `<@${interaction.user.id}>, ton salon est prêt !`,
            embeds: [new EmbedBuilder().setTitle("🎤 Session d'Entraînement").setDescription("Salon vidé et réservé.")], 
            components: [buttons] 
        });

        await submitted.editReply({ content: `✅ Salon prêt : <#${channel.id}>` });
    }
};
