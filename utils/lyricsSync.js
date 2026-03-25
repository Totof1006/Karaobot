const fs = require('fs');
const path = require('path');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

// ─── Parser LRC ──────────────────────────────────────────────────────────────
// Format LRC :
//   [mm:ss.xx] Texte de la ligne
//   [00:12.50] 🎵 Premier couplet...
//
function parseLRC(content) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const rawLine of content.split('\n')) {
    const match = rawLine.trim().match(regex);
    if (!match) continue;
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const ms      = match[3].length === 2
      ? parseInt(match[3]) * 10   // centisecondes → ms
      : parseInt(match[3]);       // millisecondes
    const text = match[4].trim();
    lines.push({ timeMs: minutes * 60_000 + seconds * 1_000 + ms, text });
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

// ─── Chercher le fichier LRC ──────────────────────────────────────────────────
// Normalise le nom de chanson en nom de fichier :
//   "Bohemian Rhapsody" → "bohemian_rhapsody.lrc"
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprime accents
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

// ─── Diffuseur de paroles ─────────────────────────────────────────────────────
// Envoie chaque ligne au bon moment dans le channel Discord.
// Retourne une fonction stop() pour annuler proprement.
function startLyricsStream(channel, lines, onFinish) {
  if (!lines || lines.length === 0) return () => {};

  const timers = [];
  const startTime = Date.now();

  for (const line of lines) {
    if (!line.text) continue; // ignorer les lignes vides

    const delay = line.timeMs - (Date.now() - startTime);
    if (delay < 0) continue; // déjà passé

    const t = setTimeout(async () => {
      try {
        await channel.send({
          content: `🎵 ${line.text}`,
          allowedMentions: { parse: [] }, // pas de @mentions accidentelles
        });
      } catch (e) {
        // Ignoré : le salon peut avoir été supprimé entre-temps
        if (!e.message?.includes('Unknown Channel')) {
          console.warn('[Paroles] Envoi ligne échoué :', e.message);
        }
      }
    }, delay);

    timers.push(t);
  }

  // Callback quand toutes les paroles sont passées
  if (lines.length > 0) {
    const lastTime  = lines[lines.length - 1].timeMs + 3_000;
    const endDelay  = Math.max(0, lastTime - (Date.now() - startTime));
    const endTimer  = setTimeout(() => {
      if (onFinish) onFinish();
    }, endDelay);
    timers.push(endTimer);
  }

  // Retourne une fonction pour tout arrêter
  return function stop() {
    timers.forEach(t => clearTimeout(t));
  };
}

module.exports = { getLyrics, startLyricsStream, slugify };
