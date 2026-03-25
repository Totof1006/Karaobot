const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { getEvent }                   = require('../utils/eventDB');
const { openChannelForEvent,
        ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { unmuteSingersOnly }          = require('../utils/voiceManager');
const { saveVoiceChannel }           = require('../utils/persist');
const { errorEmbed }                 = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ouvrir-salon')
    .setDescription('🔓 Ouvrir le salon karaoké aux participants — micros chanteurs activés')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o
      .setName('salon')
      .setDescription('Salon vocal karaoké à ouvrir')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)),

  async execute(interaction) {
    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);

    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent ouvrir le salon.')],
        ephemeral: true,
      });
    }

    const voiceChannel = interaction.options.getChannel('salon');
    const guild        = interaction.guild;
    const event        = getEvent(interaction.guildId);

    await interaction.deferReply();

    // Sauvegarder le salon vocal
    saveVoiceChannel(interaction.guildId, voiceChannel.id);

    // Ouvrir UNIQUEMENT le salon vocal aux 4 rôles
    // Le salon texte #karaoké-annonces reste public — ne pas y appliquer setupChannelPermissions
    await openChannelForEvent(voiceChannel, guild);

    // Ouvrir les micros des chanteurs inscrits dès maintenant
    // (période d'arrivée : les chanteurs peuvent parler librement)
    const singerIds = event?.registrations?.map(r => r.userId) || [];
    if (singerIds.length > 0) {
      await unmuteSingersOnly(guild, voiceChannel, singerIds);
    }

    const eventTitle = event ? `**${event.title}**` : 'la session karaoké';

    // Annoncer dans le salon
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('🎤 Le salon est ouvert !')
          .setDescription(
            `Bienvenue pour ${eventTitle} !\n\n` +
            `Rejoignez le salon vocal et installez-vous confortablement.\n` +
            `La session sera lancée entre **21h et 21h30**.\n\n` +
            `🎤 **Chanteurs** → micros **ouverts**, discutez librement !\n` +
            `👁️ **Spectateurs** → micros coupés, bienvenue en écoute !\n\n` +
            `_Un Modo ou Leader lancera la session avec \`/lancer-evenement\`._`
          )
          .setFooter({ text: `Ouvert par ${interaction.user.username}` })
          .setTimestamp(),
      ],
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(
            `✅ Salon ouvert et micros chanteurs activés !\n` +
            `Lance la soirée quand tout le monde est prêt avec \`/lancer-evenement\`.`
          ),
      ],
    });
  },
};
