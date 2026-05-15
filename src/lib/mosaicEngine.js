// Mosaic engine — pure logic, no UI.
//
// Exposes:
//   callClaude({...})           low-level API wrapper, cached
//   parseJSON(text)             tolerant JSON extractor
//   characterize(question, opts)        -> characterization object
//   fillMove(move, question, ch, opts)  -> single feed item for one move
//   runFeedFill(question, moves, ch, opts) -> array of items (parallel + dedup)
//   articulationDiff(originalQ, evolvedQ, sharpenedBy) -> array of moves
//
// Two contractual commitments from CLAUDE.md:
//   1. Response cache is persisted to localStorage (see lib/cache.js).
//   2. Web search is hard-capped at 3 uses per call (max_uses).

import { cacheKey, getCached, setCached } from './cache.js';

const API_URL  = 'https://api.anthropic.com/v1/messages';
const MODEL    = 'claude-sonnet-4-6';                  // characterization, diff, etc.
const FEED_MODEL = 'claude-haiku-4-5-20251001';       // slot-fills with web search

const WEB_SEARCH_MAX_USES = 3;                      // hard cap per call

// ---------------- low-level API call --------------------------

export async function callClaude({
  prompt,
  messages = null,
  useWebSearch = false,
  system = null,
  maxTokens = 1000,
  model = MODEL,
} = {}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: messages || [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (useWebSearch) {
    body.tools = [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: WEB_SEARCH_MAX_USES,
    }];
  }

  const key = cacheKey(body);
  const cached = getCached(key);
  if (cached !== null) {
    console.log('[cache hit]', model, (prompt || '').slice(0, 60));
    return cached;
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'VITE_ANTHROPIC_API_KEY not set. Add it to .env.local at the project root.'
    );
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) {
    console.error('[mosaicEngine] API error response:', data.error);
    const msg = data.error.message || data.error.type || JSON.stringify(data.error);
    throw new Error(`Claude API error (${data.error.type || res.status}): ${msg}`);
  }
  if (!data.content) {
    console.error('[mosaicEngine] response without content:', data);
    throw new Error('No content in Claude response');
  }

  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Surface whether the web search cap was hit so callers can warn the user.
  const searchCalls = (data.content || []).filter(b => b.type === 'tool_use' && b.name === 'web_search').length;
  if (useWebSearch && searchCalls >= WEB_SEARCH_MAX_USES) {
    console.warn(`[mosaicEngine] web_search cap reached (${searchCalls}/${WEB_SEARCH_MAX_USES}) for model ${model}`);
  }

  setCached(key, text);
  return text;
}

// ---------------- JSON extraction -----------------------------

export function parseJSON(text) {
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try { return JSON.parse(cleaned); } catch (e) {}

  const firstBrace = cleaned.search(/[\{\[]/);
  if (firstBrace === -1) throw new Error('No JSON found in: ' + cleaned.slice(0, 200));
  cleaned = cleaned.slice(firstBrace);

  const open = cleaned[0];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inString = false, escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(0, i + 1);
        try { return JSON.parse(candidate); } catch (e) {
          const fixed = candidate
            .replace(/,(\s*[\}\]])/g, '$1')
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'");
          try { return JSON.parse(fixed); } catch (e2) {}
          throw new Error('Malformed JSON: ' + candidate.slice(0, 200));
        }
      }
    }
  }
  throw new Error('Unbalanced JSON in: ' + cleaned.slice(0, 200));
}

// ---------------- characterize --------------------------------

const CHARACTERIZE_SYSTEM = `You are the thread-characterization component of Mosaic, an inquiry platform. When a user opens a thread, you read what they wrote and produce a structural reading of it. You are NOT scoring whether the question is "good" or "deep." You are naming what the question is carrying, what register it's in, and what kind of move would meet the user where they are while gently pulling them toward sustained engagement.

Mosaic is NOT optimizing for engagement-bait. It is also NOT forcing every question into analytical philosophy. The goal is to honor the user's actual state — playful, curious, practical, aesthetic, reflective, analytical — and offer a feed that meets that register while offering a slightly steeper path than they'd choose alone.

Output ONLY valid JSON, no prose before or after. Schema:
{
  "domain": "one short phrase naming the terrain",
  "questionType": "what kind of question this is",
  "register": "one of: playful, curious, practical, aesthetic, reflective, analytical, urgent, grieving",
  "presuppositions": ["2-4 assumptions the question carries"],
  "absent": ["2-4 things conspicuously not engaged with"],
  "openingMove": "one sentence naming the kind of first move that would meet this user in their register and offer a slightly steeper path"
}`;

