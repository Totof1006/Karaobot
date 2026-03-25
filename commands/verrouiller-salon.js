const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { lockChannel, ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { saveVoiceChannel }                 = require('../utils/persist');
const { errorEmbed, successEmbed }         = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verrouiller-salon')
    .setDescription('🔒 Verrouiller le salon karaoké et kicker les participants (Modo/Leader)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addChannelOption(o => o
      .setName('salon')
      .setDescription('Salon vocal karaoké à verrouiller')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent verrouiller le salon.')],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('salon');

    // ── Kicker les membres sans rôle Modo/Leader ─────────────────────────────
    const kickOps = [];
    for (const [, member] of channel.members) {
      if (member.user.bot) continue;
      const isStaff = hasRole(member, ROLE_LEADER) || hasRole(member, ROLE_MODO);
      if (!isStaff) {
        kickOps.push(member.voice.disconnect('Salon karaoké verrouillé').catch(e =>
          console.warn(`[Vocal] Kick ${member.id}:`, e.message)
        ));
      }
    }
    if (kickOps.length > 0) await Promise.all(kickOps);
    const kicked = kickOps.length;

    // ── Sauvegarder et verrouiller les permissions ────────────────────────────
    saveVoiceChannel(interaction.guildId, channel.id);
    await lockChannel(channel, interaction.guild);

    const kickedLine = kicked > 0
      ? `\n• 👢 **${kicked} membre(s) déconnecté(s)** (Chanteurs/Spectateurs)`
      : '\n• ✅ Aucun membre à déconnecter';

    return interaction.reply({
      embeds: [successEmbed(
        `🔒 Salon **${channel.name}** verrouillé !\n\n` +
        `• 👁️ Invisible pour **@everyone**\n` +
        `• ✅ Accessible uniquement aux **Modo** et **Leader**` +
        kickedLine + `\n\n` +
        `_⚠️ Si des membres n'ont pas été déconnectés, vérifiez que le bot a la permission **Déplacer des membres**._`
      )],
    });
  },
};
