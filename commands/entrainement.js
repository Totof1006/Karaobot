const { SlashCommandBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');

const { setupUserReceiver } = require('../utils/voiceReceiver');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('entrainement')
        .setDescription('🎧 Prépare le salon pour un entraînement vocal'),

    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;

        // Vérification : l’utilisateur doit être dans un vocal
        if (!voiceChannel) {
            return interaction.reply({
                content: "❌ Tu dois être dans un salon vocal pour lancer l’entraînement.",
                ephemeral: true
            });
        }

        // Connexion vocale persistante
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        try {
            // On attend que la connexion soit prête
            await entersState(connection, VoiceConnectionStatus.Ready, 5000);
        } catch (err) {
            console.error("[Entraînement] Connexion impossible :", err);
            return interaction.reply({
                content: "❌ Impossible de rejoindre le salon vocal.",
                ephemeral: true
            });
        }

        // Création de la session PRO
        const session = {
            userId: interaction.user.id,
            connection,
            player: null,            // sera créé automatiquement par audioPlayer.js
            receiverStream: null,    // sera créé par setupUserReceiver
            precisionTicks: 0,       // compteur de scoring
            songs: []                // sera rempli par /lancer-test
        };

        // Stockage global
        global.trainingSessions.set(interaction.user.id, session);

        // Activation du receiver individuel
        setupUserReceiver(session, interaction.user.id);

        return interaction.reply("✅ Entraînement initialisé ! Lance `/lancer-test` pour commencer.");
    }
};
