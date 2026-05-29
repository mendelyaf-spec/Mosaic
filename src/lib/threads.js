// User-created threads — persisted to localStorage, shaped exactly like
// wm-data.js THREADS[i] so the existing Home / Thread / Courtyard renderers
// pick them up with zero special-casing.
//
// getAllThreads() returns user threads first (most recent on top), then the
// seeded Maya threads, so a freshly-saved DOS session lands at the front of
// Home.

import { readStored, writeStored } from './storage.js';
import { WM } from '../data/wm-data.js';

const THREADS_KEY  = 'mosaic.threads';
const HIDDEN_KEY   = 'mosaic.hiddenThreads';
const LAYOUT_KEY   = 'mosaic.threadLayouts.v1';
const SHAPES_KEY   = 'mosaic.threadShapes.v1';
const ETHER_KEY    = 'mosaic.threadEther.v1';
const BORDERS_KEY  = 'mosaic.threadBorders.v1';
const USER_SHAPES_KEY = 'mosaic.userShapes.v1';
const SHAPE_SCALES_KEY = 'mosaic.threadShapeScales.v1';
const HOME_SHAPE_SCALES_KEY = 'mosaic.homeShapeScales.v1';

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

// Per-thread card-shape overrides. Maps cardKey → shapeId (see
// SHAPE_DEFS in Thread.jsx). Missing entries render as the default
// rectangular card. Shape ids include the 7 starter shapes
// (rect, circle, hex, soft-hex, square, triangle, diamond) and the
// 3 community-coined (octagon · @asha, rosette · @samira, knot · @ezra).
export function loadThreadShapes(threadId) {
  if (!threadId) return {};
  const all = readStored(SHAPES_KEY, {});
  return all[threadId] || {};
}

export function saveThreadShapes(threadId, shapes) {
  if (!threadId) return;
  const all = readStored(SHAPES_KEY, {});
  all[threadId] = shapes || {};
  writeStored(SHAPES_KEY, all);
}

// Per-card shape-scale overrides ({ [cardKey]: number }). 1.0 = card
// bounds, <1 = shrunk inward, >1 = enlarged past the card edge. The
// shape outline scales around the centre of its viewBox so the card's
// own rectangular content stays in place. Stored next to shapes; the
// Shape tab in the Design panel exposes a size slider for the
// currently-selected card.
export function loadThreadShapeScales(threadId) {
  if (!threadId) return {};
  const all = readStored(SHAPE_SCALES_KEY, {});
  return all[threadId] || {};
}

export function saveThreadShapeScales(threadId, scales) {
  if (!threadId) return;
  const all = readStored(SHAPE_SCALES_KEY, {});
  all[threadId] = scales || {};
  writeStored(SHAPE_SCALES_KEY, all);
}

// Per-thread "ether" — the background treatment of the spatial view.
// Either { kind: 'preset', value: presetId } for a built-in pattern, or
// { kind: 'image', dataUrl: 'data:image/...' } for an uploaded image.
// null / absent means the default paper background.
export function loadThreadEther(threadId) {
  if (!threadId) return null;
  const all = readStored(ETHER_KEY, {});
  return all[threadId] || null;
}

export function saveThreadEther(threadId, ether) {
  if (!threadId) return;
  const all = readStored(ETHER_KEY, {});
  if (ether) all[threadId] = ether;
  else delete all[threadId];
  writeStored(ETHER_KEY, all);
}

// Per-thread card-border overrides: { [cardKey]: { color, thickness } }.
// Missing entries fall back to the card's default border.
export function loadThreadBorders(threadId) {
  if (!threadId) return {};
  const all = readStored(BORDERS_KEY, {});
  return all[threadId] || {};
}

export function saveThreadBorders(threadId, borders) {
  if (!threadId) return;
  const all = readStored(BORDERS_KEY, {});
  all[threadId] = borders || {};
  writeStored(BORDERS_KEY, all);
}

// Home-scoped design — the constellation page itself. Same four
// dimensions as the thread-scoped design (layout, shapes, borders,
// ether), but the keys are thread-ids on Home (each cluster on the
// Home canvas is one thread). One ether per Home (single background).
const HOME_LAYOUT_KEY  = 'mosaic.homeLayout.v1';
const HOME_SHAPES_KEY  = 'mosaic.homeShapes.v1';
const HOME_BORDERS_KEY = 'mosaic.homeBorders.v1';
const HOME_ETHER_KEY   = 'mosaic.homeEther.v1';

export function loadHomeLayout()  { return readStored(HOME_LAYOUT_KEY,  {}); }
export function saveHomeLayout(v) { writeStored(HOME_LAYOUT_KEY,  v || {}); }
export function loadHomeShapes()  { return readStored(HOME_SHAPES_KEY,  {}); }
export function saveHomeShapes(v) { writeStored(HOME_SHAPES_KEY,  v || {}); }
export function loadHomeBorders() { return readStored(HOME_BORDERS_KEY, {}); }
export function saveHomeBorders(v){ writeStored(HOME_BORDERS_KEY, v || {}); }
export function loadHomeShapeScales()  { return readStored(HOME_SHAPE_SCALES_KEY, {}); }
export function saveHomeShapeScales(v) { writeStored(HOME_SHAPE_SCALES_KEY, v || {}); }
export function loadHomeEther()   { return readStored(HOME_ETHER_KEY,   null); }
export function saveHomeEther(v) {
  writeStored(HOME_ETHER_KEY, v || null);
}

