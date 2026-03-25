const { EmbedBuilder } = require('discord.js');

/**
 * Construit les embeds de récapitulatif complet d'un tour :
 * - Détail par chanteur (chanson + score)
 * - Classement du tour
 * Retourne un tableau d'embeds à envoyer.
 */
function buildTourRecap(session, leaderboard, tourNumber) {
  const embeds = [];
  const medals = ['🥇', '🥈', '🥉'];
  const isRematch = session.isRematch;

  // ── Embed 1 : Détail des passages ─────────────────────────────────────────
  const detailFields = session.roundResults.map((r, i) => {
    const stars    = '⭐'.repeat(Math.round(parseFloat(r.avgScore)));
    const position = `${i + 1}.`;
    return {
      name : `${position} <@${r.userId}>`,
      value:
        `🎵 **${r.song}**\n` +
        `🗳️ ${r.votes} vote(s) · ⭐ Moyenne : **${r.avgScore}/5** ${stars}\n` +
        `🏅 **+${r.points} pts** → Total : **${r.totalScore} pts**`,
      inline: false,
    };
  });

  embeds.push(
    new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle(`🎤 Récapitulatif — Tour ${tourNumber}/3`)
      .setDescription('Voici le détail de chaque passage pour ce tour.')
      .addFields(detailFields.length > 0 ? detailFields : [{ name: 'Aucun résultat', value: '_—_' }])
      .setTimestamp()
  );

  // ── Embed 2 : Classement du tour ──────────────────────────────────────────
  const rankLines = leaderboard.map(p => {
    const medal = medals[p.rank - 1] || `${p.rank}.`;
    return `${medal} <@${p.userId}> — **${p.score} pts**`;
  }).join('\n');

  embeds.push(
    new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🏆 Classement — Tour ${tourNumber}/3`)
      .setDescription(rankLines || '_Aucun joueur_')
      .setFooter({ text: tourNumber < 3 ? `Tour ${tourNumber}/3 • /rejouer pour continuer` : 'Fin de la soirée !' })
      .setTimestamp()
  );

  return embeds;
}

/**
 * Construit l'embed récapitulatif de FIN DE SOIRÉE (tous les tours cumulés).
 * Affiche pour chaque chanteur : ses 3 chansons + scores + total cumulé.
 */
function buildFinalNightRecap(allRoundResults, finalLeaderboard) {
  const embeds = [];
  const medals = ['🥇', '🥈', '🥉'];

  // Grouper les passages par chanteur
  const byPlayer = {};
  for (const r of allRoundResults) {
    if (!byPlayer[r.userId]) byPlayer[r.userId] = { username: r.username, rounds: [] };
    byPlayer[r.userId].rounds.push(r);
  }

  // ── Embed 1 : Détail par chanteur sur toute la soirée ─────────────────────
  const fields = finalLeaderboard.map(p => {
    const rounds = byPlayer[p.userId]?.rounds || [];
    const lines  = rounds.map((r, i) =>
      `Tour ${i + 1} · 🎵 **${r.song}** · ${r.avgScore}/5 · **+${r.points} pts**`
    ).join('\n');

    return {
      name : `${medals[p.rank - 1] || `${p.rank}.`} <@${p.userId}> — **${p.score} pts au total**`,
      value: lines || '_Aucun passage_',
      inline: false,
    };
  });

  embeds.push(
    new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('📊 Récapitulatif complet de la soirée')
      .setDescription('Voici le détail de tous les passages de la soirée.')
      .addFields(fields.length > 0 ? fields : [{ name: 'Aucun résultat', value: '_—_' }])
      .setTimestamp()
  );

  // ── Embed 2 : Classement final de la soirée ───────────────────────────────
  const rankLines = finalLeaderboard.map(p => {
    const medal = medals[p.rank - 1] || `${p.rank}.`;
    return `${medal} <@${p.userId}> — **${p.score} pts**`;
  }).join('\n');

  embeds.push(
    new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Classement Final de la soirée')
      .setDescription(rankLines || '_Aucun joueur_')
      .setFooter({ text: 'Merci à tous ! À la semaine prochaine 🎶' })
      .setTimestamp()
  );

  return embeds;
}

module.exports = { buildTourRecap, buildFinalNightRecap };
