const { EmbedBuilder }                      = require('discord.js');
const { getAllEvents, saveEvent, formatDate } = require('./eventDB');
const { eventRegistrationButtons }          = require('./buttons');
const { MAX_SINGERS, REMINDER_WINDOW_MS }   = require('./constants');

// Protection contre le double-tick si un tick prend plus de 60s
let _ticking = false;

function startScheduler(client) {
  console.log('[Scheduler] Démarré ✅');
  setInterval(async () => {
    if (_ticking) {
      console.warn('[Scheduler] Tick précédent encore en cours, saut.');
      return;
    }
    await tick(client);
  }, 60_000);
  tick(client);
}

async function tick(client) {
  _ticking = true;
  try {
    // Un seul chargement de la DB pour tout le tick
    const events = getAllEvents();
    const now    = new Date();

    for (const ev of events) {
      const regEnd = new Date(ev.registrationEnd);

      // ── Rappel 24h avant fermeture ─────────────────────────────────────────
      const msBeforeClose = regEnd - now;
      if (!ev.reminderSent && msBeforeClose > 0 && msBeforeClose <= REMINDER_WINDOW_MS) {
        await sendReminder(client, ev);
        ev.reminderSent = true;
        saveEvent(ev.guildId, ev);
      }

      // ── Fermeture des inscriptions ─────────────────────────────────────────
      if (!ev.closeSent && now >= regEnd) {
        await sendClosingSummary(client, ev);
        await disableSingerButton(client, ev);
        ev.closeSent = true;
        saveEvent(ev.guildId, ev);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Erreur inattendue dans tick:', err.message);
  } finally {
    _ticking = false;
  }
}

// Retourne le salon d'annonce (announceChannelId en priorité, sinon channelId)
async function fetchAnnounceChannel(client, ev) {
  const channelId = ev.announceChannelId || ev.channelId;
  return client.channels.fetch(channelId).catch(() => null);
}

// ─── Message de rappel ────────────────────────────────────────────────────────
async function sendReminder(client, ev) {
  try {
    const channel = await fetchAnnounceChannel(client, ev);
    if (!channel) return;

    const missing        = ev.registrations.filter(r => r.songs.length < 3);
    const missingMentions = missing.map(r => `<@${r.userId}>`).join(', ') || 'Aucun ✅';

    const embed = new EmbedBuilder()
      .setColor(0xFF9900)
      .setTitle('⏰ Rappel — Fermeture des inscriptions dans 24h !')
      .setDescription(`L'événement **${ev.title}** ferme ses inscriptions le **${formatDate(ev.registrationEnd)}**.`)
      .addFields(
        { name: '✅ Inscrits',              value: `${ev.registrations.length}/${MAX_SINGERS} joueurs`, inline: true },
        { name: '⚠️ Chansons manquantes',   value: missingMentions },
      )
      .setFooter({ text: 'Utilisez /inscrire pour soumettre ou modifier vos 3 chansons !' });

    await channel.send({
      content: ev.registrations.map(r => `<@${r.userId}>`).join(' '),
      embeds : [embed],
    });
    console.log(`[Scheduler] Rappel envoyé pour "${ev.title}" (${ev.guildId})`);
  } catch (e) {
    console.error('[Scheduler] Erreur rappel:', e.message);
  }
}

// ─── Message de clôture ───────────────────────────────────────────────────────
async function sendClosingSummary(client, ev) {
  try {
    const channel = await fetchAnnounceChannel(client, ev);
    if (!channel) return;

    const ready    = ev.registrations.filter(r => r.songs.length === 3);
    const playerList = ev.registrations.length === 0
      ? '_Aucun joueur inscrit._'
      : ev.registrations.map((r, i) => {
          const status = r.songs.length === 3 ? '✅' : `⚠️ (${r.songs.length}/3 chansons)`;
          return `${i + 1}. <@${r.userId}> ${status}`;
        }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(ready.length >= 2 ? 0x57F287 : 0xED4245)
      .setTitle(`🔒 Inscriptions fermées — ${ev.title}`)
      .setDescription(`La session karaoké aura lieu le **${formatDate(ev.eventDate)}**.`)
      .addFields(
        { name: '👥 Liste des participants', value: playerList },
        {
          name : '🚀 Pour lancer la session',
          value: ready.length >= 2
            ? `Tape \`/lancer-evenement\` le jour J pour démarrer avec les **${ready.length} joueurs prêts** !`
            : '⚠️ Moins de 2 joueurs sont prêts, la session risque de ne pas pouvoir démarrer.',
        },
      )
      .setFooter({ text: `${ready.length} joueur(s) prêt(s) sur ${ev.registrations.length} inscrit(s)` });

    await channel.send({
      content: `<@${ev.hostId}> Les inscriptions sont fermées !`,
      embeds : [embed],
    });

    // ── DM récapitulatif à chaque chanteur inscrit ───────────────────────────
    const guild = channel.guild;
    for (const reg of ev.registrations) {
      try {
        const member = await guild.members.fetch(reg.userId).catch(() => null);
        if (!member) continue;

        const songList = reg.songs.length > 0
          ? reg.songs.map((s, i) => {
              const title = typeof s === 'string' ? s : s.title;
              const audio = typeof s === 'object' && s.url ? ' 🔊' : '';
              return `${i + 1}. ${title}${audio}`;
            }).join('\n')
          : '_Aucune chanson soumise_ ⚠️';

        const dmEmbed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle(`🎤 Récapitulatif — ${ev.title}`)
          .setDescription(
            `Les inscriptions sont fermées ! Voici ton récapitulatif pour la session du **${formatDate(ev.eventDate)}**.`
          )
          .addFields(
            { name: '🎵 Tes chansons soumises', value: songList },
            { name: '📅 Date de la session',    value: formatDate(ev.eventDate) },
            {
              name : '✅ Statut',
              value: reg.songs.length === 3
                ? 'Tu es **prêt(e)** ! Sois là le jour J 🎶'
                : `⚠️ Tu n'as soumis que **${reg.songs.length}/3 chansons** ! Contacte un admin.`,
            },
          )
          .setFooter({ text: 'Karaobot — À bientôt ! 🎤' });

        await member.send({ embeds: [dmEmbed] }).catch(() => {
          console.log(`[DM] Impossible d'envoyer un DM à ${reg.username} (DMs fermés).`);
        });
      } catch (_) {}
    }

    console.log(`[Scheduler] Clôture + DMs envoyés pour "${ev.title}" (${ev.guildId})`);
  } catch (e) {
    console.error('[Scheduler] Erreur clôture:', e.message);
  }
}

// ─── Désactiver le bouton S'inscrire sur le message d'annonce ────────────────
async function disableSingerButton(client, ev) {
  try {
    if (!ev.announceMsgId) return;
    const channel = await fetchAnnounceChannel(client, ev);
    if (!channel) return;
    const msg = await channel.messages.fetch(ev.announceMsgId).catch(() => null);
    if (!msg) return;
    await msg.edit({ components: eventRegistrationButtons(true) });
    console.log(`[Scheduler] Bouton S'inscrire désactivé pour "${ev.title}"`);
  } catch (e) {
    console.error('[Scheduler] Erreur désactivation bouton:', e.message);
  }
}

module.exports = { startScheduler };
