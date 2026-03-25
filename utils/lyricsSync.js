const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getBeatLine } = require('./beatEngine'); // Assure-toi que ce fichier existe dans /utils

const LYRICS_DIR = path.join(__dirname, '../lyrics');

function parseLRC(content) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const rawLine of content.split('\n')) {
    const match = rawLine.trim().match(regex);
    if (!match) continue;
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const ms      = match[3].length === 2
      ? parseInt(match[3]) * 10
      : parseInt(match[3]);
    const text = match[4].trim();
    lines.push({ timeMs: minutes * 60_000 + seconds * 1_000 + ms, text });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function findLRCFile(songName) {
  if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });
  const slug = slugify(songName);
  const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);
  return fs.existsSync(filePath) ? filePath : null;
}

function getLyrics(songName) {
  const filePath = findLRCFile(songName);
  if (!filePath) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseLRC(content);
}

// ─── Diffuseur de paroles avec Rythme ───
function startLyricsStream(channel, lines, onFinish) {
  if (!lines || lines.length === 0) return () => {};

  const timers = [];
  const intervals = [];
  const startTime = Date.now();
  let lyricsMessage = null;

  lines.forEach((line, index) => {
    const delay = line.timeMs - (Date.now() - startTime);
    if (delay < 0) return;

    const t = setTimeout(async () => {
      // On définit la durée de la ligne (jusqu'à la suivante ou 5s)
      const nextLine = lines[index + 1];
      const lineDuration = nextLine ? (nextLine.timeMs - line.timeMs) : 5000;
      const lineStart = Date.now();
      const beatPattern = "⬛⬛⬛🟩⬛⬛⬛🟩";

      const updateDisplay = async () => {
        const elapsed = Date.now() - lineStart;
        // On arrête l'animation si on dépasse la durée
        if (elapsed >= lineDuration) return;

        const rhythmBar = getBeatLine(beatPattern, lineDuration, elapsed);
        
        const embed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle("🎤 Karaoké en cours...")
          .setDescription(`## ${line.text}\n\n${rhythmBar}`)
          .setFooter({ text: "Suivez le curseur 🎙️ pour le rythme !" });

        try {
          if (!lyricsMessage) {
            lyricsMessage = await channel.send({ embeds: [embed] });
          } else {
            await lyricsMessage.edit({ embeds: [embed] });
          }
        } catch (e) {
          if (!e.message?.includes('Unknown Message')) {
            console.warn('[Lyrics] Edit échoué :', e.message);
          }
        }
      };

      // Premier affichage de la ligne
      await updateDisplay();

      // Animation du rythme (800ms pour éviter le rate-limit Discord)
      const animInterval = setInterval(updateDisplay, 800);
      intervals.push(animInterval);

      // Nettoyage de l'intervalle à la fin de la ligne
      setTimeout(() => {
        clearInterval(animInterval);
        const idx = intervals.indexOf(animInterval);
        if (idx > -1) intervals.splice(idx, 1);
      }, lineDuration);

    }, delay);

    timers.push(t);
  });

  // Fin de la chanson
  const lastLine = lines[lines.length - 1];
  const endDelay = Math.max(0, lastLine.timeMs + 3000 - (Date.now() - startTime));
  const endTimer = setTimeout(() => {
    if (onFinish) onFinish();
  }, endDelay);
  timers.push(endTimer);

  // Retourne la fonction de stop
  return function stop() {
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
  };
}

module.exports = { getLyrics, startLyricsStream, slugify };
