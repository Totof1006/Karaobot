const { startScheduler }        = require('../utils/scheduler');
const { loadVoiceChannel }      = require('../utils/persist');
const { ChannelType }           = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    client.user.setActivity('🎤 Karaobot', { type: 2 });

    // ── Démuter tous les membres mutés dans les salons vocaux connus ──────────
    // Protection contre les mutes persistants si le bot a redémarré pendant
    // une session active (la session RAM est perdue mais les mutes Discord restent)
    try {
      for (const guild of client.guilds.cache.values()) {
        const savedId = loadVoiceChannel(guild.id);
        if (!savedId) continue;
        const channel = guild.channels.cache.get(savedId)
          || await guild.channels.fetch(savedId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildVoice) continue;
        const ops = [];
        for (const [, member] of channel.members) {
          if (member.user.bot) continue;
          if (member.voice.serverMute) {
            ops.push(member.voice.setMute(false, 'Redémarrage bot — démute préventif').catch(e =>
              console.warn(`[Ready] Démute ${member.user.username} échoué :`, e.message)
            ));
          }
        }
        if (ops.length > 0) {
          await Promise.all(ops);
          console.log(`[Ready] ${ops.length} membre(s) démuté(s) dans #${channel.name} (${guild.name})`);
        }
      }
    } catch (err) {
      console.warn('[Ready] Erreur lors du démute préventif :', err.message);
    }

    startScheduler(client);
  },
};
