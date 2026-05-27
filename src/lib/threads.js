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
const HIDDEN_KEY  = 'mosaic.hiddenThreads';
const LAYOUT_KEY  = 'mosaic.threadLayouts.v1';

export function loadUserThreads() {
  return readStored(THREADS_KEY, []);
}

function loadHiddenIds() {
  return new Set(readStored(HIDDEN_KEY, []));
}

// Remove a thread from Home. User-created threads (saved DOS sessions,
// spawned threads, or seed threads that have user copies overriding
// them) are dropped from storage entirely. Seeded Maya threads can't be
// removed from source, so we persist a hidden-ids set instead; the
// reader functions filter against it.
export function deleteThread(id) {
  if (!id) return false;
  const user = loadUserThreads();
  if (user.some(t => t.id === id)) {
    writeStored(THREADS_KEY, user.filter(t => t.id !== id));
  }
  if (WM.THREADS.some(t => t.id === id)) {
    const hidden = readStored(HIDDEN_KEY, []);
    if (!hidden.includes(id)) writeStored(HIDDEN_KEY, [...hidden, id]);
  }
  return true;
}

// Bring a previously-hidden seeded thread back. Has no effect on
// user-created threads (those are gone for good once deleteThread runs).
export function restoreThread(id) {
  const hidden = readStored(HIDDEN_KEY, []);
  if (!hidden.includes(id)) return false;
  writeStored(HIDDEN_KEY, hidden.filter(h => h !== id));
  return true;
}

// Per-thread card-position overrides for the Thread spatial view. Maya
// can rearrange her cards in edit mode and lock them; the result is
// stored as { [cardKey]: { x, y } } in canvas coordinates. Anything
// without an override falls back to the orbital default at render time.
export function loadThreadLayout(threadId) {
  if (!threadId) return {};
  const all = readStored(LAYOUT_KEY, {});
  return all[threadId] || {};
}

export function saveThreadLayout(threadId, layout) {
  if (!threadId) return;
  const all = readStored(LAYOUT_KEY, {});
  all[threadId] = layout || {};
  writeStored(LAYOUT_KEY, all);
}

export function clearThreadLayout(threadId) {
  if (!threadId) return;
  const all = readStored(LAYOUT_KEY, {});
  if (!(threadId in all)) return;
  delete all[threadId];
  writeStored(LAYOUT_KEY, all);
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
  // User threads override seeded threads of the same id (so an appended-to
  // seed thread shows its updated copy, not a duplicate). Hidden ids
  // (deleted seeded threads) are filtered out at both layers.
  const hidden = loadHiddenIds();
  const user = loadUserThreads().filter(t => !hidden.has(t.id));
  const userIds = new Set(user.map(t => t.id));
  const seed = WM.THREADS.filter(t => !userIds.has(t.id) && !hidden.has(t.id));
  return [...user, ...seed];
}

export function getThreadById(id) {
  return getAllThreads().find(t => t.id === id)
      || (WM.KINDRED_THREADS || []).find(t => t.id === id)
      || null;
}

// True if this id is one of the user's own threads (a saved DOS thread, or a
// seed thread they've already appended to and thus copied into user storage).
// Seeded Maya threads count as "yours" in the single-user model — appending
// to one creates a user-storage copy that overrides the seed.
export function isOwnThread(id) {
  if (!id) return false;
  if (loadUserThreads().some(t => t.id === id)) return true;
  if (WM.THREADS.some(t => t.id === id)) return true;          // seeded = Maya = you
  return false; // KINDRED_THREADS are other people's
}

// Set (or clear) the annotation on one find within a thread. Persists via
// saveThread — for a seeded Maya thread this writes a user-storage copy that
// overrides the seed (same pattern as appendSessionToThread). Caller must
// gate on isOwnThread: you can't annotate someone else's thread.
//
// Seeded finds have no stable id, so we match by id when present, else by
// the title+source+date triple the find actually carries.
export function setFindNote(threadId, find, note) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  const thread = JSON.parse(JSON.stringify(existing));
  const match = (f) =>
    (find.id && f.id && f.id === find.id) ||
    (!find.id && f.t === find.t && f.s === find.s && f.d === find.d);
  const target = (thread.fl || []).find(match);
  if (!target) return null;
  const trimmed = (note || '').trim();
  if (trimmed) target.note = trimmed;
  else delete target.note;
  thread.notes = (thread.fl || []).filter(f => f.note).length;
  thread._userCreated = true;
  saveThread(thread);
  return { thread, find: target };
}