// User-extracted card shapes. Each entry is
// { id, label, path, preview, createdAt }. Path is an SVG outline in
// the same 0..100 viewBox as the built-in SHAPE_DEFS, so it slots into
// the Shape library next to starter and community shapes. preview is
// a dataURL thumbnail rendered from the extracted silhouette.
export function loadUserShapes() {
  return readStored(USER_SHAPES_KEY, []);
}

export function saveUserShape(shape) {
  const all = loadUserShapes();
  const id = shape.id || ('u-' + Date.now().toString(36));
  const next = { ...shape, id, createdAt: shape.createdAt || Date.now() };
  const idx = all.findIndex(s => s.id === id);
  if (idx >= 0) all[idx] = next; else all.push(next);
  writeStored(USER_SHAPES_KEY, all);
  return next;
}

export function deleteUserShape(id) {
  writeStored(USER_SHAPES_KEY, loadUserShapes().filter(s => s.id !== id));
}

// "Stumble — save a find" workflow. Items saved from the Promenade enter
// the destination thread queued (flag: queued=true) rather than placed
// in the orbit. They sit in a small dock until the owner "gives them
// form" — at which point the flag is cleared and the orbital layout
// picks them up like any other find.
export function queueFindForThread(threadId, item) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  const thread = JSON.parse(JSON.stringify(existing));
  const ts = Date.now();
  const find = {
    id: `f-${ts}-q`,
    t: item.title || '(untitled)',
    s: item.source || '',
    url: item.url || '',
    i: glyphForMedia(item.mediaType),
    d: 'just now',
    mediaType: item.mediaType,
    signal: 'queued',
    pinnedSeed: true,
    queued: true,
    note: item.fromOwner
      ? `Stumbled in from ${item.fromOwner}. Not yet placed.`
      : 'Stumbled in. Not yet placed.',
  };
  thread.fl = [...(thread.fl || []), find];
  thread.last = 'just now';
  thread.finds = thread.fl.length;
  thread._userCreated = true;
  saveThread(thread);
  return { thread, find };
}

// Move a queued find into the orbit. Clears the queued flag so the
// spatial layout includes it on the next render.
export function placeQueuedFind(threadId, findId) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  const thread = JSON.parse(JSON.stringify(existing));
  const find = (thread.fl || []).find(f => f.id === findId);
  if (!find) return null;
  delete find.queued;
  if (find.signal === 'queued') find.signal = 'moved';
  find.note = (find.note || '').replace(/Not yet placed\.?/i, 'Given form.').trim();
  thread._userCreated = true;
  saveThread(thread);
  return { thread, find };
}

// Drop a queued find without placing it (the stumble didn't land).
export function dismissQueuedFind(threadId, findId) {
  const existing = getThreadById(threadId);
  if (!existing) return null;
  const thread = JSON.parse(JSON.stringify(existing));
  thread.fl = (thread.fl || []).filter(f => f.id !== findId);
  thread.finds = thread.fl.length;
  thread._userCreated = true;
  saveThread(thread);
  return thread;
}

function glyphForMedia(mediaType) {
  switch (mediaType) {
    case 'video': case 'film':       return '▶';
    case 'podcast': case 'interview':return '🎙';
    case 'audio':                    return '🎙';
    case 'image':                    return '📸';
    case 'reddit':                   return '💬';
    case 'paper':                    return '📄';
    case 'book-chapter': case 'primer': return '📖';
    case 'longform-article':         return '📰';
    case 'essay':                    return '✎';
    default:                          return '◻';
  }
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

// Threads owned by someone other than Maya, for the "visiting X's home"
// view. Pulls from KINDRED_THREADS (which carry an owner field for each
// thread in a courtyard) and PERSONAL_THREADS (threads not yet in a
// courtyard but still authored by a non-Maya member).
export function getThreadsByOwner(owner) {
  if (!owner) return [];
  const kindred  = (WM.KINDRED_THREADS  || []).filter(t => t.owner === owner);
  const personal = (WM.PERSONAL_THREADS || []).filter(t => t.owner === owner);
  return [...kindred, ...personal];
}

// All members other than Maya who own at least one thread. Returns a
// list of { owner, threadCount } so callers can show a directory or
// jump links.
export function listOtherMembers() {
  const map = new Map();
  for (const t of (WM.KINDRED_THREADS || [])) {
    if (!t.owner) continue;
    map.set(t.owner, (map.get(t.owner) || 0) + 1);
  }
  for (const t of (WM.PERSONAL_THREADS || [])) {
    if (!t.owner) continue;
    map.set(t.owner, (map.get(t.owner) || 0) + 1);
  }
  return Array.from(map, ([owner, threadCount]) => ({ owner, threadCount }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
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
