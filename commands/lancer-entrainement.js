const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const { playAudio } = require('../utils/audioPlayer');
const { analyzeVoiceActivity } = require('../utils/voiceAnalyzer');
const { computeRoundScore } = require('../utils/gameState'); // Utilise ta vraie logique de score

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lancer-test')
        .setDescription('▶️ Démarrer la séquence d\'entraînement (3 musiques)'),

    async execute(interaction) {
        const session = global.trainingSessions?.get(interaction.user.id);

        // 1. Vérifications de sécurité
        if (!session) {
            return interaction.reply({ content: "❌ Aucune session d'entraînement trouvée. Tape `/entrainement` d'abord.", ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) {
            return interaction.reply({ content: "❌ Tu dois être dans ton salon vocal d'entraînement pour lancer le test.", ephemeral: true });
        }

        await interaction.reply({ content: "🚀 Préparation de l'entraînement... Musique 1 dans 10 secondes !", ephemeral: false });

        // 2. Connexion au salon
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false, // Important pour écouter ta voix
            selfMute: false,
        });

        // 3. Boucle d'enchaînement des 3 musiques
        for (let i = 0; i < session.songs.length; i++) {
            const song = session.songs[i];
            session.currentSongIndex = i;

            // --- A. Annonce ---
            const startEmbed = new EmbedBuilder()
                .setColor(0xFF69B4)
                .setTitle(`🎤 Musique ${i + 1}/3`)
                .setDescription(`Préparation : **${song.info}**\nDébut du chant dans **10 secondes** !`);
            
            await interaction.channel.send({ embeds: [startEmbed] });
            await new Promise(resolve => setTimeout(resolve, 10000));

            // --- B. Activation de l'analyse vocale (Condition réelle) ---
            session.precisionTicks = 0;
            const receiver = connection.receiver;
            const voiceStream = receiver.subscribe(interaction.user.id);
            
            analyzeVoiceActivity(voiceStream, (energy) => {
                session.precisionTicks++; // Incrémente le score réel selon ton chant
                session.currentVoiceEnergy = energy;
            });

            // --- C. Lecture Audio (Utilise tes cookies Railway) ---
            await interaction.channel.send(`🎶 Lecture en cours : **${song.info}**`);
            
            // On attend la fin de la musique
            await new Promise((resolve) => {
                playAudio(voiceChannel, song.url, () => {
                    resolve(); // Callback de fin de musique
                }, (err) => {
                    interaction.channel.send(`❌ Erreur audio : ${err.message}`);
                    resolve();
                }, interaction.user.id);
            });

            // --- D. Calcul du score REEL (Comme en soirée) ---
            const result = computeRoundScore(session); // Ta fonction officielle
            
            const scoreEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle(`📊 Résultat Musique ${i + 1}`)
                .setDescription(`Chanteur : <@${interaction.user.id}>\nScore : **${result.score}%**\nPrécision : **${result.rating}**`);
            
            await interaction.channel.send({ embeds: [scoreEmbed] });

            // --- E. Pause de 10s entre les musiques ---
            if (i < 2) {
                await interaction.channel.send("⏳ Petite pause de 10 secondes avant la suite...");
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        // 4. Clôture de la session
        await interaction.channel.send("🎉 **Entraînement terminé !** Tu vas être déconnecté et le salon sera supprimé dans 10 secondes.");
        
        setTimeout(async () => {
            connection.destroy();
            await interaction.channel.delete().catch(() => {});
            global.trainingSessions.delete(interaction.user.id);
        }, 10000);
    }
};