// Directly pin an item into one of YOUR threads as a find — no DOS run, no
// reframe. This is the one-click "save this to my thread": appending a find
// to an ongoing inquiry needs no new question. (Making the item its OWN
// thread would need a question — that's what "go deeper" is for.)
//
//   threadId   destination thread (must be your own — gate with isOwnThread)
//   item       { title, source, url, mediaType, fromOwner }
export function addFindToThread(threadId, item) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  const thread = JSON.parse(JSON.stringify(existing));
  const markers = thread.mileMarkers || [];
  const markerId = markers.length ? markers[markers.length - 1].id : undefined;
  const find = makeSeedFind(item, markerId, Date.now());
  thread.fl = [...(thread.fl || []), find];
  thread.last = 'just now';
  thread.finds = thread.fl.length;
  thread.notes = thread.fl.filter(f => f.note).length;
  thread._userCreated = true;
  saveThread(thread);
  return { thread, find };
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
// A pinned find for the card a DOS session was "deepened" from. Carries
// attribution when the card came from someone else (courtyard / kindred).
function makeSeedFind(seededFrom, markerId, ts) {
  return {
    id: `f-${ts}-seed`,
    t: seededFrom.title || '(untitled)',
    s: seededFrom.source || '',
    url: seededFrom.url || '',
    i: mediaIcon(seededFrom.mediaType),
    d: 'just now',
    markerId,
    mediaType: seededFrom.mediaType,
    signal: 'moved',
    pinnedSeed: true,
    note: seededFrom.fromOwner
      ? `Saved from ${seededFrom.fromOwner}. Went deeper on this here.`
      : 'Went deeper on this here.',
  };
}

