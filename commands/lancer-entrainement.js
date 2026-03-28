const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
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

        await interaction.reply({ content: "🚀 Préparation de l'entraînement... Musique 1 dans 10 secondes !", ephemeral: false });

        // Connexion au salon
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false, 
            selfMute: false,
        });

        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            session.currentSongIndex = i;

            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/3`)
                .setDescription(`Préparation : **${song.info}**\nDébut du chant dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Analyse vocale
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

            // --- FIX : CALCUL DU SCORE SECURISE ---
            // On calcule un score basé sur les ticks enregistrés durant la chanson
            const rawScore = Math.min(Math.round((session.precisionTicks / (song.duration * 2)) * 100), 100);
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

        await interaction.channel.send("🎉 **Entraînement terminé !** Suppression du salon dans 20 secondes.");
        
        setTimeout(async () => {
            connection.destroy();
            await interaction.channel.delete().catch(() => {});
            global.trainingSessions.delete(interaction.user.id);
        }, 20000);
    }
};
