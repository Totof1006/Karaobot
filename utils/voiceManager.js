const { PermissionsBitField, ChannelType } = require('discord.js');
const { loadVoiceChannel } = require('./persist');

// ─── Trouver le salon vocal karaoké ──────────────────────────────────────────
// Priorité : 1) salon défini via /definir-vocal  2) nom contenant "karaok/chant"  3) premier vocal avec membres
async function findVoiceChannel(guild) {
  // 1. Salon défini manuellement et persisté
  const savedId = loadVoiceChannel(guild.id);
  if (savedId) {
    // Chercher en cache d'abord, fetch seulement si absent
    const cached = guild.channels.cache.get(savedId);
    if (cached?.type === ChannelType.GuildVoice) return cached;
    const fetched = await guild.channels.fetch(savedId).catch(() => null);
    if (fetched?.type === ChannelType.GuildVoice) return fetched;
  }

  // 2. Cherche par nom dans le cache (pas de fetch complet)
  const byName = guild.channels.cache.find(
    c => c.type === ChannelType.GuildVoice &&
         (c.name.toLowerCase().includes('karaok') || c.name.toLowerCase().includes('chant'))
  );
  if (byName) return byName;

  // 3. Premier vocal avec des membres (cache uniquement)
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildVoice && c.members.size > 0
  ) || null;
}

// ─── Muter tout le monde dans le vocal sauf le chanteur actif ────────────────
async function muteAllExcept(guild, voiceChannel, activeSingerId) {
  if (!voiceChannel) return;

  const ops = [];
  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot) continue;
    if (memberId === activeSingerId) {
      ops.push(member.voice.setMute(false, 'Tour de chant karaoké').catch(e => console.warn(`[Vocal] Démute ${memberId}:`, e.message)));
    } else {
      ops.push(member.voice.setMute(true, 'Karaoké : ce n\'est pas ton tour').catch(e => console.warn(`[Vocal] Mute ${memberId}:`, e.message)));
    }
  }
  await Promise.all(ops);
  console.log(`[Vocal] Seul <${activeSingerId}> est démuté dans #${voiceChannel.name}`);
}

// ─── Démutera tout le monde (fin de session ou pause) ────────────────────────
async function unmuteAll(guild, voiceChannel) {
  if (!voiceChannel) return;
  const ops = [];
  for (const [, member] of voiceChannel.members) {
    if (member.user.bot) continue;
    ops.push(member.voice.setMute(false, 'Session karaoké terminée').catch(e => console.warn(`[Vocal] Démute ${member.id}:`, e.message)));
  }
  await Promise.all(ops);
  console.log(`[Vocal] Tout le monde est démuté dans #${voiceChannel?.name}`);
}

// ─── Configurer les permissions du salon vocal ───────────────────────────────
// Tout le monde peut rejoindre et écrire dans le chat du vocal,
// mais tout le monde est muté par défaut (le bot gère les mutes manuellement).
async function setupVoiceChannelPermissions(voiceChannel, guild) {
  const everyoneRole = guild.roles.everyone;

  await voiceChannel.permissionOverwrites.set([
    {
      id: everyoneRole.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,            // peut rejoindre
        PermissionsBitField.Flags.SendMessages,        // peut écrire dans le chat du vocal
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.UseApplicationCommands,
      ],
      deny: [
        PermissionsBitField.Flags.Speak,              // micro coupé par défaut
      ],
    },
  ]);

  console.log(`[Vocal] Permissions configurées sur #${voiceChannel.name}`);
}

// ─── Réinitialiser les permissions du salon vocal ────────────────────────────
async function resetVoiceChannelPermissions(voiceChannel, guild) {
  await voiceChannel.permissionOverwrites.set([
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ]);
  console.log(`[Vocal] Permissions réinitialisées sur #${voiceChannel.name}`);
}

// ─── Démutera uniquement les chanteurs inscrits (pas les spectateurs) ────────
async function unmuteSingersOnly(guild, voiceChannel, singerUserIds) {
  if (!voiceChannel) return;

  const ops = [];
  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot) continue;
    if (singerUserIds.includes(memberId)) {
      ops.push(member.voice.setMute(false, 'Pause libre karaoké').catch(e => console.warn(`[Vocal] Démute chanteur ${memberId}:`, e.message)));
    } else {
      ops.push(member.voice.setMute(true, 'Spectateur : micro fermé').catch(e => console.warn(`[Vocal] Mute spectateur ${memberId}:`, e.message)));
    }
  }
  await Promise.all(ops);
  console.log(`[Vocal] Pause : ${singerUserIds.length} chanteur(s) démutés, spectateurs gardés muets.`);
}

module.exports = {
  findVoiceChannel,
  muteAllExcept,
  unmuteAll,
  unmuteSingersOnly,
  resetVoiceChannelPermissions,
};
