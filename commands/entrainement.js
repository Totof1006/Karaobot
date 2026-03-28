const { 
    SlashCommandBuilder, ChannelType, PermissionFlagsBits, 
    ModalBuilder, TextInputBuilder, TextInputStyle, 
    ActionRowBuilder, EmbedBuilder 
} = require('discord.js');
const play = require('play-dl');
const { getLyrics } = require('../utils/lyricsSync'); 
const { trainingSessions } = require('../utils/trainingManager'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Inscription et création d\'un salon de test privé'),

    async execute(interaction) {
        // 1. Limite de sécurité (max 4 sessions)
        if (global.trainingSessions?.size >= 4) {
            return interaction.reply({ content: "⚠️ Trop d'entraînements en cours (max 4).", ephemeral: true });
        }

        // 2. Affichage du Modal
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Mode Entraînement');

        for (let i = 1; i <= 3; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`song${i}`)
                .setLabel(`Musique ${i} : Titre + Artiste = Lien`)
                .setPlaceholder('Ex: Bohemian Rhapsody + Queen = https://youtu.be/...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
        }

        await interaction.showModal(modal);

        // 3. Réception et Validation
        const submitted = await interaction.awaitModalSubmit({
            time: 120000,
            filter: i => i.customId === `modal_train_${interaction.user.id}`,
        }).catch(() => null);

        if (!submitted) return;
        await submitted.deferReply({ ephemeral: true });

        const songs = [];
        const reports = [];

        for (let i = 1; i <= 3; i++) {
            const raw = submitted.fields.getTextInputValue(`song${i}`);
            
            if (!raw.includes('=') || !raw.includes('+')) {
                return submitted.editReply({ content: `❌ Format invalide pour la chanson ${i}. Utilisez : Titre + Artiste = Lien` });
            }

            const [info, url] = raw.split('=').map(s => s.trim());
            const [title, artist] = info.split('+').map(s => s.trim());
            
            // FIX : On nettoie le "+" pour que la recherche de paroles soit identique à /evenement
            const searchInfo = info.replace('+', ' ').trim();
            
            try {
                // Check YouTube
                const ytInfo = await play.video_basic_info(url);
                const ytSec = ytInfo.video_details.durationInSec;

                // Check Lyrics (Utilisation de searchInfo pour trouver les paroles)
                const lyrics = getLyrics(searchInfo);
                const lySec = lyrics ? lyrics.length : 0; 

                const diff = Math.abs(ytSec - lySec);
                const isValid = diff < 30;

                reports.push(`${isValid ? '✅' : '⚠️'} **${info}**\n└ YouTube: ${ytSec}s | Paroles: ${lySec}s`);
                songs.push({ info, url, duration: ytSec, title, artist });
            } catch (err) {
                return submitted.editReply({ content: `❌ Lien YouTube invalide pour la chanson ${i}` });
            }
        }

        // 4. Création du Salon Vocal Privé
        const channel = await interaction.guild.channels.create({
            name: `🎙️-test-${interaction.user.username}`,
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
            ],
        });

        // 5. Enregistrement de la session
        const sessionData = {
            userId: interaction.user.id,
            channelId: channel.id,
            songs: songs,
            currentSongIndex: 0,
            precisionTicks: 0, 
            createdAt: Date.now()
        };

        if (!global.trainingSessions) global.trainingSessions = new Map();
        global.trainingSessions.set(interaction.user.id, sessionData);

        // 6. Sécurité Timers
        setTimeout(async () => {
            const ch = await interaction.guild.channels.fetch(channel.id).catch(() => null);
            if (ch && ch.members.size === 0) {
                await ch.delete().catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 3 * 60 * 1000);

        setTimeout(async () => {
            const ch = await interaction.guild.channels.fetch(channel.id).catch(() => null);
            if (ch) {
                await ch.delete().catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 20 * 60 * 1000);

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎯 Rapport de Conformité Entraînement')
            .setDescription(reports.join('\n\n') + `\n\n**Salon créé :** <#${channel.id}>\nRejoins le salon et tape \`/lancer-test\` !`);

        await submitted.editReply({ embeds: [embed] });
    }
};
