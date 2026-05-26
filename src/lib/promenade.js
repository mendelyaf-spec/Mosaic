// Promenade — the discovery walk.
//
// Flattens foreign threads (KINDRED_THREADS + PERSONAL_THREADS) into a
// browseable item stream and clusters them by courtyard. Items belonging
// to the same courtyard share one spatial "home"; personal-thread items
// each get their own (smaller) home. The result: courtyards have visible
// spatial weight, personal threads sit lighter at the periphery.
//
// Each item carries a `media` object the Thumbnail component can render
// into a rich SVG composite — book cover, waveform, matrix, duotone scene —
// without any raster assets.

import { WM } from '../data/wm-data.js';

// ─── Hash / RNG ────────────────────────────────────────────────────────
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

// ─── Media derivation ──────────────────────────────────────────────────
// Translate the seed data's single-glyph icon + source string into a
// structured `media` object the Thumbnail component can paint. The goal is
// honesty: a book glyph yields a book cover; an audio note yields a waveform.

const PHOTO_SCENES = ['bench', 'kiln', 'medina', 'wayfinding'];
const PARTICIPANT_POOL = ['MR','PK','TV','DM','EF','HO','MD','IG','NA','MT','PL','JR','AL','SM','TR'];

function pickFrom(arr, seed) { return arr[seed % arr.length]; }

function pickHue(seed) {
  // Limit to warm/earth/cool ranges that play with the paper palette.
  const palettes = [18, 28, 32, 40, 78, 160, 190, 200, 230, 260, 340];
  return palettes[seed % palettes.length];
}

function deriveFindMedia(item) {
  const seed = hash(item.id);
  const r = rng(seed);
  const hue = pickHue(seed);
  switch (item.glyph) {
    case '📖':
      return {
        kind: 'book',
        hue,
        title: (item.title || '').slice(0, 28),
        author: (item.source || '').split('—')[0].trim().slice(0, 24) || '—',
        spine: `hsl(${hue}, 35%, ${28 + Math.floor(r()*16)}%)`,
      };
    case '📰':
    case '🌐':
    case '📊':
    case '📄':
    case '💬':
      return { kind: 'article', hue, source: (item.source || 'longread').slice(0, 36) };
    case '▶':
      return {
        kind: 'event-live', hue,
        duration: `${20 + (seed % 40)}:${String(10 + (seed % 50)).padStart(2,'0')}`,
        participants: Array.from({length: 3}, (_,i) => pickFrom(PARTICIPANT_POOL, seed + i*7)),
      };
    case '🎙':
    case '♪': {
      const n = 30;
      const peaks = Array.from({length: n}, (_,i) => 0.25 + Math.abs(Math.sin(seed*0.01 + i*0.6)) * 0.7);
      return {
        kind: 'audio', hue,
        duration: `${1 + (seed % 9)}:${String(seed % 60).padStart(2,'0')}`,
        peaks,
      };
    }
    case '📸':
    case '🎞':
      return { kind: 'photo', hue, scene: pickFrom(PHOTO_SCENES, seed), count: 1 + (seed % 18) };
    case '✎':
      return { kind: 'drawing', hue, scene: 'doorways', count: 4 + (seed % 8) };
    case '◻':
    default:
      // Generic fallback — abstract article hero
      return { kind: 'article', hue, source: (item.source || 'on the promenade').slice(0, 36) };
  }
}

function deriveNoteMedia(item) {
  const seed = hash(item.id);
  const hue = pickHue(seed);
  if (item.noteType === 'audio') {
    const n = 30;
    const peaks = Array.from({length: n}, (_,i) => 0.25 + Math.abs(Math.sin(seed*0.013 + i*0.5)) * 0.72);
    return { kind: 'audio', hue, duration: item.dur || `${1 + (seed % 9)}:${String(seed % 60).padStart(2,'0')}`, peaks };
  }
  if (item.noteType === 'image') {
    return { kind: 'photo', hue, scene: pickFrom(PHOTO_SCENES, seed), count: 1 };
  }
  // text note — no media. The card renders the quote band itself.
  return null;
}

