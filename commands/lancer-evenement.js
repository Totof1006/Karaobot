const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
        ActionRowBuilder, ButtonBuilder, ButtonStyle }  = require('discord.js');
const { getEvent }               = require('../utils/eventDB');
const { getSession, createSession,
        addPlayer, setPlayerSongs } = require('../utils/gameState');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { errorEmbed }             = require('../utils/embeds');
const { startButton }            = require('../utils/buttons');
const { checkSessionChannel }    = require('../utils/channelGuard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lancer-evenement')
    .setDescription('▶️ Lancer officiellement la session karaoké (Modo/Leader uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const guard = checkSessionChannel(interaction);
    if (!guard.ok) {
      return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
    }

    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent lancer la session.')],
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;

    if (getSession(guildId)) {
      return interaction.reply({
        embeds: [errorEmbed('Une session est déjà en cours !')],
        ephemeral: true,
      });
    }

    const event = getEvent(guildId);

    // ── Cas 1 : événement planifié avec inscrits ──────────────────────────────
    if (event && event.registrations.length >= 2) {
      const notReady = event.registrations.filter(r => r.songs.length < 3);

      if (notReady.length > 0) {
        const names = notReady.map(r => `<@${r.userId}>`).join(', ');
        return interaction.reply({
          embeds: [errorEmbed(
            `Ces chanteurs n'ont pas encore soumis leurs 3 chansons : ${names}\n\n` +
            `Tu peux quand même lancer avec le bouton ci-dessous si tu veux continuer.`
          )],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('force_launch_event')
                .setLabel('▶️ Lancer quand même')
                .setStyle(ButtonStyle.Danger)
            ),
          ],
          ephemeral: true,
        });
      }

      // Créer la session et pré-remplir avec les inscrits de l'événement
      await launchFromEvent(interaction, event);
      return;
    }

    // ── Cas 2 : pas d'événement ou moins de 2 inscrits → session libre ────────
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF9900)
          .setDescription(
            event
              ? `⚠️ Seulement **${event.registrations.length} chanteur(s)** inscrit(s) (minimum 2).\n` +
                `Utilise \`/karaoke\` pour ouvrir une inscription manuelle.`
              : `ℹ️ Aucun événement planifié. Utilise \`/karaoke\` pour démarrer une session libre.`
          ),
      ],
      ephemeral: true,
    });
  },
};

// ─── Lancer la session depuis l'événement planifié ────────────────────────────
async function launchFromEvent(interaction, event) {
  const guildId = interaction.guildId;

  // session.channelId = salon VOCAL (défini dans event.channelId via /definir-vocal)
  // interaction.channelId = salon TEXTE (là où la commande est tapée)
  // Les deux peuvent être différents : les messages de session vont dans le texte,
  // mais findVoiceChannel cherche le salon vocal via persist.loadVoiceChannel
  const session = createSession(guildId, interaction.user.id, interaction.channelId);

  // Pré-remplir les joueurs depuis les inscrits de l'événement
  for (const reg of event.registrations) {
    if (reg.songs.length > 0) {
      addPlayer(session, reg.userId, reg.username);
      setPlayerSongs(session, reg.userId, reg.songs);
    }
  }

  if (session.players.length < 2) {
    return interaction.reply({
      embeds: [{ color: 0xED4245, description: '❌ Moins de 2 chanteurs avec des chansons valides.' }],
      ephemeral: true,
    });
  }

  const playerList = session.players
    .map((p, i) => `${i + 1}. <@${p.userId}> — ✅ ${p.songs.length} chansons`)
    .join('\n');

  const msg = await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`🎤 ${event.title} — Prêt à démarrer !`)
        .setDescription(
          `**${session.players.length} chanteurs** sont inscrits et prêts.\n\n` +
          playerList
        )
        .setFooter({ text: 'Clique sur Lancer pour démarrer la session !' }),
    ],
    components: [startButton()],
    fetchReply: true,
  });

  session.registrationMessage = msg;
  // channelId reste celui de l'interaction (texte) — findVoiceChannel gère le vocal séparément
}
module.exports.launchFromEvent = launchFromEvent;
