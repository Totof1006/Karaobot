/**
 * sessionFlow.js — Logique de déroulement de session
 * Module indépendant pour éviter la dépendance circulaire
 * interactionCreate ↔ reprise
 */

const { EmbedBuilder }    = require('discord.js');
const { getSession, getCurrentSinger, pickRandomSong,
        getSongTitle, getSongUrl,
        computeRoundScore, getLeaderboard,
        deleteSession }                                = require('./gameState');
const { getLyrics, startLyricsStream, slugify }        = require('./lyricsSync');
const { findVoiceChannel, muteAllExcept,
        unmuteSingersOnly, unmuteAll }                 = require('./voiceManager');
const { playAudio }                                    = require('./audioPlayer');
const { endSongButton, nextSingerButton }              = require('./buttons');
const { singingEmbed, errorEmbed, roundResultEmbed,
        finalLeaderboardEmbed }                        = require('./embeds');
const { updateProgressEmbed, buildProgressEmbed }      = require('./progressEmbed');
const { updateGlobalScores }                           = require('./scoreDB');
const { cleanupAllKaraokeRoles }                       = require('./roleManager');
const { computeMedals, formatMedalsField }             = require('./medals');
const { getRematchCount, resetRematchCount,
        appendNightResults, getNightResults,
        clearNightResults }                            = require('./persist');
const { getEvent, formatDate }                         = require('./eventDB');
const { buildTourRecap, buildFinalNightRecap }         = require('./sessionRecap');

const { BREAK_DURATION_MS }                            = require('./constants');

// Valeur d'affichage dérivée de la constante — reste cohérente si BREAK_DURATION_MS change
const BREAK_SECONDS = BREAK_DURATION_MS / 1_000;

/**
 * Lance une pause libre de ${BREAK_SECONDS}s (micros chanteurs ouverts),
 * puis démarre le tour du chanteur suivant.
 */
async function startBreakThenSing(interaction, session, isFirst) {
  const guild    = interaction.guild;
  const channel  = interaction.channel;
  const singer   = getCurrentSinger(session);
  const isFirstSinger = session.currentSingerIndex === 0;

  const voiceChannel = await findVoiceChannel(guild);
  const singerIds    = session.players.map(p => p.userId);
  if (voiceChannel) await unmuteSingersOnly(guild, voiceChannel, singerIds);

  // Premier passage : annoncer l'ordre + épingler la progression
  if (isFirstSinger) {
    const orderLines = session.players.map((p, i) =>
      `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'][i] || `${i+1}.`} <@${p.userId}>`
    ).join('\n');

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('🎯 Ordre de passage (tiré au sort !)')
          .setDescription(orderLines)
          .setFooter({ text: 'Bonne chance à tous 🍀' }),
      ],
    });

    const progressMsg = await channel.send({ embeds: [buildProgressEmbed(session)] });
    await progressMsg.pin().catch(e => console.warn('[Session] Impossible d\'épingler la progression (50 épingles max ?) :', e.message));
    session.progressMessageId = progressMsg.id;
  }

  const title = isFirstSinger
    ? `💬 La session démarre dans ${BREAK_SECONDS} secondes !`
    : `💬 Pause libre — Prochain chanteur : ${singer.username}`;

  const description = isFirstSinger
    ? `Profitez de ce temps pour vous échauffer ! 🎙️\nLe premier chanteur sera **${singer.username}**.`
    : `Discutez librement ! 🎶\nDans **${BREAK_SECONDS} secondes**, ce sera au tour de <@${singer.userId}>.`;

  const breakEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title)
    .setDescription(description)
    .addFields({ name: '🎙️ Micros', value: '✅ Micros ouverts pour les **chanteurs** — spectateurs en écoute 👁️' })
    .setFooter({ text: `La chanson démarrera automatiquement dans ${BREAK_SECONDS}s` });

  if (isFirst && interaction.update) {
    // Premier lancement : l'interaction bouton n'a pas encore été acquittée
    await interaction.update({ embeds: [breakEmbed], components: [] });
  } else {
    // Tours suivants ou reprise : envoyer simplement le message
    await channel.send({ embeds: [breakEmbed] });
  }

  const allTimers = [];

  // Countdowns dérivés de BREAK_DURATION_MS — texte calculé automatiquement
  const countdowns = [
    { delay: BREAK_DURATION_MS - 60_000, remaining: 60 },
    { delay: BREAK_DURATION_MS - 30_000, remaining: 30 },
    { delay: BREAK_DURATION_MS - 10_000, remaining: 10 },
  ]
    .filter(c => c.delay > 0)
    .map(c => ({
      delay: c.delay,
      text : c.remaining > 10
        ? `⏳ **${c.remaining} secondes** avant le prochain chanteur…`
        : `⚠️ **${c.remaining} secondes** ! Préparez-vous 🎤`,
    }));

  for (const { delay, text } of countdowns) {
    const t = setTimeout(async () => {
      if (!getSession(interaction.guildId)) return;
      await channel.send({ content: text }).catch(e => console.warn('[Session] Countdown non envoyé :', e.message));
    }, delay);
    allTimers.push(t);
  }

  const mainTimer = setTimeout(async () => {
    if (!getSession(interaction.guildId)) return;
    await startSingerTurn({ guild, channel, guildId: interaction.guildId }, session);
  }, BREAK_DURATION_MS);
  allTimers.push(mainTimer);

  session.pauseTimerHandle = () => allTimers.forEach(t => clearTimeout(t));
}

