const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { playAudio } = require('../utils/audioPlayer');

module.exports = {
    // --- DÉFINITION DE LA COMMANDE ---
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Lance la séquence d’entraînement vocal'),

    async execute(interaction) {
        // --- 1. RÉCUPÉRATION DE LA SESSION ET DE LA CONNEXION ---
        // On récupère les données enregistrées lors du /entrainement
        const session = global.trainingSessions?.get(interaction.user.id);
        
        // On cherche la connexion vocale active sur le serveur
        const voiceConnection = session?.connection || require('@discordjs/voice').getVoiceConnection(interaction.guild.id);

        // Si la session n'existe pas ou si le bot n'est pas en vocal, on arrête
        if (!session || !voiceConnection) {
            return interaction.reply({
                content: "❌ Session introuvable. Tape `/entrainement` (vérifie que le bot est bien avec toi).",
                ephemeral: true
            });
        }

        // On synchronise la connexion dans la session
        session.connection = voiceConnection;

        // Vérification que des musiques ont bien été saisies
        if (!session.songs || session.songs.length === 0) {
            return interaction.reply({
                content: "❌ Aucune chanson trouvée dans ta session.",
                ephemeral: true
            });
        }

        // Réponse initiale pour confirmer le lancement
        await interaction.reply("🎤 Lancement de ton entraînement…");

        // --- 2. BOUCLE DE LECTURE SÉQUENTIELLE ---
        for (let i = 0; i < session.songs.length; i++) {
            const raw = session.songs[i];
            const fullText = typeof raw === "object" ? raw.info : raw;

            // Sécurité : Si la ligne ne contient pas de '=', on passe à la suivante
            if (!fullText.includes('=')) continue;

            // Découpage : Nom de la chanson (avant le =) et URL (après le =)
            const parts = fullText.split('=');
            const songNamePart = parts[0].trim();
            const youtubeUrl = parts[1]?.trim();

            // SÉCURITÉ ANTI-CRASH (Railway) : On vérifie que l'URL est valide
            if (!youtubeUrl || !youtubeUrl.startsWith('http')) {
                await interaction.channel.send(`⚠️ URL invalide ou absente pour : **${songNamePart}**`);
                continue;
            }

            // Nettoyage du nom (on enlève le '+' s'il existe)
            const songName = songNamePart.split('+')[0].trim();

            // Reset du score de précision pour cette nouvelle chanson
            session.precisionTicks = 0;

            // --- 3. AFFICHAGE DE L'ANNONCE ---
            const embedStart = new EmbedBuilder()
                .setColor(0xFF69B4) // Rose
                .setTitle(`🎶 Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\n\n*Préparez-vous, la musique commence !*`);

            await interaction.channel.send({ embeds: [embedStart] });

            // --- 4. LECTURE AUDIO (ATTENTE DE LA FIN) ---
            await new Promise(resolve => {
                // On lance la musique et on attend qu'elle se termine (resolve)
                playAudio(session, youtubeUrl, resolve, resolve);
            });

            // --- 5. CALCUL ET AFFICHAGE DU SCORE ---
            // Formule : (ticks détectés / 350) * 100, plafonné à 100%
            const score = Math.min(Math.round((session.precisionTicks / 350) * 100), 100);

            const embedScore = new EmbedBuilder()
                .setColor(score >= 50 ? 0x57F287 : 0xED4245) // Vert si >= 50, sinon Rouge
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Précision vocale : **${score}%**`);

            // Envoi du score final pour la chanson
            await interaction.channel.send({ embeds: [embedScore] });

            // Note : Pas de délai de 3s ici pour garantir la stabilité de la connexion Railway
        }

        // --- 6. FIN DE LA SESSION ---
        await interaction.channel.send("🎉 **Séquence d'entraînement terminée ! Bravo !**");
    }
};
