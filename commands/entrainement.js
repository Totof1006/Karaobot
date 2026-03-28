const { 
    SlashCommandBuilder, ChannelType, PermissionFlagsBits, 
    ModalBuilder, TextInputBuilder, TextInputStyle, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder 
} = require('discord.js');
const { slugify } = require('../utils/lyricsSync');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Crée un salon privé avec vérification par boutons'),

    async execute(interaction) {
        // Limite de sessions pour Railway
        if (global.trainingSessions?.size >= 4) {
            return interaction.reply({ content: "⚠️ Trop d'entraînements en cours (max 4).", ephemeral: true });
        }

        // 1. Modal d'inscription
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Mode Entraînement');

        for (let i = 1; i <= 3; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`song${i}`)
                .setLabel(`Chanson n°${i} (Titre + Artiste = Lien)`)
                .setPlaceholder('Ex: Soulman + Ben l\'Oncle Soul = https://...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
        }

        await interaction.showModal(modal);

        // 2. Réception et traitement du formulaire
        const submitted = await interaction.awaitModalSubmit({
            time: 120000,
            filter: i => i.customId === `modal_train_${interaction.user.id}`,
        }).catch(() => null);

        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [];
        for (let i = 1; i <= 3; i++) {
            const raw = submitted.fields.getTextInputValue(`song${i}`);
            if (!raw.includes('=') || !raw.includes('+')) {
                return submitted.editReply({ content: `❌ Format invalide (Chanson ${i}). Utilisez : Titre + Artiste = Lien` });
            }
            const [info, url] = raw.split('=').map(s => s.trim());
            songs.push({ info, url });
        }

        // 3. Création du salon vocal
        const channelName = `🎙️-test-${slugify(interaction.user.username)}`;
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel] }
            ],
        });

        // 4. Enregistrement de la session pour les boutons
        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            createdAt: Date.now()
        });

        // --- TIMERS DE SUPPRESSION (DÉJÀ INTÉGRÉS ICI) ---
        // Suppression après 3 min si le salon reste vide
        setTimeout(async () => {
            const ch = await interaction.guild.channels.fetch(channel.id).catch(() => null);
            if (ch && ch.members.size === 0) {
                await ch.delete().catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 3 * 60 * 1000);

        // Suppression forcée après 20 min
        setTimeout(async () => {
            const ch = await interaction.guild.channels.fetch(channel.id).catch(() => null);
            if (ch) {
                await ch.delete().catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 20 * 60 * 1000);

        // 5. Envoi de l'interface avec boutons (CORRECTION .setStyle)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`check_train_1_${interaction.user.id}`)
                .setLabel('Vérifier n°1')
                .setStyle(ButtonStyle.Primary), // Correction ici
            new ButtonBuilder()
                .setCustomId(`check_train_2_${interaction.user.id}`)
                .setLabel('Vérifier n°2')
                .setStyle(ButtonStyle.Primary), // Correction ici
            new ButtonBuilder()
                .setCustomId(`check_train_3_${interaction.user.id}`)
                .setLabel('Vérifier n°3')
                .setStyle(ButtonStyle.Primary)  // Correction ici
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎶 Inscription Enregistrée !')
            .setDescription(`Tes chansons ont été ajoutées. Clique sur les boutons ci-dessous dans ton salon pour vérifier la correspondance.\n\n` +
                songs.map((s, idx) => `**Chanson ${idx+1}**\n${s.info}\nParoles : ⏳ En attente...`).join('\n\n'));

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
        await submitted.editReply({ content: `✅ Ton salon d'entraînement a été créé : <#${channel.id}>` });
    }
};
