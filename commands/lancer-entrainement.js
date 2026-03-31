const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d’entraînement vocal'),

    async execute(interaction) {
        // --- 1. VÉRIFICATION DE LA SESSION ---
        const session = global.trainingSessions?.get(interaction.user.id);
        
        // On récupère la connexion existante
        const voiceConnection = session?.connection || require('@discordjs/voice').getVoiceConnection(interaction.guild.id);

        if (!session || !voiceConnection) {
            return interaction.reply({
                content: "❌ Session introuvable. Tape `/entrainement` d'abord.",
                ephemeral: true
            });
        }

        // On s'assure que la connexion est bien liée à la session
        session.connection = voiceConnection;

        if (!session.songs || session.songs.length === 0) {
            return interaction.reply({
                content: "❌ Aucune chanson trouvée.",
                ephemeral: true
            });
        }

        await interaction.reply("🎤 Lancement de ton entraînement…");

        // --- 2. BOUCLE DE LECTURE ---
        for (let i = 0; i < session.songs.length; i++) {
            const rawText = session.songs[i];
            
            // Initialisation des variables par défaut pour éviter le "undefined"
            let songName = `Musique ${i + 1}`;
            let targetUrl = "";

            // Découpage intelligent : supporte "Nom = URL" ou juste "URL"
            if (rawText.includes('=')) {
                const parts = rawText.split('=');
                songName = parts[0].trim();
                targetUrl = parts[1]?.trim();
            } else {
                targetUrl = rawText.trim();
            }

            // SÉCURITÉ : Si l'URL est vide ou invalide, on passe à la suite sans crash
            if (!targetUrl || !targetUrl.startsWith('http')) {
                await interaction.channel.send(`⚠️ Lien ignoré (invalide) : **${songName}**`);
                continue;
            }

            // Reset du score pour cette chanson
            session.precisionTicks = 0;

            // --- 3. ANNONCE ---
            const embedStart = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎶 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\n\n*Préparez-vous !*`);

            await interaction.channel.send({ embeds: [embedStart] });

            // --- 4. LECTURE (Synchronisée avec audioPlayer.js) ---
            await new Promise(resolve => {
                // On utilise la fonction universelle qui gère YT/SoundCloud/MP3
                playAudio(session, targetUrl, resolve, (err) => {
                    console.error(`Erreur sur ${songName}:`, err.message);
                    resolve(); // On resolve quand même pour ne pas bloquer la boucle for
                });
            });

            // --- 5. CALCUL ET AFFICHAGE DU SCORE ---
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);

            const resultEmbed = new EmbedBuilder()
                .setColor(score >= 50 ? 0x57F287 : 0xED4245)
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Précision vocale : **${score}%**`);

            await interaction.channel.send({ embeds: [resultEmbed] });
        }

        // --- 6. FIN ---
        await interaction.channel.send("🎉 **Séquence d'entraînement terminée !**");
    }
};