export function buildThreadFromSession({
  originalQ, evolvedQ, characterization, moves, items, signals = {}, diffMoves = [],
  seededFrom = null,
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

  // Only items the user signalled as "moved" are saved as finds. Dismissed
  // and unmarked items are dropped — the thread holds what you chose, not
  // everything the search surfaced. Saving with nothing chosen yields a
  // thread with just the question + reframe history (an honest "I looked,
  // nothing landed" record).
  const chosen = items.filter(it => signals[it.moveId] === 'moved');

  const fl = chosen.map((it, i) => {
    const move = moves.find(m => m.id === it.moveId);
    return {
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
      signal: 'moved',
      // The note carries the slice of the articulation diff this find is
      // responsible for — appended to the find itself, not free-floating.
      note: diffText ? `This moved me. ${diffText}` : 'This moved me.',
    };
  });

  if (seededFrom && (seededFrom.url || seededFrom.title)) {
    fl.unshift(makeSeedFind(seededFrom, currentMarkerId, ts));
  }

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

// Spawn a NEW thread off a parent (the inquiry forked, not continued). Unlike
// append (same thread grows) and save-as-new (orphan), a spawn is its own
// thread that records lineage back to the parent: it shows as "newly spawned"
// on Home and carries spawnedFrom / parent / root ids. The parent is left
// untouched. Mirrors the persona model (wm-data t-grief) and the legacy
// EngineApp spawnContext.
//
// You can spawn off your OWN thread (pass its id) or off SOMEONE ELSE's
// card — a courtyard shared item / kindred find (pass {owner, viaCard}).
// Foreign spawns carry owner-based lineage instead of a thread id: a
// courtyard shared item has no thread id of its own, and you're forking
// off their card, not appending into their inquiry (which is theirs to grow).
//
//   parentThreadId   id of YOUR thread this forked from, or null/'' if foreign
//   session          same shape as buildThreadFromSession
//   opts.owner       foreign origin's owner (when parentThreadId is absent)
//   opts.viaCard     the foreign card title the fork came through
//   opts.reason      optional explicit "why it split off" note
export function spawnThreadFromSession(parentThreadId, session, opts = {}) {
  const { owner = '', viaCard = '', reason = '' } = opts;
  const parent = parentThreadId ? getThreadById(parentThreadId) : null;
  const base = buildThreadFromSession(session);
  const parentQ = (parent && parent.q) || '';

  let spawnedFrom, lineage;
  if (parent) {
    const why = reason
      || `split off from “${parentQ.length > 56 ? parentQ.slice(0, 56) + '…' : parentQ}”`;
    spawnedFrom = { id: parent.id, at: 'just now', reason: why };
    lineage = { parentThreadId: parent.id, rootThreadId: parent.rootThreadId || parent.id };
  } else {
    const why = reason
      || (owner
          ? `split off from ${owner}${viaCard ? ` · “${viaCard.length > 48 ? viaCard.slice(0, 48) + '…' : viaCard}”` : ''}`
          : 'split off from a deeper look');
    spawnedFrom = { owner: owner || null, viaCard: viaCard || null, at: 'just now', reason: why };
    lineage = { parentThreadId: null, rootThreadId: null };
  }

  const spawned = { ...base, state: 'spawned', spawnedFrom, ...lineage };
  saveThread(spawned);
  return spawned;
}

// Spawn a new thread directly off a single card — no DOS run required.
// "Going deeper" (a DOS session) is one way to fork an inquiry, but it must
// not be the ONLY way: seeing someone else's find/note and starting your own
// thread from it is a first-class action. The card is pinned as the seed
// find; the thread opens on `question` (falls back to the card's own title
// so a spawn is never blocked on typing). Foreign lineage is recorded via
// owner/viaCard, exactly like a foreign session-spawn.
//
//   card   { title, source, url, mediaType }
//   opts.owner     whose card this was (when it's not yours)
//   opts.question  the question this new thread opens on (optional)
export function spawnThreadFromCard(card, opts = {}) {
  const { owner = '', question = '' } = opts;
  if (!card || (!card.title && !card.source)) return null;
  const ts = Date.now();
  const id = 't-' + ts;
  const via = (card.title || card.source || '').trim();
  const q = (question || '').trim() || via || 'a new thread';
  const markerId = 'm-0';

  // Pin the originating card as a seed find only when it's a real artifact
  // (a source/link). Spawning off a bare question — a reframe in someone's
  // history — has nothing to pin: the new thread simply opens on it.
  const hasArtifact = !!(card.source || card.url);
  const fl = [];
  if (hasArtifact) {
    const seed = makeSeedFind({
      title: card.title || via || '(untitled)',
      source: card.source || '',
      url: card.url || '',
      mediaType: card.mediaType,
      fromOwner: owner || null,
    }, markerId, ts);
    seed.note = owner ? `Spawned a thread off ${owner}'s card.` : 'Spawned a thread off this card.';
    fl.push(seed);
  }

  const trunc = via.length > 48 ? via.slice(0, 48) + '…' : via;
  const spawned = {
    id,
    q,
    domain: 'inquiry',
    dc: pickPalette(null),
    state: 'spawned',
    age: 'just now',
    last: 'just now',
    finds: fl.length,
    notes: fl.filter(f => f.note).length,
    mileMarkers: [{ id: markerId, age: 'just now', q }],
    fl,
    notesList: [],
    kindred: [],
    courtyardName: null,
    courtyardTopic: null,
    spawnedFrom: {
      owner: owner || null,
      viaCard: via || null,
      at: 'just now',
      reason: owner
        ? `split off from ${owner}${trunc ? ` · “${trunc}”` : ''}`
        : `split off from “${trunc}”`,
    },
    parentThreadId: null,
    rootThreadId: null,
    _userCreated: true,
  };
  saveThread(spawned);
  return spawned;
}

// Build find objects for a session, tethered to a given marker id.
function buildFinds({ items, signals = {}, moves = [], diffMoves = [], markerId, tsBase }) {
  const diffText = (diffMoves || [])
    .map(d => `${d.label}: ${d.content}`)
    .join('  ·  ');
  const chosen = items.filter(it => signals[it.moveId] === 'moved');
  return chosen.map((it, i) => {
    const move = moves.find(m => m.id === it.moveId);
    return {
      id: `f-${tsBase}-${i}`,
      t: it.title || '(untitled)',
      s: it.source || '',
      url: it.url || '',
      i: mediaIcon(it.mediaType),
      d: 'just now',
      moveId: it.moveId,
      moveLabel: move?.label || it.moveId,
      markerId,
      mediaType: it.mediaType,
      estimatedMinutes: it.estimatedMinutes,
      signal: 'moved',
      note: diffText ? `This moved me. ${diffText}` : 'This moved me.',
    };
  });
}

// Append a DOS session to an existing thread as a new reframe (Model B): a
// new mile-marker = the re-articulated question, plus the moved finds tethered
// to it. Optionally seed-pin one external item (a card the session was
// "deepened" from) as a find too. Writes to user storage; if `threadId` was a
// seeded Maya thread, this creates a user-storage copy that overrides the seed.
//
//   threadId     id of the thread to append to
//   evolvedQ     the re-articulated question (becomes the new current marker)
//   moves/items/signals/diffMoves   same as buildThreadFromSession
//   seededFrom   optional { title, source, url, mediaType } — a foreign card
//                this session went deeper on; saved as a pinned find
export function appendSessionToThread(threadId, {
  evolvedQ, moves = [], items = [], signals = {}, diffMoves = [], seededFrom = null,
}) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  // Deep-ish clone so we don't mutate the seed object in memory.
  const thread = JSON.parse(JSON.stringify(existing));
  const ts = Date.now();

  const newQ = (evolvedQ || '').trim() || thread.q;
  const markers = thread.mileMarkers || [];
  const lastMarker = markers[markers.length - 1];
  // Only add a new marker if the question actually moved.
  let currentMarkerId;
  if (!lastMarker || (lastMarker.q || '').trim() !== newQ) {
    const newMarker = { id: `m-${ts}`, age: 'just now', q: newQ };
    markers.push(newMarker);
    currentMarkerId = newMarker.id;
  } else {
    currentMarkerId = lastMarker.id;
  }

  const newFinds = buildFinds({ items, signals, moves, diffMoves, markerId: currentMarkerId, tsBase: ts });

  if (seededFrom && (seededFrom.url || seededFrom.title)) {
    newFinds.unshift(makeSeedFind(seededFrom, currentMarkerId, ts));
  }

  thread.mileMarkers = markers;
  thread.fl = [...(thread.fl || []), ...newFinds];
  thread.q = newQ;
  thread.last = 'just now';
  thread.state = 'active';
  thread.finds = thread.fl.length;
  thread.notes = thread.fl.filter(f => f.note).length;
  thread._userCreated = true;

  saveThread(thread);
  return thread;
}
