const { PermissionsBitField } = require('discord.js');

const ROLE_SINGER    = '🎤 Chanteur Karaoké';
const ROLE_SPECTATOR = '👁️ Spectateur Karaoké';
const ROLE_MODO      = 'Modo';
const ROLE_LEADER    = 'Leader';

// ─── HELPERS DE VÉRIFICATION ─────────────────────────────────────────────────

/**
 * Vérifie si un membre possède un rôle (insensible à la casse)
 */
function hasRole(member, roleName) {
  if (!member || !member.roles) return false;
  const target = roleName.toLowerCase();
  return member.roles.cache.some(r => r.name.toLowerCase() === target);
}

function isStaffMember(member) {
  return hasRole(member, ROLE_LEADER) || hasRole(member, ROLE_MODO);
}

// ─── RÉCUPÉRER OU CRÉER UN RÔLE ───────────────────────────────────────────────

async function getOrCreateRole(guild, name, color) {
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (!role) {
    try {
      role = await guild.roles.create({ 
        name, 
        color, 
        reason: 'Rôle automatique Let\'s Sing', 
        mentionable: false 
      });
      console.log(`[Rôles] Rôle "${name}" créé.`);
    } catch (e) {
      console.error(`[Rôles] Erreur création rôle ${name}:`, e.message);
    }
  }
  return role;
}

// ─── CONFIGURATION DES PERMISSIONS ───────────────────────────────────────────

async function setupChannelPermissions(voiceChannel, guild) {
  const everyoneRole = guild.roles.everyone;
  
  const [singerRole, spectatorRole, modoRole, leaderRole] = await Promise.all([
    getOrCreateRole(guild, ROLE_SINGER,    0xFF69B4),
    getOrCreateRole(guild, ROLE_SPECTATOR, 0x5865F2),
    getOrCreateRole(guild, ROLE_MODO,      0xE67E22),
    getOrCreateRole(guild, ROLE_LEADER,    0xFFD700),
  ]);

  const memberPerms = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.UseApplicationCommands,
    PermissionsBitField.Flags.EmbedLinks,
  ];

  const soundboardDeny = [
    PermissionsBitField.Flags.UseSoundboard,
    PermissionsBitField.Flags.UseExternalSounds,
  ];

  await voiceChannel.permissionOverwrites.set([
    {
      id  : everyoneRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, ...soundboardDeny],
    },
    { id: singerRole.id,    allow: memberPerms, deny: [PermissionsBitField.Flags.Speak, ...soundboardDeny] },
    { id: spectatorRole.id, allow: memberPerms, deny: [PermissionsBitField.Flags.Speak, ...soundboardDeny] },
    {
      id   : modoRole.id,
      allow: [...memberPerms, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MuteMembers],
      deny : soundboardDeny,
    },
    {
      id   : leaderRole.id,
      allow: [...memberPerms, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.ManageChannels],
      deny : soundboardDeny,
    },
  ]);

  return { singerRole, spectatorRole, modoRole, leaderRole };
}

// ─── GESTION DES RÔLES INDIVIDUELS ───────────────────────────────────────────

async function assignRole(guild, userId, roleName, color) {
  const role = await getOrCreateRole(guild, roleName, color);
  if (!role) return;
  
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && !member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch(e => console.warn(`[Rôles] Ajout ${roleName} à ${userId}:`, e.message));
  }
}

async function assignSingerRole(guild, userId)    { await assignRole(guild, userId, ROLE_SINGER, 0xFF69B4); }
async function assignSpectatorRole(guild, userId) { await assignRole(guild, userId, ROLE_SPECTATOR, 0x5865F2); }

async function removeKaraokeRoles(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const rolesToRemove = guild.roles.cache.filter(r => 
    [ROLE_SINGER.toLowerCase(), ROLE_SPECTATOR.toLowerCase()].includes(r.name.toLowerCase())
  );
  
  if (rolesToRemove.size > 0) {
    await member.roles.remove(rolesToRemove).catch(e => console.warn(`[Rôles] Retrait de ${userId}:`, e.message));
  }
}

// ─── NETTOYAGE GLOBAL (Fin de session) ───────────────────────────────────────

async function cleanupAllKaraokeRoles(guild) {
  const rolesToCleanup = [ROLE_SINGER, ROLE_SPECTATOR];
  
  for (const roleName of rolesToCleanup) {
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) continue;

    // ✅ On traite les membres un par un avec un petit délai si nécessaire ou via Promise.all
    const membersWithRole = Array.from(role.members.values());
    if (membersWithRole.length === 0) continue;

    console.log(`[Rôles] Nettoyage de ${membersWithRole.length} membres pour le rôle ${roleName}...`);
    
    await Promise.all(membersWithRole.map(member => 
      member.roles.remove(role).catch(e => console.warn(`[Rôles] Erreur cleanup ${member.id}:`, e.message))
    ));
  }
}

// ─── VERROUILLAGE ────────────────────────────────────────────────────────────

async function lockChannel(channel, guild) {
  const everyoneRole = guild.roles.everyone;
  const modoRole = await getOrCreateRole(guild, ROLE_MODO, 0xE67E22);
  const leaderRole = await getOrCreateRole(guild, ROLE_LEADER, 0xFFD700);

  const soundboardDeny = [PermissionsBitField.Flags.UseSoundboard, PermissionsBitField.Flags.UseExternalSounds];

  await channel.permissionOverwrites.set([
    {
      id  : everyoneRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, ...soundboardDeny],
    },
    { id: modoRole.id,   allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak], deny: soundboardDeny },
    { id: leaderRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.ManageChannels], deny: soundboardDeny },
  ]);
}

module.exports = {
  setupChannelPermissions,
  lockChannel,
  assignSingerRole,
  assignSpectatorRole,
  removeKaraokeRoles,
  cleanupAllKaraokeRoles,
  hasRole,
  isStaffMember,
  ROLE_SINGER, ROLE_SPECTATOR, ROLE_MODO, ROLE_LEADER
};
