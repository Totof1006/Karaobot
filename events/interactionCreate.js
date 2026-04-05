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
                // ✅ CORRECTION : Gestion si l'interaction est déjà différée ou répondue
                const payload = { embeds: [errorEmbed('Une erreur est survenue lors de l\'exécution de la commande.')], flags: 64 };
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(payload).catch(() => null);
                } else {
                    await interaction.reply(payload).catch(() => null);
                }
            }
            return;
        }

        // ── 2. SOUMISSION DE MODAL ──
        if (interaction.type === InteractionType.ModalSubmit) {
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
            if (customId === 'btn_register') {
                const inscrire = client.commands.get('inscrire');
                if (inscrire && inscrire.showRegistrationModal) {
                    return await inscrire.showRegistrationModal(interaction);
                }
            }

            if (customId.startsWith('check_')) {
                await interaction.deferReply({ flags: 64 });

                const parts = customId.split('_');
                const index = parseInt(parts[1]) - 1; 
                const userId = parts[2];

                const session = global.trainingSessions?.get(userId);
                // ✅ CORRECTION : Ajout de flags: 64 si editReply échoue ou message d'erreur
                if (!session) return interaction.editReply({ content: "❌ Session expirée ou inexistante. Relancez la commande." });

                const trackInput = session.songs[index];
                if (!trackInput) return interaction.editReply({ content: "❌ Musique introuvable dans votre session." });

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
                    embed.setDescription(`⚠️ **Verdict** : Écart de **${Math.round(diff)}s**. Attention, les paroles risquent d'être décalées.`);
                }

                return await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (err) {
            console.error('[Button Error]', err);
            // ✅ CORRECTION : Assurer une réponse propre en cas de crash bouton
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "Une erreur critique est survenue." }).catch(() => null);
            } else {
                await interaction.reply({ content: "Une erreur est survenue.", flags: 64 }).catch(() => null);
            }
        }
    },
};
