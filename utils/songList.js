const fs   = require('fs');
const path = require('path');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

// 1. Retourne la liste des chansons disponibles (fichiers .lrc)
function getAvailableSongs() {
    if (!fs.existsSync(LYRICS_DIR)) return [];

    return fs.readdirSync(LYRICS_DIR)
        .filter(f => f.endsWith('.lrc'))
        .map(f => {
            const slug  = f.replace('.lrc', '');
            const title = slug
                .split('_')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
            return { slug, title, file: f };
        })
        .sort((a, b) => a.title.localeCompare(b.title));
}

// 2. NOUVEAU : Fonction getLyrics (Celle qui manquait !)
// Elle lit le fichier .lrc et calcule sa durée pour la comparaison
function getLyrics(songName) {
    if (!songName) return null;

    // Génération du slug pour trouver le fichier (ex: "Ailleurs Orelsan" -> "ailleurs_orelsan.lrc")
    const slug = songName
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

    const filePath = path.join(LYRICS_DIR, `${slug}.lrc`);

    if (!fs.existsSync(filePath)) return null;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Extraction du dernier horodatage pour calculer la durée totale
        let lastTimeMs = 0;
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        for (let i = lines.length - 1; i >= 0; i--) {
            const match = lines[i].match(timeRegex);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms  = parseInt(match[3].padEnd(3, '0'));
                lastTimeMs = (min * 60 * 1000) + (sec * 1000) + ms;
                break;
            }
        }

        return {
            content: content,
            durationMs: lastTimeMs
        };
    } catch (err) {
        console.error(`[songList] Erreur lecture ${slug}:`, err.message);
        return null;
    }
}

// 3. Vérifie si une chanson saisie a un .lrc correspondant
function hasSongFile(songName) {
    if (!songName) return false;
    const slug = songName
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    return fs.existsSync(path.join(LYRICS_DIR, `${slug}.lrc`));
}

// TRÈS IMPORTANT : Export de toutes les fonctions
module.exports = { 
    getAvailableSongs, 
    getLyrics, 
    hasSongFile 
};