/**
 * Démarre le tour d'un chanteur : micro, audio, paroles.
 */
async function startSingerTurn(ctx, session) {
  const singer  = getCurrentSinger(session);
  const guild   = ctx.guild;
  const channel = ctx.channel;

  // ── Vérifier que le chanteur est toujours membre du serveur ─────────────
  const singerMember = await guild.members.fetch(singer.userId).catch(() => null);
  if (!singerMember) {
    await channel.send({
      content: `⚠️ <@${session.hostId}> — **${singer.username}** a quitté le serveur. Tour ignoré, passage au suivant…`,
      allowedMentions: { users: [session.hostId] },
    });
    // Avancer automatiquement au chanteur suivant
    const hasNext = advanceToNextSinger(session);
    if (!hasNext) {
      // endSession est défini plus bas dans ce même fichier — appel direct
      await endSession({ guild, channel, guildId: ctx.guildId, channelId: session.channelId }, session);
    } else {
      await startBreakThenSing({ guild, channel, guildId: ctx.guildId }, session, false);
    }
    return;
  }

  const song    = pickRandomSong(session);

  if (!song) {
    await channel.send({ embeds: [errorEmbed('Ce joueur n\'a pas de chanson définie !')] });
    return;
  }

  const songTitle = getSongTitle(song);
  const songUrl   = getSongUrl(song);
  const lyrics    = getLyrics(songTitle);
  const hasLyrics = lyrics && lyrics.length > 0;

  await channel.send({ embeds: [singingEmbed(singer, songTitle, hasLyrics)], components: [endSongButton()] });

  // Micro vocal
  const voiceChannel = await findVoiceChannel(guild);
  if (voiceChannel) {
    const singerMember = await guild.members.fetch(singer.userId).catch(() => null);
    const isInVoice    = singerMember?.voice?.channelId === voiceChannel.id;

    if (!isInVoice) {
      await channel.send({
        content: `⚠️ <@${session.hostId}> — **${singer.username}** n'est pas dans le salon vocal !`,
        allowedMentions: { users: [session.hostId] },
      });
    } else {
      await muteAllExcept(guild, voiceChannel, singer.userId);
      await channel.send({
        content: `🎙️ <@${singer.userId}> ton micro est **activé** — les autres sont **coupés** !`,
        allowedMentions: { users: [singer.userId] },
      });
    }
  } else {
    await channel.send({ content: `⚠️ Aucun salon vocal configuré. Utilise \`/definir-vocal\`.` });
  }

  await updateProgressEmbed(session, guild);

  // Stopper audio/paroles/ambiance précédents
  if (session.stopLyrics)  { session.stopLyrics();  session.stopLyrics  = null; }
  if (session.stopAudio)   { session.stopAudio();   session.stopAudio   = null; }
  if (session.stopAmbient) { session.stopAmbient(); session.stopAmbient = null; }

  if (songUrl && voiceChannel) {
    await channel.send({ content: `🔊 Lecture de **${songTitle}** dans le vocal…` });

    session.stopAudio = await playAudio(
      voiceChannel, songUrl,
      async () => {
        const s = getSession(guild.id);
        if (!s || s.phase !== 'singing') return;
        if (s.stopLyrics) { s.stopLyrics(); s.stopLyrics = null; }
        // Verrouiller la phase AVANT l'await pour éviter le double appel
        // si l'hôte clique sur "Fin de chanson" au même instant
        s.phase = 'voting';
        await channel.send({ content: `🎵 **${songTitle}** terminée ! Ouverture des votes…` });
        await revealResults({ channel, guild }, s);
      },
      async (err) => {
        await channel.send({ content: `⚠️ Erreur audio : ${err.message}` });
      }
    );

    if (hasLyrics) session.stopLyrics = startLyricsStream(channel, lyrics, null);
  } else {
    if (!songUrl) await channel.send({ content: `🔇 Pas de lien audio — le chanteur gère sa musique.` });
    if (hasLyrics) {
      session.stopLyrics = startLyricsStream(channel, lyrics, null);
    } else {
      await channel.send({ content: `📄 Pas de paroles pour **${songTitle}**. Ajoute \`lyrics/${slugify(songTitle)}.lrc\` !` });
    }
  }
}

