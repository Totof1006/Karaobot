const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getBeatLine } = require('./beatEngine');

const LYRICS_DIR = path.join(__dirname, '../lyrics');

function parseLRC(content) {
    const lines = [];
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    
    for (const rawLine of content.split('\n')) {
        const match = rawLine.trim().match(regex);
        if (match) {
            const msStr = match[3];
            const ms = msStr.length === 2 ? parseInt(msStr) * 10 : parseInt(msStr);
            lines.push({ 
                timeMs: parseInt(match[1]) * 60_000 + parseInt(match[2]) * 1_000 + ms, 
                text: match[4].trim() 
            });
        }
    }
    
    const sortedLines = lines.sort((a, b) => a.timeMs - b.timeMs);
    sortedLines.durationMs = sortedLines.length > 0 
        ? sortedLines[sortedLines.length - 1].timeMs + 3000 
        : 0;

    return sortedLines;
}

// --- SECTION SLUGIFY AMÉLIORÉE ---
function slugify(name) {
    const text = (typeof name === 'object' && name !== null) ? name.info : name;
    if (!text || typeof text !== 'string') return 'unknown_song';

    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
        .replace(/[^a-z0-9]+/g, '_')     // Remplacer tout ce qui n'est pas alphanumérique par _
        .replace(/^_|_$/g, '');          // Nettoyer les bords
}

function findLRCFile(songName) {
    if (!fs.existsSync(LYRICS_DIR)) fs.mkdirSync(LYRICS_DIR, { recursive: true });
    
    const slug = slugify(songName);
    const files = fs.readdirSync(LYRICS_DIR);
    
    // 1. Tentative de match exact
    const exactMatch = path.join(LYRICS_DIR, `${slug}.lrc`);
    if (fs.existsSync(exactMatch)) return exactMatch;

    // 2. Recherche intelligente (si le fichier contient le mot-clé du slug)
    // Utile si tu tapes "Orelsan Ailleurs" et que le fichier s'appelle "orelsan_ailleurs_officiel.lrc"
    const smartMatch = files.find(f => slug.includes(f.replace('.lrc', '')) || f.replace('.lrc', '').includes(slug));
    
    return smartMatch ? path.join(LYRICS_DIR, smartMatch) : null;
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
        const delay = line.timeMs; // On se base sur le temps absolu du LRC
        
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
                    if (!lyricsMessage || !lyricsMessage.editable) {
                        lyricsMessage = await channel.send({ embeds: [embed] });
                    } else {
                        await lyricsMessage.edit({ embeds: [embed] }).catch(() => null);
                    }
                } catch (e) {
                    console.error("[Lyrics] Erreur d'affichage :", e.message);
                }
            };

            await updateDisplay();
            // On limite l'intervalle à 1.5s pour éviter d'être banni par Discord pour spam d'éditions
            const animInterval = setInterval(updateDisplay, 1500);
            intervals.push(animInterval);

            setTimeout(() => {
                clearInterval(animInterval);
                const idx = intervals.indexOf(animInterval);
                if (idx > -1) intervals.splice(idx, 1);
            }, lineDuration);

        }, delay);

        timers.push(t);
    });

    // Gestion de la fin
    const lastLine = lines[lines.length - 1];
    const endDelay = lastLine.timeMs + 3000;
    timers.push(setTimeout(() => { if (onFinish) onFinish(); }, endDelay));

    return function stop() {
        timers.forEach(clearTimeout);
        intervals.forEach(clearInterval);
    };
}

module.exports = { getLyrics, startLyricsStream, slugify };
