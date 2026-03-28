const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// AJOUT de VoiceConnectionStatus et entersState pour la stabilité
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement (3 musiques)'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        if (!session) {
            return interaction.reply({ content: "❌ Aucune session d'entraînement trouvée. Tape `/entrainement` d'abord.", ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ content: "❌ Tu dois être dans ton salon vocal d'entraînement pour lancer le test.", ephemeral: true });
        }

        // 1. Connexion initiale
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        await interaction.reply({ content: "🚀 Connexion au salon en cours...", ephemeral: false });

        // 2. FIX : Attente de la connexion réelle (évite l'AbortError)
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (error) {
            connection.destroy();
            return interaction.followUp("❌ Erreur : Impossible de stabiliser la connexion vocale.");
        }

        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            session.currentSongIndex = i;

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/3`)
                .setDescription(`Préparation : **${song.info}**\nDébut du chant dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // 3. Analyse vocale - On souscrit APRÈS que la connexion soit Ready
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, (energy) => {
                session.precisionTicks++; 
            });

            await interaction.channel.send(`🎶 Lecture en cours : **${song.info}**`);
            
            await new Promise((resolve) => {
                playAudio(voiceChannel, song.url, () => {
                    resolve(); 
                }, (err) => {
                    interaction.channel.send(`❌ Erreur audio : ${err.message}`);
                    resolve();
                }, interaction.user.id);
            });

            // 4. Calcul du score (Simulateur)
            // Ajustement : On divise par la durée pour un ratio cohérent
            const rawScore = Math.min(Math.round((session.precisionTicks / (song.duration || 180)) * 100), 100);
            const rating = rawScore > 80 ? "⭐ Divin" : rawScore > 50 ? "✅ Pas mal" : "📉 À bosser";

            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Chanteur : <@${interaction.user.id}>\nScore : **${rawScore}%**\nPrécision : **${rating}**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            if (i < session.songs.length - 1) {
                await interaction.channel.send("⏳ Petite pause de 10 secondes avant la suite...");
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        await interaction.channel.send("🎉 **Entraînement terminé !** Déconnexion dans 20 secondes.");
        
        setTimeout(async () => {
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            await interaction.channel.delete().catch(() => {});
            global.trainingSessions.delete(interaction.user.id);
        }, 20000);
    }
};
