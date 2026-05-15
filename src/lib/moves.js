// Moves library — the open vocabulary the user picks from in DOS.
//
// Three tiers:
//   - starter:   shipped with the app, can't be deleted (sharpen, complicate, bridge, ground, spawn, reframe)
//   - community: seeded from the design (mirror, disturb, witness, refuse, crystallize)
//   - user:      coined by this user, persisted to localStorage
//
// Each move carries the long `promptDescription` that the engine inlines into
// the slot-fill prompt where SLOT_DESCRIPTIONS[slot] used to live.
//
// User prefs:
//   selectedMoves: array of move IDs the next session will use
//   maxTimePerItem: integer minutes, or null for "no limit"

import { readStored, writeStored } from './storage.js';

const MOVES_KEY = 'mosaic.moves';
const PREFS_KEY = 'mosaic.userPrefs';

export const STARTER_MOVES = [
  {
    id: 'sharpen',
    label: 'SHARPEN',
    blurb: 'narrows the question',
    category: 'starter',
    promptDescription: 'an item that SHARPENS — cuts closer to the heart of what the user is actually asking, makes the existing framing more precise. Match the user\'s register: a playful question gets a vivid, well-made piece that hits the same target more sharply, not a philosophy paper.',
  },
  {
    id: 'complicate',
    label: 'COMPLICATE',
    blurb: 'introduces a wrinkle',
    category: 'starter',
    promptDescription: 'an item that COMPLICATES — introduces genuine tension, a case the current framing doesn\'t handle, a perspective that resists the thread\'s presuppositions. Should still feel inviting, not academic.',
  },
  {
    id: 'bridge',
    label: 'BRIDGE',
    blurb: 'carries to another inquiry',
    category: 'starter',
    promptDescription: 'an item that BRIDGES to a distant domain — something structurally analogous from a different field (biology, architecture, music, sport, crafts, design, ecology) where the same shape of question has been worked through in different terms. The bridge should be vivid and surprising, not dutifully cross-disciplinary.',
  },
  {
    id: 'spawn',
    label: 'SPAWN',
    blurb: 'births a sub-question',
    category: 'starter',
    promptDescription: 'an item that points toward a SUB-QUESTION the user hasn\'t asked yet but is implicit in what they brought. The item should plant the new question vividly enough that the user notices it as separate from the parent question — a worthy thread in its own right.',
  },
  {
    id: 'reframe',
    label: 'REFRAME',
    blurb: 'shifts the angle',
    category: 'starter',
    promptDescription: 'an item that REFRAMES the question entirely — same territory, fundamentally different angle. The kind of move where the user reads the item and realizes their original framing was a choice, not a given. Should not just restate; should reveal what the original framing was assuming.',
  },
  {
    id: 'ground',
    label: 'GROUND',
    blurb: 'anchors in lived reality',
    category: 'starter',
    promptDescription: 'an item that GROUNDS — a concrete case, a specific person\'s account, a primary source, a video walkthrough, a Reddit thread of practitioners — something that puts the abstract question into a specific material situation.',
  },
];

