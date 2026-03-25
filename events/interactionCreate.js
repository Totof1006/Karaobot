const { EmbedBuilder }           = require('discord.js');
const {
  getSession, addPlayer, getCurrentSinger,
  getSongTitle,
  addVote, advanceToNextSinger,
  deleteSession, shufflePlayers,
} = require('../utils/gameState');
const {
  registrationEmbed, votingEmbed, errorEmbed, successEmbed,
} = require('../utils/embeds');
const { joinButton, startButton, voteButtons } = require('../utils/buttons');
const { getEvent, registerPlayer, unregisterPlayer, isRegistrationOpen } = require('../utils/eventDB');
const { refreshAnnouncement,
        showRegistrationModal, handleModalSubmit } = require('../commands/inscrire');
const {
  assignSpectatorRole, removeKaraokeRoles,
  ROLE_LEADER, ROLE_MODO, hasRole,
} = require('../utils/roleManager');
const {
  findVoiceChannel, unmuteSingersOnly,
} = require('../utils/voiceManager');
const { checkAnnouncementButton, checkCommandChannel } = require('../utils/channelGuard');
const { launchFromEvent }                        = require('../commands/lancer-evenement');
const { playLocalAudio }                         = require('../utils/audioPlayer');
const { startBreakThenSing, revealResults,
        endSession }                             = require('../utils/sessionFlow');
const { updateProgressEmbed }                    = require('../utils/progressEmbed');

