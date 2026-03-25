/**
 * Génère la ligne de rythme avec le curseur qui avance.
 * @param {string} pattern - Le motif (ex: "⬛⬛⬛🟩")
 * @param {number} totalDuration - Durée de la ligne en ms
 * @param {number} elapsed - Temps écoulé en ms
 * @returns {string} - La ligne formatée
 */
function getBeatLine(pattern, totalDuration, elapsed) {
    if (!pattern || totalDuration <= 0) return "🎶";

    // On transforme le pattern en tableau pour gérer les emojis (2 caractères en mémoire)
    const chars = Array.from(pattern);
    
    // On s'assure que le progrès reste entre 0 et 0.99 pour ne pas dépasser l'index du tableau
    const progress = Math.max(0, Math.min(elapsed / totalDuration, 0.99));
    const currentIndex = Math.floor(progress * chars.length);

    return chars.map((char, index) => {
        // Si c'est l'index actuel, on affiche le micro, sinon on garde le carré
        return (index === currentIndex) ? '🎙️' : char;
    }).join('');
}

module.exports = { getBeatLine };
