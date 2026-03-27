/**
 * Génère la ligne de rythme avec le curseur qui avance.
 * @param {string} pattern - Le motif (ex: "⬛⬛⬛🟩")
 * @param {number} totalDuration - Durée de la ligne en ms
 * @param {number} elapsed - Temps écoulé en ms
 * @returns {string} - La ligne formatée
 */
function getBeatLine(pattern, totalDuration, elapsed) {
    if (!pattern || totalDuration <= 0) return "🎶";

    const chars = Array.from(pattern);
    const progress = Math.max(0, Math.min(elapsed / totalDuration, 0.99));
    const currentIndex = Math.floor(progress * chars.length);

    // On crée la ligne en remplaçant la position actuelle
    // ASTUCE : On peut ajouter un espace invisible ou un indicateur de rythme
    return chars.map((char, index) => {
        if (index === currentIndex) {
            // Option A : Remplacer par le micro (ton code actuel, très clair)
            return '🎙️'; 
            
            // Option B : Si tu veux garder la couleur visible (ex: 🎤)
            // return '🎤'; 
        }
        return char;
    }).join('');
}

module.exports = { getBeatLine };
