const { Events, InteractionType } = require('discord.js');
const { errorEmbed } = require('../utils/embeds');

// ... (tes fonctions formatTime / getAudioDuration si elles sont définies ici)

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
                const payload = { 
                    embeds: [errorEmbed('Une erreur est survenue lors de l\'exécution de la commande.')], 
                    flags: 64 
                };
                // ✅ Sécurité : on vérifie si on doit edit ou reply
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
            // ✅ CORRECTION : Toujours acquitter ou différer une modale pour éviter le "L'interaction a échoué"
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
            // ✅ VOTES (Crucial pour le Flag 64)
            if (customId.startsWith('vote_')) {
                const score = parseInt(customId.split('_')[1]);
                const { addVote, getSession } = require('../utils/gameState');
                const session = getSession(interaction.guildId);

                if (!session) return interaction.reply({ content: "❌ Aucune session active.", flags: 64 });

                const success = addVote(session, interaction.user.id, score);
                if (success) {
                    return await interaction.reply({ content: `✅ Vote de **${score} ⭐** enregistré !`, flags: 64 });
                } else {
                    return await interaction.reply({ content: "⚠️ Vous avez déjà voté ou vous êtes le chanteur actuel.", flags: 64 });
                }
            }

            // BOUTON INSCRIPTION (Depuis eventRegistrationButtons)
            if (customId === 'event_register') {
                 // On délègue à la commande inscrire mais on s'assure du retour privé
                 const inscrire = client.commands.get('inscrire');
                 if (inscrire) return await inscrire.showRegistrationModal(interaction);
            }

            // ... (ton code pour btn_register et check_)

            if (customId.startsWith('check_')) {
                await interaction.deferReply({ flags: 64 });
                // ... (la suite de ton code de comparaison)
                // Ton editReply final héritera du flag 64 du deferReply, c'est parfait.
            }
            
        } catch (err) {
            console.error('[Button Error]', err);
            const errorPayload = { content: "Une erreur est survenue avec ce bouton.", flags: 64 };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorPayload).catch(() => null);
            } else {
                await interaction.reply(errorPayload).catch(() => null);
            }
        }
    },
};
