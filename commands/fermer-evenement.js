const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getEvent, deleteEvent }                = require('../utils/eventDB');
const { cleanupAllKaraokeRoles,
        lockChannel,
        ROLE_LEADER, ROLE_MODO, hasRole } = require('../utils/roleManager');
const { findVoiceChannel,
        unmuteAll,
        resetVoiceChannelPermissions }         = require('../utils/voiceManager');
const { deleteSongFiles }                      = require('../utils/autoLyrics');
const { clearLastSession,
        clearNightResults,
        resetRematchCount }                    = require('../utils/persist');
const { deleteSession, getSession }            = require('../utils/gameState');
const { errorEmbed }                           = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fermer-evenement')
    .setDescription('🔒 Fermer l\'événement : retirer tous les rôles et nettoyer le salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  async execute(interaction) {
    const guild   = interaction.guild;
    const guildId = interaction.guildId;

    const isLeader = hasRole(interaction.member, ROLE_LEADER);
    const isModo   = hasRole(interaction.member, ROLE_MODO);
    
    if (!isLeader && !isModo) {
      return interaction.reply({
        embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent fermer un événement.')],
        flags: 64, // ✅ CORRECTION
      });
    }

    const event = getEvent(guildId);

    // ✅ CORRECTION : Defer privé car le rapport de nettoyage est technique
    await interaction.deferReply({ flags: 64 });

    const steps = [];

    // ── 1. Stopper la session en cours si elle existe ─────────────────────────
    if (getSession(guildId)) {
      deleteSession(guildId);
      steps.push('🛑 Session karaoké en cours arrêtée');
    }

    // ── 2. Désactiver et désépingler le message d'annonce ─────────────────────
    if (event?.announceMsgId) {
      try {
        const announceChId = event.announceChannelId || event.channelId;
        const annChannel   = await guild.channels.fetch(announceChId).catch(() => null);
        if (annChannel) {
          const msg = await annChannel.messages.fetch(event.announceMsgId).catch(() => null);
          if (msg) {
            await msg.edit({ components: [] }).catch(e => console.warn('[Fermeture] Edit annonce :', e.message));
            await msg.unpin().catch(e => console.warn('[Fermeture] Désépingle annonce :', e.message));
            steps.push('📌 Message d\'annonce désépinglé et boutons désactivés');
          }
        }
      } catch (e) { console.warn('[Fermeture] Erreur traitement message annonce :', e.message); }
    }

    // ── 3. Retirer les rôles Chanteur et Spectateur ───────────────────────────
    try {
      await cleanupAllKaraokeRoles(guild);
      steps.push('🎭 Rôles Chanteur et Spectateur retirés à tout le monde');
    } catch (e) {
      console.warn('[Fermeture] Erreur retrait rôles :', e.message);
      steps.push('⚠️ Erreur lors du retrait des rôles');
    }

    // ── 4. Remettre les permissions, kicker et reverrouiller le salon vocal ──
    try {
      const voiceChannel = await findVoiceChannel(guild);
      if (voiceChannel) {
        await unmuteAll(guild, voiceChannel);

        const kickOps = [];
        for (const [, member] of voiceChannel.members) {
          if (member.user.bot) continue;
          const isStaff = hasRole(member, ROLE_LEADER) || hasRole(member, ROLE_MODO);
          if (!isStaff) {
            kickOps.push(member.voice.disconnect('Événement karaoké terminé').catch(e => console.warn(`[Kick] ${member.user.username}:`, e.message)));
          }
        }
        if (kickOps.length > 0) {
          await Promise.all(kickOps);
          steps.push(`👢 **${kickOps.length} membre(s)** déconnecté(s) du salon vocal`);
        }

        await resetVoiceChannelPermissions(voiceChannel, guild);
        await lockChannel(voiceChannel, guild);
        steps.push(`🔒 Salon vocal **${voiceChannel.name}** reverrouillé (Modo/Leader uniquement)`);
      }
    } catch (e) {
      console.warn('[Fermeture] Erreur verrouillage salon vocal :', e.message);
      steps.push('⚠️ Erreur lors du verrouillage du salon vocal');
    }

    // ── 5. Supprimer les fichiers .lrc des chansons de la soirée ─────────────
    if (event?.registrations?.length > 0) {
      const allSongs = event.registrations.flatMap(r => r.songs);
