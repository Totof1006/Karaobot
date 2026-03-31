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
            const fullText = typeof raw === "object" ? raw.info : raw;

            // --- CORRECTION ICI : Extraction propre de l'URL ---
            if (!fullText.includes('=')) {
                console.error(`Ligne mal formatée : ${fullText}`);
                continue;
            }

            const parts = fullText.split('=');
            const songNamePart = parts[0].trim();
            const youtubeUrl = parts[1]?.trim(); // On récupère ce qui est APRES le =

            if (!youtubeUrl || !youtubeUrl.startsWith('http')) {
                console.error(`URL invalide pour ${songNamePart} : ${youtubeUrl}`);
                await interaction.channel.send(`⚠️ Impossible de lire l'URL pour : ${songNamePart}`);
                continue;
            }

            const songName = songNamePart.split('+')[0].trim();
            // ------------------------------------------------

            session.precisionTicks = 0;

            const embedStart = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎶 Entraînement — Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\nChante dès que tu es prêt !`);

            await interaction.channel.send({ embeds: [embedStart] });

            // Lecture audio
            await new Promise(resolve => {
                // On passe bien l'URL nettoyée
                playAudio(session, youtubeUrl, resolve, resolve);
            });

            // Calcul du score
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);

            const embedScore = new EmbedBuilder()
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Score : **${score}%**`);

            await interaction.channel.send({ embeds: [scoreEmbed] });

            // Petite pause entre les musiques
            //if (i < session.songs.length - 1) {
            //await new Promise(r => setTimeout(r, 3000));
            }
        }

        await interaction.channel.send("🎉 Entraînement terminé !");
    }
};