/**
 * Ferme les votes, calcule les scores et affiche les résultats.
 */
async function revealResults(ctx, session) {
  const channel = ctx.channel || ctx;
  const guild   = ctx.guild   || ctx.channel?.guild;
  session.phase = 'results';

  if (session.stopAmbient) { session.stopAmbient(); session.stopAmbient = null; }

  if (guild) {
    const voiceChannel = await findVoiceChannel(guild);
    if (voiceChannel) {
      const singer = getCurrentSinger(session);
      if (singer) {
        const member = await guild.members.fetch(singer.userId).catch(() => null);
        if (member?.voice?.channel) {
          await member.voice.setMute(true, 'Vote en cours').catch(e => console.warn(`[Vocal] Mute chanteur vote:`, e.message));
        }
      }
      await channel.send({
        content: `🔇 Tous les micros sont **coupés** pendant le vote. Utilisez les boutons pour voter !`,
      });
    }
  }

  computeRoundScore(session);
  const lastResult = session.roundResults[session.roundResults.length - 1];

  if (session.voteMessage) {
    await session.voteMessage.edit({ components: [] }).catch(e => console.warn('[Vote] Impossible de retirer les boutons du vote :', e.message));
  }

  await channel.send({
    embeds: [roundResultEmbed(lastResult)],
    components: [nextSingerButton()],
  });
}

/**
 * Termine un tour complet : scores, classement, médailles, récap, nettoyage.
 * Appelé par karaoke_next quand advanceToNextSinger retourne false.
 */
