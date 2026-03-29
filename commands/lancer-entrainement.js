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

        if (!session || !session.connection) {
            return interaction.reply({ content: "❌ Session introuvable. Tape `/entrainement`.", ephemeral: true });
        }

        const connection = session.connection;
        // On vérifie si l'interaction est toujours valide
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({ content: "🎤 Analyse de la session...", ephemeral: false });
        }

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        } catch (error) {
            try { await interaction.followUp("⚠️ Connexion perdue. Relance `/entrainement`."); } catch(e){}
            return;
        }

        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            const parts = song.info.split('=');
            const songName = parts[0].trim();
            const songUrl = parts[1]?.trim();

            // SÉCURITÉ IA (Point n°4) : Vérifier l'URL avant de lancer
            if (!songUrl) {
                await interaction.channel.send(`⚠️ URL manquante pour **${songName}**, passage à la suivante.`);
                continue;
            }

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\nPréparation du flux...`);
            
            await interaction.channel.send({ embeds: [startEmbed] });

            session.precisionTicks = 0;
            let voiceStream = null;
            
            try {
                // On tente la souscription (Point n°2)
                voiceStream = connection.receiver.subscribe(interaction.user.id);
                analyzeVoiceActivity(voiceStream, () => {
                    session.precisionTicks++; 
                });
            } catch (e) {
                console.error("Erreur micro:", e.message);
            }

            // LECTURE AUDIO
            await new Promise((resolve) => {
                // Note : On passe 'connection' au lieu de 'voiceChannel' pour être plus standard (Point n°3)
                playAudio(connection, songUrl, () => {
                    if (voiceStream?.destroy) voiceStream.destroy(); // Point n°5
                    resolve();
                }, (err) => {
                    if (voiceStream?.destroy) voiceStream.destroy();
                    resolve();
                }, interaction.user.id);
            });

            // SCORE
            const score = Math.min(Math.round((session.precisionTicks / 400) * 100), 100);
            const scoreEmbed = new EmbedBuilder()
                .setColor(score > 50 ? 0x57F287 : 0xFFAA00)
                .setTitle(`📊 Score : ${songName}`)
                .setDescription(`Précision : **${score}%**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            if (i < session.songs.length - 1) {
                await new Promise(r => setTimeout(r, 4000));
            }
        }

        await interaction.channel.send("🎉 **Séquence terminée !**");
    }
};
