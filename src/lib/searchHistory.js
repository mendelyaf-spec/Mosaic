// DOS search history — every "Take it down" run is logged here so the user
// can see and reopen past searches without paying again (the full results
// are stored, not just a cache pointer).
//
// Keyed in localStorage under mosaic.searchHistory. Bounded to MAX_ENTRIES,
// newest first. Re-running an identical search (same question + moves +
// time budget + thread context) bumps the existing entry to the top and
// refreshes it rather than adding a duplicate.

import { readStored, writeStored } from './storage.js';

const KEY = 'mosaic.searchHistory';
const MAX_ENTRIES = 50;

function signature({ question, fromThreadId, moveIds, maxTimePerItem }) {
  return JSON.stringify({
    q: (question || '').trim().toLowerCase(),
    from: fromThreadId || null,
    moves: [...(moveIds || [])].sort(),
    t: maxTimePerItem ?? null,
  });
}

export function loadHistory() {
  return readStored(KEY, []);
}

export function recordSearch(rec) {
  const all = loadHistory();
  const sig = signature(rec);
  const filtered = all.filter(r => r.sig !== sig);
  const entry = {
    id: 'h-' + Date.now(),
    sig,
    ts: Date.now(),
    question: rec.question,
    fromThreadId: rec.fromThreadId || null,
    moveIds: rec.moveIds || [],
    maxTimePerItem: rec.maxTimePerItem ?? null,
    characterization: rec.characterization || null,
    items: rec.items || [],          // engine results, keyed implicitly by moveId
    signals: rec.signals || {},
    evolvedQ: rec.evolvedQ || '',
    diffMoves: rec.diffMoves || [],
    savedThreadId: rec.savedThreadId || null,
  };
  const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
  writeStored(KEY, next);
  return entry.id;
}

export function updateHistory(id, patch) {
  if (!id) return;
  const all = loadHistory();
  const idx = all.findIndex(r => r.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch };
  writeStored(KEY, all);
}

export function deleteHistory(id) {
  writeStored(KEY, loadHistory().filter(r => r.id !== id));
}

export function clearHistory() {
  writeStored(KEY, []);
}

export function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}
