const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
        ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { getSession, getLastSession, createRematchSession } = require('../utils/gameState');
const { getRematchCount, incrementRematchCount }           = require('../utils/persist');
const { getEvent, formatDate }                             = require('../utils/eventDB');
const { errorEmbed }                                       = require('../utils/embeds');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { checkSessionChannel }                              = require('../utils/channelGuard');

const { MAX_REMATCHES }                                    = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rejouer')
    .setDescription('🔁 Relancer une session avec les mêmes chanteurs (Leader/Modo uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent lancer une revanche.')],
        ephemeral: true,
      });
    }

    const guard = checkSessionChannel(interaction);
    if (!guard.ok) {
      return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
    }

    const guildId = interaction.guildId;

    if (getSession(guildId)) {
      return interaction.reply({
        embeds: [errorEmbed('Une session est déjà en cours ! Utilisez `/stop` d\'abord.')],
        ephemeral: true,
      });
    }

    const last = getLastSession(guildId);
    if (!last) {
      return interaction.reply({
        embeds: [errorEmbed('Aucune session précédente trouvée. Lance d\'abord une session avec `/karaoke`.')],
        ephemeral: true,
      });
    }

    const rematchCount = getRematchCount(guildId);

    // ── Bloquer après 2 revanches (3 tours total) ────────────────────────────
    if (rematchCount >= MAX_REMATCHES) {
      const event = getEvent(guildId);

      const nextEventInfo = event
        ? `\n\n📅 **Prochain événement : ${event.title}**\n` +
          `📬 Inscriptions : **${formatDate(event.registrationStart)}**\n` +
          `🎤 Session : **${formatDate(event.eventDate)}**`
        : '\n\n📅 Aucun prochain événement planifié pour le moment.\nUn **Leader** peut en créer un avec `/evenement`.';

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle('🎤 Les 3 tours sont terminés !')
            .setDescription(
              'Chaque chanteur a interprété ses **3 chansons**. ' +
              'La soirée karaoké est officiellement terminée !\n\n' +
              '🙏 Merci à tous d\'avoir participé et rendu cette soirée inoubliable !' +
              nextEventInfo
            )
            .setFooter({ text: 'À très bientôt pour de nouvelles sessions ! 🎶' }),
        ],
      });
    }

    // ── Tour 3 : dernière chanson restante, pas de choix ─────────────────────
    const isLastTour = rematchCount === MAX_REMATCHES - 1;

    // Créer la session — tirage automatique parmi les chansons restantes
    const session = createRematchSession(guildId, interaction.user.id, interaction.channelId);
    if (!session) {
      return interaction.reply({
        embeds: [errorEmbed('Impossible de créer la revanche. Données de session introuvables.')],
        ephemeral: true,
      });
    }

    // Incrémenter le compteur
    incrementRematchCount(guildId);

    const tourNumber   = rematchCount + 2; // Tour 2 ou Tour 3
    const playerLines  = session.players.map(p => {
      const songTitle = typeof p.chosenSong === 'string' ? p.chosenSong : (p.chosenSong?.title || '?');
      return `🎤 <@${p.userId}> → 🎲 **${songTitle}**`;
    }).join('\n');

    const tourLabel = isLastTour
      ? '🏁 Dernier tour ! Chaque chanteur interprète sa chanson finale.'
      : '🔁 Les chansons ont été tirées au sort parmi les restantes.';

    const embed = new EmbedBuilder()
      .setColor(isLastTour ? 0xFFD700 : 0xFF69B4)
      .setTitle(`${isLastTour ? '🏁' : '🔁'} Tour ${tourNumber}/3 — Tirage effectué !`)
      .setDescription(tourLabel)
      .addFields({ name: '🎵 Chansons tirées au sort', value: playerLines })
      .setFooter({ text: `Tour ${tourNumber} sur 3 maximum` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('karaoke_start')
        .setLabel('▶️ Lancer la session')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('karaoke_cancel')
        .setLabel('❌ Annuler')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
