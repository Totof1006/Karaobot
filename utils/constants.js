/**
 * constants.js — Constantes partagées du bot Karaobot
 * Source unique de vérité pour les valeurs utilisées dans plusieurs modules.
 */

// ─── Session ──────────────────────────────────────────────────────────────────
const MAX_SINGERS           = 8;          // Chanteurs max par session
const BREAK_DURATION_MS     = 90_000;     // Durée de la pause entre chanteurs (ms)
const VOTE_DURATION_MS      = 30_000;     // Durée de la fenêtre de vote (ms)
const MAX_REMATCHES         = 2;          // Revanches max (3 tours au total)
const REMINDER_WINDOW_MS    = 24 * 60 * 60 * 1_000; // Fenêtre de rappel avant fermeture (24h)

// ─── Audio ────────────────────────────────────────────────────────────────────
const APPLAUSE_FILE     = 'applause.mp3';
const AUDIO_CONNECT_TIMEOUT_MS = 5_000;
const LYRICS_FETCH_TIMEOUT_MS  = 8_000;

module.exports = {
  MAX_SINGERS, BREAK_DURATION_MS, VOTE_DURATION_MS, MAX_REMATCHES,
  REMINDER_WINDOW_MS,
  APPLAUSE_FILE, AUDIO_CONNECT_TIMEOUT_MS, LYRICS_FETCH_TIMEOUT_MS,
};
