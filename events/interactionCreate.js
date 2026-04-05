const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const play = require('play-dl'); 

// IMPORTATION DES UTILITAIRES
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
                    // ✅ Utilisation de flags: 64 pour remplacer ephemeral: true (Standard v14+)
                    await interaction.reply({ embeds: [errorEmbed('Erreur lors de la commande.')], flags: 64 });
                }
            }
            return;
        }

        // ── 2. SOUMISSION DE MODAL ──
        if (interaction.type === InteractionType.ModalSubmit) {
            
            // ✅ GARDE-FOU : Si le modal provient de l'entraînement, on sort immédiatement.
            // Cela permet à .awaitModalSubmit() dans entrainement.js de capturer l'événement sans conflit.
            if (interaction.customId.startsWith('modal_train_')) return;

            if (interaction.customId === 'modal_register_songs') {
                const inscrire = client.commands.get('inscrire');
                if (inscrire && inscrire.handleModalSubmit) {
                    await inscrire.handleModalSubmit(interaction);
                }
            }
            return;
        }

        // ── 3. BOUTONS ──
        if (!interaction.isButton()) return;
        const { customId } = interaction;

        try {
            // Bouton d'inscription (Vient de la commande inscrire)
            if (customId === 'btn_register') {
                const inscrire = client.commands.get('inscrire');
                if (inscrire && inscrire.showRegistrationModal) {
                    return await inscrire.showRegistrationModal(interaction);
                }
            }

            // Boutons de vérification (Viennent de l'entraînement)
            if (customId.startsWith('check_')) {
                // ✅ Utilisation de flags: 64
                await interaction.deferReply({ flags: 64 });

                const parts = customId.split('_');
                const index = parseInt(parts[1]) - 1; 
                const userId = parts[2];

                const session = global.trainingSessions?.get(userId);
                if (!session) return interaction.editReply({ content: "❌ Session expirée. Relancez la commande." });

                const trackInput = session.songs[index];
                if (!trackInput) return interaction.editReply({ content: "❌ Musique introuvable." });

                // --- LE COMPARATIF ---
                const youtubeDuration = await getAudioDuration(trackInput);
                let apiDuration = 0;
                const localLyrics = getLyrics(trackInput); 
                
                if (localLyrics && localLyrics.durationMs) {
                    apiDuration = Math.round(localLyrics.durationMs / 1000);
                } else {
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

                return await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (err) {
            console.error('[Button Error]', err);
            if (interaction.deferred) await interaction.editReply({ content: "Une erreur est survenue lors de la vérification." });
        }
    },
};
