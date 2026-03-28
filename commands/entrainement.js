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
        const channelName = 'Entraînement 1';
        const channel = interaction.guild.channels.cache.find(c => 
            c.name === channelName && c.isVoice()
        );

        if (!channel) {
            return interaction.reply({ 
                content: `⚠️ Le salon "${channelName}" est introuvable.`, 
                ephemeral: true 
            });
        }

        // Vérification d'occupation
        if (channel.members.size > 0 && !global.trainingSessions?.has(interaction.user.id)) {
            return interaction.reply({ 
                content: "⚠️ Le salon est déjà occupé. Attends que la place se libère !", 
                ephemeral: true 
            });
        }

        // ── 2. NETTOYAGE PRÉVENTIF (AVANT) ───────────────────────────────────
        // On vide le salon avant même d'afficher le modal pour partir sur du propre
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            if (fetched.size > 0) {
                await channel.bulkDelete(fetched, true).catch(() => {});
            }
        } catch (err) {
            console.error("Erreur nettoyage préventif:", err);
        }

        // ── 3. CRÉATION DU MODAL D'INSCRIPTION ───────────────────────────────
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Entraînement');

        const input1 = new TextInputBuilder()
            .setCustomId('chanson1')
            .setLabel('Titre n°1 (Format: Nom = URL)')
            .setPlaceholder('Ex: Envole-moi = https://youtube.com/...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

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

        // ── 4. RÉCEPTION ET TRAITEMENT DES DONNÉES ──────────────────────────
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

        // ── 5. GESTION DES PERMISSIONS ET SESSION ───────────────────────────
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

        // ── 6. SÉCURITÉ : NETTOYAGE AUTO (APRÈS 20 MIN) ─────────────────────
        setTimeout(async () => {
            const session = global.trainingSessions?.get(interaction.user.id);
            if (session) {
                // Rétablir les permissions par défaut (Cacher le salon)
                await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});
                
                // Nouveau nettoyage des messages
                try {
                    const finalFetch = await channel.messages.fetch({ limit: 100 });
                    if (finalFetch.size > 0) {
                        await channel.bulkDelete(finalFetch, true).catch(() => {});
                    }
                    await channel.send("✨ **Salon réinitialisé.**");
                } catch (err) {
                    console.log("Erreur nettoyage final.");
                }

                global.trainingSessions.delete(interaction.user.id);
                
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member?.voice.channelId === channel.id) {
                    member.voice.disconnect().catch(() => {});
                }
            }
        }, 20 * 60 * 1000);

        // ── 7. ENVOI DE L'INTERFACE ─────────────────────────────────────────
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`check_train_1_${interaction.user.id}`).setLabel('Vérifier n°1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`check_train_2_${interaction.user.id}`).setLabel('Vérifier n°2').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 2),
            new ButtonBuilder().setCustomId(`check_train_3_${interaction.user.id}`).setLabel('Vérifier n°3').setStyle(ButtonStyle.Primary).setDisabled(songs.length < 3)
        );

        const embed = new EmbedBuilder()
            .setTitle("🎤 Session d'Entraînement")
            .setColor(0x5865F2)
            .setDescription(`Salon prêt pour <@${interaction.user.id}> !\n\n*Le salon a été vidé pour ta session.*`)
            .setFooter({ text: "Expiration : 20 minutes." });

        await channel.send({ 
            content: `<@${interaction.user.id}>`,
            embeds: [embed], 
            components: [buttons] 
        });

        await submitted.editReply({ 
            content: `✅ Salon <#${channel.id}> nettoyé et réservé !` 
        });
    }
};
