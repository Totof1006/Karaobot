const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getBeatLine } = require('./beatEngine');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

function parseLRC(content) {
  const lines = [];
  const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  
  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const match = trimmed.match(regex);
    if (!match) continue; 

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const msStr = match[3];
    const ms = msStr.length === 2 ? parseInt(msStr) * 10 : parseInt(msStr);
    
    const text = match[4].trim();
    if (text) {
      lines.push({ timeMs: minutes * 60_000 + seconds * 1_000 + ms, text });
    }
  }

  const sortedLines = lines.sort((a, b) => a.timeMs - b.timeMs);

  // AJOUT : On attache la durée totale directement à l'objet array
  // Cela permet de garder "lines" comme un tableau pour /evenement
  // Tout en ayant accès à .totalDurationMs pour /entrainement
  sortedLines.totalDurationMs = sortedLines.length > 0 
    ? sortedLines[sortedLines.length - 1].timeMs + 2000 
    : 0;

  return sortedLines;
}

function slugify(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
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
  return parseLRC(fs.readFileSync(filePath, 'utf-8'));
}

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
      const nextLine = lines[index + 1];
      const lineDuration = nextLine ? (nextLine.timeMs - line.timeMs) : 5000;
      const lineStart = Date.now();
      const beatPattern = "⬛⬛⬛🟩⬛⬛⬛🟩";

      const updateDisplay = async () => {
        const elapsed = Date.now() - lineStart;
        if (elapsed >= lineDuration) return;

        const rhythmBar = getBeatLine(beatPattern, lineDuration, elapsed);
        const embed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle("🎤 Karaoké en direct")
          .setDescription(`## ${line.text}\n\n${rhythmBar}`)
          .setFooter({ text: "Suivez le curseur 🎙️ pour chanter !" });

        try {
          if (!lyricsMessage) {
            lyricsMessage = await channel.send({ embeds: [embed] });
          } else {
            await lyricsMessage.edit({ embeds: [embed] });
          }
        } catch (e) {
          // Si le message est supprimé (Code 10008), on arrête tout pour cette ligne
          if (e.code === 10008) {
            clearInterval(animInterval);
          }
        }
      };

      await updateDisplay();
      // On passe à 1000ms pour éviter le Rate Limit de Discord
      const animInterval = setInterval(updateDisplay, 1000);
      intervals.push(animInterval);

      setTimeout(() => {
        clearInterval(animInterval);
        const idx = intervals.indexOf(animInterval);
        if (idx > -1) intervals.splice(idx, 1);
      }, lineDuration);

    }, delay);

    timers.push(t);
  });

  const lastLine = lines[lines.length - 1];
  const endDelay = Math.max(0, lastLine.timeMs + 3000 - (Date.now() - startTime));
  timers.push(setTimeout(() => { if (onFinish) onFinish(); }, endDelay));

  return function stop() {
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
  };
}

module.exports = { getLyrics, startLyricsStream, slugify };
