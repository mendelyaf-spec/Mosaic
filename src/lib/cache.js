// Response cache for engine API calls.
//
// Two-layer:
//   1. In-memory Map  — hot path, used during a single page session.
//   2. localStorage   — survives reloads, so dev iterations against the same
//                       Maya seed don't re-pay full price.
//
// Keys are byte-stable JSON of the normalised request body (so semantically-
// identical requests collide). Entries expire after CACHE_TTL_MS.

import { readStored, writeStored } from './storage.js';

const STORAGE_KEY = 'mosaic.responseCache.v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — long enough for dev replays
const MAX_ENTRIES = 200;             // bound the localStorage footprint

const mem = new Map(); // key -> { text, ts }

// Hydrate from disk once at module load.
(function hydrate() {
  const stored = readStored(STORAGE_KEY, {});
  const now = Date.now();
  for (const [k, v] of Object.entries(stored)) {
    if (v && v.ts && now - v.ts < CACHE_TTL_MS) mem.set(k, v);
  }
})();

function flushToDisk() {
  // Keep newest MAX_ENTRIES, drop the rest.
  const entries = [...mem.entries()];
  entries.sort((a, b) => b[1].ts - a[1].ts);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  const obj = Object.fromEntries(trimmed);
  writeStored(STORAGE_KEY, obj);
}

function normalizeForCache(val) {
  if (typeof val === 'string') {
    return val.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  if (Array.isArray(val)) return val.map(normalizeForCache);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) out[k] = normalizeForCache(val[k]);
    return out;
  }
  return val;
}

export function cacheKey(body) {
  return JSON.stringify(normalizeForCache({
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system || null,
    messages: body.messages,
    tools: body.tools || null,
  }));
}

export function getCached(key) {
  const entry = mem.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    mem.delete(key);
    return null;
  }
  return entry.text;
}

export function setCached(key, text) {
  mem.set(key, { text, ts: Date.now() });
  flushToDisk();
}

export function clearCache() {
  mem.clear();
  writeStored(STORAGE_KEY, {});
}
