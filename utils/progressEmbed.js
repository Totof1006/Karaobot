const { EmbedBuilder } = require('discord.js');

function buildProgressEmbed(session) {
  const lines = session.players.map((p, i) => {
    let icon;
    if (i < session.currentSingerIndex)       icon = '✅';
    else if (i === session.currentSingerIndex) icon = '🎤';
    else                                       icon = '⏳';
    return `${icon} <@${p.userId}>`;
  }).join('\n');

  const done  = session.currentSingerIndex;
  const total = session.players.length;

  return new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('📊 Progression de la session')
    .setDescription(lines)
    .setFooter({ text: `${done}/${total} chanteurs passés` })
    .setTimestamp();
}

async function updateProgressEmbed(session, guild) {
  try {
    if (!session.progressMessageId) return;
    const channelObj = await guild.channels.fetch(session.channelId).catch(() => null);
    if (!channelObj) return;
    const msg = await channelObj.messages.fetch(session.progressMessageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [buildProgressEmbed(session)] });
  } catch (_) {}
}

module.exports = { buildProgressEmbed, updateProgressEmbed };
