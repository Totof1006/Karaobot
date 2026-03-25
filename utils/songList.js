const fs   = require('fs');
const path = require('path');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

// Retourne la liste des chansons disponibles (avec fichier .lrc)
// sous forme [{ slug, title }]
function getAvailableSongs() {
  if (!fs.existsSync(LYRICS_DIR)) return [];

  return fs.readdirSync(LYRICS_DIR)
    .filter(f => f.endsWith('.lrc'))
    .map(f => {
      const slug  = f.replace('.lrc', '');
      // Reconvertir slug en titre lisible : bohemian_rhapsody → Bohemian Rhapsody
      const title = slug
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return { slug, title, file: f };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Vérifie si une chanson saisie a un .lrc correspondant
function hasSongFile(songName) {
  const slug     = songName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return fs.existsSync(path.join(LYRICS_DIR, `${slug}.lrc`));
}

module.exports = { getAvailableSongs };
