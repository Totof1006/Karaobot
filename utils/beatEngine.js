/**
 * Génère la ligne de rythme avec le curseur qui avance.
 * @param {string} pattern - Le motif (ex: "⬛⬛⬛🟩")
 * @param {number} totalDuration - Durée de la ligne en ms
 * @param {number} elapsed - Temps écoulé en ms
 * @returns {string} - La ligne formatée
 */
function getBeatLine(pattern, totalDuration, elapsed) {
    // Sécurité de base
    if (!pattern || totalDuration <= 0) return "🎶";

    // Conversion en tableau pour gérer les émojis multi-octets (ex: 🟩)
    const chars = Array.from(pattern);
    const len = chars.length;

    // Calcul de l'index actuel (0 à len - 1)
    // On utilise Math.min pour éviter que le curseur ne sorte de la ligne à la fin
    const progress = elapsed / totalDuration;
    let currentIndex = Math.floor(progress * len);
    
    if (currentIndex >= len) currentIndex = len - 1;
    if (currentIndex < 0) currentIndex = 0;

    // Construction de la ligne
    return chars.map((char, index) => {
        if (index === currentIndex) {
            // On utilise le micro pour marquer la position actuelle
            return '🎙️'; 
        }
        
        // On garde les carrés originaux pour le reste de la ligne
        return char;
    }).join('');
}

module.exports = { getBeatLine };
