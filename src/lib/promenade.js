// Promenade — the discovery walk.
//
// Flattens the foreign threads (KINDRED_THREADS + PERSONAL_THREADS) into a
// browseable item stream. Maya's own things never appear here; the promenade
// is for finding what's out there.
//
// Each item carries enough lineage to drive the five response actions:
//   - ask to join the courtyard (only when the source thread sits in one)
//   - request to merge (when there's no courtyard to join)
//   - reach out to schedule an event
//   - save the item to a thread
//   - spawn a new thread from it
//
// A deterministic scatter assigns each item a stable canvas position so the
// wander view doesn't reshuffle on re-render.

import { WM } from '../data/wm-data.js';

// Hash a string → 32-bit unsigned int. Used to seed positions and shuffle.
function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

// Build the full item set from foreign threads.
// Maya's own threads (WM.THREADS) are excluded — the promenade is discovery.
export function getPromenadeItems() {
  const kindred  = WM.KINDRED_THREADS  || [];
  const personal = WM.PERSONAL_THREADS || [];
  const sourceThreads = [...kindred, ...personal];

  const items = [];
  for (const t of sourceThreads) {
    const inCourtyard = !!t.courtyardName;

    for (const f of (t.fl || [])) {
      const id = `i-${t.id}-f-${hash(f.t + f.s + f.d)}`;
      items.push({
        id,
        kind: 'find',
        title: f.t,
        source: f.s || '',
        url: f.url || '',
        glyph: f.i || '◻',
        age:   f.d || '',
        note:  f.note || '',
        owner: t.owner,
        threadId: t.id,
        threadQ: t.q,
        domain: t.domain,
        dc: t.dc,
        courtyardName:  t.courtyardName  || null,
        courtyardTopic: t.courtyardTopic || null,
        inCourtyard,
        sharedWith: f.sharedWith || null,
      });
    }

    for (const n of (t.notesList || [])) {
      const id = `i-${t.id}-n-${hash((n.cap || '') + (n.d || ''))}`;
      items.push({
        id,
        kind: 'note',
        title: n.cap,
        source: '',
        url: '',
        glyph: n.type === 'audio' ? '🎙' : n.type === 'image' ? '📸' : '✎',
        age:   n.d || '',
        noteType: n.type,
        dur:   n.dur || null,
        owner: t.owner,
        threadId: t.id,
        threadQ: t.q,
        domain: t.domain,
        dc: t.dc,
        courtyardName:  t.courtyardName  || null,
        courtyardTopic: t.courtyardTopic || null,
        inCourtyard,
        sharedWith: n.sharedWith || null,
      });
    }
  }

  // Deterministic shuffle so order feels open but stable across mounts.
  const seeded = items.map(it => ({ it, k: hash(it.id) }));
  seeded.sort((a, b) => a.k - b.k);
  return seeded.map(s => s.it);
}

// Spread items across a 2400x1800 canvas. Rough grid with per-item jitter so
// the wander surface feels organic but stays legible. Stable per item id.
//
// We aim for a centre-weighted spread: a tighter cluster in the middle, with
// the field thinning toward the edges. The user can pan/zoom from there.
export function scatterPositions(items, { canvasW = 2400, canvasH = 1800, cols = 7 } = {}) {
  const colW = canvasW / cols;
  const rows = Math.max(3, Math.ceil(items.length / cols));
  const rowH = canvasH / rows;

  return items.map((it, i) => {
    const r = rng(hash(it.id));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const baseX = colW * (col + 0.5);
    const baseY = rowH * (row + 0.5);
    // Jitter ±35% of the cell, capped so cards don't collide too hard.
    const jx = (r() - 0.5) * colW * 0.7;
    const jy = (r() - 0.5) * rowH * 0.7;
    return { id: it.id, x: baseX + jx, y: baseY + jy };
  });
}

// The user's "kindred courtyards" — the courtyards they're already in. We
// derive this from Maya's own threads (WM.THREADS): each one carries a
// courtyardName. If an item's source thread sits in one of those, Maya is
// already a member and "join" makes no sense.
export function ownCourtyardNames() {
  return new Set(
    (WM.THREADS || [])
      .map(t => t.courtyardName)
      .filter(Boolean)
  );
}
