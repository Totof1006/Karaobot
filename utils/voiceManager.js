const { PermissionsBitField, ChannelType } = require('discord.js');
const { loadVoiceChannel } = require('./persist');

/**
 * ─── Trouver le salon vocal karaoké ──────────────────────────────────────────
 * Priorité : 1) défini via /definir-vocal 2) nom "karaok/chant" 3) premier vocal habité
 */
async function findVoiceChannel(guild) {
  // 1. Salon défini manuellement (Persistance Railway /data)
  const savedId = loadVoiceChannel(guild.id);
  if (savedId) {
    const cached = guild.channels.cache.get(savedId);
    if (cached?.type === ChannelType.GuildVoice) return cached;
    
    // Fetch si pas en cache (important après un reboot du bot)
    const fetched = await guild.channels.fetch(savedId).catch(() => null);
    if (fetched?.type === ChannelType.GuildVoice) return fetched;
  }

  // 2. Recherche par mot-clé dans le nom
  const byName = guild.channels.cache.find(
    c => c.type === ChannelType.GuildVoice &&
         (c.name.toLowerCase().includes('karaok') || c.name.toLowerCase().includes('chant'))
  );
  if (byName) return byName;

  // 3. Premier salon avec des membres (fallback)
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildVoice && c.members.size > 0
  ) || null;
}

/**
 * ─── Muter tout le monde sauf le chanteur ───────────────────────────────────
 */
async function muteAllExcept(guild, voiceChannel, activeSingerId) {
  if (!voiceChannel) return;

  const botMember = guild.members.me;
  if (!botMember.permissionsIn(voiceChannel).has(PermissionsBitField.Flags.MuteMembers)) {
    console.error(`[Vocal] Erreur: Permission 'MuteMembers' manquante dans #${voiceChannel.name}`);
    return;
  }

  const ops = [];
  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot) continue;

    const shouldBeMuted = memberId !== activeSingerId;

    // Vérification de l'état actuel pour éviter le spam API
    if (member.voice.serverMute !== shouldBeMuted) {
      // SÉCURITÉ : Discord interdit de mute quelqu'un de plus haut gradé ou l'Owner
      const canManage = member.roles.highest.position < botMember.roles.highest.position && member.id !== guild.ownerId;
      
      if (canManage) {
        ops.push(
          member.voice.setMute(shouldBeMuted, shouldBeMuted ? 'Karaoké : micro coupé' : 'Tour de chant')
            .catch(e => console.warn(`[Vocal] Échec mute sur ${member.user.tag}:`, e.message))
        );
      } else {
        console.warn(`[Vocal] Impossible de muter ${member.user.tag} (Hiérarchie supérieure)`);
      }
    }
  }
  await Promise.all(ops);
}

/**
 * ─── Démuter tout le monde (Fin ou Pause) ────────────────────────────────────
 */
async function unmuteAll(guild, voiceChannel) {
  if (!voiceChannel) return;
  const botMember = guild.members.me;

  const ops = [];
  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot || !member.voice.serverMute) continue;

    // Même sécurité de hiérarchie pour le démute
    if (member.roles.highest.position < botMember.roles.highest.position && member.id !== guild.ownerId) {
      ops.push(
        member.voice.setMute(false, 'Session terminée')
          .catch(e => console.warn(`[Vocal] Échec démute ${memberId}:`, e.message))
      );
    }
  }
  await Promise.all(ops);
  console.log(`[Vocal] Tout le monde est démuté dans #${voiceChannel.name}`);
}

/**
 * ─── Configurer les permissions du salon vocal ───────────────────────────────
 */
async function setupVoiceChannelPermissions(voiceChannel, guild) {
  try {
    await voiceChannel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.UseApplicationCommands,
        ],
        deny: [
          PermissionsBitField.Flags.Speak, // Forcer le Push-to-talk ou le mute par défaut
        ],
      },
    ]);
    console.log(`[Vocal] Permissions configurées sur #${voiceChannel.name}`);
  } catch (e) {
    console.error(`[Vocal] Erreur configuration permissions:`, e.message);
  }
}

/**
 * ─── Réinitialiser les permissions (Nettoyage) ───────────────────────────────
 */
async function resetVoiceChannelPermissions(voiceChannel, guild) {
  try {
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
  } catch (e) {
    console.error(`[Vocal] Erreur reset permissions:`, e.message);
  }
}

/**
 * ─── Démuter uniquement les chanteurs (Pause libre) ──────────────────────────
 */
async function unmuteSingersOnly(guild, voiceChannel, singerUserIds) {
  if (!voiceChannel) return;
  const botMember = guild.members.me;

  const ops = [];
  for (const [memberId, member] of voiceChannel.members) {
    if (member.user.bot) continue;

    const isSinger = singerUserIds.includes(memberId);
    const shouldBeMuted = !isSinger;

    if (member.voice.serverMute !== shouldBeMuted) {
      if (member.roles.highest.position < botMember.roles.highest.position && member.id !== guild.ownerId) {
        ops.push(
          member.voice.setMute(shouldBeMuted, isSinger ? 'Pause libre chanteur' : 'Spectateur muet')
            .catch(e => console.warn(`[Vocal] Erreur switch mute ${memberId}:`, e.message))
        );
      }
    }
  }
  await Promise.all(ops);
  console.log(`[Vocal] Mode pause : ${singerUserIds.length} chanteurs actifs.`);
}

module.exports = {
  findVoiceChannel,
  muteAllExcept,
  unmuteAll,
  unmuteSingersOnly,
  setupVoiceChannelPermissions,
  resetVoiceChannelPermissions,
};
