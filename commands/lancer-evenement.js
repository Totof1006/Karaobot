const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
        ActionRowBuilder, ButtonBuilder, ButtonStyle }  = require('discord.js');
const { getEvent }               = require('../utils/eventDB');
const { getSession, createSession,
        addPlayer, setPlayerSongs } = require('../utils/gameState');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { errorEmbed }             = require('../utils/embeds');
const { startButton }            = require('../utils/buttons');
const { checkSessionChannel }    = require('../utils/channelGuard');

// --- FONCTION DE LANCEMENT ---
async function launchFromEvent(interaction, event) {
    const guildId = interaction.guildId;
    
    const session = createSession(guildId, interaction.user.id, interaction.channelId);

    for (const reg of event.registrations) {
        if (reg.songs && reg.songs.length > 0) {
            addPlayer(session, reg.userId, reg.username);
            session.players.find(p => p.userId === reg.userId).songs = reg.songs;
        }
    }

    if (session.players.length < 2) {
        return interaction.editReply({
            embeds: [errorEmbed('Il faut au moins 2 chanteurs avec des chansons pour lancer !')],
            components: [] 
        });
    }

    const playerList = session.players
        .map((p, i) => `**${i + 1}.** <@${p.userId}> — ✅ ${p.songs.length} chansons`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`🎤 ${event.title || 'Session Karaoké'} — Prêt !`)
        .setDescription(`**${session.players.length} chanteurs** sont prêts à monter sur scène.\n\n${playerList}`)
        .setFooter({ text: 'Clique sur le bouton vert pour démarrer la musique !' });

    const msg = await interaction.editReply({
        embeds: [embed],
        components: [startButton()],
        fetchReply: true,
    });

    session.registrationMessage = msg;
}

module.exports = {
    launchFromEvent, 

    data: new SlashCommandBuilder()
        .setName('lancer-evenement')
        .setDescription('▶️ Lancer officiellement la session karaoké (Modo/Leader)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

    async execute(interaction) {
        const guard = checkSessionChannel(interaction);
        if (!guard.ok) {
            // ✅ CORRECTION
            return interaction.reply({ embeds: [errorEmbed(guard.reason)], flags: 64 });
        }

        const isLeader = hasRole(interaction.member, ROLE_LEADER);
        const isModo   = hasRole(interaction.member, ROLE_MODO);

        if (!isLeader && !isModo) {
            return interaction.reply({
                embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent lancer la session.')],
                flags: 64, // ✅ CORRECTION
            });
        }

        if (getSession(interaction.guildId)) {
            return interaction.reply({
                embeds: [errorEmbed('Une session est déjà en cours !')],
                flags: 64, // ✅ CORRECTION
            });
        }

        const event = getEvent(interaction.guildId);

        // --- CAS 1 : ÉVÉNEMENT PRÊT ---
        if (event && event.registrations.length >= 2) {
            const notReady = event.registrations.filter(r => !r.songs || r.songs.length < 3);

            if (notReady.length > 0) {
                const names = notReady.map(r => `<@${r.userId}>`).join(', ');
                return interaction.reply({
                    embeds: [errorEmbed(
                        `⚠️ Incomplet : ${names} n'ont pas encore leurs 3 chansons.\n\n` +
                        `Tu peux forcer le lancement, mais ils ne pourront chanter que ce qu'ils ont rempli.`
                    )],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('force_launch_event')
                                .setLabel('Lancer quand même')
                                .setStyle(ButtonStyle.Danger)
                        ),
                    ],
                    flags: 64, // ✅ CORRECTION
                });
            }

            // ✅ NOTE : Pas de flags: 64 ici car l'annonce de lancement est publique
            await interaction.deferReply(); 
            await launchFromEvent(interaction, event);
            return;
        }

        // --- CAS 2 : PAS ASSEZ D'INSCRITS ---
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFF9900)
                    .setDescription(
                        event
                            ? `⚠️ Seulement **${event.registrations.length} chanteur(s)** (min. 2).\nUtilise \`/karaoke\` pour une session libre.`
                            : `ℹ️ Aucun événement planifié. Utilise \`/karaoke\` pour démarrer.`
                    ),
            ],
            flags: 64, // ✅ CORRECTION
        });
    },
};
