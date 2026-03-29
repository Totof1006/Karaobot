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

        const connection = session.connection;
        await interaction.reply({ content: "🎤 Micro vérifié. Préparation de la séquence...", ephemeral: false });

        try {
            // Vérification de l'état de la connexion (Vérification n°1)
            await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        } catch (error) {
            return interaction.followUp("⚠️ La connexion a été perdue. Relance `/entrainement`.");
        }

        // 3. BOUCLE DE LECTURE SÉCURISÉE (Vérification n°2)
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            const parts = song.info.split('=');
            const songName = parts[0].trim();
            const songUrl = parts[1]?.trim() || "";

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`Musique ${i + 1}/${session.songs.length}`)
                .setDescription(`Titre : **${songName}**\nAnalyse du flux audio en cours...`);
            
            await interaction.channel.send({ embeds: [startEmbed] });

            // --- GESTION DE L'ANALYSE VOCALE ---
            session.precisionTicks = 0;
            let voiceStream = null; // On initialise à null (Vérification n°3)
            
            try {
                const receiver = connection.receiver;
                voiceStream = receiver.subscribe(interaction.user.id);
                
                analyzeVoiceActivity(voiceStream, () => {
                    session.precisionTicks++; 
                });
            } catch (e) {
                console.error("Erreur flux vocal:", e);
            }

            // --- LECTURE AUDIO AVEC NETTOYAGE FORCÉ ---
            await new Promise((resolve) => {
                playAudio(voiceChannel, songUrl, () => {
                    // Fin de lecture normale (Vérification n°4)
                    if (voiceStream) {
                        voiceStream.destroy();
                        voiceStream = null;
                    }
                    resolve();
                }, (err) => {
                    // Erreur de lecture (Vérification n°5)
                    console.error("Erreur PlayAudio:", err);
                    if (voiceStream) {
                        voiceStream.destroy();
                        voiceStream = null;
                    }
                    resolve();
                }, interaction.user.id);
            });

            // --- CALCUL DU SCORE ---
            const score = Math.min(Math.round((session.precisionTicks / 400) * 100), 100);
            
            const scoreEmbed = new EmbedBuilder()
                .setColor(score > 50 ? 0x57F287 : 0xFFAA00)
                .setTitle(`📊 Résultat : ${songName}`)
                .setDescription(`Précision vocale : **${score}%**\n${score < 30 ? "⚠️ *Attention aux décalages (intros YouTube) !*" : "Bien chanté !"}`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            // Pause de sécurité pour laisser Railway respirer
            if (i < session.songs.length - 1) {
                await new Promise(r => setTimeout(r, 4000));
            }
        }

        await interaction.channel.send("🎉 **Séquence d'entraînement terminée !**");
    }
};
