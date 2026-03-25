/**
 * Génère la ligne de rythme avec le curseur qui avance
 * @param {string} pattern - Le motif (ex: "⬛⬛🟩⬛⬛🟩")
 * @param {number} totalDuration - Durée totale de la ligne en ms
 * @param {number} elapsed - Temps écoulé en ms
 * @returns {string} - La ligne formatée avec le curseur 🎙️
 */
function getBeatLine(pattern, totalDuration, elapsed) {
    const chars = Array.from(pattern); // Gère les emojis correctement
    const progress = elapsed / totalDuration;
    const currentIndex = Math.floor(progress * chars.length);

    return chars.map((char, index) => {
        if (index === currentIndex) return '🎙️'; // Curseur actuel
        return char;
    }).join('');
}

module.exports = { getBeatLine };
