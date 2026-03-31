const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d’entraînement vocal'),

    async execute(interaction) {
        
        // Vérification session
        const session = global.trainingSessions?.get(interaction.user.id);

        // 1. On cherche la connexion (soit dans la session, soit directement sur le serveur)
        const voiceConnection = session?.connection || require('@discordjs/voice').getVoiceConnection(interaction.guild.id);

        if (!session || !voiceConnection) {
            return interaction.reply({
                content: "❌ Session introuvable. Tape `/entrainement` (et vérifie que le bot est bien dans le vocal avec toi).",
                ephemeral: true
            });
        }

        // On remet la connexion dans la session au cas où elle s'était perdue
        session.connection = voiceConnection;

        // Vérification chansons
        if (!session.songs || session.songs.length === 0) {
            return interaction.reply({
                content: "❌ Aucune chanson trouvée dans ta session.",
                ephemeral: true
            });
        }

        await interaction.reply("🎤 Lancement de ton entraînement…");

        // Lecture séquentielle
        for (let i = 0; i < session.songs.length; i++) {
            const raw = session.songs[i];

            // Format attendu : "Titre + Artiste = URL"
           const fullText = typeof raw === "object" ? raw.info : raw;
            if (!fullText.includes('=')) continue; // Sécurité si ligne mal remplie

            const [infoPart, urlPart] = fullText.split('=').map(s => s.trim());
            
            // Si pas de +, on prend tout le infoPart comme nom
            const songName = infoPart.includes('+') ? infoPart.split('+')[0].trim() : infoPart;
            const youtubeUrl = urlPart;

            // Reset scoring
            session.precisionTicks = 0;

            // Embed d’annonce
            const embedStart = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎶 Entraînement — Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\nChante dès que tu es prêt !`);

            await interaction.channel.send({ embeds: [embedStart] });

            // Lecture audio
            await new Promise(resolve => {
                playAudio(session, youtubeUrl, resolve, resolve);
            });

            // Calcul du score
            const score = Math.min(
                Math.round((session.precisionTicks / 350) * 100),
                100
            );

            // Embed résultat
            const embedScore = new EmbedBuilder()
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Score : **${score}%**`);

            await interaction.channel.send({ embeds: [embedScore] });

            // Petite pause entre les musiques
            //if (i < session.songs.length - 1) {
            //await new Promise(r => setTimeout(r, 3000));
            }
        }

        await interaction.channel.send("🎉 Entraînement terminé !");
    }
};
