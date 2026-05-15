// Tiny localStorage shim. JSON-encodes values. Returns `def` if missing or
// parse fails. Safe to call before mount; SSR-safe (returns def in non-browser).
//
// Keys we use today:
//   mosaic.responseCache.v1   — engine response cache (set by lib/cache.js)
//   mosaic.moves              — user-coined moves + community moves cache
//   mosaic.userPrefs          — selectedMoves, maxTimePerItem, etc.
//
// When we move to Supabase later, this is the seam to replace.

const inBrowser = typeof window !== 'undefined' && !!window.localStorage;

export function readStored(key, def = null) {
  if (!inBrowser) return def;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return def;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`storage read failed for "${key}":`, e);
    return def;
  }
}

export function writeStored(key, value) {
  if (!inBrowser) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`storage write failed for "${key}":`, e);
  }
}

export function removeStored(key) {
  if (!inBrowser) return;
  try { window.localStorage.removeItem(key); } catch (e) {}
}