async function endSession(interaction, session) {
  const guild       = interaction.guild;
  const guildId     = session.guildId;
  const leaderboard = getLeaderboard(session);

  // Utiliser le salon de la session plutôt que interaction.channel
  // (ils peuvent différer si la commande vient d'un autre salon)
  let channel = interaction.channel;
  if (session.channelId && session.channelId !== interaction.channelId) {
    const sessionCh = await guild.channels.fetch(session.channelId).catch(() => null);
    if (sessionCh) channel = sessionCh;
  }

  // ── 1. Scores globaux et historique ──────────────────────────────────────
  updateGlobalScores(guildId, session.players);

  // Calculer le numéro de tour dès maintenant — utilisé dans les étapes suivantes
  const rematchCount = getRematchCount(guildId);
  const isLastTour   = session.isRematch && rematchCount >= 2;
  const tourNumber   = !session.isRematch ? 1 : rematchCount === 1 ? 2 : 3;

  // ── 2. Nettoyage vocal ────────────────────────────────────────────────────
  // Entre les tours : micros des chanteurs ouverts pour qu'ils puissent discuter
  // On ne touche PAS aux permissions du salon (rôles karaoké conservés)
  // Le kick et le verrouillage se font manuellement via /verrouiller-salon ou /fermer-evenement
  if (guild) {
    const voiceChannel = await findVoiceChannel(guild);
    if (voiceChannel) {
      const singerIds = session.players.map(p => p.userId);
      if (!isLastTour) {
        // Entre les tours : ouvrir les micros des chanteurs, spectateurs muets
        await unmuteSingersOnly(guild, voiceChannel, singerIds);
      } else {
        // Fin de soirée : tout le monde peut parler librement
        await unmuteAll(guild, voiceChannel);
      }
    }
  }

  // ── 3. Classement final du tour ───────────────────────────────────────────
  await channel.send({ embeds: [finalLeaderboardEmbed(leaderboard, session)], components: [] });

  // ── 4. Médailles ──────────────────────────────────────────────────────────
  const medalsData = computeMedals(session.roundResults, leaderboard);
  if (medalsData.length > 0) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🏅 Médailles de la session')
          .setDescription(formatMedalsField(medalsData))
          .setFooter({ text: 'Bravo à tous les participants !' }),
      ],
    });
  }

  // ── 5. Accumuler les résultats de la soirée ───────────────────────────────
  appendNightResults(guildId, session.roundResults);

  // ── 6. Nettoyage de fin de soirée (dernier tour uniquement) ───────────────
  if (isLastTour) {
    resetRematchCount(guildId);

    // Nettoyage des rôles uniquement en fin de soirée (dernier tour)
    // → Entre les tours, les joueurs doivent garder leur rôle pour
    //   pouvoir accéder au salon vocal lors des revanches
    if (guild) {
      await cleanupAllKaraokeRoles(guild);
      // Pas de kick ici : les participants peuvent continuer à discuter
      // Le kick se fait manuellement via /verrouiller-salon ou /fermer-evenement
    }
  }

  // ── 7. Récapitulatif dans #karaoké-annonces ───────────────────────────────
  const event          = getEvent(guildId);
  const announceChId   = event?.announceChannelId;
  let   recapTarget    = channel;

  if (guild && announceChId) {
    const annCh = await guild.channels.fetch(announceChId).catch(() => null);
    if (annCh) recapTarget = annCh;
  }

  if (!isLastTour) {
    const recapEmbeds = buildTourRecap(session, leaderboard, tourNumber);
    await recapTarget.send({ embeds: recapEmbeds });
  } else {
    const allResults = getNightResults(guildId);
    await recapTarget.send({ embeds: buildFinalNightRecap(allResults, leaderboard) });
    clearNightResults(guildId);
  }

  // ── 8. Message de fin de tour / soirée ────────────────────────────────────
  const nextEventBlock = event
    ? `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 **Prochain événement : ${event.title}**\n\n` +
      `📬 Ouverture des inscriptions\n**${formatDate(event.registrationStart)}**\n\n` +
      `🔒 Fermeture des inscriptions\n**${formatDate(event.registrationEnd)}**\n\n` +
      `🎤 Lancement de la session\n**${formatDate(event.eventDate)}** entre **20h30 et 21h**`
    : `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📅 Aucun prochain événement planifié.\n` +
      `Un **Leader** peut en créer un avec \`/evenement\`.`;

  if (isLastTour) {
    await recapTarget.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('🎤 Fin de la soirée karaoké !')
          .setDescription(
            '🙏 **Merci à tous les participants** pour cette incroyable soirée !\n' +
            'Chaque chanteur a interprété ses **3 chansons**.\n' +
            'On espère vous revoir très bientôt ! 🎶\n\n' + nextEventBlock
          )
          .setFooter({ text: 'À très bientôt ! 🎶' })
          .setTimestamp(),
      ],
    });
  } else if (!session.isRematch) {
    await recapTarget.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔁 Tour 1/3 terminé !')
          .setDescription(
            'Vous pouvez encore jouer **2 tours supplémentaires** !\n' +
            'L\'hôte peut lancer la revanche avec `/rejouer`.\n\n' + nextEventBlock
          ),
      ],
    });
  } else {
    await recapTarget.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔁 Tour 2/3 terminé !')
          .setDescription(
            'Il reste encore **1 tour** avec la dernière chanson de chacun !\n' +
            'L\'hôte peut lancer la dernière revanche avec `/rejouer`.\n\n' + nextEventBlock
          ),
      ],
    });
  }

  // ── 9. Supprimer la session RAM ───────────────────────────────────────────
  deleteSession(guildId);
}

module.exports = { startBreakThenSing, revealResults, endSession };
