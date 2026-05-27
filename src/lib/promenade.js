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

export function deriveFindMedia(item) {
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

export function deriveNoteMedia(item) {
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

// ─── Splitting items into courtyards + loose singletons ───────────────
// Only items whose source thread sits in a courtyard get clustered.
// Personal-thread items each become a standalone card in the field —
// no cluster, no halo, no label. The owner stays on each card so
// identity isn't lost.
//
// Courtyards are capped to a small number of items (3–5, varied per
// courtyard by stable hash) so each cluster reads as a constellation,
// not a pile. Items kept per courtyard are picked deterministically to
// favour variety of media kind and a mix of owners.
const MAX_PER_COURTYARD_LO = 3;
const MAX_PER_COURTYARD_HI = 5;

function pickRepresentatives(items, n) {
  // Diversify by kind + owner. We rotate through (kind, owner) buckets
  // and take the first item from each bucket until we have n items.
  const buckets = new Map();
  for (const it of items) {
    const key = `${it.kind}|${it.owner}|${it.media?.kind || 'plain'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const keys = Array.from(buckets.keys());
  // Stable order across keys based on hash of the key string.
  keys.sort((a, b) => hash(a) - hash(b));
  const out = [];
  let cursor = 0;
  while (out.length < n && keys.length > 0) {
    const k = keys[cursor % keys.length];
    const bucket = buckets.get(k);
    if (bucket && bucket.length) {
      out.push(bucket.shift());
      cursor++;
    } else {
      keys.splice(cursor % keys.length, 1);
    }
    if (keys.length === 0) break;
  }
  return out;
}

export function buildClusters(items) {
  const grouped = new Map();
  const loose   = [];
  for (const it of items) {
    if (it.courtyardName) {
      const key = `c-${it.courtyardName}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          kind: 'courtyard',
          name: it.courtyardName,
          label: `the ${it.courtyardName} courtyard`,
          topic: it.courtyardTopic || '',
          items: [],
          hue: pickHue(hash(key)),
        });
      }
      grouped.get(key).items.push(it);
    } else {
      loose.push(it);
    }
  }

  // Cap each courtyard to a stable 3–5 representative items.
  const clusters = Array.from(grouped.values()).map(c => {
    const span = MAX_PER_COURTYARD_HI - MAX_PER_COURTYARD_LO + 1;
    const n = MAX_PER_COURTYARD_LO + (hash(c.id) % span);
    return { ...c, items: pickRepresentatives(c.items, n) };
  });

  return { clusters, loose };
}

// Layout constants — all in canvas pixels.
//
// A card is ~260 wide × 250 tall; half-diagonal ≈ 180. CARD_R is the
// "personal space" radius — two cards never sit closer than 2·CARD_R.
//
// A courtyard label sits at the home and is ~320 × 90; we keep cards
// out of an inner band (LABEL_KEEPOUT) so the name stays uncovered.
// Cards in the ring then sit between RING_IN and RING_OUT.
const CARD_R         = 220;
const LABEL_KEEPOUT  = 340;   // no cards within this radius of a courtyard home
const RING_IN        = LABEL_KEEPOUT;
const RING_OUT       = 480;
const CLUSTER_R      = RING_OUT + CARD_R; // outer reach of a courtyard cluster

// Lay out cluster homes and loose-card positions in a single pass with
// rejection sampling. Courtyards (tighter clusters of 3–5) seek the
// centre; loose cards drift in the surrounding field, well-separated.
export function layoutCards({ clusters, loose }, canvasW = 4000, canvasH = 2700) {
  const r = rng(42);
  const pad = 280;
  // placed[] tracks every reserved spot: cluster homes and loose-card
  // centres. `radius` is how far other things must stay away from this
  // centre. We never let any two reserved circles overlap.
  const placed = [];
  const homes  = {};
  const positions = new Map();

  const reserve = (x, y, radius) => placed.push({ x, y, radius });
  const clearOf = (x, y, radius) =>
    placed.every(p => Math.hypot(p.x - x, p.y - y) > p.radius + radius);

  // 1) place each courtyard home in the central two-thirds, then scatter
  //    its items in a ring outside the label keepout. Each home reserves
  //    CLUSTER_R so loose cards can't enter the ring.
  const courtyardsByHash = [...clusters].sort((a, b) => hash(a.id) - hash(b.id));
  for (const c of courtyardsByHash) {
    let tries = 0;
    while (tries < 600) {
      const x = canvasW * 0.18 + r() * canvasW * 0.64;
      const y = canvasH * 0.20 + r() * canvasH * 0.60;
      if (clearOf(x, y, CLUSTER_R) || tries > 580) {
        homes[c.id] = { x, y };
        reserve(x, y, CLUSTER_R);
        // Scatter items around the ring, angularly spaced so they don't
        // pile on top of each other.
        c.items.forEach((it, i) => {
          const ir = rng(hash(it.id));
          const baseAngle = (i / c.items.length) * Math.PI * 2;
          const angle = baseAngle + (ir() - 0.5) * 0.7;
          const radius = RING_IN + ir() * (RING_OUT - RING_IN);
          const cx = x + Math.cos(angle) * radius;
          const cy = y + Math.sin(angle) * radius;
          positions.set(it.id, {
            id: it.id, x: cx, y: cy,
            rot: (ir() - 0.5) * 1.8,
          });
        });
        break;
      }
      tries++;
    }
  }

  // 2) drop loose cards anywhere clear of every reserved circle.
  //    Each loose card itself reserves CARD_R so the next one keeps its
  //    distance.
  for (const it of loose) {
    const ir = rng(hash(it.id));
    let tries = 0;
    while (tries < 500) {
      const x = pad + r() * (canvasW - pad * 2);
      const y = pad + r() * (canvasH - pad * 2);
      if (clearOf(x, y, CARD_R) || tries > 480) {
        positions.set(it.id, {
          id: it.id, x, y,
          rot: (ir() - 0.5) * 2.6,
        });
        reserve(x, y, CARD_R);
        break;
      }
      tries++;
    }
  }

  return { positions, homes };
}

// The user's "kindred courtyards" — already-joined.
export function ownCourtyardNames() {
  return new Set(
    (WM.THREADS || []).map(t => t.courtyardName).filter(Boolean)
  );
}
