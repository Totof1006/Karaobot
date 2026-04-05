// ... (tes imports restent identiques)

async function startBreakThenSing(interaction, session, isFirst) {
  const guild    = interaction.guild;
  const channel  = interaction.channel;
  const singer   = getCurrentSinger(session);
  const isFirstSinger = session.currentSingerIndex === 0;

  // 1. GESTION DE L'INTERACTION (Flag 64 / update)
  if (isFirst && interaction.isButton()) {
    // ✅ On acquitte l'interaction immédiatement. 
    // Si c'est l'hôte qui lance, on met à jour son message pour éviter le "L'interaction a échoué"
    await interaction.update({ 
      content: "✅ Session démarrée !", 
      embeds: [], 
      components: [] 
    }).catch(() => null);
  }

  const voiceChannel = await findVoiceChannel(guild);
  const singerIds    = session.players.map(p => p.userId);
  if (voiceChannel) await unmuteSingersOnly(guild, voiceChannel, singerIds);

  // 2. ÉPINGLAGE DU MESSAGE DE PROGRESSION
  if (isFirstSinger) {
    // ... (ton code d'ordre de passage)
    const progressMsg = await channel.send({ embeds: [buildProgressEmbed(session)] });
    
    // ✅ Sécurité : Essayer d'épingler, mais ne pas crash si le salon est plein (50 pins)
    try {
      await progressMsg.pin();
    } catch (e) {
      await channel.send({ 
        content: "⚠️ Impossible d'épingler le message de progression (limite de 50 atteinte).",
        flags: 64 // ✅ Privé pour ne pas polluer
      });
    }
    session.progressMessageId = progressMsg.id;
  }

  // ... (Logique des countdowns)
}

/**
 * Démarre le tour d'un chanteur
 */
async function startSingerTurn(ctx, session) {
  const singer  = getCurrentSinger(session);
  const guild   = ctx.guild;
  const channel = ctx.channel;

  // 3. SÉCURITÉ : VÉRIFICATION DU CHANTEUR
  const singerMember = await guild.members.fetch(singer.userId).catch(() => null);
  if (!singerMember) {
    await channel.send({
      content: `⚠️ Le chanteur **${singer.username}** est introuvable. passage au suivant...`,
      // ✅ Pas besoin de flag 64 ici car c'est une annonce publique de skip
    });
    // ... (logique advanceToNextSinger)
    return;
  }

  const song = pickRandomSong(session);
  if (!song) {
    // ✅ ERREUR CRITIQUE : Envoyer un message d'erreur visible par l'hôte
    return channel.send({ 
        embeds: [errorEmbed('Aucune chanson trouvée pour ce joueur.')],
        flags: 64 
    });
  }

  // 4. RÉPONSE AUX BOUTONS DE VOTE (Le point le plus sensible)
  // Note : La gestion des clics de vote se fait dans interactionCreate.js,
  // mais ici on s'assure que le message de vote est bien envoyé.
  const voteMsg = await channel.send({ 
    embeds: [singingEmbed(singer, getSongTitle(song), true)], 
    components: [endSongButton()] 
  });
  session.voteMessage = voteMsg; // Pour pouvoir retirer les boutons plus tard
}

/**
 * Révéler les résultats
 */
async function revealResults(ctx, session) {
  const channel = ctx.channel || ctx;
  const guild   = ctx.guild;
  session.phase = 'results';

  // ✅ NETTOYAGE DES BOUTONS PRÉCÉDENTS
  if (session.voteMessage) {
    await session.voteMessage.edit({ components: [] }).catch(() => null);
  }

  computeRoundScore(session);
  const lastResult = session.roundResults[session.roundResults.length - 1];

  // ✅ ENVOI DU CLASSEMENT DU TOUR
  await channel.send({
    embeds: [roundResultEmbed(lastResult)],
    components: [nextSingerButton()],
  });
}
