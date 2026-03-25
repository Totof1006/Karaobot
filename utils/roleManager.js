const { PermissionsBitField } = require('discord.js');

const ROLE_SINGER    = '🎤 Chanteur Karaoké';
const ROLE_SPECTATOR = '👁️ Spectateur Karaoké';
const ROLE_MODO      = 'Modo';
const ROLE_LEADER    = 'Leader';

// ─── Helpers de vérification de rôle ─────────────────────────────────────────
// Centralise la comparaison : insensible à la casse pour résister aux renommages
// accidentels (ex: "leader" au lieu de "Leader").
// Usage : hasRole(interaction.member, ROLE_LEADER)
function hasRole(member, roleName) {
  return member.roles.cache.some(
    r => r.name.toLowerCase() === roleName.toLowerCase()
  );
}

function isStaffMember(member) {
  return hasRole(member, ROLE_LEADER) || hasRole(member, ROLE_MODO);
}

function isLeaderMember(member) {
  return hasRole(member, ROLE_LEADER);
}

// ─── Récupérer ou créer un rôle ───────────────────────────────────────────────
async function getOrCreateRole(guild, name, color) {
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (!role) {
    role = await guild.roles.create({ name, color, reason: 'Rôle automatique Let\'s Sing', mentionable: false });
    console.log(`[Rôles] Rôle "${name}" créé.`);
  }
  return role;
}

// ─── Configurer les permissions du salon vocal karaoké ───────────────────────
// Accès strictement réservé aux rôles : Chanteur, Spectateur, Modo, Leader.
// @everyone → bloqué. Soundboard bloquée pour TOUS les profils.
async function setupChannelPermissions(voiceChannel, guild) {
  const everyoneRole = guild.roles.everyone;
  // Créer les 4 rôles en parallèle plutôt que séquentiellement
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

  // Soundboard toujours bloquée dans ce salon pour tout le monde
  const soundboardDeny = [
    PermissionsBitField.Flags.UseSoundboard,
    PermissionsBitField.Flags.UseExternalSounds,
  ];

  await voiceChannel.permissionOverwrites.set([
    // @everyone : accès refusé + soundboard bloquée
    {
      id  : everyoneRole.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        ...soundboardDeny,
      ],
    },
    // Chanteur : micro géré par le bot + soundboard bloquée
    { id: singerRole.id,    allow: memberPerms, deny: [PermissionsBitField.Flags.Speak, ...soundboardDeny] },
    // Spectateur : micro toujours coupé + soundboard bloquée
    { id: spectatorRole.id, allow: memberPerms, deny: [PermissionsBitField.Flags.Speak, ...soundboardDeny] },
    // Modo : peut parler pour modérer + soundboard bloquée
    {
      id   : modoRole.id,
      allow: [...memberPerms, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MuteMembers],
      deny : soundboardDeny,
    },
    // Leader : accès total + soundboard bloquée
    {
      id   : leaderRole.id,
      allow: [...memberPerms, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.ManageChannels],
      deny : soundboardDeny,
    },
  ]);

  console.log(`[Permissions] Salon vocal "${voiceChannel.name}" configuré — soundboard bloquée pour tous.`);
  return { singerRole, spectatorRole, modoRole, leaderRole };
}

// ─── Attribuer un rôle ────────────────────────────────────────────────────────
async function assignRole(guild, userId, roleName, color) {
  const role   = await getOrCreateRole(guild, roleName, color);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(e => console.warn(`[Rôles] Ajout "${roleName}" à ${userId}:`, e.message));
}

async function assignSingerRole(guild, userId)    { await assignRole(guild, userId, ROLE_SINGER,    0xFF69B4); }
async function assignSpectatorRole(guild, userId)  { await assignRole(guild, userId, ROLE_SPECTATOR, 0x5865F2); }
async function assignModoRole(guild, userId)       { await assignRole(guild, userId, ROLE_MODO,      0xE67E22); }
async function assignLeaderRole(guild, userId)     { await assignRole(guild, userId, ROLE_LEADER,    0xFFD700); }

// ─── Retirer les rôles karaoké d'un membre ───────────────────────────────────
async function removeKaraokeRoles(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  for (const name of [ROLE_SINGER, ROLE_SPECTATOR]) {
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (role && member.roles.cache.has(role.id)) await member.roles.remove(role).catch(e => console.warn(`[Rôles] Retrait "${name}" de ${userId}:`, e.message));
  }
}

