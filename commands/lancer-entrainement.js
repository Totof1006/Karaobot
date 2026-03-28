const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement pré-connectée'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        // 1. VÉRIFICATION DE LA SESSION
        if (!session || !session.connection) {
            return interaction.reply({ 
                content: "❌ Session introuvable. Tape `/entrainement` pour me connecter au salon.", 
                ephemeral: true 
            });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ 
                content: "❌ Rejoins-moi dans le salon vocal d'entraînement pour commencer.", 
                ephemeral: true 
            });
        }

        // 2. RÉCUPÉRATION DE LA CONNEXION EXISTANTE
        const connection = session.connection;

        await interaction.reply({ content: "🎤 Micro vérifié. Préparation de la première piste...", ephemeral: false });

        try {
            // On s'assure juste que la connexion faite précédemment est toujours active
            await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        } catch (error) {
            return interaction.followUp("⚠️ La connexion a été perdue. Relance `/entrainement`.");
        }

        // 3. BOUCLE DE LECTURE
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            const songName = song.info.split('=')[0].trim();
            const songUrl = song.info.split('=')[1]?.trim() || "";

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\nDébut dans 10 secondes...`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Analyse vocale
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, () => {
                session.precisionTicks++; 
            });

            await interaction.channel.send(`🎶 Lecture en cours : **${songName}**`);
            
            // Lecture
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => resolve(), (err) => resolve(), interaction.user.id);
            });

            // Score rapide
            const score = Math.min(Math.round((session.precisionTicks / 300) * 100), 100);
            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Score de précision : **${score}%**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            if (i < session.songs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        await interaction.channel.send("🎉 **Séquence terminée !** Bien joué.");
        
        // On ne détruit pas la connexion ici, on laisse le timer de 20min de entrainement.js gérer la sortie
    }
};
