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
        ephemeral: true,
      });
    }

    const event = getEvent(guildId);

    await interaction.deferReply();

    const steps = [];

    // ── 1. Stopper la session en cours si elle existe ─────────────────────────
    if (getSession(guildId)) {
      deleteSession(guildId);
      steps.push('🛑 Session karaoké en cours arrêtée');
    }

    // ── 2. Désactiver et désépingler le message d'annonce ─────────────────────
    if (event?.announceMsgId) {
      try {
        // Chercher dans le salon annonces (#karaoké-annonces)
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

        // Kicker tous les membres non-staff avant de reverrouiller
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
      // Le salon texte #karaoké-annonces reste accessible à tout le monde
    } catch (e) {
      console.warn('[Fermeture] Erreur verrouillage salon vocal :', e.message);
      steps.push('⚠️ Erreur lors du verrouillage du salon vocal');
    }

    // ── 5. Supprimer les fichiers .lrc des chansons de la soirée ─────────────
    if (event?.registrations?.length > 0) {
      const allSongs = event.registrations.flatMap(r => r.songs);
      const deleted  = deleteSongFiles(allSongs);
      steps.push(deleted.length > 0
        ? `🗑️ **${deleted.length}** fichier(s) de paroles supprimé(s)`
        : '📄 Aucun fichier de paroles à supprimer'
      );
    }

    // ── 6. Supprimer l'événement natif Discord ────────────────────────────────
    if (event?.discordEventId) {
      try {
        const scheduledEvent = await guild.scheduledEvents
          .fetch(event.discordEventId).catch(() => null);
        if (scheduledEvent) {
          await scheduledEvent.delete();
          steps.push('📅 Événement natif Discord supprimé');
        }
      } catch (e) {
        console.warn('[Fermeture] Erreur suppression événement Discord natif :', e.message);
        steps.push('⚠️ Impossible de supprimer l\'événement natif Discord');
      }
    }

    // ── 7. Vider toute la mémoire persistante ─────────────────────────────────
    clearLastSession(guildId);   // snapshot /rejouer
    clearNightResults(guildId);  // résultats cumulés de la soirée
    resetRematchCount(guildId);  // compteur de revanches
    steps.push('🧹 Mémoire de la soirée effacée (snapshots, résultats, compteurs)');

    // ── 8. Supprimer l'événement de la base JSON ──────────────────────────────
    if (event) {
      deleteEvent(guildId);
      steps.push(`🗑️ Événement **${event.title}** supprimé de la base`);
    } else {
      steps.push('ℹ️ Aucun événement planifié à supprimer');
    }

    // ── Message de clôture ────────────────────────────────────────────────────
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔒 Événement fermé — Tout est nettoyé !')
          .setDescription(steps.join('\n'))
          .setFooter({ text: `Fermé par ${interaction.user.username}` })
          .setTimestamp(),
      ],
    });
  },
};
