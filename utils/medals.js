// ─── Système de médailles de fin de session ───────────────────────────────────

const MEDALS = {
  WINNER      : { emoji: '🥇', label: 'Champion(ne)',       desc: 'Meilleur score de la session'       },
  PERFECT     : { emoji: '💎', label: 'Sans-faute',          desc: 'Que des votes 5⭐ reçus'            },
  CROWD_FAVE  : { emoji: '🔥', label: 'Chouchou du public',  desc: 'Moyenne la plus haute (min 3 votes)'},
  IRON_LUNGS  : { emoji: '🎤', label: 'Poumons d\'acier',    desc: 'A chanté le plus de chansons'       },
  COMEBACK    : { emoji: '⚡', label: 'Comeback',            desc: 'Dernier à chanter, meilleur score'  },
  UNDERDOG    : { emoji: '🌟', label: 'Outsider',            desc: 'Moins attendu, meilleur résultat'   },
};

/**
 * Calcule les médailles à partir des roundResults et du leaderboard.
 * @param {Array} roundResults  — tableau des résultats de chaque tour
 * @param {Array} leaderboard   — classement final trié par score
 * @returns {Array} [{ userId, username, medals: [{ emoji, label, desc }] }]
 */
function computeMedals(roundResults, leaderboard) {
  const awarded = new Map(); // userId → [medal, ...]

  function give(userId, username, medal) {
    if (!awarded.has(userId)) awarded.set(userId, { userId, username, medals: [] });
    awarded.get(userId).medals.push(medal);
  }

  // 🥇 Champion : 1er du classement
  if (leaderboard.length > 0) {
    const winner = leaderboard[0];
    give(winner.userId, winner.username, MEDALS.WINNER);
  }

  // 💎 Sans-faute : tous les votes reçus sont 5
  // On regroupe les votes par chanteur
  const votesByPlayer = {};
  for (const r of roundResults) {
    if (!votesByPlayer[r.userId]) votesByPlayer[r.userId] = { username: r.username, avgs: [] };
    votesByPlayer[r.userId].avgs.push(parseFloat(r.avgScore));
  }
  for (const [userId, data] of Object.entries(votesByPlayer)) {
    if (data.avgs.every(avg => avg === 5.0)) {
      give(userId, data.username, MEDALS.PERFECT);
    }
  }

  // 🔥 Chouchou du public : meilleure moyenne sur tous ses passages (min 3 votes sur au moins un passage)
  let bestAvg = -1;
  let bestAvgPlayer = null;
  for (const [userId, data] of Object.entries(votesByPlayer)) {
    const hasEnoughVotes = roundResults
      .filter(r => r.userId === userId)
      .some(r => r.votes >= 3);
    if (!hasEnoughVotes) continue;
    const avg = data.avgs.reduce((a, b) => a + b, 0) / data.avgs.length;
    if (avg > bestAvg) { bestAvg = avg; bestAvgPlayer = { userId, username: data.username }; }
  }
  if (bestAvgPlayer && bestAvgPlayer.userId !== leaderboard[0]?.userId) {
    give(bestAvgPlayer.userId, bestAvgPlayer.username, MEDALS.CROWD_FAVE);
  }

  // ⚡ Comeback : dernier chanteur dans l'ordre de passage mais dans le top 3 du classement
  if (roundResults.length > 0 && leaderboard.length >= 2) {
    const lastSinger = roundResults[roundResults.length - 1];
    const rank = leaderboard.findIndex(p => p.userId === lastSinger.userId);
    if (rank >= 0 && rank <= 2 && rank > 0) {
      give(lastSinger.userId, lastSinger.username, MEDALS.COMEBACK);
    }
  }

  // 🌟 Outsider : joueur avec le moins de points à mi-session qui termine 2ème ou mieux
  if (leaderboard.length >= 3) {
    const midPoint = Math.floor(roundResults.length / 2);
    const midScores = {};
    for (let i = 0; i < midPoint; i++) {
      const r = roundResults[i];
      if (!midScores[r.userId]) midScores[r.userId] = 0;
      midScores[r.userId] += r.points;
    }
    const midRanked = Object.entries(midScores).sort((a, b) => a[1] - b[1]);
    if (midRanked.length > 0) {
      const underdog = midRanked[0][0]; // dernier à mi-session
      const finalRank = leaderboard.findIndex(p => p.userId === underdog);
      if (finalRank >= 0 && finalRank <= 1) {
        const p = leaderboard[finalRank];
        give(p.userId, p.username, MEDALS.UNDERDOG);
      }
    }
  }

  return [...awarded.values()].filter(e => e.medals.length > 0);
}

/**
 * Formate les médailles en champs pour un embed Discord.
 */
function formatMedalsField(medalsData) {
  if (medalsData.length === 0) return '_Aucune médaille décernée._';
  return medalsData.map(entry => {
    const icons = entry.medals.map(m => `${m.emoji} **${m.label}**`).join(' · ');
    return `<@${entry.userId}> — ${icons}`;
  }).join('\n');
}

module.exports = { computeMedals, formatMedalsField };