// Seeded community moves, from the design's library screen.
// IDs prefixed with `c-` to keep starters and user-coined moves separable.
// `coiner` and `uses` are display-only; they don't affect engine behaviour.
export const COMMUNITY_MOVES = [
  {
    id: 'c-mirror',
    label: 'MIRROR',
    blurb: 'reflects from outside',
    category: 'community',
    coiner: '@asha',
    uses: 47,
    promptDescription: 'an item that MIRRORS the user back to themselves through an outside frame — an essay, profile, interview, or first-person account in which someone else has noticed a pattern the user is currently inside. The item shouldn\'t address the question directly; it should show the user something about their own posture toward it. Feel of recognition, not analysis.',
  },
  {
    id: 'c-disturb',
    label: 'DISTURB',
    blurb: 'treats q. as category error',
    category: 'community',
    coiner: '@jun',
    uses: 22,
    promptDescription: 'an item that DISTURBS the question by treating it as a category error — material that suggests the user is asking the wrong kind of question, or asking it in the wrong register. Should not be condescending; should be a clear-eyed practitioner or critic showing why a different question would be more honest.',
  },
  {
    id: 'c-witness',
    label: 'WITNESS',
    blurb: 'personal testimony, no argument',
    category: 'community',
    coiner: '@aira',
    uses: 34,
    promptDescription: 'an item that bears WITNESS — a piece of personal testimony, a memoir excerpt, a voice memo, a letter, a lived account. No argument. No analysis. Someone who has been near this question speaking from inside their experience of it.',
  },
  {
    id: 'c-refuse',
    label: 'REFUSE',
    blurb: 'declines the q.\'s terms',
    category: 'community',
    coiner: '@ellis',
    uses: 19,
    promptDescription: 'an item that REFUSES the question\'s terms — a thinker, artist, or community that has explicitly declined to engage with the question as posed, and articulated WHY. The item should make the refusal legible without making it sound like dismissal.',
  },
  {
    id: 'c-crystallize',
    label: 'CRYSTALLIZE',
    blurb: 'names what was half-seen',
    category: 'community',
    coiner: '@theo',
    uses: 28,
    promptDescription: 'an item that CRYSTALLIZES something the user is half-seeing — gives a name, a vocabulary, a frame to a phenomenon they\'re circling without quite holding. Should feel like a relief: "oh, that\'s what this is called."',
  },
];

// Public API ---------------------------------------------------

export function loadMoves() {
  const userCoined = readStored(MOVES_KEY, []);
  return [...STARTER_MOVES, ...COMMUNITY_MOVES, ...userCoined];
}

export function loadMoveById(id) {
  return loadMoves().find(m => m.id === id) || null;
}

export function saveUserMove(move) {
  const userCoined = readStored(MOVES_KEY, []);
  // Generate an id if missing. Slugify the label.
  const id = move.id || ('u-' + (move.label || 'move').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24));
  const next = { ...move, id, category: 'user', uses: 0 };
  // Replace existing if same id, else append.
  const idx = userCoined.findIndex(m => m.id === id);
  if (idx >= 0) userCoined[idx] = next; else userCoined.push(next);
  writeStored(MOVES_KEY, userCoined);
  return next;
}

export function deleteUserMove(id) {
  if (!id.startsWith('u-')) return; // can't delete starters or community moves
  const userCoined = readStored(MOVES_KEY, []);
  writeStored(MOVES_KEY, userCoined.filter(m => m.id !== id));
}

// User prefs ---------------------------------------------------

const DEFAULT_PREFS = {
  selectedMoves: ['sharpen', 'complicate', 'bridge', 'ground'],
  maxTimePerItem: 30, // minutes; null = no limit
};

export function loadPrefs() {
  const stored = readStored(PREFS_KEY, {});
  return { ...DEFAULT_PREFS, ...stored };
}

export function savePrefs(patch) {
  const current = loadPrefs();
  const next = { ...current, ...patch };
  writeStored(PREFS_KEY, next);
  return next;
}

// Helpful for the time-budget slider.
export const TIME_OPTIONS = [
  { mins: 5,    label: '5 min',    cost: 'a quick read' },
  { mins: 15,   label: '15 min',   cost: 'one sitting' },
  { mins: 30,   label: '30 min',   cost: 'a focused block' },
  { mins: 60,   label: '1 hr',     cost: 'an afternoon coffee' },
  { mins: 120,  label: '2 hr',     cost: 'a long sit' },
  { mins: 240,  label: '4 hr',     cost: 'a half-day' },
  { mins: 480,  label: '8 hr',     cost: 'a full day' },
  { mins: 1440, label: '24 hr',    cost: 'a long-form commitment' },
  { mins: null, label: 'no limit', cost: 'a really long book in an open-source library' },
];
