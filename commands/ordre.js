const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getSession }       = require('../utils/gameState');
const { errorEmbed } = require('../utils/embeds');
const { ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ordre')
    .setDescription('🎯 Voir ou modifier l\'ordre de passage des chanteurs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand(sub => sub
      .setName('voir')
      .setDescription('Afficher l\'ordre de passage actuel'))
    .addSubcommand(sub => sub
      .setName('changer')
      .setDescription('Échanger la position de deux chanteurs (Leader uniquement)')
      .addIntegerOption(o => o.setName('position1').setDescription('Première position (ex: 1)').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('position2').setDescription('Deuxième position (ex: 3)').setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const session = getSession(interaction.guildId);

    if (!session) {
      return interaction.reply({ embeds: [errorEmbed('Aucune session en cours.')], flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    // ── VOIR ──────────────────────────────────────────────────────────────────
    if (sub === 'voir') {
      return interaction.reply({ embeds: [buildOrderEmbed(session)] });
    }

    // ── CHANGER (Leader ou Modo seulement) ────────────────────────────────────
    if (sub === 'changer') {
      const isLeader = hasRole(interaction.member, ROLE_LEADER);
      const isModo   = hasRole(interaction.member, ROLE_MODO);

      if (!isLeader && !isModo) {
        return interaction.reply({
          embeds: [errorEmbed('Seuls les **Leader** et **Modo** peuvent modifier l\'ordre de passage.')],
          flags: 64,
        });
      }

      if (session.phase !== 'registration' && session.phase !== 'singing') {
        return interaction.reply({
          embeds: [errorEmbed('L\'ordre ne peut être modifié qu\'avant ou pendant la session.')],
          flags: 64,
        });
      }

      if (session.currentSingerIndex > 0) {
        return interaction.reply({
          embeds: [errorEmbed('La session a déjà commencé, impossible de modifier l\'ordre.')],
          flags: 64,
        });
      }

      const pos1 = interaction.options.getInteger('position1') - 1;
      const pos2 = interaction.options.getInteger('position2') - 1;
      const max  = session.players.length;

      if (pos1 >= max || pos2 >= max) {
        return interaction.reply({
          embeds: [errorEmbed(`Positions invalides. Il y a **${max}** chanteurs (1 à ${max}).`)],
          flags: 64,
        });
      }

      if (pos1 === pos2) {
        return interaction.reply({ embeds: [errorEmbed('Les deux positions sont identiques.')], flags: 64 });
      }

      // Échanger
      const tmp = session.players[pos1];
      session.players[pos1] = session.players[pos2];
      session.players[pos2] = tmp;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Ordre modifié !')
            .setDescription(
              `Position **${pos1+1}** et **${pos2+1}** échangées.\n\n` +
              buildOrderList(session)
            ),
        ],
        flags: 64,
      });
    }
  },
};

function buildOrderEmbed(session) {
  return new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('🎯 Ordre de passage')
    .setDescription(buildOrderList(session))
    .setFooter({ text: 'Les Leader/Modo peuvent modifier l\'ordre avec /ordre changer' });
}

function buildOrderList(session) {
  const icons = ['🎤','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
  if (!session.players || session.players.length === 0) return "*Aucun chanteur inscrit.*";
  
  return session.players.map((p, i) => {
    const icon   = i < session.currentSingerIndex ? '✅' : icons[i] || `${i+1}.`;
    const status = i === session.currentSingerIndex ? ' ← **en cours**' : '';
    return `${icon} <@${p.userId}>${status}`;
  }).join('\n');
}