// ─── Item flattening ───────────────────────────────────────────────────
export function getPromenadeItems() {
  const kindred  = WM.KINDRED_THREADS  || [];
  const personal = WM.PERSONAL_THREADS || [];
  const sourceThreads = [...kindred, ...personal];

  const items = [];
  for (const t of sourceThreads) {
    const inCourtyard = !!t.courtyardName;

    for (const f of (t.fl || [])) {
      const base = {
        id: `i-${t.id}-f-${hash(f.t + f.s + f.d)}`,
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
      };
      base.media = deriveFindMedia(base);
      items.push(base);
    }

    for (const n of (t.notesList || [])) {
      const base = {
        id: `i-${t.id}-n-${hash((n.cap || '') + (n.d || ''))}`,
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
      };
      base.media = deriveNoteMedia(base);
      items.push(base);
    }
  }

  // Deterministic shuffle within the list so order is stable.
  items.sort((a, b) => hash(a.id) - hash(b.id));
  return items;
}

// ─── Clustering ────────────────────────────────────────────────────────
// One cluster per courtyardName; one per personal thread. The cluster
// carries its items, a label, a hue (for the soft halo), and a "weight"
// hint that controls how much space it reserves in layout.
export function buildClusters(items) {
  const groups = new Map();
  for (const it of items) {
    const key = it.courtyardName ? `c-${it.courtyardName}` : `p-${it.threadId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        kind: it.inCourtyard ? 'courtyard' : 'personal',
        label: it.inCourtyard
          ? `the ${it.courtyardName} courtyard`
          : `${it.owner}'s personal thread`,
        topic: it.courtyardTopic || it.threadQ,
        owner: it.inCourtyard ? null : it.owner,
        items: [],
        hue: pickHue(hash(key)),
      });
    }
    groups.get(key).items.push(it);
  }
  return Array.from(groups.values());
}

// Lay out cluster homes with rejection sampling against a minimum
// distance. Courtyard clusters reserve more space than personal ones.
export function layoutClusters(clusters, canvasW = 3200, canvasH = 2200) {
  // Courtyards seek the center; personal threads tend toward the edges.
  // We do this by trying centre-biased coords for courtyards and edge-biased
  // coords for personal clusters before falling back to uniform random.
  const r = rng(42);
  const pad = 280;
  const placed = [];
  const homes  = {};

  // Sort: courtyards first (claim the centre), personal after.
  const sorted = [...clusters].sort((a, b) =>
    (a.kind === 'courtyard' ? 0 : 1) - (b.kind === 'courtyard' ? 0 : 1));

  for (const c of sorted) {
    const minDist = c.kind === 'courtyard' ? 880 : 540;
    let tries = 0;
    while (tries < 500) {
      let x, y;
      if (c.kind === 'courtyard') {
        // Bias toward the central two-thirds.
        x = canvasW * 0.18 + r() * canvasW * 0.64;
        y = canvasH * 0.20 + r() * canvasH * 0.60;
      } else {
        // Edge band: 0–25% or 75–100% along at least one axis.
        const edgeAxis = r() > 0.5;
        x = edgeAxis
          ? (r() < 0.5 ? pad + r() * canvasW * 0.20 : canvasW * 0.80 + r() * (canvasW * 0.20 - pad))
          : pad + r() * (canvasW - pad * 2);
        y = edgeAxis
          ? pad + r() * (canvasH - pad * 2)
          : (r() < 0.5 ? pad + r() * canvasH * 0.20 : canvasH * 0.80 + r() * (canvasH * 0.20 - pad));
      }
      const ok = placed.every(p => Math.hypot(p.x - x, p.y - y) > Math.max(minDist, p.minDist));
      if (ok || tries > 480) {
        homes[c.id] = { x, y };
        placed.push({ x, y, minDist });
        break;
      }
      tries++;
    }
  }
  return homes;
}

// Scatter items inside a cluster around its home. Courtyard items get a
// slightly wider ring than personal-thread items.
export function scatterInCluster(cluster, home) {
  const ringIn  = cluster.kind === 'courtyard' ? 160 : 110;
  const ringOut = cluster.kind === 'courtyard' ? 380 : 220;
  return cluster.items.map(it => {
    const r = rng(hash(it.id));
    const angle = r() * Math.PI * 2;
    const radius = ringIn + r() * (ringOut - ringIn);
    return {
      id: it.id,
      x: home.x + Math.cos(angle) * radius,
      y: home.y + Math.sin(angle) * radius,
      rot: (r() - 0.5) * 2.2,
    };
  });
}

// The user's "kindred courtyards" — already-joined.
export function ownCourtyardNames() {
  return new Set(
    (WM.THREADS || []).map(t => t.courtyardName).filter(Boolean)
  );
}