export async function characterize(question, { mode = 'question', fromThread = null } = {}) {
  const modeContext = mode === 'explore'
    ? `\n\nContext: this thread is in EXPLORE mode — the user is not asking a question but giving a curatorial directive. They want to be shown things, contrasts, examples, territory. Treat the input as a brief, not a question.`
    : '';
  const fromCtx = fromThread
    ? `\n\nContext: the user is currently inside a thread on: "${fromThread.q}". The new question may relate to it but shouldn't collapse into it.`
    : '';
  const label = mode === 'explore' ? 'Directive' : 'Question';
  const userPrompt = `${label}: "${question}"${modeContext}${fromCtx}\n\nProduce the structural reading as specified.`;

  const text = await callClaude({
    prompt: userPrompt,
    system: CHARACTERIZE_SYSTEM,
    maxTokens: 800,
  });
  const ch = parseJSON(text);
  ch.mode = mode;
  return ch;
}

// ---------------- slot fill (one move) ------------------------

// Format a max-time number as a human-readable phrase for the prompt.
// `null` or 0 means no limit.
function formatTimeBudget(mins) {
  if (mins == null || mins === 0) return 'no limit (they have all the time they want)';
  if (mins < 60) return `about ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = mins / 60;
  if (hours < 24) return `about ${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? '' : 's'}`;
  const days = hours / 24;
  return `about ${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'} of engagement`;
}

function fillMovePrompt({ move, question, characterization, excludeUrls, fromThread, maxTimePerItem }) {
  const register = characterization.register || 'curious';
  const mode = characterization.mode || 'question';
  const isExplore = mode === 'explore';

  const labelLine = isExplore
    ? `The user opened a thread in EXPLORE mode with this directive:\n\n"${question}"\n\nThey're not asking a question — they want to be shown things. Honor the brief.`
    : `The user opened a thread with this question:\n\n"${question}"`;

  const fromLine = fromThread
    ? `\n\nThey came here from a thread on: "${fromThread.q}". Bias toward openings, not echoes — don't collapse back into that thread.`
    : '';

  return `You are filling one slot in the workbench of Mosaic, an inquiry platform. ${labelLine}${fromLine}

Structural reading of what they brought:
- Domain: ${characterization.domain}
- Type: ${characterization.questionType}
- Register: ${register}
- Mode: ${mode}
- Presuppositions: ${characterization.presuppositions?.join('; ') || '—'}
- Conspicuously absent: ${characterization.absent?.join('; ') || '—'}
- Opening move: ${characterization.openingMove}

CRITICAL: match the user's register. A playful supercar question gets a stunning concept reveal — NOT a philosophy paper. A grieving question gets something tender. Meet them where they are; offer a slightly steeper path than they'd choose alone.

The slot you are filling is called "${move.label}". Its job, as the author of this move described it:

${move.promptDescription}

Your task: find ONE real item that fills this slot for this user, this question. Real URL. Real title. Real author/source. Use web search if helpful (you have at most ${WEB_SEARCH_MAX_USES} searches per slot).

TIME BUDGET CONSTRAINT: the user has indicated they want each item to take ${formatTimeBudget(maxTimePerItem)} to engage with. Honor this. A 4-minute video is fine when they asked for 5 minutes; a 200-page book is not unless they asked for several hours. If the slot's nature demands depth, find something that fits both the slot AND the time budget — a chapter rather than a book, a podcast episode rather than a series.

${excludeUrls && excludeUrls.length > 0 ? `Exclude already-chosen URLs: ${excludeUrls.join(', ')}` : ''}

Avoid SEO listicles and AI-generated filler. Prefer primary sources, working practitioners, longform interviews, vivid concrete cases.

Output ONLY valid JSON, no preamble:
{
  "title": "the actual title of the item",
  "source": "author, publication, channel, or speaker",
  "url": "the real URL you found",
  "mediaType": "one of: video, essay, interview, reddit, film, art, classical, primer, podcast, paper, image, book-chapter, longform-article",
  "estimatedMinutes": <integer — your honest estimate of how long this item takes to engage with at a normal pace>,
  "thumbnailUrl": "OPTIONAL — only include if it's a YouTube video (use https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg). Otherwise omit.",
  "preview": "2-3 sentences giving a vivid sense of what's in the item — match the user's register",
  "why": "2-3 sentences explaining why this item, in this slot, for this thread"
}

CRITICAL: always return an item. If you can't find a perfect fit, return the best plausible item — a less-than-ideal item is better than no item.`;
}

const SLOT_TIMEOUT_MS = 120000; // 2 minutes per attempt

function withTimeout(promise, ms = SLOT_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

export async function fillMove(move, question, characterization, opts = {}) {
  const {
    excludeUrls = [],
    fromThread = null,
    maxTimePerItem = 30,
    model = FEED_MODEL,
  } = opts;

  const baseAttempt = async (extra = '', useSearch = true) => {
    const prompt = fillMovePrompt({
      move, question, characterization, excludeUrls, fromThread, maxTimePerItem,
    }) + extra;
    const text = await withTimeout(callClaude({
      prompt,
      useWebSearch: useSearch,
      model,
      maxTokens: 600,
    }));
    return parseJSON(text);
  };

  try {
    return { moveId: move.id, ...(await baseAttempt()) };
  } catch (e1) {
    console.warn(`fillMove "${move.id}" first attempt failed:`, e1.message);
    try {
      return {
        moveId: move.id,
        ...(await baseAttempt('\n\nIMPORTANT: Output ONLY valid JSON with no preamble. If you cannot find an ideal item, pick the closest reasonable one.')),
      };
    } catch (e2) {
      console.warn(`fillMove "${move.id}" retry failed, falling back to knowledge:`, e2.message);
      try {
        return {
          moveId: move.id,
          ...(await baseAttempt(
            '\n\nFALLBACK MODE: Skip web search. From your training knowledge, propose ONE real, well-known item that fits this slot. Real titles, real authors, real sources. Output ONLY valid JSON.',
            false
          )),
        };
      } catch (e3) {
        return {
          moveId: move.id,
          failed: true,
          title: `(${move.label} — search exhausted)`,
          source: '',
          url: '',
          mediaType: 'essay',
          preview: 'Three attempts to fill this slot failed. Try again or pick a different move.',
          why: '',
          estimatedMinutes: 0,
        };
      }
    }
  }
}

// ---------------- parallel fill + dedup -----------------------

export async function runFeedFill(question, moves, characterization, opts = {}, onSlotDone) {
  // Phase 1: fire all moves in parallel.
  const initial = await Promise.all(moves.map(async (move) => {
    const item = await fillMove(move, question, characterization, opts);
    if (onSlotDone) onSlotDone(move.id, item);
    return item;
  }));

  // Phase 2: deduplicate by URL. If two slots returned the same URL,
  // keep the first occurrence and re-fill the rest with the dupe URLs excluded.
  const seen = new Set();
  const keepers = [];
  const needRetry = [];
  for (const it of initial) {
    if (it.failed || !it.url) { keepers.push(it); continue; }
    if (seen.has(it.url)) {
      needRetry.push(it);
    } else {
      seen.add(it.url);
      keepers.push(it);
    }
  }

  if (needRetry.length === 0) return initial;

  // Re-fill the duplicates, excluding all kept URLs.
  const excludeUrls = [...seen];
  const retried = await Promise.all(needRetry.map(async (orig) => {
    const move = moves.find(m => m.id === orig.moveId);
    if (!move) return orig;
    const item = await fillMove(move, question, characterization, { ...opts, excludeUrls });
    if (onSlotDone) onSlotDone(move.id, item);
    return item;
  }));

  // Reassemble in original move order.
  const byMove = new Map();
  for (const it of keepers) byMove.set(it.moveId, it);
  for (const it of retried) byMove.set(it.moveId, it);
  return moves.map(m => byMove.get(m.id)).filter(Boolean);
}

// ---------------- articulation diff ---------------------------

const DIFF_PROMPT_FN = (original, evolved, sharpenedBy) =>
`A user opened a thread on Mosaic with this question:

"${original}"

After reading a feed of items and marking these as having moved them — ${sharpenedBy.join('; ') || 'none'} — they re-articulated their question as:

"${evolved}"

Your job: produce the articulation-diff. Name what actually moved between the two articulations. Match the register of the user's actual writing — if they're playful, don't suddenly turn academic. If they're analytical, be precise. The diff should feel like an honest mirror, not a philosophy paper.

Output ONLY valid JSON of this shape:
{
  "moves": [
    {"label": "short name of the move — e.g. 'Register shift', 'Presupposition abandoned', 'Scope widened', 'Binary dissolved'", "content": "1-2 sentences naming specifically what moved, grounded in the actual words of the two articulations"}
  ]
}

Produce 2-4 moves. Be specific — quote phrases. If the evolved articulation is barely different, say so in one move.`;

export async function articulationDiff(originalQ, evolvedQ, sharpenedBy = []) {
  const text = await callClaude({
    prompt: DIFF_PROMPT_FN(originalQ, evolvedQ, sharpenedBy),
    maxTokens: 800,
  });
  const obj = parseJSON(text);
  return obj.moves || [];
}
