const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const play = require('play-dl'); 

// IMPORTATION REQUISE : On récupère getLyrics et les utilitaires d'affichage
const { getLyrics } = require('../utils/songList'); 
const { errorEmbed } = require('../utils/embeds');

// Fonctions utilitaires internes
function formatTime(seconds) {
    if (!seconds || seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

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

        // ── 1. SLASH COMMANDS ──
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error('[Slash Command Error]', err);
                const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
                else await interaction.reply(msg);
            }
            return;
        }

        // ── 2. MODALS ──
        if (interaction.type === InteractionType.ModalSubmit) {
            try {
                // On délègue la gestion des morceaux à la commande qui a ouvert le modal 
                // ou on ajoute un handler spécifique ici si besoin.
                if (interaction.customId === 'modal_register_songs') {
                    // Si handleModalSubmit est défini dans un autre fichier (ex: inscrire.js)
                    const inscrire = client.commands.get('inscrire');
                    if (inscrire && inscrire.handleModalSubmit) {
                        await inscrire.handleModalSubmit(interaction);
                    }
                }
            } catch (err) { console.error('[Modal Error]', err); }
            return;
        }

        // ── 3. BOUTONS ──
        if (!interaction.isButton()) return;
        const { customId, user } = interaction;

        try {
            // ── 4. BOUTONS : MODE ENTRAÎNEMENT ──
            if (customId.startsWith('check_1_') || customId.startsWith('check_2_') || customId.startsWith('check_3_')) {
                // Point n°2 déjà anticipé : on utilise deferReply pour éviter le "Unknown Interaction"
                await interaction.deferReply({ ephemeral: true });

                const parts = customId.split('_');
                const index = parseInt(parts[1]) - 1; 
                const userId = parts[2];

                const session = global.trainingSessions?.get(userId);
                if (!session) return interaction.editReply({ content: "❌ Session expirée ou introuvable." });

                const trackInput = session.songs[index];
                if (!trackInput) return interaction.editReply({ content: "❌ Chanson introuvable dans la liste." });

                // Récupération de la durée Vidéo
                const youtubeDuration = await getAudioDuration(trackInput);
                
                // Récupération de la durée Paroles (Correction de la ReferenceError)
                let apiDuration = 0;
                const localLyrics = getLyrics(trackInput); // Appel à la fonction importée
                
                if (localLyrics && localLyrics.durationMs) {
                    apiDuration = Math.round(localLyrics.durationMs / 1000);
                } else {
                    try {
                        const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(trackInput)}`);
                        const results = await response.json();
                        if (results?.[0]) apiDuration = results[0].duration;
                    } catch (e) { console.error("Erreur LRCLIB:", e); }
                }

                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = youtubeDuration > 0 && apiDuration > 0 && diff <= 15;

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Vérification : ${trackInput}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '🎙️ Durée Paroles', value: formatTime(apiDuration), inline: true },
                        { name: '📺 Durée Vidéo', value: formatTime(youtubeDuration), inline: true }
                    );

                if (apiDuration === 0) {
                    embed.setDescription("❌ **Verdict** : Paroles introuvables. La synchronisation ne fonctionnera pas.");
                } else if (isMatch) {
                    embed.setDescription("✅ **Verdict** : Les durées correspondent ! Le karaoké sera bien synchronisé.");
                } else {
                    embed.setDescription(`⚠️ **Verdict** : Écart de **${Math.round(diff)}s**. La vidéo et les paroles ne sont probablement pas la même version.`);
                }

                return await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (err) {
            console.error('[Global Button Error]', err);
        }
    },
};
