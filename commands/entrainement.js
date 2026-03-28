const { 
    SlashCommandBuilder, ChannelType, PermissionFlagsBits, 
    ModalBuilder, TextInputBuilder, TextInputStyle, 
    ActionRowBuilder, EmbedBuilder 
} = require('discord.js');
const play = require('play-dl');
const { getLyrics, slugify } = require('../utils/lyricsSync'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎤 Inscription et création d\'un salon de test privé'),

    async execute(interaction) {
        // 1. Limite de sécurité pour l'hébergement (max 4 sessions simultanées)
        if (global.trainingSessions?.size >= 4) {
            return interaction.reply({ content: "⚠️ Trop d'entraînements en cours (max 4).", ephemeral: true });
        }

        // 2. Création et affichage du Modal pour les 3 musiques
        const modal = new ModalBuilder()
            .setCustomId(`modal_train_${interaction.user.id}`)
            .setTitle('Inscription Mode Entraînement');

        for (let i = 1; i <= 3; i++) {
            const input = new TextInputBuilder()
                .setCustomId(`song${i}`)
                .setLabel(`Musique ${i} : Titre + Artiste = Lien`)
                .setPlaceholder('Ex: Ailleurs + Orelsan = https://youtu.be/...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
        }

        await interaction.showModal(modal);

        // 3. Réception et Validation des données du formulaire
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
            
            // Vérification du format strict exigé par ton projet
            if (!raw.includes('=') || !raw.includes('+')) {
                return submitted.editReply({ content: `❌ Format invalide pour la chanson ${i}. Utilisez : Titre + Artiste = Lien` });
            }

            const [info, url] = raw.split('=').map(s => s.trim());
            
            try {
                // Récupération de la durée YouTube
                const ytInfo = await play.video_basic_info(url);
                const ytSec = ytInfo.video_details.durationInSec;

                // Récupération des paroles et de la durée synchronisée (.durationMs)
                const lyrics = getLyrics(info);
                
                // Conversion en secondes pour la comparaison
                const lySec = lyrics ? Math.round(lyrics.durationMs / 1000) : 0; 

                // Algorithme de double vérification de conformité
                const diff = Math.abs(ytSec - lySec);
                const isValid = (lySec > 0 && diff <= 15); // Tolérance de 15 secondes max

                let statusEmoji = isValid ? '✅' : '⚠️';
                if (lySec === 0) statusEmoji = '❌';

                // Construction de la ligne du rapport
                reports.push(
                    `${statusEmoji} **${info}**\n` +
                    `└ YouTube: \`${ytSec}s\` | Paroles: \`${lySec}s\`\n` +
                    `└ *${isValid ? "Correspondance validée !" : (lySec === 0 ? "Paroles introuvables" : "Écart trop important")}*`
                );

                songs.push({ info, url, duration: ytSec, lyricsFound: lySec > 0 });
            } catch (err) {
                console.error(err);
                return submitted.editReply({ content: `❌ Erreur sur la chanson ${i}. Vérifie que le lien YouTube est correct.` });
            }
        }

        // 4. Création du Salon Vocal Privé avec permissions adaptées
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

        // 5. Initialisation de la session globale
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

        // 6. Sécurités de nettoyage automatique du salon vocal
        setTimeout(async () => {
            const ch = await interaction.guild.channels.fetch(channel.id).catch(() => null);
            if (ch && ch.members.size === 0) {
                await ch.delete().catch(() => {});
                global.trainingSessions.delete(interaction.user.id);
            }
        }, 180000); // 3 minutes si vide

        // 7. Envoi de l'Embed de confirmation (Style image 9b251a)
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎯 Rapport de Conformité Entraînement')
            .setThumbnail(interaction.user.displayAvatarURL())
            .setDescription(reports.join('\n\n') + `\n\n**Salon créé :** <#${channel.id}>\nRejoins le salon et tape \`/lancer-test\` !`)
            .setFooter({ text: "Système de synchronisation Karaobot" });

        await submitted.editReply({ embeds: [embed] });
    }
};