// ─── Nettoyer chanteurs + spectateurs après session (Modo/Leader conservés) ──
async function cleanupAllKaraokeRoles(guild) {
  const ops = [];
  for (const name of [ROLE_SINGER, ROLE_SPECTATOR]) {
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!role) continue;
    for (const [, member] of role.members) {
      ops.push(member.roles.remove(role).catch(e => console.warn(`[Rôles] Nettoyage "${name}" de ${member.id}:`, e.message)));
    }
  }
  await Promise.all(ops);
  console.log('[Rôles] Rôles Chanteur et Spectateur nettoyés (Modo/Leader conservés).');
}

// ─── Réinitialiser les permissions du salon vocal (fin de session) ────────────
// Le salon reste restreint aux 4 rôles, micros rouverts, soundboard toujours bloquée.
async function resetChannelPermissions(channel, guild) {
  const everyoneRole  = guild.roles.everyone;
  const singerRole    = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_SINGER.toLowerCase());
  const spectatorRole = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_SPECTATOR.toLowerCase());
  const modoRole      = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_MODO.toLowerCase());
  const leaderRole    = guild.roles.cache.find(r => r.name.toLowerCase() === ROLE_LEADER.toLowerCase());

  const soundboardDeny = [
    PermissionsBitField.Flags.UseSoundboard,
    PermissionsBitField.Flags.UseExternalSounds,
  ];

  const memberPerms = [
    PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.UseApplicationCommands,
  ];

  const overwrites = [
    {
      id  : everyoneRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, ...soundboardDeny],
    },
  ];

  for (const role of [singerRole, spectatorRole, modoRole, leaderRole]) {
    if (role) overwrites.push({ id: role.id, allow: memberPerms, deny: soundboardDeny });
  }

  await channel.permissionOverwrites.set(overwrites);
  console.log(`[Permissions] Salon vocal "${channel.name}" réinitialisé — soundboard toujours bloquée.`);
}

// ─── Verrouiller le salon (hors événement) ────────────────────────────────────
// Seuls Modo et Leader peuvent voir et accéder au salon.
// Soundboard bloquée même pour le staff.
async function lockChannel(channel, guild) {
  const everyoneRole = guild.roles.everyone;
  const [modoRole, leaderRole] = await Promise.all([
    getOrCreateRole(guild, ROLE_MODO,   0xE67E22),
    getOrCreateRole(guild, ROLE_LEADER, 0xFFD700),
  ]);

  const soundboardDeny = [
    PermissionsBitField.Flags.UseSoundboard,
    PermissionsBitField.Flags.UseExternalSounds,
  ];

  const staffPerms = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.UseApplicationCommands,
    PermissionsBitField.Flags.ManageMessages,
  ];

  await channel.permissionOverwrites.set([
    // @everyone → invisible + soundboard bloquée
    {
      id  : everyoneRole.id,
      deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, ...soundboardDeny],
    },
    // Modo → accès complet + soundboard bloquée
    { id: modoRole.id,   allow: staffPerms, deny: soundboardDeny },
    // Leader → accès complet + soundboard bloquée
    { id: leaderRole.id, allow: staffPerms, deny: soundboardDeny },
  ]);

  console.log(`[Permissions] Salon "${channel.name}" verrouillé — soundboard bloquée.`);
}

// ─── Ouvrir le salon pour un événement ───────────────────────────────────────
// Appelé automatiquement à la création d'un événement.
// Chanteurs et Spectateurs peuvent rejoindre, @everyone reste bloqué.
async function openChannelForEvent(channel, guild) {
  await setupChannelPermissions(channel, guild);
  console.log(`[Permissions] Salon "${channel.name}" ouvert pour l'événement.`);
}

// ─── Helper : vérifie qu'un membre possède un rôle par son nom ───────────────
// Comparaison insensible à la casse pour résister aux renommages accidentels.
// Usage : hasRole(interaction.member, ROLE_LEADER)
function hasRole(member, roleName) {
  const target = roleName.toLowerCase();
  return member.roles.cache.some(r => r.name.toLowerCase() === target);
}

module.exports = {
  // Permissions salon
  setupChannelPermissions,
  lockChannel, openChannelForEvent,
  // Attribution de rôles
  assignSingerRole, assignSpectatorRole,
  removeKaraokeRoles, cleanupAllKaraokeRoles,
  // Constantes de noms de rôles
  ROLE_SINGER, ROLE_SPECTATOR, ROLE_MODO, ROLE_LEADER,
  // Helper de vérification insensible à la casse
  hasRole,
};
