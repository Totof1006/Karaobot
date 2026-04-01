const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const play = require('play-dl'); 

// IMPORTATION DES UTILITAIRES (Point 1 corrigé ici)
const { getLyrics } = require('../utils/songList'); 
const { errorEmbed } = require('../utils/embeds');

// Utilitaire de formatage de temps (0:00)
function formatTime(seconds) {
    if (!seconds || seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Fonction de récupération de durée via YouTube
async function getAudioDuration(input) {
    if (!input) return 0;
    try {
        let url = input;
        if (!input.startsWith('http')) {
            const search = await play.search(input, { limit: 1 });
            if (!search[0]) return 0;
            url = search[0].url;
        }
        const info = await play.video_info(url);
        return info.video_details.durationInSec || 0;
    } catch (e) {
        console.error(`[play-dl] Erreur durée pour ${input} :`, e.message);
        return 0;
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        // ── 1. COMMANDES SLASH ──
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error('[Slash Error]', err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ embeds: [errorEmbed('Erreur lors de la commande.')], ephemeral: true });
                }
            }
            return;
        }

        // ── 2. SOUMISSION DE MODAL (Inscription Chansons) ──
        if (interaction.type === InteractionType.ModalSubmit) {
            if (interaction.customId === 'modal_register_songs') {
                const inscrire = client.commands.get('inscrire');
                if (inscrire && inscrire.handleModalSubmit) {
                    await inscrire.handleModalSubmit(interaction);
                }
            }
            return;
        }

        // ── 3. BOUTONS (Le comparatif vidéo/lyrics) ──
        if (!interaction.isButton()) return;
        const { customId } = interaction;

        try {
            if (customId.startsWith('check_')) {
                // SOLUTION POINT 2 : On diffère la réponse pour éviter le timeout de 3s
                await interaction.deferReply({ ephemeral: true });

                const parts = customId.split('_');
                const index = parseInt(parts[1]) - 1; 
                const userId = parts[2];

                // On récupère la session d'entraînement
                const session = global.trainingSessions?.get(userId);
                if (!session) return interaction.editReply({ content: "❌ Session expirée. Relancez la commande." });

                const trackInput = session.songs[index];
                if (!trackInput) return interaction.editReply({ content: "❌ Musique introuvable." });

                // --- LE COMPARATIF (Réintégré et sécurisé) ---
                
                // A. Durée de la vidéo YouTube
                const youtubeDuration = await getAudioDuration(trackInput);
                
                // B. Durée des paroles (.lrc local ou LRCLIB)
                let apiDuration = 0;
                const localLyrics = getLyrics(trackInput); 
                
                if (localLyrics && localLyrics.durationMs) {
                    apiDuration = Math.round(localLyrics.durationMs / 1000);
                } else {
                    // Si pas de .lrc local, on check LRCLIB pour donner une info quand même
                    try {
                        const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(trackInput)}`);
                        const results = await response.json();
                        if (results?.[0]) apiDuration = results[0].duration;
                    } catch (e) { console.error("Erreur LRCLIB:", e.message); }
                }

                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = youtubeDuration > 0 && apiDuration > 0 && diff <= 15;

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Comparaison : ${trackInput}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '🎙️ Durée Lyrics (.lrc)', value: apiDuration > 0 ? formatTime(apiDuration) : 'Indisponible', inline: true },
                        { name: '📺 Durée YouTube', value: youtubeDuration > 0 ? formatTime(youtubeDuration) : 'Indisponible', inline: true }
                    );

                if (apiDuration === 0) {
                    embed.setDescription("❌ **Verdict** : Aucun fichier de paroles trouvé. La synchro ne fonctionnera pas.");
                } else if (isMatch) {
                    embed.setDescription("✅ **Verdict** : Les durées correspondent ! Le karaoké sera parfaitement synchronisé.");
                } else {
                    embed.setDescription(`⚠️ **Verdict** : Écart de **${Math.round(diff)}s**. Attention, les paroles risquent d'être décalées par rapport à la vidéo.`);
                }

                // On utilise editReply car on a fait un deferReply au début
                return await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (err) {
            console.error('[Button Error]', err);
            if (interaction.deferred) await interaction.editReply({ content: "Une erreur est survenue lors de la vérification." });
        }
    },
};
