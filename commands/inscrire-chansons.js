const { SlashCommandBuilder } = require('discord.js');
const { getEvent, setPlayerSongs, isRegistrationOpen, formatDate } = require('../utils/eventDB');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { refreshAnnouncement } = require('./inscrire');
const { checkCommandChannel } = require('../utils/channelGuard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inscrire-chansons')
        .setDescription('🎵 Soumettre tes 3 chansons pour l\'événement karaoké planifié')
        .addStringOption(o => o.setName('chanson1').setDescription('1ère chanson').setRequired(true))
        .addStringOption(o => o.setName('chanson2').setDescription('2ème chanson').setRequired(true))
        .addStringOption(o => o.setName('chanson3').setDescription('3ème chanson').setRequired(true)),

    async execute(interaction) {
        const guard = checkCommandChannel(interaction);
        if (!guard.ok) {
            // ✅ CORRECTION : flags: 64 pour le garde-fou
            return interaction.reply({ embeds: [errorEmbed(guard.reason)], flags: 64 });
        }

        const guildId = interaction.guildId;
        const event = getEvent(guildId);

        if (!event) {
            // ✅ CORRECTION : flags: 64 si aucun événement
            return interaction.reply({ embeds: [errorEmbed('Aucun événement planifié.')], flags: 64 });
        }

        const reg = event.registrations.find(r => r.userId === interaction.user.id);
        if (!reg) {
            // ✅ CORRECTION : flags: 64 si pas inscrit
            return interaction.reply({ embeds: [errorEmbed('Utilise `/inscrire` d\'abord.')], flags: 64 });
        }

        if (!isRegistrationOpen(event)) {
            // ✅ CORRECTION : flags: 64 si inscriptions fermées
            return interaction.reply({ embeds: [errorEmbed(`Fermé depuis le ${formatDate(event.registrationEnd)}`)], flags: 64 });
        }

        const songs = [
            { title: interaction.options.getString('chanson1').trim(), url: null },
            { title: interaction.options.getString('chanson2').trim(), url: null },
            { title: interaction.options.getString('chanson3').trim(), url: null },
        ];

        setPlayerSongs(guildId, interaction.user.id, songs);
        await refreshAnnouncement(interaction, guildId);

        // ✅ CORRECTION : flags: 64 pour la confirmation finale
        return interaction.reply({
            embeds: [successEmbed(`Chansons enregistrées pour **${event.title}** :\n${songs.map(s => `🎵 ${s.title}`).join('\n')}`)],
            flags: 64,
        });
    },
};
