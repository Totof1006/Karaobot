const { EmbedBuilder } = require('discord.js');
const { MAX_SINGERS } = require('./constants');

const COLORS = {
  pink: 0xFF69B4,
  gold: 0xFFD700,
  green: 0x57F287,
  red: 0xED4245,
  blue: 0x5865F2,
  orange: 0xFF6B35,
  purple: 0x9B59B6,
};

function registrationEmbed(session) {
  // Correction : On s'assure que session.players existe
  const players = session.players || [];
  const playerList = players.length === 0
    ? '_Aucun joueur encore…_'
    : players.map((p, i) => {
        const count = p.songs ? p.songs.length : 0;
        const songStatus = count > 0 ? `✅ ${count}/3 chansons` : '⏳ En attente';
        return `${i + 1}. <@${p.userId}> — ${songStatus}`;
      }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.pink)
    .setTitle('🎤 Let\'s Sing Discord — Inscription ouverte !')
    .setDescription('Une session karaoké démarre ! Rejoins en cliquant sur le bouton ci-dessous.')
    .addFields(
      { name: '👥 Joueurs inscrits', value: playerList },
      { name: '📋 Règles', value: `• Max **${MAX_SINGERS} joueurs**\n• Chaque joueur choisit **3 chansons**\n• Recherche auto type **Pancake** activée\n• Vote du public & Précision micro 🎙️` },
    )
    .setFooter({ text: `${players.length}/${MAX_SINGERS} joueurs` })
    .setTimestamp();
}

// singingEmbed mis à jour pour refléter la recherche auto
function singingEmbed(singer, songTitle, hasLyrics = false) {
  return new EmbedBuilder()
    .setColor(COLORS.orange)
    .setTitle(`🎙️ C'est au tour de ${singer.username || 'quelqu\'un'} !`)
    .setDescription(`> 🎵 **${songTitle}**\n\nLe bot a trouvé la musique. Chante maintenant ! 🌟`)
    .addFields(
      {
        name: '📄 Paroles',
        value: hasLyrics
          ? '✅ Paroles synchronisées en direct !'
          : '⚠️ Pas de paroles (.lrc) trouvées. Chante à l\'oreille !',
      },
      { name: '🗳️ Vote', value: 'Les votes s\'ouvriront à la fin de la prestation.' },
    )
    .setFooter({ text: 'Donne tout ! 🍀' });
}

function roundResultEmbed(result) {
  const avg = parseFloat(result.avgScore) || 0;
  const stars = '⭐'.repeat(Math.round(avg));
  
  // Correction : On adapte la barre de précision au nouveau système PCM (sur 100%)
  const precisionValue = parseFloat(result.precision) || 0;
  const greenSquares = Math.round(precisionValue / 20); // Barre sur 5 (100 / 20 = 5)
  const bar = '🟩'.repeat(Math.min(greenSquares, 5)) + '⬜'.repeat(Math.max(5 - greenSquares, 0));

  return new EmbedBuilder()
    .setColor(COLORS.green)
    .setTitle(`📊 Performance de ${result.username}`)
    .setDescription(`Bravo ! Voici ton score pour **${result.song}**.`)
    .addFields(
      { name: '🗳️ Avis du Public', value: `${avg.toFixed(1)}/5 ${stars}\n*(${result.votes || 0} votes)*`, inline: true },
      { name: '🎙️ Précision Micro', value: `${Math.round(precisionValue)}%\n${bar}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🏅 Points gagnés', value: `**+${Math.round(result.points || 0)} pts**`, inline: true },
      { name: '🏆 Score total', value: `**${Math.round(result.totalScore || 0)} pts**`, inline: true },
    )
    .setFooter({ text: "La précision est calculée via ton flux audio PCM." });
}

// Les autres fonctions (error, success, leaderboards) restent identiques car déjà robustes
function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.red).setDescription(`❌ ${message}`);
}

function successEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ ${message}`);
}

function votingEmbed(singer, song) {
  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(`🗳️ Votez pour ${singer.username} !`)
    .setDescription(`Il/Elle vient de chanter **${song}**\n\nClique sur les boutons pour noter !`)
    .addFields({ name: '⭐ Notes', value: '1 ⭐ à 5 ⭐ (Parfait !)' })
    .setFooter({ text: 'Le chanteur ne peut pas voter pour lui-même.' });
}

function finalLeaderboardEmbed(leaderboard, session) {
  const medals = ['🥇', '🥈', '🥉'];
  const rows = (leaderboard || []).map((p, i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} <@${p.userId}> — **${Math.round(p.score || 0)} pts**`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('🏆 Classement Final')
    .setDescription(rows || '_Aucun participant._')
    .setTimestamp();
}

module.exports = {
  registrationEmbed, singingEmbed,
  votingEmbed, roundResultEmbed, finalLeaderboardEmbed,
  errorEmbed, successEmbed,
};