const { VOTE_DURATION_MS, APPLAUSE_FILE, MAX_SINGERS } = require('../utils/constants');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash commands ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(err);
        const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
        else await interaction.reply(msg);
      }
      return;
    }

    // ── Modals ──────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId === 'modal_register_songs') {
          const guard = checkCommandChannel(interaction);
          if (!guard.ok) {
            return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
          }
          await handleModalSubmit(interaction);
        }
      } catch (err) {
        console.error('[Modal]', err);
        const msg = { embeds: [errorEmbed('Une erreur est survenue lors du traitement du formulaire.')], ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
        else await interaction.reply(msg).catch(() => {});
      }
      return;
    }

    // ── Buttons ─────────────────────────────────────────────────────────────
    if (!interaction.isButton()) return;

    const session = getSession(interaction.guildId);
    const { customId, user } = interaction;

    try {

    // ── BOUTON S'INSCRIRE chanteur → ouvre le modal ──────────────────────────
    if (customId === 'event_register') {
      const guard = checkAnnouncementButton(interaction);
      if (!guard.ok) {
        return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
      }
      await showRegistrationModal(interaction);
      return;
    }

    // ── BOUTON SPECTATEUR (message d'annonce) ────────────────────────────────
    if (customId === 'event_spectator') {
      const guard = checkAnnouncementButton(interaction);
      if (!guard.ok) {
        return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
      }
      const event = getEvent(interaction.guildId);
      if (!event) {
        return interaction.reply({ embeds: [errorEmbed('Aucun événement en cours.')], ephemeral: true });
      }
      const isRegistered = event.registrations.find(r => r.userId === user.id);
      if (isRegistered) {
        return interaction.reply({
          embeds: [errorEmbed('Tu es déjà inscrit(e) comme **chanteur** ! Tu peux déjà voir le salon et voter.')],
          ephemeral: true,
        });
      }
      await assignSpectatorRole(interaction.guild, user.id);
      return interaction.reply({
        embeds: [
          successEmbed(
            `Tu as rejoint **${event.title}** en tant que 👁️ **spectateur** !\n\n` +
            `Tu peux voir le salon karaoké et **voter** pendant la session, mais pas écrire dans le chat.`
          ),
        ],
        ephemeral: true,
      });
    }

    // ── BOUTON SE DÉSINSCRIRE (message d'annonce) ────────────────────────────
    if (customId === 'event_unregister') {
      const guard = checkAnnouncementButton(interaction);
      if (!guard.ok) {
        return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
      }
      const event = getEvent(interaction.guildId);
      if (!event) {
        return interaction.reply({ embeds: [errorEmbed('Aucun événement en cours.')], ephemeral: true });
      }
      if (!isRegistrationOpen(event)) {
        return interaction.reply({ embeds: [errorEmbed('Les inscriptions sont fermées, impossible de se désinscrire.')], ephemeral: true });
      }
      const ok = unregisterPlayer(interaction.guildId, user.id);
      if (!ok) {
        return interaction.reply({ embeds: [errorEmbed('Tu n\'étais pas inscrit(e).')], ephemeral: true });
      }
      await removeKaraokeRoles(interaction.guild, user.id);
      await refreshAnnouncement(interaction, interaction.guildId);
      return interaction.reply({ embeds: [successEmbed('Tu as bien été désinscrit(e). Ton rôle karaoké a été retiré.')], ephemeral: true });
    }

    // ── REJOINDRE ────────────────────────────────────────────────────────────
    if (customId === 'karaoke_join') {
      if (!session || session.phase !== 'registration') {
        return interaction.reply({ embeds: [errorEmbed('Aucune session ouverte aux inscriptions.')], ephemeral: true });
      }
      const ok = addPlayer(session, user.id, user.username);
      if (!ok) {
        const msg = session.players.find(p => p.userId === user.id)
          ? 'Tu es déjà inscrit !'
          : `La session est complète (${MAX_SINGERS} joueurs max) !`;
        return interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
      }
      await interaction.update({
        embeds: [registrationEmbed(session)],
        components: [joinButton(), startButton()],
      });
      return;
    }

    // ── LANCER ÉVÉNEMENT MÊME SANS CHANSONS COMPLÈTES ────────────────────────
    if (customId === 'force_launch_event') {
      // Vérification de rôle — seuls Leader et Modo peuvent forcer le lancement
      const isLeader = hasRole(interaction.member, ROLE_LEADER);
      const isModo   = hasRole(interaction.member, ROLE_MODO);
      if (!isLeader && !isModo) {
        return interaction.reply({ embeds: [errorEmbed('Seuls les **Leader** 👑 et **Modo** 🛡️ peuvent lancer la session.')], ephemeral: true });
      }
      if (!session && !getEvent(interaction.guildId)) {
        return interaction.reply({ embeds: [errorEmbed('Aucune session ou événement en cours.')], ephemeral: true });
      }
      const ev = getEvent(interaction.guildId);
      if (!ev) return interaction.reply({ embeds: [errorEmbed('Événement introuvable.')], ephemeral: true });
      await interaction.update({ components: [] });
      await launchFromEvent(interaction, ev);
      return;
    }

    // ── ANNULER ──────────────────────────────────────────────────────────────
    if (customId === 'karaoke_cancel') {
      const isLeader = hasRole(interaction.member, ROLE_LEADER);
      const isModo   = hasRole(interaction.member, ROLE_MODO);
      const isHost   = session?.hostId === user.id;
      if (!session || (!isHost && !isLeader && !isModo)) {
        return interaction.reply({ embeds: [errorEmbed('Seuls l\'hôte, un **Leader** ou un **Modo** peuvent annuler.')], ephemeral: true });
      }
      deleteSession(interaction.guildId);
      await interaction.update({ embeds: [errorEmbed('Session annulée.')], components: [] });
      return;
    }

    // ── LANCER ───────────────────────────────────────────────────────────────
    if (customId === 'karaoke_start') {
      if (!session || session.hostId !== user.id) {
        return interaction.reply({ embeds: [errorEmbed('Seul l\'hôte peut lancer la session.')], ephemeral: true });
      }
      if (session.players.length < 2) {
        return interaction.reply({ embeds: [errorEmbed('Il faut au moins **2 joueurs** pour commencer !')], ephemeral: true });
      }
      const notReady = session.players.filter(p => p.songs.length === 0);
      if (notReady.length > 0) {
        const names = notReady.map(p => `<@${p.userId}>`).join(', ');
        return interaction.reply({ embeds: [errorEmbed(`Ces joueurs n'ont pas encore soumis leurs chansons : ${names}`)], ephemeral: true });
      }

      session.phase = 'singing';
      // Mélanger aléatoirement l'ordre de passage
      if (!session.isRematch) shufflePlayers(session);
      await startBreakThenSing(interaction, session, true);
      return;
    }

    // ── VOTE ─────────────────────────────────────────────────────────────────
    if (customId.startsWith('vote_')) {
      if (!session || session.phase !== 'voting') {
        return interaction.reply({ embeds: [errorEmbed('Aucun vote en cours.')], ephemeral: true });
      }

      // Anti-spam : déjà voté ?
      if (session.votes.has(user.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Tu as **déjà voté** pour ce chanteur ! Un seul vote par personne.')],
          ephemeral: true,
        });
      }

      // Le chanteur actif ne peut pas voter pour lui-même
      if (getCurrentSinger(session)?.userId === user.id) {
        return interaction.reply({
          embeds: [errorEmbed('Tu ne peux pas voter pour toi-même !')],
          ephemeral: true,
        });
      }

      const value = parseInt(customId.split('_')[1]);
      addVote(session, user.id, value);

      // eligibleVoters = tous les inscrits sauf le chanteur actif
      const eligibleVoters = session.players.filter(p => p.userId !== getCurrentSinger(session)?.userId).length;
      const received       = session.votes.size;

      await interaction.reply({
        embeds: [successEmbed(`Vote enregistré : **${value} ⭐** ! (${received} votes reçus)`)],
        ephemeral: true,
      });

      // Mettre à jour l'embed de progression
      await updateProgressEmbed(session, interaction.guild);

      // Re-vérifier la phase après les await (protection contre double-appel concurrent)
      if (session.phase !== 'voting') return;

      // Si tous les chanteurs inscrits ont voté → clore immédiatement
      if (received >= eligibleVoters) {
        // Annuler le timer de vote automatique (tous votes reçus avant expiration)
        if (session.voteTimerHandle) {
          clearTimeout(session.voteTimerHandle);
          session.voteTimerHandle = null;
        }
        session.phase = 'results'; // verrouiller avant l'await pour éviter double appel
        await revealResults({ channel: interaction.channel, guild: interaction.guild }, session);
      }
      return;
    }

    // ── FIN DE CHANSON (hôte clique manuellement) ────────────────────────────
    if (customId === 'karaoke_end_song') {
      if (!session || session.hostId !== user.id) {
        return interaction.reply({ embeds: [errorEmbed("Seul l'hôte peut terminer la chanson.")], ephemeral: true });
      }
      if (!session || session.phase !== 'singing') {
        return interaction.reply({ embeds: [errorEmbed('Aucune chanson en cours.')], ephemeral: true });
      }

      const singer = getCurrentSinger(session);
      const song   = session.currentSong;

      if (!singer) {
        return interaction.reply({ embeds: [errorEmbed('Aucun chanteur actif.')], ephemeral: true });
      }

      await interaction.update({ components: [] });

      // Stopper l'audio, les paroles et l'ambiance
      if (session.stopLyrics)  { session.stopLyrics();  session.stopLyrics  = null; }
      if (session.stopAudio)   { session.stopAudio();   session.stopAudio   = null; }
      if (session.stopAmbient) { session.stopAmbient(); session.stopAmbient = null; }

      session.phase = 'voting';
      const voteMsg = await interaction.channel.send({
        embeds: [votingEmbed(singer, getSongTitle(song))],
        components: [voteButtons()],
      });
      session.voteMessage = voteMsg;

      // Jouer les applaudissements pendant le vote
      const voiceChannel = await findVoiceChannel(interaction.guild);
      if (voiceChannel) {
        session.stopAmbient = await playLocalAudio(voiceChannel, APPLAUSE_FILE, () => {
          session.stopAmbient = null;
        });
      }

      // Auto-close votes après VOTE_DURATION_MS
      session.voteTimerHandle = setTimeout(async () => {
        session.voteTimerHandle = null;
        if (getSession(interaction.guildId)?.phase !== 'voting') return;
        await revealResults({ channel: interaction.channel, guild: interaction.guild }, session);
      }, VOTE_DURATION_MS);

      return;
    }

    // ── SUIVANT ───────────────────────────────────────────────────────────────
    if (customId === 'karaoke_next') {
      if (!session || session.hostId !== user.id) {
        return interaction.reply({ embeds: [errorEmbed("Seul l'hôte peut passer au suivant.")], ephemeral: true });
      }
      // Acquitter immédiatement l'interaction avant les opérations longues
      await interaction.update({ components: [] });
      const hasNext = advanceToNextSinger(session);
      if (!hasNext) {
        await endSession(interaction, session);
      } else if (session.paused) {
        // ── PAUSE ACTIVE → bloquer la session ici ────────────────────────────
        // interaction.update({ components: [] }) déjà fait plus haut
        session.phase = 'paused';
        const guild        = interaction.guild;
        const channel      = interaction.channel;
        const singerIds    = session.players.map(p => p.userId);
        const voiceChannel = await findVoiceChannel(guild);

        if (voiceChannel) await unmuteSingersOnly(guild, voiceChannel, singerIds);

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF9900)
              .setTitle('⏸️ Session en pause')
              .setDescription(
                `La session est en pause.\n\n` +
                `🎙️ Les micros des **chanteurs** sont **ouverts** — discutez librement !\n` +
                `👁️ Les spectateurs restent en écoute.\n\n` +
                `Un **Leader** ou **Modo** peut reprendre avec \`/reprise\`.`
              ),
          ],
        });
      } else {
        await startBreakThenSing(interaction, session, false);
      }
      return;
    }

    } catch (err) {
      console.error('[Button]', customId, err);
      const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  },
};

// ─── Helpers délégués aux modules spécialisés ────────────────────────────────
// startBreakThenSing, revealResults, endSession → utils/sessionFlow.js
// buildProgressEmbed, updateProgressEmbed       → utils/progressEmbed.js

