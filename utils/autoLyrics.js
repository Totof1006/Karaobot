const fs   = require('fs');
const path = require('path');
const { slugify }               = require('./lyricsSync');
const { LYRICS_FETCH_TIMEOUT_MS } = require('./constants');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

/**
 * Nettoie le titre pour une meilleure recherche (enlève (Official Video), etc.)
 */
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\(.*\)|\[.*\]/g, '') // Enlève tout ce qui est entre parenthèses ou crochets
    .replace(/official video|lyric video|clip officiel/gi, '') // Enlève les mots clés courants
    .trim();
}

/**
 * Tente de télécharger les paroles d'une chanson depuis lrclib.net.
 */
async function autoFetchLyrics(songInput) {
  // 1. On adapte le parser au nouveau format "Titre + Artiste"
  let titre   = songInput.trim();
  let artiste = null;

  if (songInput.includes('+')) {
    const parts = songInput.split('+');
    titre   = cleanText(parts[0]);
    artiste = cleanText(parts[1]);
  } else {
    // Gestion de l'ancien format au cas où
    const separators = [' — ', ' - ', ' – '];
    for (const sep of separators) {
      if (songInput.includes(sep)) {
        const parts = songInput.split(sep);
        titre   = cleanText(parts[0]);
        artiste = cleanText(parts[1]);
        break;
      }
    }
  }

  // Vérifier si le fichier existe déjà
  const slug     = slugify(titre);
  const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);
  if (fs.existsSync(filePath)) {
    return { ok: true, synced: true, lines: 0, file: `${slug}.lrc`, already: true };
  }

  try {
    // 2. Construction de la requête URL
    const queryParams = new URLSearchParams();
    queryParams.set('track_name', titre);
    if (artiste) queryParams.set('artist_name', artiste);

    const res = await fetch(`https://lrclib.net/api/get?${queryParams}`, {
      headers : { 'User-Agent': 'KaraokeDiscordBot/1.0' },
      signal  : AbortSignal.timeout(LYRICS_FETCH_TIMEOUT_MS),
    });

    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (!res.ok)            return { ok: false, reason: `http_${res.status}` };

    const data = await res.json();
    const lrcContent = data.syncedLyrics || data.plainLyrics;
    if (!lrcContent)  return { ok: false, reason: 'no_content' };

    const isSynced = !!data.syncedLyrics;

    // 3. Construction du fichier LRC
    const header = [
      `[ti:${data.trackName  || titre}]`,
      `[ar:${data.artistName || artiste || ''}]`,
      data.albumName ? `[al:${data.albumName}]` : null,
      '',
    ].filter(l => l !== null).join('\n');

    let finalContent;
    if (isSynced) {
      finalContent = header + lrcContent;
    } else {
      const lines    = lrcContent.split('\n').filter(l => l.trim());
      let   timeMs   = 0;
      const lrcLines = lines.map(line => {
        const mm = String(Math.floor(timeMs / 60000)).padStart(2, '0');
        const ss = String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0');
        const cs = String(Math.floor((timeMs % 1000) / 10)).padStart(2, '0');
        timeMs  += 3000;
        return `[${mm}:${ss}.${cs}] ${line}`;
      });
      finalContent = header + lrcLines.join('\n');
    }

    if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });
    fs.writeFileSync(filePath, finalContent, 'utf-8');

    const lineCount = (lrcContent.match(/\n/g) || []).length + 1;
    return { ok: true, synced: isSynced, lines: lineCount, file: `${slug}.lrc`, already: false };

  } catch (err) {
    console.error(`[Lyrics] Erreur pour ${titre}:`, err.message);
    return { ok: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

/**
 * Supprime les fichiers .lrc correspondant à une liste de chansons.
 */
function deleteSongFiles(songs) {
  const deleted = [];
  for (const song of songs) {
    const rawTitle = typeof song === 'string' ? song : (song.title || '');
    // Nettoyage pour trouver le slug
    const titre    = rawTitle.split(/\+/)[0].trim();
    const slug     = slugify(titre);
    const fp       = path.join(LYRICS_DIR, `${slug}.lrc`);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      deleted.push(`${slug}.lrc`);
    }
  }
  return deleted;
}

module.exports = { autoFetchLyrics, deleteSongFiles };
