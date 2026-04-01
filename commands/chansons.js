const { SlashCommandBuilder } = require('discord.js');
const { getSession, setPlayerSongs } = require('../utils/gameState');
const { errorEmbed, successEmbed, registrationEmbed } = require('../utils/embeds');
const { joinButton, startButton } = require('../utils/buttons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chansons')
        .setDescription('🎵 Soumets tes 3 chansons pour la session karaoké en cours')
        .addStringOption(opt => opt.setName('chanson1').setDescription('1ère chanson').setRequired(true))
        .addStringOption(opt => opt.setName('chanson2').setDescription('2ème chanson').setRequired(true))
        .addStringOption(opt => opt.setName('chanson3').setDescription('3ème chanson').setRequired(true)),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const session = getSession(guildId);

        if (!session) {
            return interaction.reply({ embeds: [errorEmbed('Aucune session en cours. Lance-en une avec `/karaoke` !')], ephemeral: true });
        }

        if (session.phase !== 'registration') {
            return interaction.reply({ embeds: [errorEmbed('La session a déjà commencé !')], ephemeral: true });
        }

        const player = session.players.find(p => p.userId === interaction.user.id);
        if (!player) {
            return interaction.reply({ embeds: [errorEmbed('Tu n\'es pas inscrit. Clique sur "Rejoindre" !')], ephemeral: true });
        }

        const songs = [
            { title: interaction.options.getString('chanson1').trim(), url: null },
            { title: interaction.options.getString('chanson2').trim(), url: null },
            { title: interaction.options.getString('chanson3').trim(), url: null },
        ];

        setPlayerSongs(session, interaction.user.id, songs);

        if (session.registrationMessage) {
            await session.registrationMessage.edit({
                embeds: [registrationEmbed(session)],
                components: [joinButton(), startButton()],
            }).catch(e => console.warn('[Chansons] Erreur edit:', e.message));
        }

        return interaction.reply({
            embeds: [successEmbed(`Tes chansons ont été enregistrées :\n${songs.map(s => `🎵 ${s.title}`).join('\n')}`)],
            ephemeral: true,
        });
    },
};
