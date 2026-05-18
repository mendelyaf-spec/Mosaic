// User-created threads — persisted to localStorage, shaped exactly like
// wm-data.js THREADS[i] so the existing Home / Thread / Courtyard renderers
// pick them up with zero special-casing.
//
// getAllThreads() returns user threads first (most recent on top), then the
// seeded Maya threads, so a freshly-saved DOS session lands at the front of
// Home.

import { readStored, writeStored } from './storage.js';
import { WM } from '../data/wm-data.js';

const THREADS_KEY = 'mosaic.threads';

export function loadUserThreads() {
  return readStored(THREADS_KEY, []);
}

export function saveThread(thread) {
  const all = loadUserThreads();
  const idx = all.findIndex(t => t.id === thread.id);
  if (idx >= 0) all[idx] = thread;
  else all.unshift(thread); // newest first
  writeStored(THREADS_KEY, all);
  return thread;
}

export function getAllThreads() {
  return [...loadUserThreads(), ...WM.THREADS];
}

export function getThreadById(id) {
  return getAllThreads().find(t => t.id === id)
      || (WM.KINDRED_THREADS || []).find(t => t.id === id)
      || null;
}

// Map an engine mediaType to the single-glyph icon the design's FindCard
// renders in `find.i`.
function mediaIcon(mediaType) {
  switch (mediaType) {
    case 'video':            return '▶';
    case 'film':             return '🎞';
    case 'podcast':          return '🎙';
    case 'interview':        return '🎙';
    case 'reddit':           return '💬';
    case 'art':              return '◻';
    case 'image':            return '📸';
    case 'classical':        return '♪';
    case 'paper':            return '📄';
    case 'primer':           return '📘';
    case 'book-chapter':     return '📖';
    case 'longform-article': return '📰';
    case 'essay':            return '✎';
    default:                 return '◻';
  }
}

// Pick a domain palette key from the characterization. The design's palette
// keys are teal / purple / green / amber. We map loosely by register so the
// thread has a coherent identity; falls back to a stable hash of the domain.
function pickPalette(characterization) {
  const reg = (characterization?.register || '').toLowerCase();
  if (['reflective', 'grieving'].includes(reg)) return 'purple';
  if (['practical', 'urgent'].includes(reg)) return 'amber';
  if (['aesthetic', 'playful'].includes(reg)) return 'green';
  if (['analytical', 'curious'].includes(reg)) return 'teal';
  const s = (characterization?.domain || 'inquiry');
  const keys = ['teal', 'purple', 'green', 'amber'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
}

// Turn a completed DOS session into a thread in the wm-data shape.
//
//   originalQ        the question the user typed
//   evolvedQ         their re-articulation (may equal originalQ, or be empty)
//   characterization the engine's structural reading
//   moves            the move objects used this session
//   items            the engine items, keyed implicitly by item.moveId
//   signals          { [moveId]: 'moved' | 'dismiss' | null }
//   diffMoves        articulation-diff entries [{label, content}], or []
//
// Mile-markers follow Model B (reframing history). The articulation diff is
// distributed onto the finds the user signalled as "moved" — not as
// standalone notes.
export function buildThreadFromSession({
  originalQ, evolvedQ, characterization, moves, items, signals = {}, diffMoves = [],
}) {
  const ts = Date.now();
  const id = 't-' + ts;
  const orig = (originalQ || '').trim();
  const evolved = (evolvedQ || '').trim();
  const changed = evolved && evolved !== orig;

  const mileMarkers = changed
    ? [
        { id: 'm-0', age: 'just now', q: orig },
        { id: 'm-1', age: 'just now', q: evolved },
      ]
    : [
        { id: 'm-0', age: 'just now', q: orig },
      ];
  const currentMarkerId = mileMarkers[mileMarkers.length - 1].id;

  const diffText = (diffMoves || [])
    .map(d => `${d.label}: ${d.content}`)
    .join('  ·  ');

  const fl = items.map((it, i) => {
    const sig = signals[it.moveId] || null;
    const move = moves.find(m => m.id === it.moveId);
    const find = {
      id: `f-${ts}-${i}`,
      t: it.title || '(untitled)',
      s: it.source || '',
      url: it.url || '',
      i: mediaIcon(it.mediaType),
      d: 'just now',
      // engine-specific extras the renderers ignore but we use:
      moveId: it.moveId,
      moveLabel: move?.label || it.moveId,
      markerId: currentMarkerId,
      mediaType: it.mediaType,
      estimatedMinutes: it.estimatedMinutes,
      signal: sig,
    };
    // Note appended ONLY to finds the user said moved them. It carries the
    // slice of the articulation diff this find is responsible for.
    if (sig === 'moved') {
      find.note = diffText
        ? `This moved me. ${diffText}`
        : 'This moved me.';
    }
    return find;
  });

  return {
    id,
    q: changed ? evolved : orig,
    domain: characterization?.domain || 'inquiry',
    dc: pickPalette(characterization),
    state: 'active',
    age: 'just now',
    last: 'just now',
    finds: fl.length,
    notes: fl.filter(f => f.note).length,
    mileMarkers,
    fl,
    notesList: [],
    kindred: [],
    courtyardName: null,
    courtyardTopic: null,
    _userCreated: true,
  };
}
