const { ActivityType, ChannelType, Events } = require('discord.js'); // Ajout de Events
const { startScheduler } = require('../utils/scheduler');
const { loadVoiceChannel } = require('../utils/persist');

module.exports = {
  name: Events.ClientReady, // Utilise la constante officielle
  once: true,
  async execute(client) {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    
    // Définir l'activité correctement
    client.user.setActivity('🎤 Karaobot', { type: ActivityType.Listening });

    // ── Démuter tous les membres ──────────────────────────────────────────
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
