const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { saveVoiceChannel } = require('../utils/persist');
const { setupChannelPermissions } = require('../utils/roleManager');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('definir-vocal')
    .setDescription('🔊 Définir le salon vocal utilisé pour les sessions karaoké')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(o => o
      .setName('salon')
      .setDescription('Salon vocal karaoké')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon');

    // Vérifier que c'est bien un salon vocal
    if (channel.type !== ChannelType.GuildVoice) {
      return interaction.reply({
        embeds: [errorEmbed('Ce salon n\'est pas un salon vocal !')],
        ephemeral: true,
      });
    }

    // Sauvegarder en JSON (persiste après redémarrage)
    saveVoiceChannel(interaction.guildId, channel.id);

    // Configurer les permissions du salon vocal (accès + micro coupé par défaut)
    await setupChannelPermissions(channel, interaction.guild);

    return interaction.reply({
      embeds: [successEmbed(
        `✅ Salon vocal karaoké défini : **${channel.name}**\n\n` +
        `🔒 Permissions configurées :\n` +
        `• Tout le monde peut **rejoindre** et **écrire dans le chat**\n` +
        `• Les micros sont **coupés par défaut** (le bot les gère pendant les tours)\n` +
        `• Seuls les **chanteurs inscrits** auront le micro ouvert pendant les pauses`
      )],
    });
  },
};
