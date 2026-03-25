const { EmbedBuilder } = require('discord.js');
const { MAX_SINGERS }  = require('./constants');

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
  const playerList = session.players.length === 0
    ? '_Aucun joueur encore…_'
    : session.players.map((p, i) => {
        const songStatus = p.songs.length > 0 ? `✅ ${p.songs.length}/3 chansons` : '⏳ En attente';
        return `${i + 1}. <@${p.userId}> — ${songStatus}`;
      }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.pink)
    .setTitle('🎤 Let\'s Sing Discord — Inscription ouverte !')
    .setDescription('Une session karaoké démarre ! Rejoins en cliquant sur le bouton ci-dessous.')
    .addFields(
      { name: '👥 Joueurs inscrits', value: playerList },
      { name: '📋 Règles', value: `• Max **${MAX_SINGERS} joueurs**\n• Chaque joueur choisit **3 chansons**\n• Une chanson **aléatoire** sera jouée\n• Les autres joueurs **votent de 1 à 5** ⭐` },
    )
    .setFooter({ text: `${session.players.length}/${MAX_SINGERS} joueurs` })
    .setTimestamp();
}

function songSelectionEmbed(player) {
  return new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle('🎵 Choisis tes 3 chansons !')
    .setDescription(`<@${player.userId}>, utilise \`/chansons\` pour soumettre tes 3 chansons.\n\nExemple : \`/chansons chanson1:Bohemian Rhapsody chanson2:Thriller chanson3:Shape of You\``)
    .setFooter({ text: 'Tu peux changer tes chansons tant que la session n\'a pas commencé.' });
}

function singingEmbed(singer, song, hasLyrics = false) {
  return new EmbedBuilder()
    .setColor(COLORS.orange)
    .setTitle(`🎙️ C'est au tour de ${singer.username} !`)
    .setDescription(`> 🎵 **${song}**\n\nLance la chanson et chante jusqu'au bout ! 🌟`)
    .addFields(
      {
        name: '📄 Paroles',
        value: hasLyrics
          ? '✅ Les paroles vont s\'afficher en direct dans le chat !'
          : '❌ Pas de paroles disponibles pour cette chanson.',
      },
      { name: '🗳️ Vote', value: 'L\'hôte ouvrira les votes quand la chanson sera terminée.' },
    )
    .setFooter({ text: 'Bonne chance ! 🍀' });
}

function votingEmbed(singer, song) {
  return new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(`🗳️ Votez pour ${singer.username} !`)
    .setDescription(`Il/Elle vient de chanter **${song}**\n\nDonnez votre note en cliquant sur les boutons ci-dessous !`)
    .addFields({ name: '⭐ Notes', value: '1 ⭐ (Bof) — 2 ⭐⭐ — 3 ⭐⭐⭐ — 4 ⭐⭐⭐⭐ — 5 ⭐⭐⭐⭐⭐ (Parfait !)' })
    .setFooter({ text: 'Le chanteur ne peut pas voter pour lui-même.' });
}

function roundResultEmbed(result) {
  const stars = '⭐'.repeat(Math.round(parseFloat(result.avgScore)));
  return new EmbedBuilder()
    .setColor(COLORS.green)
    .setTitle(`📊 Résultats — ${result.username}`)
    .addFields(
      { name: '🎵 Chanson', value: result.song, inline: true },
      { name: '🗳️ Votes reçus', value: `${result.votes}`, inline: true },
      { name: '⭐ Moyenne', value: `${result.avgScore}/5 ${stars}`, inline: true },
      { name: '🏅 Points gagnés', value: `**+${result.points} pts**`, inline: true },
      { name: '🏆 Score total', value: `**${result.totalScore} pts**`, inline: true },
    );
}

function finalLeaderboardEmbed(leaderboard, session) {
  const medals = ['🥇', '🥈', '🥉'];
  const rows = leaderboard.map(p => {
    const medal = medals[p.rank - 1] || `${p.rank}.`;
    return `${medal} <@${p.userId}> — **${p.score} pts**`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('🏆 Classement Final — Let\'s Sing Discord !')
    .setDescription(rows || '_Personne n\'a participé…_')
    .setFooter({ text: 'Merci à tous d\'avoir participé ! 🎤' })
    .setTimestamp();
}

function globalLeaderboardEmbed(leaderboard) {
  const medals = ['🥇', '🥈', '🥉'];
  const rows = leaderboard.map(p => {
    const medal = medals[p.rank - 1] || `${p.rank}.`;
    return `${medal} <@${p.userId}> — **${p.totalScore} pts** (${p.gamesPlayed} parties, ${p.wins} 🏆)`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('🌍 Classement Global — Let\'s Sing Discord')
    .setDescription(rows || '_Aucune partie jouée encore !_')
    .setTimestamp();
}

function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.red).setDescription(`❌ ${message}`);
}

function successEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ ${message}`);
}

module.exports = {
  registrationEmbed, singingEmbed,
  votingEmbed, roundResultEmbed, finalLeaderboardEmbed,
  globalLeaderboardEmbed, errorEmbed, successEmbed,
};
