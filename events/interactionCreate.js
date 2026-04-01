const { EmbedBuilder, InteractionType, Events } = require('discord.js');
const play = require('play-dl'); // On passe sur play-dl pour la stabilité

// ... (Garde tes imports utilitaires identiques jusqu'à formatTime)

async function getAudioDuration(input) {
    if (!input) return 0;
    try {
        // Si c'est une recherche (pas d'URL), on cherche d'abord le lien
        let url = input;
        if (!input.startsWith('http')) {
            const search = await play.search(input, { limit: 1 });
            if (!search[0]) return 0;
            url = search[0].url;
        }
        
        // On récupère les infos via play-dl (plus rapide que ytdl sur Node 22)
        const info = await play.video_info(url);
        return info.video_details.durationInSec || 0;
    } catch (e) {
        console.error(`[play-dl] Erreur durée pour ${input} :`, e.message);
        return 0;
    }
}

// ... (Garde formatTime)

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {

        // ── 1. SLASH COMMANDS (Identique) ──
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

        // ── 2. MODALS (Identique) ──
        if (interaction.type === InteractionType.ModalSubmit) {
            try {
                if (interaction.customId.startsWith('modal_train_')) { // Correction pour matcher ton entrainement.js
                    // Gérer ici si nécessaire ou laisser faire le awaitModalSubmit de la commande
                }
                if (interaction.customId === 'modal_register_songs') {
                    await handleModalSubmit(interaction);
                }
            } catch (err) { console.error('[Modal Error]', err); }
            return;
        }

        // ── 3. BOUTONS ──
        if (!interaction.isButton()) return;
        const { customId, user, guildId } = interaction;

        try {
            // ── 4. BOUTONS : MODE ENTRAÎNEMENT (Correction de la correspondance) ──
            if (customId.startsWith('check_1_') || customId.startsWith('check_2_') || customId.startsWith('check_3_')) {
                await interaction.deferReply({ ephemeral: true });

                const parts = customId.split('_');
                const index = parseInt(parts[1]) - 1; // On adapte à ton format d'ID check_N_USERID
                const userId = parts[2];

                const session = global.trainingSessions?.get(userId);
                if (!session) return interaction.editReply({ content: "❌ Session expirée." });

                const trackInput = session.songs[index];
                if (!trackInput) return interaction.editReply({ content: "❌ Chanson introuvable." });

                // On lance la recherche de durée et de paroles en parallèle
                const youtubeDuration = await getAudioDuration(trackInput);
                
                let apiDuration = 0;
                const localLyrics = getLyrics(trackInput);
                if (localLyrics) {
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
                    .setTitle(`🔍 Correspondance : ${trackInput}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '🎙️ Durée Paroles', value: formatTime(apiDuration), inline: true },
                        { name: '📺 Durée Vidéo', value: formatTime(youtubeDuration), inline: true }
                    );

                if (apiDuration === 0) embed.setDescription("❌ **Verdict**\nParoles introuvables dans la base.");
                else if (isMatch) embed.setDescription("✅ **Verdict**\n**Correspondance validée !**");
                else embed.setDescription(`⚠️ **Verdict**\n**Écart de ${Math.round(diff)}s.** La musique risque d'être décalée.`);

                return await interaction.editReply({ embeds: [embed] });
            }

            // ... (Reste de tes boutons Événement : ils sont OK car ils utilisaient déjà deferReply)
            
        } catch (err) {
            console.error('[Global Button Error]', err);
        }
    },
};
