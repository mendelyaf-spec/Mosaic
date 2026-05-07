import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// WANDERMARK — PART I live prototype
// End-to-end single-user loop, powered by Claude Sonnet 4 + web search
// ============================================================

const MODEL = "claude-sonnet-4-20250514"; // used for characterization, candidates, diff
const FEED_MODEL = "claude-haiku-4-5-20251001"; // used for web-search slot filling — much faster
const API_URL = "https://api.anthropic.com/v1/messages";

// --- Claude API helpers -------------------------------------

// --- Response cache (5-minute TTL, keyed on request body) ---

const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeForCache(val) {
  if (typeof val === 'string') {
    return val.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  if (Array.isArray(val)) {
    return val.map(normalizeForCache);
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) {
      out[k] = normalizeForCache(val[k]);
    }
    return out;
  }
  return val;
}

function cacheKey(body) {
  return JSON.stringify(normalizeForCache({
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system || null,
    messages: body.messages,
    tools: body.tools || null,
  }));
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.text;
}

function setCached(key, text) {
  responseCache.set(key, { text, ts: Date.now() });
}

async function callClaude({ prompt, messages = null, useWebSearch = false, system = null, maxTokens = 1000, model = MODEL }) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: messages || [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  // Check cache
  const key = cacheKey(body);
  const cached = getCached(key);
  if (cached !== null) {
    console.log('[cache hit]', model, (prompt || '').slice(0, 60));
    return cached;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.content) throw new Error("No content in Claude response");

  const text = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  setCached(key, text);
  return text;
}

function parseJSON(text) {
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Try direct parse first
  try { return JSON.parse(cleaned); } catch (e) {}

  // Find the first { or [ and try from there
  const firstBrace = cleaned.search(/[\{\[]/);
  if (firstBrace === -1) throw new Error("No JSON found in: " + cleaned.slice(0, 200));
  cleaned = cleaned.slice(firstBrace);

  // Try parsing the largest balanced block from the start
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
          // Try common fixes: trailing commas, smart quotes
          const fixed = candidate
            .replace(/,(\s*[\}\]])/g, '$1')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2018\u2019]/g, "'");
          try { return JSON.parse(fixed); } catch (e2) {}
          throw new Error("Malformed JSON: " + candidate.slice(0, 200));
        }
      }
    }
  }
  throw new Error("Unbalanced JSON in: " + cleaned.slice(0, 200));
}

// --- Persistent storage (artifact runtime, ~5min for tests, persists across days) ---

const STORAGE_KEYS = {
  threadsList: 'threads:list',           // [thread_id, ...]
  thread: (id) => `thread:${id}`,         // thread metadata
  sessionsList: (tid) => `sessions:${tid}:list`,
  session: (sid) => `session:${sid}`,
};

async function safeStorageGet(key) {
  if (!window.storage) return null;
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}

async function safeStorageSet(key, value) {
  if (!window.storage) return;
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.error('storage.set failed', key, e);
  }
}

async function safeStorageDelete(key) {
  if (!window.storage) return;
  try { await window.storage.delete(key); } catch (e) {}
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function loadAllThreads() {
  const ids = await safeStorageGet(STORAGE_KEYS.threadsList) || [];
  const threads = [];
  for (const id of ids) {
    const t = await safeStorageGet(STORAGE_KEYS.thread(id));
    if (t) threads.push(t);
  }
  return threads.sort((a, b) => (b.lastSessionAt || 0) - (a.lastSessionAt || 0));
}

async function loadSessionsForThread(threadId) {
  const ids = await safeStorageGet(STORAGE_KEYS.sessionsList(threadId)) || [];
  const sessions = [];
  for (const id of ids) {
    const s = await safeStorageGet(STORAGE_KEYS.session(id));
    if (s) sessions.push(s);
  }
  return sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

async function saveSession({ threadId, originalQuestion, currentQuestion, characterization, feed, signals, evolved, diffMoves, artifact, spawnContext = null }) {
  // Find or create thread
  const ids = await safeStorageGet(STORAGE_KEYS.threadsList) || [];
  let thread;
  let threadId_ = threadId;

  if (!threadId_) {
    threadId_ = genId();
    thread = {
      id: threadId_,
      originalQuestion,
      currentQuestion: evolved || currentQuestion,
      artifactSummary: artifact ? {
        kind: artifact.kind,
        filename: artifact.filename,
        observation: artifact.observation,
        thumbnail: artifact.kind === 'image' && artifact.base64.length < 200000
          ? `data:${artifact.mediaType};base64,${artifact.base64}` : null,
      } : null,
      // Lineage fields for spawned threads
      parentThreadId: spawnContext?.parentThreadId || null,
      rootThreadId: spawnContext?.rootThreadId || threadId_, // root thread is its own root
      spawnAnchor: spawnContext?.anchor || null, // { title, url, slot, source }
      spawnFromQuestion: spawnContext?.fromQuestion || null,
      createdAt: Date.now(),
      lastSessionAt: Date.now(),
      sessionCount: 0,
    };
    ids.unshift(threadId_);
    await safeStorageSet(STORAGE_KEYS.threadsList, ids);
  } else {
    thread = await safeStorageGet(STORAGE_KEYS.thread(threadId_));
    if (!thread) thread = { id: threadId_, originalQuestion, createdAt: Date.now(), sessionCount: 0 };
    thread.currentQuestion = evolved || currentQuestion;
    thread.lastSessionAt = Date.now();
  }

  // Save session
  const sessionId = genId();
  const session = {
    id: sessionId,
    threadId: threadId_,
    questionAtOpen: currentQuestion,
    questionAtClose: evolved,
    characterization,
    feed: feed.map(it => ({
      slot: it.slot, title: it.title, source: it.source, url: it.url,
      mediaType: it.mediaType, preview: it.preview, why: it.why, failed: !!it.failed,
    })),
    signals,
    diffMoves,
    startedAt: Date.now(),
  };
  await safeStorageSet(STORAGE_KEYS.session(sessionId), session);

  // Update thread's session list
  const sessIds = await safeStorageGet(STORAGE_KEYS.sessionsList(threadId_)) || [];
  sessIds.push(sessionId);
  await safeStorageSet(STORAGE_KEYS.sessionsList(threadId_), sessIds);

  thread.sessionCount = sessIds.length;
  await safeStorageSet(STORAGE_KEYS.thread(threadId_), thread);

  return { threadId: threadId_, sessionId };
}

async function deleteThread(threadId) {
  const ids = await safeStorageGet(STORAGE_KEYS.threadsList) || [];
  const updated = ids.filter(x => x !== threadId);
  await safeStorageSet(STORAGE_KEYS.threadsList, updated);
  const sessIds = await safeStorageGet(STORAGE_KEYS.sessionsList(threadId)) || [];
  for (const sid of sessIds) await safeStorageDelete(STORAGE_KEYS.session(sid));
  await safeStorageDelete(STORAGE_KEYS.sessionsList(threadId));
  await safeStorageDelete(STORAGE_KEYS.thread(threadId));
}


function buildArtifactBlock(artifact) {
  if (artifact.kind === 'image') {
    return {
      type: "image",
      source: { type: "base64", media_type: artifact.mediaType, data: artifact.base64 },
    };
  }
  if (artifact.kind === 'pdf') {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: artifact.base64 },
    };
  }
  throw new Error("Unknown artifact kind: " + artifact.kind);
}

// Read a File as base64 (strips data: prefix)
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

// --- Prompts ------------------------------------------------

const CHARACTERIZE_SYSTEM = `You are the thread-characterization component of Mosaic, an inquiry platform. When a user opens a thread, you read what they wrote and produce a structural reading of it. You are NOT scoring whether the question is "good" or "deep." You are naming what the question is carrying, what register it's in, and what kind of move would meet the user where they are while gently pulling them toward sustained engagement.

Mosaic is NOT optimizing for engagement-bait. It is also NOT forcing every question into analytical philosophy. The goal is to honor the user's actual state — playful, curious, practical, aesthetic, reflective, analytical — and offer a feed that meets that register while offering a slightly steeper path than they'd choose alone. A question about which supercar to buy if you got rich deserves a feed that honors the delight (a stunning concept reveal, a designer interview about why a car looks the way it does, a mechanic's perspective on what makes one different to drive) — NOT a philosophy paper on consumption ethics.

If the thread was opened from an uploaded artifact, account for what the artifact contributes.

Output ONLY valid JSON, no prose before or after. Schema:
{
  "domain": "one short phrase naming the terrain",
  "questionType": "what kind of question this is",
  "register": "the user's actual register — one of: playful, curious, practical, aesthetic, reflective, analytical, urgent, grieving. Pick the closest single one.",
  "presuppositions": ["2-4 assumptions the question carries"],
  "absent": ["2-4 things conspicuously not engaged with"],
  "openingMove": "one sentence naming the kind of first move that would meet this user in their register and offer a slightly steeper path"
}`;

const ARTIFACT_CANDIDATES_PROMPT = `You are the thread-opening component of Mosaic, an inquiry platform. A user has uploaded an artifact (image or document) they find themselves thinking about. They may have added a note about what drew them to it.

Look at the artifact. Then produce THREE candidate questions — each a structurally different way this artifact could anchor an inquiry thread. These are NOT summaries or descriptions of the artifact. They are open questions the user might actually hold and pursue over multiple sessions.

The three candidates should take genuinely different angles — not three versions of the same question. Aim for variety across: normative vs. descriptive vs. conceptual; close reading vs. wide-frame; the artifact's explicit content vs. what it does or enacts vs. what it leaves out.

If the user added a note about what drew them to the artifact, take it seriously as a signal about what they're really holding — but don't collapse all three candidates to it. One candidate can follow their cue; the others should offer alternative framings they might not have considered.

Output ONLY valid JSON:
{
  "observation": "2-3 sentences naming what's salient in the artifact — what it's showing, saying, or doing. Be specific and concrete, not abstract.",
  "candidates": [
    {"angle": "2-4 words naming the angle — e.g. 'The labor vs. the product' or 'What the frame excludes'", "question": "the actual open question, written as the user might hold it in their own voice"}
  ]
}`;

const SLOT_DESCRIPTIONS = {
  sharpen: "an item that SHARPENS — cuts closer to the heart of what the user is actually asking, makes the existing framing more precise. Match the user's register: a playful question gets a vivid, well-made piece that hits the same target more sharply, not a philosophy paper.",
  complicate: "an item that COMPLICATES — introduces genuine tension, a case the current framing doesn't handle, a perspective that resists the thread's presuppositions. Should still feel inviting, not academic.",
  bridge: "an item that BRIDGES to a distant domain — something structurally analogous from a different field (biology, architecture, music, sport, crafts, design, ecology) where the same shape of question has been worked through in different terms. The bridge should be vivid and surprising, not dutifully cross-disciplinary.",
  ground: "an item that GROUNDS — a concrete case, a specific person's account, a primary source, a video walkthrough, a Reddit thread of practitioners — something that puts the abstract question into a specific material situation."
};

const feedSlotPrompt = (slot, question, characterization, excludeUrls = [], artifact = null) => {
  const artifactLine = artifact
    ? `\n\nNOTE: This thread was opened from an uploaded artifact${artifact.observation ? ` — ${artifact.observation}` : ''}.`
    : '';
  const register = characterization.register || 'curious';
  const mode = characterization.mode || 'question';
  const isExplore = mode === 'explore';

  const slotMeaningExplore = {
    sharpen: "an item that CUTS CLOSER to the territory they want to see — a vivid, exemplary instance of what they named",
    complicate: "an item that introduces a CASE THAT RESISTS the directive — something within the territory that pushes against their framing",
    bridge: "an item that points to ADJACENT TERRITORY they didn't name — a related domain where the same shape shows up in different terms",
    ground: "a CONCRETE INSTANCE — a specific example, person, place, work, or community that embodies the directive",
  };

  const labelLine = isExplore
    ? `The user opened a thread in EXPLORE mode with this directive:\n\n"${question}"\n\nThey're not asking a question — they want to be shown things. Honor the brief. Don't try to convert the directive into a question.`
    : `The user opened a thread with this question:\n\n"${question}"`;

  return `You are assembling one item for the feed of Mosaic, an inquiry platform. ${labelLine}${artifactLine}

Structural reading:
- Domain: ${characterization.domain}
- Type: ${characterization.questionType}
- Register: ${register}
- Mode: ${mode}
- Presuppositions: ${characterization.presuppositions.join("; ")}
- Conspicuously absent: ${characterization.absent.join("; ")}
- Opening move: ${characterization.openingMove}

CRITICAL: Match the user's register. The user is in a "${register}" mode. A playful supercar question gets a stunning concept reveal video — NOT a philosophy paper. A grieving question gets something tender. The platform is NOT engagement-bait, but it is ALSO NOT forcing every input into academic depth. Meet the user where they are; offer a slightly steeper path than they'd choose alone.

Your job: find ONE real item to fill the ${slot.toUpperCase()} slot — ${isExplore ? slotMeaningExplore[slot] : SLOT_DESCRIPTIONS[slot]}.

Use web search to find a REAL, SPECIFIC item with a real URL. Run at most 2 searches. Strongly prefer:
- YouTube videos for visual/aesthetic/practical questions
- Long-form interviews and podcasts for reflective/curious questions
- Reddit threads for practical/grounding moves
- Substantive essays only when register is reflective or analytical
- Films, art, photography, music when register is aesthetic

Avoid SEO listicles and AI-generated filler.

${excludeUrls.length > 0 ? `Exclude already-chosen items: ${excludeUrls.join(", ")}` : ''}

Output ONLY valid JSON, no preamble:
{
  "title": "the actual title of the item",
  "source": "author, publication, channel, or speaker",
  "url": "the real URL you found",
  "mediaType": "one of: video, essay, interview, reddit, film, art, classical, primer, podcast, paper, image",
  "thumbnailUrl": "OPTIONAL — only include if it's a YouTube video (use https://img.youtube.com/vi/VIDEO_ID/hqdefault.jpg). Otherwise omit this field entirely.",
  "preview": "2-3 sentences giving a vivid sense of what's in the item — match the user's register",
  "why": "2-3 sentences explaining why this item, in this slot, for this thread"
}

CRITICAL: Always return an item. If you can't find a perfect fit, return the best plausible item you can — a less-than-ideal item is better than no item.`;
};

const DIFF_PROMPT = (original, evolved, sharpenedBy) => `A user opened a thread on Mosaic with this question:

ORIGINAL: "${original}"

After reading a feed of items and marking these as having moved them — ${sharpenedBy.join("; ") || "none"} — they re-articulated their question as:

EVOLVED: "${evolved}"

Your job: produce the articulation-diff. Name what actually moved between the two articulations. Match the register of the user's actual writing — if they're playful, don't suddenly turn academic. If they're analytical, be precise. The diff should feel like an honest mirror, not a philosophy paper.

Output ONLY valid JSON:
{
  "moves": [
    {"label": "short name of the move — e.g. 'Register shift', 'Presupposition abandoned', 'Scope widened', 'Binary dissolved', 'Got more specific', 'Became playful'", "content": "1-2 sentences naming specifically what moved, grounded in the actual words of the two articulations"}
  ]
}

Produce 2-4 moves. Be specific — quote phrases where it sharpens the claim. If the evolved articulation is barely different, say so in one move.`;

// --- Small components --------------------------------------

const Glyph = ({ sig }) => {
  if (sig === 'sharpen') return <span style={{ color: 'var(--accent)' }}>✦</span>;
  if (sig === 'neutral') return <span style={{ color: 'var(--ink-faded)' }}>○</span>;
  if (sig === 'close') return <span style={{ color: 'var(--ink-faded)' }}>–</span>;
  return null;
};

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function getThumbnail(item) {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  const ytId = extractYouTubeId(item.url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

const SignalBar = ({ value, onChange, size = 'normal' }) => {
  const opts = [
    { v: 'sharpen', label: 'moved me', glyph: '✦' },
    { v: 'neutral', label: 'neutral', glyph: '○' },
    { v: 'close', label: 'closed', glyph: '–' },
  ];
  return (
    <div className={`signal-bar ${size}`}>
      {opts.map(o => (
        <button
          key={o.v}
          className={`signal-btn ${value === o.v ? 'active' : ''} sig-${o.v}`}
          onClick={(e) => { e.stopPropagation(); onChange(value === o.v ? null : o.v); }}
        >
          <span className="g">{o.glyph}</span>
          <span className="l">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

const Loading = ({ lines }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => (x + 1) % lines.length), 2400);
    return () => clearInterval(t);
  }, [lines]);
  return (
    <div className="loading-block">
      <div className="loading-glyph">✦</div>
      <div className="loading-text">{lines[i]}</div>
    </div>
  );
};

// Small artifact badge shown inside thread cards when a thread was opened from an upload
function ArtifactBadge({ artifact, size = 'normal' }) {
  if (!artifact) return null;
  const src = artifact.kind === 'image'
    ? `data:${artifact.mediaType};base64,${artifact.base64}`
    : null;
  return (
    <div className={`artifact-badge size-${size}`}>
      {src ? (
        <img src={src} alt="Thread artifact" />
      ) : (
        <div className="artifact-badge-pdf">
          <span className="pdf-tag">PDF</span>
          <span className="pdf-name">{artifact.filename}</span>
        </div>
      )}
      <div className="artifact-badge-label">Thread artifact</div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function Wandermark() {
  const [screen, setScreen] = useState('loading'); // loading | home | entry | analyzing-artifact | choosing | characterizing | feed | reader | review | diff | profile | thread-history
  const [savedThreads, setSavedThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [viewingThread, setViewingThread] = useState(null); // {thread, sessions} when viewing history
  const [question, setQuestion] = useState('');
  const [artifact, setArtifact] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [characterization, setCharacterization] = useState(null);
  const [feed, setFeed] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState({});
  const [signals, setSignals] = useState({});
  const [openReader, setOpenReader] = useState(null);
  const [evolved, setEvolved] = useState('');
  const [diffMoves, setDiffMoves] = useState([]);
  const [nextFeed, setNextFeed] = useState([]);
  const [loadingNext, setLoadingNext] = useState({});
  const [error, setError] = useState(null);

  // Load saved threads on mount
  useEffect(() => {
    (async () => {
      const threads = await loadAllThreads();
      setSavedThreads(threads);
      setScreen(threads.length > 0 ? 'home' : 'entry');
    })();
  }, []);

  // --- Handlers ---------------------------------------------

  const submitQuestion = async (q, modeOrArtifact = 'question', maybeArtifact = null) => {
    if (!q.trim()) return;
    // Allow legacy call signature: (q, artifactObj)
    let mode = 'question';
    let existingArtifact = null;
    if (typeof modeOrArtifact === 'string') {
      mode = modeOrArtifact;
      existingArtifact = maybeArtifact;
    } else if (modeOrArtifact && typeof modeOrArtifact === 'object') {
      existingArtifact = modeOrArtifact;
    }
    setQuestion(q);
    setScreen('characterizing');
    setError(null);
    try {
      let messages;
      const modeContext = mode === 'explore'
        ? `\n\nContext: this thread is in EXPLORE mode — the user is not asking a question but giving a curatorial directive. They want to be shown things, contrasts, examples, territory. Treat the input as a brief, not a question. The four slots still apply but should serve the directive: sharpen=cut closer to what they want to see, complicate=introduce tension within the territory, bridge=adjacent terrain they didn't name, ground=concrete instances.`
        : '';
      const artifactContext = existingArtifact
        ? `\n\nContext: this thread was opened from an uploaded artifact. The artifact's role in the thread is part of what you're reading.`
        : '';
      const label = mode === 'explore' ? 'Directive' : 'Question';
      const userPrompt = `${label}: "${q}"${modeContext}${artifactContext}\n\nProduce the structural reading as specified.`;

      if (existingArtifact) {
        const content = [buildArtifactBlock(existingArtifact), { type: "text", text: userPrompt }];
        messages = [{ role: "user", content }];
      }
      const text = await callClaude({
        prompt: userPrompt,
        messages,
        system: CHARACTERIZE_SYSTEM,
      });
      const ch = parseJSON(text);
      ch.mode = mode; // attach mode so feed prompts can use it
      setCharacterization(ch);
      setScreen('feed');
      loadFeed(q, ch, existingArtifact);
    } catch (e) {
      setError("Couldn't read the thread. " + e.message);
      setScreen('entry');
    }
  };

  const submitArtifact = async (artifactData) => {
    setArtifact(artifactData);
    setScreen('analyzing-artifact');
    setError(null);
    try {
      const noteLine = artifactData.note?.trim()
        ? `\n\nThe user added this note about what drew them to it: "${artifactData.note}"`
        : '';
      const promptText = `Here is an artifact the user uploaded.${noteLine}\n\nProduce the observation and three candidate questions as specified.`;
      const messages = [{
        role: "user",
        content: [buildArtifactBlock(artifactData), { type: "text", text: promptText }],
      }];
      const text = await callClaude({
        messages,
        system: ARTIFACT_CANDIDATES_PROMPT,
        maxTokens: 1200,
      });
      const result = parseJSON(text);
      setArtifact({ ...artifactData, observation: result.observation });
      setCandidates(result.candidates);
      setScreen('choosing');
    } catch (e) {
      setError("Couldn't read the artifact. " + e.message);
      setScreen('entry');
    }
  };

  // Try slot once. If parse/network fails, retry with stricter prompt.
  // If that also fails, return a minimal placeholder item so the slot is never empty.
  const fillSlot = async (slot, q, ch, excludeUrls, artifactCtx) => {
    const TIMEOUT_MS = 120000; // 2 minutes per attempt

    const withTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS))
    ]);

    const baseAttempt = async (extraInstruction = '', useSearch = true) => {
      const prompt = feedSlotPrompt(slot, q, ch, excludeUrls, artifactCtx) + extraInstruction;
      const text = await withTimeout(callClaude({
        prompt,
        useWebSearch: useSearch,
        model: FEED_MODEL,
        maxTokens: 500,
      }));
      return parseJSON(text);
    };

    try {
      return await baseAttempt();
    } catch (e1) {
      console.warn(`${slot} first attempt failed:`, e1.message);
      try {
        return await baseAttempt('\n\nIMPORTANT: Output ONLY valid JSON with no preamble. If you cannot find an ideal item, pick the closest reasonable one.');
      } catch (e2) {
        console.warn(`${slot} retry failed, falling back to knowledge:`, e2.message);
        // Final fallback: knowledge-only (no search) — fast, never empty
        try {
          return await baseAttempt('\n\nFALLBACK MODE: Skip web search. From your training knowledge, propose ONE real, well-known item that fits this slot. Real titles, real authors, real sources. Output ONLY valid JSON.', false);
        } catch (e3) {
          // Three attempts failed — return a failure marker so the UI shows a real "retry" state
          return {
            failed: true,
            slot,
            error: e3.message || 'failed after 3 attempts',
          };
        }
      }
    }
  };

  const loadFeed = async (q, ch, artifactCtx = null) => {
    const slots = ['sharpen', 'complicate', 'bridge', 'ground'];
    setLoadingSlots(Object.fromEntries(slots.map(s => [s, true])));
    setFeed([]);

    // Phase 1: fire all slots in parallel for speed
    const results = await Promise.all(slots.map(async (slot) => {
      const item = await fillSlot(slot, q, ch, [], artifactCtx);
      setLoadingSlots(prev => ({ ...prev, [slot]: false }));
      return { slot, ...item };
    }));

    // Phase 2: deduplicate. If two slots returned the same URL, keep the first
    // and retry the others, excluding URLs already chosen.
    const seen = new Set();
    const deduped = [];
    const needRetry = [];
    for (const r of results) {
      if (r.failed || !r.url) {
        deduped.push(r);
        continue;
      }
      if (seen.has(r.url)) {
        needRetry.push(r.slot);
      } else {
        seen.add(r.url);
        deduped.push(r);
      }
    }
    setFeed(deduped);

    // Retry duplicate slots, one at a time, with current exclusion list growing
    for (const slot of needRetry) {
      setLoadingSlots(prev => ({ ...prev, [slot]: true }));
      const excludeUrls = Array.from(seen);
      const item = await fillSlot(slot, q, ch, excludeUrls, artifactCtx);
      if (item.url) seen.add(item.url);
      setFeed(prev => [...prev, { slot, ...item }]);
      setLoadingSlots(prev => ({ ...prev, [slot]: false }));
    }
  };

  const retrySlot = async (slot) => {
    setLoadingSlots(prev => ({ ...prev, [slot]: true }));
    // Collect URLs already shown for this slot so retry picks something different.
    // Also exclude URLs from other slots so we don't get duplicates across the feed.
    const allShownUrls = feed.filter(x => x.url).map(x => x.url);
    setFeed(prev => prev.filter(x => x.slot !== slot));
    const item = await fillSlot(slot, question, characterization, allShownUrls, artifact);
    setFeed(prev => [...prev, { slot, ...item }]);
    setLoadingSlots(prev => ({ ...prev, [slot]: false }));
  };

  const skipReview = async () => {
    // Save session without re-articulation/diff. Question stays the same.
    setError(null);
    try {
      const { threadId } = await saveSession({
        threadId: currentThreadId,
        originalQuestion: question,
        currentQuestion: question,
        characterization,
        feed,
        signals,
        evolved: null, // explicit null = skipped
        diffMoves: [],
        artifact,
      });
      setCurrentThreadId(threadId);
      loadAllThreads().then(setSavedThreads);
      setScreen(savedThreads.length > 0 || true ? 'home' : 'entry');
    } catch (e) {
      setError("Couldn't save session. " + e.message);
    }
  };

  const spawnFromHistory = async (parentThread, anchorItem, newQuestion) => {
    if (!newQuestion?.trim() || !anchorItem || !parentThread) return;
    setError(null);

    const parentRootId = parentThread.rootThreadId || parentThread.id;
    const parentCurrentQuestion = parentThread.currentQuestion || parentThread.originalQuestion;

    // Reset state for new thread
    setCurrentThreadId(null);
    setQuestion(newQuestion);
    setArtifact(null);
    setCandidates([]);
    setCharacterization(null);
    setFeed([]);
    setSignals({});
    setOpenReader(null);
    setEvolved('');
    setDiffMoves([]);
    setNextFeed([]);
    setViewingThread(null);

    setScreen('characterizing');
    try {
      const text = await callClaude({
        prompt: `Question: "${newQuestion}"\n\nThis question was spawned from a thread anchored to: "${anchorItem.title}" by ${anchorItem.source || 'unknown source'} (filled the ${anchorItem.slot} slot of the parent thread). Take this lineage into account in your structural reading.\n\nProduce the structural reading as specified.`,
        system: CHARACTERIZE_SYSTEM,
      });
      const ch = parseJSON(text);
      setCharacterization(ch);

      const spawnContext = {
        parentThreadId: parentThread.id,
        rootThreadId: parentRootId,
        anchor: {
          title: anchorItem.title,
          url: anchorItem.url || '',
          slot: anchorItem.slot,
          source: anchorItem.source || '',
        },
        fromQuestion: parentCurrentQuestion,
      };
      const { threadId: newThreadId } = await saveSession({
        threadId: null,
        originalQuestion: newQuestion,
        currentQuestion: newQuestion,
        characterization: ch,
        feed: [],
        signals: {},
        evolved: null,
        diffMoves: [],
        artifact: null,
        spawnContext,
      });
      setCurrentThreadId(newThreadId);
      loadAllThreads().then(setSavedThreads);

      setScreen('feed');
      loadFeed(newQuestion, ch, null);
    } catch (e) {
      setError("Couldn't spawn from history. " + e.message);
      setScreen('home');
    }
  };

  const spawnFromItem = async (anchorItem, newQuestion) => {
    if (!newQuestion?.trim() || !anchorItem) return;
    setError(null);

    // 1. Save current session first (without diff — like skip)
    let parentThreadIdResolved = currentThreadId;
    let parentRootIdResolved = null;
    try {
      const { threadId: pid } = await saveSession({
        threadId: currentThreadId,
        originalQuestion: question,
        currentQuestion: question,
        characterization,
        feed,
        signals,
        evolved: null,
        diffMoves: [],
        artifact,
      });
      parentThreadIdResolved = pid;
      // Look up parent's rootThreadId
      const parentThread = await safeStorageGet(STORAGE_KEYS.thread(pid));
      parentRootIdResolved = parentThread?.rootThreadId || pid;
    } catch (e) {
      setError("Couldn't save parent session before spawning. " + e.message);
      return;
    }

    // 2. Reset state for new thread
    setCurrentThreadId(null);
    setQuestion(newQuestion);
    setArtifact(null);
    setCandidates([]);
    setCharacterization(null);
    setFeed([]);
    setSignals({});
    setOpenReader(null);
    setEvolved('');
    setDiffMoves([]);
    setNextFeed([]);

    // 3. Run characterization on new question
    setScreen('characterizing');
    try {
      const text = await callClaude({
        prompt: `Question: "${newQuestion}"\n\nThis question was spawned from a thread anchored to: "${anchorItem.title}" by ${anchorItem.source || 'unknown source'} (filled the ${anchorItem.slot} slot of the parent thread). Take this lineage into account in your structural reading.\n\nProduce the structural reading as specified.`,
        system: CHARACTERIZE_SYSTEM,
      });
      const ch = parseJSON(text);
      setCharacterization(ch);

      // 4. Save the new thread immediately with spawn context, then load feed
      const spawnContext = {
        parentThreadId: parentThreadIdResolved,
        rootThreadId: parentRootIdResolved,
        anchor: {
          title: anchorItem.title,
          url: anchorItem.url || '',
          slot: anchorItem.slot,
          source: anchorItem.source || '',
        },
        fromQuestion: question, // parent's current question at spawn time
      };
      // Pre-create thread so we have an id to use for session linking
      const { threadId: newThreadId } = await saveSession({
        threadId: null,
        originalQuestion: newQuestion,
        currentQuestion: newQuestion,
        characterization: ch,
        feed: [],
        signals: {},
        evolved: null,
        diffMoves: [],
        artifact: null,
        spawnContext,
      });
      setCurrentThreadId(newThreadId);
      loadAllThreads().then(setSavedThreads);

      setScreen('feed');
      loadFeed(newQuestion, ch, null);
    } catch (e) {
      setError("Couldn't read the spawned thread. " + e.message);
      setScreen('home');
    }
  };

  const submitReview = async (evolvedText) => {
    setEvolved(evolvedText);
    setScreen('diff-loading');
    setError(null);

    const sharpenedBy = feed
      .filter((_, i) => signals[i] === 'sharpen')
      .map(it => `"${it.title}" (${it.slot} slot)`);

    try {
      const diffTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Diff timeout (2 min)')), 120000)
      );
      const diffPromise = Promise.race([
        callClaude({
          prompt: DIFF_PROMPT(question, evolvedText, sharpenedBy),
          maxTokens: 1500,
        }),
        diffTimeout,
      ]);

      const diffText = await diffPromise;
      const diffResult = parseJSON(diffText);
      setDiffMoves(diffResult.moves);

      // Persist session
      const { threadId } = await saveSession({
        threadId: currentThreadId,
        originalQuestion: question,
        currentQuestion: question,
        characterization,
        feed,
        signals,
        evolved: evolvedText,
        diffMoves: diffResult.moves,
        artifact,
      });
      setCurrentThreadId(threadId);
      // Refresh threads list in background
      loadAllThreads().then(setSavedThreads);

      setScreen('diff');
    } catch (e) {
      // Preserve the user's re-articulation (already in `evolved` state); show error on review screen with retry option
      setError("Couldn't compute the diff. " + e.message + " Your re-articulation was saved — press Retry or edit it and submit again.");
      setScreen('review');
    }
  };

  const retryDiff = async () => {
    if (!evolved) return;
    await submitReview(evolved);
  };

  const restart = () => {
    setScreen(savedThreads.length > 0 ? 'home' : 'entry');
    setCurrentThreadId(null);
    setQuestion('');
    setArtifact(null);
    setCandidates([]);
    setCharacterization(null);
    setFeed([]);
    setSignals({});
    setOpenReader(null);
    setEvolved('');
    setDiffMoves([]);
    setNextFeed([]);
    setError(null);
  };

  const startNewThread = () => {
    setCurrentThreadId(null);
    setQuestion('');
    setArtifact(null);
    setCandidates([]);
    setCharacterization(null);
    setFeed([]);
    setSignals({});
    setEvolved('');
    setDiffMoves([]);
    setNextFeed([]);
    setError(null);
    setScreen('entry');
  };

  const openThreadHistory = async (threadId) => {
    const thread = savedThreads.find(t => t.id === threadId);
    if (!thread) return;
    const sessions = await loadSessionsForThread(threadId);
    setViewingThread({ thread, sessions });
    setScreen('thread-history');
  };

  const continueThread = async (threadId) => {
    const thread = savedThreads.find(t => t.id === threadId);
    if (!thread) return;
    setCurrentThreadId(threadId);
    setQuestion(thread.currentQuestion);
    // Re-run characterization on the current (evolved) question
    setScreen('characterizing');
    setError(null);
    try {
      const text = await callClaude({
        prompt: `Question: "${thread.currentQuestion}"\n\nProduce the structural reading as specified.`,
        system: CHARACTERIZE_SYSTEM,
      });
      const ch = parseJSON(text);
      setCharacterization(ch);
      setScreen('feed');
      loadFeed(thread.currentQuestion, ch, null);
    } catch (e) {
      setError("Couldn't read the thread. " + e.message);
      setScreen('home');
    }
  };

  const openCrossProfile = async () => {
    // Load all sessions across all threads
    const all = [];
    for (const t of savedThreads) {
      const sess = await loadSessionsForThread(t.id);
      all.push(...sess);
    }
    setViewingThread({ allSessions: all }); // reuse state slot
    setScreen('cross-profile');
  };

  const handleDeleteThread = async (threadId) => {
    await deleteThread(threadId);
    const threads = await loadAllThreads();
    setSavedThreads(threads);
    if (threads.length === 0) setScreen('entry');
    else setScreen('home');
  };

  // --- Render -----------------------------------------------

  return (
    <div className="wm-root">
      <style>{styles}</style>

      <header className="topbar">
        <div className="brand">Mosaic</div>
        <div className="screen-indicator">
          {screen === 'loading' && 'Loading'}
          {screen === 'home' && 'Your threads'}
          {screen === 'thread-tree' && 'Inquiry tree'}
          {screen === 'entry' && 'Open a thread'}
          {screen === 'analyzing-artifact' && 'Reading the artifact'}
          {screen === 'choosing' && 'Choose your question'}
          {screen === 'characterizing' && 'Reading the thread'}
          {screen === 'feed' && 'Your feed'}
          {screen === 'reader' && 'Reading'}
          {screen === 'review' && 'Session review'}
          {(screen === 'diff' || screen === 'diff-loading') && 'What moved'}
          {screen === 'profile' && 'The shape of your inquiry'}
          {screen === 'thread-history' && 'Thread history'}
        </div>
        {screen !== 'entry' && screen !== 'home' && screen !== 'loading' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {savedThreads.length > 0 && (
              <button className="ghost-btn" onClick={() => setScreen('home')}>← All threads</button>
            )}
            <button className="ghost-btn" onClick={restart}>Start over</button>
          </div>
        )}
      </header>

      <main className="stage">
        {error && (
          <div className="error-banner">
            <strong>Snag:</strong> {error}
            <button className="ghost-btn small" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {screen === 'loading' && (
          <Loading lines={["Loading your threads…"]} />
        )}

        {screen === 'home' && (
          <HomeScreen
            threads={savedThreads}
            onOpenThread={openThreadHistory}
            onContinueThread={continueThread}
            onNewThread={startNewThread}
            onDelete={handleDeleteThread}
            onProfile={openCrossProfile}
            onTree={(rootId) => { setViewingThread({ rootId }); setScreen('thread-tree'); }}
          />
        )}

        {screen === 'thread-tree' && viewingThread?.rootId && (
          <ThreadTreeScreen
            rootId={viewingThread.rootId}
            threads={savedThreads}
            onOpenThread={openThreadHistory}
            onBack={() => setScreen('home')}
          />
        )}

        {screen === 'cross-profile' && viewingThread && (
          <CrossThreadProfile
            threads={savedThreads}
            allSessions={viewingThread.allSessions || []}
            onBack={() => setScreen('home')}
            onOpenThread={openThreadHistory}
          />
        )}

        {screen === 'thread-history' && viewingThread && (
          <ThreadHistoryScreen
            thread={viewingThread.thread}
            sessions={viewingThread.sessions}
            onContinue={() => continueThread(viewingThread.thread.id)}
            onBack={() => setScreen('home')}
            onDelete={() => handleDeleteThread(viewingThread.thread.id)}
            onSpawn={(anchorItem, newQuestion) => spawnFromHistory(viewingThread.thread, anchorItem, newQuestion)}
          />
        )}

        {screen === 'entry' && <EntryScreen onSubmitQuestion={submitQuestion} onSubmitArtifact={submitArtifact} />}

        {screen === 'analyzing-artifact' && (
          <Loading lines={[
            "Looking at the artifact…",
            "Noting what's salient…",
            "Surfacing candidate questions…",
            "Offering angles to choose from…"
          ]} />
        )}

        {screen === 'choosing' && (
          <ChoosingScreen
            artifact={artifact}
            candidates={candidates}
            onChoose={(q) => submitQuestion(q, artifact)}
            onBack={restart}
          />
        )}

        {screen === 'characterizing' && (
          <Loading lines={[
            "Reading the question…",
            "Naming what it's carrying…",
            "Noting what's not engaged with…",
            "Choosing the opening move…"
          ]} />
        )}

        {screen === 'feed' && (
          <FeedScreen
            question={question}
            artifact={artifact}
            characterization={characterization}
            feed={feed}
            loadingSlots={loadingSlots}
            signals={signals}
            onSignal={(i, v) => setSignals(prev => ({ ...prev, [i]: v }))}
            onOpen={(i) => { setOpenReader(i); setScreen('reader'); }}
            onReview={() => setScreen('review')}
            onRetry={retrySlot}
          />
        )}

        {screen === 'reader' && openReader !== null && (
          <ReaderScreen
            item={feed[openReader]}
            question={question}
            artifact={artifact}
            signal={signals[openReader]}
            onSignal={(v) => setSignals(prev => ({ ...prev, [openReader]: v }))}
            onClose={() => { setOpenReader(null); setScreen('feed'); }}
          />
        )}

        {screen === 'review' && (
          <ReviewScreen
            question={question}
            artifact={artifact}
            feed={feed}
            signals={signals}
            evolved={evolved}
            onSubmit={submitReview}
            onRetry={retryDiff}
            onSkip={skipReview}
            onSpawn={spawnFromItem}
            hasError={!!error}
            onBack={() => setScreen('feed')}
          />
        )}

        {screen === 'diff-loading' && (
          <Loading lines={[
            "Diffing the articulations…",
            "Naming what moved…",
            "Assembling the next feed…"
          ]} />
        )}

        {screen === 'diff' && (
          <DiffScreen
            original={question}
            artifact={artifact}
            evolved={evolved}
            moves={diffMoves}
            nextFeed={nextFeed}
            loadingNext={loadingNext}
            onProfile={() => setScreen('profile')}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            question={question}
            artifact={artifact}
            characterization={characterization}
            feed={feed}
            signals={signals}
            evolved={evolved}
            moves={diffMoves}
            nextFeed={nextFeed}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================
// ENTRY
// ============================================================

function EntryScreen({ onSubmitQuestion, onSubmitArtifact }) {
  const [mode, setMode] = useState('question');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const textRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    if (mode === 'question') textRef.current?.focus();
  }, [mode]);

  const examples = [
    "When does a community member who was not born into it count as one of them?",
    "What kind of knowing does a craftsperson have that can't be transmitted by explanation?",
    "Why does it feel shameful to be the kind of person one has become?",
  ];

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    const isImage = f.type.startsWith('image/');
    const isPdf = f.type === 'application/pdf';
    if (!isImage && !isPdf) { setUploadError("Only images and PDFs are supported."); return; }
    if (f.size > 10 * 1024 * 1024) { setUploadError("File over 10MB."); return; }
    setUploading(true);
    try {
      const base64 = await readFileAsBase64(f);
      setFile(f);
      setFileBase64(base64);
      setFilePreview(isImage ? `data:${f.type};base64,${base64}` : null);
    } catch (err) {
      setUploadError("Couldn't read the file. " + err.message);
    } finally { setUploading(false); }
  };

  const clearFile = () => {
    setFile(null); setFileBase64(null); setFilePreview(null); setNote('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitArtifact = () => {
    if (!file || !fileBase64) return;
    onSubmitArtifact({
      kind: file.type === 'application/pdf' ? 'pdf' : 'image',
      mediaType: file.type, base64: fileBase64, filename: file.name, note: note.trim(),
    });
  };

  return (
    <div className="entry-screen fade-in">
      <div className="eyebrow">Step 01 · Opening a thread</div>
      <h1>What are you <em>holding</em>?</h1>
      <p className="lede">A thread isn't a post or a draft. It's something you're actively pursuing — a question, a curiosity, an artifact you can't put down.</p>

      <div className="mode-toggle three">
        <button className={`mode-btn ${mode === 'question' ? 'active' : ''}`} onClick={() => setMode('question')}>I have a question</button>
        <button className={`mode-btn ${mode === 'explore' ? 'active' : ''}`} onClick={() => setMode('explore')}>I want to explore something</button>
        <button className={`mode-btn ${mode === 'artifact' ? 'active' : ''}`} onClick={() => setMode('artifact')}>I have an artifact</button>
      </div>

      {mode === 'question' && (
        <>
          <div className="compose">
            <textarea ref={textRef} placeholder="Type the question you're holding…" value={text} onChange={e => setText(e.target.value)} rows={5} />
            <button className="primary-btn" disabled={!text.trim()} onClick={() => onSubmitQuestion(text)}>Open the thread →</button>
          </div>
          <div className="examples">
            <div className="examples-label">Or try one of these:</div>
            {examples.map((ex, i) => (
              <button key={i} className="example-btn" onClick={() => onSubmitQuestion(ex)}>
                <span className="q-mark">?</span> {ex}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === 'explore' && (
        <>
          <div className="compose">
            <textarea ref={textRef} placeholder="Describe what you want to explore — a contrast, a tension, a territory, a feeling…" value={text} onChange={e => setText(e.target.value)} rows={5} />
            <button className="primary-btn" disabled={!text.trim()} onClick={() => onSubmitQuestion(text, 'explore')}>Open the thread →</button>
          </div>
          <div className="examples">
            <div className="examples-label">Or try one of these:</div>
            {[
              "Show me things from the real world that contrast eurhythmic and isorhythmic ways of living",
              "I want to understand what makes a building feel alive vs. dead",
              "Examples of communities that survived their founder leaving",
            ].map((ex, i) => (
              <button key={i} className="example-btn" onClick={() => onSubmitQuestion(ex, 'explore')}>
                <span className="q-mark" style={{ color: 'var(--sage)' }}>↪</span> {ex}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === 'artifact' && (
        <div className="upload-compose">
          {!file ? (
            <>
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <div className="upload-glyph">⤒</div>
                <div className="upload-primary">Upload an image or PDF</div>
                <div className="upload-secondary">A photograph you took · a page from something you're reading · an image that won't leave you alone</div>
                <div className="upload-tertiary">JPG · PNG · WebP · GIF · PDF · up to 10MB</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
              {uploading && <div className="upload-status">Reading file…</div>}
              {uploadError && <div className="upload-error">{uploadError}</div>}
            </>
          ) : (
            <>
              <div className="upload-preview">
                {filePreview ? <img src={filePreview} alt="" /> : (
                  <div className="pdf-preview">
                    <div className="pdf-icon">PDF</div>
                    <div className="pdf-filename">{file.name}</div>
                    <div className="pdf-size">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                )}
                <button className="ghost-btn small clear-file" onClick={clearFile}>Replace</button>
              </div>
              <div className="note-compose">
                <label className="note-label">What drew you to it? <span className="optional">(optional)</span></label>
                <textarea placeholder="What caught your attention? What's unresolved about it?" value={note} onChange={e => setNote(e.target.value)} rows={3} />
              </div>
              <button className="primary-btn" onClick={submitArtifact}>Surface candidate questions →</button>
              <div className="upload-next-note">
                Next: the system will look at what you uploaded and offer three different questions this artifact could anchor.
              </div>
            </>
          )}
        </div>
      )}

      <aside className="note-aside">
        <div className="margin-label">What happens next</div>
        <p>The system reads your thread structurally — what it's carrying, what it's not engaging with, what kind of move would sharpen it. Then it assembles four items: one that sharpens, one that complicates, one that bridges, one that grounds.</p>
        <p>No algorithmic feed. One thread, one feed, shaped to the thread.</p>
      </aside>
    </div>
  );
}

// ============================================================
// THREAD TREE — visual mind map of a thread lineage
// ============================================================

function ThreadTreeScreen({ rootId, threads, onOpenThread, onBack }) {
  // Build the tree rooted at rootId
  const lineage = threads.filter(t => (t.rootThreadId || t.id) === rootId);
  if (lineage.length === 0) {
    return (
      <div className="profile-screen fade-in">
        <h1>Tree not found</h1>
        <button className="ghost-btn" onClick={onBack}>← Back</button>
      </div>
    );
  }

  const root = lineage.find(t => t.id === rootId) || lineage[0];
  const childrenOf = (id) => lineage.filter(t => t.parentThreadId === id);

  // Recursive layout — assign depth and computed x positions
  // Strategy: walk the tree depth-first, assign each node an x-coordinate based on its leaf order
  const positions = {};
  const NODE_W = 220;
  const NODE_H = 90;
  const VGAP = 50;
  const HGAP = 30;

  let leafCounter = 0;
  function layout(nodeId, depth) {
    const kids = childrenOf(nodeId);
    if (kids.length === 0) {
      const x = leafCounter * (NODE_W + HGAP);
      positions[nodeId] = { x, y: depth * (NODE_H + VGAP), depth };
      leafCounter++;
      return x;
    }
    const childXs = kids.map(k => layout(k.id, depth + 1));
    const x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    positions[nodeId] = { x, y: depth * (NODE_H + VGAP), depth };
    return x;
  }
  layout(root.id, 0);

  const allXs = Object.values(positions).map(p => p.x);
  const allYs = Object.values(positions).map(p => p.y);
  const minX = Math.min(...allXs, 0);
  const width = Math.max(...allXs, 0) - minX + NODE_W + 40;
  const height = Math.max(...allYs, 0) + NODE_H + 40;

  return (
    <div className="profile-screen fade-in">
      <div className="eyebrow">Inquiry tree · {lineage.length} {lineage.length === 1 ? 'thread' : 'threads'}</div>
      <h1>How this <em>inquiry branched.</em></h1>
      <p className="lede">Each node is a thread. A child branches from a parent when an item moved you and you opened a new question anchored to it. Click any node to open that thread.</p>

      <div style={{ overflow: 'auto', padding: 20, background: 'var(--bg-deep)', border: '1px solid var(--rule-soft)', borderRadius: 2, marginBottom: 24 }}>
        <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          {/* Edges */}
          {lineage.map(t => {
            if (!t.parentThreadId) return null;
            const me = positions[t.id];
            const par = positions[t.parentThreadId];
            if (!me || !par) return null;
            const x1 = par.x - minX + NODE_W / 2;
            const y1 = par.y + NODE_H;
            const x2 = me.x - minX + NODE_W / 2;
            const y2 = me.y;
            const midY = (y1 + y2) / 2;
            return (
              <path key={`edge-${t.id}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none" stroke="#b8923a" strokeWidth="1.5" opacity="0.6" />
            );
          })}
          {/* Nodes */}
          {lineage.map(t => {
            const p = positions[t.id];
            if (!p) return null;
            const x = p.x - minX;
            const isRoot = t.id === root.id;
            return (
              <g key={t.id} style={{ cursor: 'pointer' }} onClick={() => onOpenThread(t.id)}>
                <rect x={x} y={p.y} width={NODE_W} height={NODE_H}
                  fill="#f5f0e6"
                  stroke={isRoot ? '#8f2418' : '#b8923a'}
                  strokeWidth={isRoot ? 2 : 1}
                  rx="2" />
                <text x={x + 12} y={p.y + 18}
                  fontFamily="'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.4"
                  fill="#8a7f72">
                  {isRoot ? 'ROOT' : 'SPAWN'}
                  {' · '}
                  {t.sessionCount} {t.sessionCount === 1 ? 'SESSION' : 'SESSIONS'}
                </text>
                <foreignObject x={x + 10} y={p.y + 24} width={NODE_W - 20} height={NODE_H - 32}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{
                    fontFamily: "'Fraunces', serif", fontSize: 13, lineHeight: 1.3, color: '#1a1612',
                    overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3,
                  }}>
                    {t.currentQuestion || t.originalQuestion}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      <section className="profile-section">
        <div className="section-label">Thread list (in branching order)</div>
        {lineage.map(t => (
          <div key={t.id} className="thread-row" style={{ marginLeft: positions[t.id]?.depth * 20 || 0 }}>
            <div className="thread-row-main" onClick={() => onOpenThread(t.id)}>
              <div className="thread-row-text">
                <div className="thread-row-question">{t.currentQuestion || t.originalQuestion}</div>
                {t.spawnAnchor?.title && (
                  <div className="spawned-from">↳ anchored on "{t.spawnAnchor.title.slice(0, 80)}"</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="actions-row">
        <button className="ghost-btn" onClick={onBack}>← All threads</button>
      </div>
    </div>
  );
}

// ============================================================
// HOME — list of saved threads
// ============================================================

function HomeScreen({ threads, onOpenThread, onContinueThread, onNewThread, onDelete, onProfile, onTree }) {
  const formatDate = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return new Date(ts).toLocaleDateString();
  };

  // Index by id for parent lookups, group by root for tree summaries
  const byId = Object.fromEntries(threads.map(t => [t.id, t]));
  const childrenByRoot = {};
  for (const t of threads) {
    const root = t.rootThreadId || t.id;
    if (!childrenByRoot[root]) childrenByRoot[root] = [];
    childrenByRoot[root].push(t);
  }

  return (
    <div className="home-screen fade-in">
      <div className="eyebrow">Welcome back</div>
      <h1>Your <em>threads.</em></h1>
      <p className="lede">Open questions you've been holding. Each one persists across sessions — return whenever you're ready.</p>

      <div className="threads-list">
        {threads.map(t => {
          const parent = t.parentThreadId ? byId[t.parentThreadId] : null;
          const root = t.rootThreadId || t.id;
          const lineageSize = (childrenByRoot[root] || []).length;
          return (
            <div key={t.id} className={`thread-row ${t.parentThreadId ? 'is-spawned' : ''}`}>
              <div className="thread-row-main" onClick={() => onOpenThread(t.id)}>
                {t.artifactSummary?.thumbnail && <img src={t.artifactSummary.thumbnail} alt="" className="thread-thumb" />}
                {t.artifactSummary && !t.artifactSummary.thumbnail && <div className="thread-thumb pdf-thumb">PDF</div>}
                <div className="thread-row-text">
                  <div className="thread-row-question">{t.currentQuestion || t.originalQuestion}</div>
                  {parent && (
                    <div className="spawned-from">
                      ↳ spawned from "{(parent.currentQuestion || parent.originalQuestion).slice(0, 70)}{(parent.currentQuestion || parent.originalQuestion).length > 70 ? '…' : ''}"
                      {t.spawnAnchor?.title && <span> · anchored on "{t.spawnAnchor.title.slice(0, 50)}{t.spawnAnchor.title.length > 50 ? '…' : ''}"</span>}
                    </div>
                  )}
                  {!parent && t.currentQuestion && t.currentQuestion !== t.originalQuestion && (
                    <div className="thread-row-original">started as: <em>{t.originalQuestion}</em></div>
                  )}
                  <div className="thread-row-meta">
                    {t.sessionCount} {t.sessionCount === 1 ? 'session' : 'sessions'} · last visited {formatDate(t.lastSessionAt)}
                    {lineageSize > 1 && <span> · part of a lineage of {lineageSize}</span>}
                  </div>
                </div>
              </div>
              <div className="thread-row-actions">
                <button className="ghost-btn small" onClick={() => onContinueThread(t.id)}>Continue ↻</button>
                <button className="ghost-btn small" onClick={() => onOpenThread(t.id)}>History →</button>
                {lineageSize > 1 && onTree && (
                  <button className="ghost-btn small" onClick={() => onTree(root)}>Tree ⌥</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="actions-row" style={{ marginTop: 32 }}>
        <button className="primary-btn" onClick={onNewThread}>+ Open a new thread</button>
        {onProfile && threads.length > 0 && (
          <button className="ghost-btn" onClick={onProfile} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            ✦ View your inquiry signature
          </button>
        )}
      </div>

      <aside className="note-aside" style={{ marginTop: 40 }}>
        <div className="margin-label">About persistence</div>
        <p>Your threads are stored locally and persist across sessions. Coming back tomorrow, next week, or in a month, you'll find them here. Continuing a thread re-runs it on your most recent re-articulation. Spawning from a moving item creates a new thread anchored to that item — the inquiry tree branches.</p>
      </aside>
    </div>
  );
}

function MultiSessionHeatmap({ sessions }) {
  if (!sessions || sessions.length === 0) return null;

  const slots = ['sharpen', 'complicate', 'bridge', 'ground'];
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };
  const slotColors = {
    sharpen: '#8f2418',
    complicate: '#6b7559',
    bridge: '#b8923a',
    ground: '#4a4038',
  };

  // Compute intensity per (session, slot)
  const grid = sessions.map(s => {
    const row = {};
    const safeSignals = s.signals || {};
    const diffText = (s.diffMoves || []).map(m => (m.content || '').toLowerCase()).join(' ');
    for (const slot of slots) {
      const item = (s.feed || []).find(x => x && x.slot === slot && !x.failed);
      if (!item) { row[slot] = { intensity: 0, sig: null, title: '—' }; continue; }
      const sig = safeSignals[(s.feed || []).indexOf(item)];
      let intensity = 0.5;
      if (sig === 'sharpen') intensity = 3;
      else if (sig === 'neutral') intensity = 1;
      else if (sig === 'close') intensity = 0.2;
      const titleWords = (item.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const referenced = titleWords.some(w => diffText.includes(w)) || diffText.includes(slot);
      if (referenced) intensity += 1.5;
      row[slot] = { intensity, sig, title: item.title };
    }
    return row;
  });

  const maxI = Math.max(1, ...grid.flatMap(r => slots.map(s => r[s].intensity)));

  const cellW = 80;
  const cellH = 56;
  const labelW = 110;
  const headerH = 28;
  const gap = 4;
  const width = labelW + (cellW + gap) * sessions.length;
  const height = headerH + (cellH + gap) * 4 + 30;

  return (
    <div className="heatmap-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: Math.max(400, width), display: 'block' }}>
        {/* Session column headers */}
        {sessions.map((s, i) => {
          const x = labelW + i * (cellW + gap);
          return (
            <text key={i} x={x + cellW / 2} y={20} textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace" fontSize="10" letterSpacing="1" fill="#8a7f72">
              S{i + 1}
            </text>
          );
        })}

        {/* Slot rows */}
        {slots.map((slot, rowIdx) => {
          const y = headerH + rowIdx * (cellH + gap);
          return (
            <g key={slot}>
              <text x={labelW - 10} y={y + cellH / 2 + 4} textAnchor="end"
                fontFamily="'JetBrains Mono', monospace" fontSize="10.5" letterSpacing="1.4" fill="#4a4038">
                {slotLabels[slot].toUpperCase()}
              </text>
              {sessions.map((s, colIdx) => {
                const cell = grid[colIdx][slot];
                const norm = cell.intensity / maxI;
                const x = labelW + colIdx * (cellW + gap);
                return (
                  <g key={colIdx}>
                    <rect x={x} y={y} width={cellW} height={cellH}
                      fill={slotColors[slot]} opacity={0.12 + norm * 0.78} rx="2">
                      <title>{cell.title}{cell.sig ? ` — ${cell.sig}` : ''}</title>
                    </rect>
                    {cell.sig && (
                      <text x={x + cellW / 2} y={y + cellH / 2 + 5} textAnchor="middle"
                        fontFamily="'Fraunces', serif" fontSize="13" fontWeight="500"
                        fill="#f5f0e6" opacity={norm > 0.4 ? 1 : 0.7}>
                        {cell.sig === 'sharpen' ? '✦' : cell.sig === 'neutral' ? '○' : '–'}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 12, color: 'var(--ink-faded)', marginTop: 8, textAlign: 'center' }}>
        rows: slots · columns: sessions over time · intensity: signal + diff reference
      </div>
    </div>
  );
}

// ============================================================
// CROSS-THREAD PROFILE — aggregate inquiry shape across all threads
// ============================================================

function CrossThreadProfile({ threads, allSessions, onBack, onOpenThread }) {
  // Aggregate stats across every session
  const sessions = allSessions;
  const slots = ['sharpen', 'complicate', 'bridge', 'ground'];
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };

  // Slot responsiveness across all sessions
  const slotStats = {};
  for (const slot of slots) slotStats[slot] = { sharpen: 0, neutral: 0, close: 0, unread: 0, refInDiff: 0 };

  let totalDiffs = 0;
  const allDomains = [];
  const allQuestionTypes = [];
  const allPresuppositions = [];
  const allAbsent = [];
  const reArticulationTypes = []; // 'narrowed' | 'widened' | 'distinction-added' | 'cosmetic'

  for (const s of sessions) {
    if (s.diffMoves?.length) totalDiffs++;
    if (s.characterization) {
      if (s.characterization.domain) allDomains.push(s.characterization.domain);
      if (s.characterization.questionType) allQuestionTypes.push(s.characterization.questionType);
      if (s.characterization.presuppositions) allPresuppositions.push(...s.characterization.presuppositions);
      if (s.characterization.absent) allAbsent.push(...s.characterization.absent);
    }
    const diffText = (s.diffMoves || []).map(m => (m.content || '').toLowerCase()).join(' ');
    (s.feed || []).forEach((it, i) => {
      if (!it || !slotStats[it.slot]) return;
      const sig = (s.signals || {})[i];
      if (sig === 'sharpen') slotStats[it.slot].sharpen++;
      else if (sig === 'neutral') slotStats[it.slot].neutral++;
      else if (sig === 'close') slotStats[it.slot].close++;
      else slotStats[it.slot].unread++;
      const titleWords = (it.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      if (titleWords.some(w => diffText.includes(w))) slotStats[it.slot].refInDiff++;
    });

    // Heuristic re-articulation typing
    for (const m of (s.diffMoves || [])) {
      const label = (m.label || '').toLowerCase();
      if (label.includes('narrow')) reArticulationTypes.push('narrowed');
      else if (label.includes('widen') || label.includes('broaden')) reArticulationTypes.push('widened');
      else if (label.includes('distinct') || label.includes('refine')) reArticulationTypes.push('distinction-added');
      else if (label.includes('cosmetic') || label.includes('minimal') || label.includes('rewording')) reArticulationTypes.push('cosmetic');
    }
  }

  // What slot moves you most? (sharpen + diff-reference rate)
  const slotResponsiveness = slots.map(slot => {
    const st = slotStats[slot];
    const total = st.sharpen + st.neutral + st.close + st.unread;
    const movementScore = total ? (st.sharpen + st.refInDiff) / total : 0;
    return { slot, movementScore, ...st, total };
  }).sort((a, b) => b.movementScore - a.movementScore);

  const topSlot = slotResponsiveness[0];
  const bottomSlot = slotResponsiveness[slotResponsiveness.length - 1];

  // Top recurring presuppositions (frequency)
  const tally = (arr) => {
    const m = {};
    for (const x of arr) m[x] = (m[x] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const topPresuppositions = tally(allPresuppositions);
  const topAbsent = tally(allAbsent);
  const topDomains = tally(allDomains);

  const totalSignals = Object.values(slotStats).reduce((a, b) => a + b.sharpen + b.neutral + b.close, 0);

  return (
    <div className="profile-screen fade-in">
      <div className="eyebrow">Profile · across all threads</div>
      <h1>Your <em>inquiry signature.</em></h1>
      <p className="lede">A structural reading across {threads.length} {threads.length === 1 ? 'thread' : 'threads'} and {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}. Not a record of what you read — a portrait of how you think when you're holding open questions.</p>

      <section className="profile-section">
        <div className="section-label">At a glance</div>
        <div className="stats-row">
          <div className="stat"><div className="stat-num">{threads.length}</div><div className="stat-label">threads</div></div>
          <div className="stat"><div className="stat-num">{sessions.length}</div><div className="stat-label">sessions</div></div>
          <div className="stat"><div className="stat-num" style={{ color: 'var(--accent)' }}>{totalDiffs}</div><div className="stat-label">articulation shifts</div></div>
          <div className="stat"><div className="stat-num">{totalSignals}</div><div className="stat-label">items signaled</div></div>
        </div>
      </section>

      {sessions.length >= 1 && topSlot && (
        <section className="profile-section">
          <div className="section-label">What moves your thinking</div>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 17, lineHeight: 1.55, color: 'var(--ink)', maxWidth: 'none' }}>
            <strong>{slotLabels[topSlot.slot]}</strong>-slot items move you most — {Math.round(topSlot.movementScore * 100)}% of {slotLabels[topSlot.slot]} items either marked you ✦ or showed up in articulation-diffs.
            {bottomSlot && bottomSlot.slot !== topSlot.slot && bottomSlot.movementScore < topSlot.movementScore * 0.6 && (
              <> Items in the <strong>{slotLabels[bottomSlot.slot]}</strong> slot move you least — only {Math.round(bottomSlot.movementScore * 100)}%.</>
            )}
          </p>

          <div className="slot-responsiveness">
            <h4>Slot responsiveness</h4>
            {slotResponsiveness.map(s => {
              const totalNonZero = s.total || 1;
              const sharpenedPct = Math.round((s.sharpen / totalNonZero) * 100);
              return (
                <div key={s.slot} className={`slot-row slot-${s.slot}`}>
                  <div className="slot-name"><span className="dot" />{slotLabels[s.slot]}</div>
                  <div className="slot-item-name">
                    ✦ {s.sharpen} · ○ {s.neutral} · – {s.close} · referenced in diff: {s.refInDiff}
                  </div>
                  <div className="slot-sig">{Math.round(s.movementScore * 100)}% movement</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {topDomains.length > 0 && (
        <section className="profile-section">
          <div className="section-label">Where your inquiry lives</div>
          <div className="signature-grid">
            <div>
              <h4>Recurring domains</h4>
              <ul>{topDomains.map(([d, n], i) => <li key={i}>{d} <span style={{ color: 'var(--ink-faded)' }}>· {n}</span></li>)}</ul>
            </div>
            {topPresuppositions.length > 0 && (
              <div>
                <h4>Recurring presuppositions</h4>
                <ul>{topPresuppositions.map(([p, n], i) => <li key={i}>{p}{n > 1 && <span style={{ color: 'var(--ink-faded)' }}> · {n}</span>}</li>)}</ul>
              </div>
            )}
            {topAbsent.length > 0 && (
              <div>
                <h4>Conspicuously absent (recurring)</h4>
                <ul>{topAbsent.map(([a, n], i) => <li key={i}>{a}{n > 1 && <span style={{ color: 'var(--ink-faded)' }}> · {n}</span>}</li>)}</ul>
              </div>
            )}
            {reArticulationTypes.length > 0 && (
              <div>
                <h4>How you tend to re-articulate</h4>
                <ul>
                  {Object.entries(reArticulationTypes.reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {}))
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n], i) => <li key={i}>{t} <span style={{ color: 'var(--ink-faded)' }}>· {n}</span></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="profile-section">
        <div className="section-label">Your threads</div>
        <div className="threads-list">
          {threads.map(t => (
            <div key={t.id} className="thread-row" onClick={() => onOpenThread(t.id)} style={{ cursor: 'pointer' }}>
              <div className="thread-row-main">
                {t.artifactSummary?.thumbnail && <img src={t.artifactSummary.thumbnail} alt="" className="thread-thumb" />}
                <div className="thread-row-text">
                  <div className="thread-row-question">{t.currentQuestion || t.originalQuestion}</div>
                  <div className="thread-row-meta">{t.sessionCount} {t.sessionCount === 1 ? 'session' : 'sessions'}</div>
                </div>
              </div>
              <div className="thread-row-actions">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-faded)' }}>history →</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="actions-row">
        <button className="ghost-btn" onClick={onBack}>← All threads</button>
      </div>
    </div>
  );
}


// ============================================================
// COLLAPSIBLE STATS — click a stat to see the items behind it
// ============================================================

function CollapsibleStats({ sessions, totals, slotLabels, onSpawn }) {
  const [expanded, setExpanded] = useState(null);
  const [spawnFor, setSpawnFor] = useState(null); // unique key per item
  const [spawnQuestion, setSpawnQuestion] = useState('');

  // Collect items by signal across all sessions
  const itemsBySignal = { sharpen: [], neutral: [], close: [] };
  sessions.forEach((s, sIdx) => {
    (s.feed || []).forEach((it, i) => {
      if (it.failed) return;
      const sig = (s.signals || {})[i];
      if (sig && itemsBySignal[sig]) {
        itemsBySignal[sig].push({ ...it, sessionIdx: sIdx, sessionDate: s.startedAt, _key: `${sIdx}-${i}` });
      }
    });
  });

  const cards = [
    { key: 'sessions', num: sessions.length, label: 'sessions', color: 'var(--ink)' },
    { key: 'sharpen', num: totals.sharpen, label: '✦ moved me', color: 'var(--accent)' },
    { key: 'neutral', num: totals.neutral, label: '○ neutral', color: 'var(--ink)' },
    { key: 'close', num: totals.close, label: '– closed', color: 'var(--ink)' },
  ];

  const toggle = (key) => setExpanded(expanded === key ? null : key);

  const renderItem = (it, i, signalKey) => {
    const sigGlyph = it.sessionIdx !== undefined ? `S${it.sessionIdx + 1}` : '';
    const canSpawn = !!onSpawn && signalKey === 'sharpen';
    const spawnKey = it._key || i;
    const isSpawning = spawnFor === spawnKey;
    return (
      <div key={i} style={{ padding: '10px 0', borderBottom: '1px dashed var(--rule-soft)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {sigGlyph && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-faded)', minWidth: 32, paddingTop: 2 }}>{sigGlyph}</span>
          )}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-faded)', textTransform: 'uppercase', minWidth: 70, paddingTop: 2 }}>{slotLabels[it.slot] || it.slot}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.35 }}>
              {it.url ? (
                <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted var(--ink-faded)' }}>{it.title}</a>
              ) : it.title}
            </div>
            {it.source && <div style={{ fontSize: 11.5, color: 'var(--ink-faded)', marginTop: 2 }}>{it.source}</div>}
          </div>
          {canSpawn && !isSpawning && (
            <button className="ghost-btn small" onClick={() => setSpawnFor(spawnKey)} style={{ flexShrink: 0 }}>
              → Pursue this
            </button>
          )}
        </div>

        {canSpawn && isSpawning && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--rule-soft)' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faded)', marginBottom: 8 }}>
              New thread anchored to this item
            </div>
            <textarea
              autoFocus
              placeholder="What do you want to ask about this?"
              value={spawnQuestion}
              onChange={e => setSpawnQuestion(e.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontFamily: "'Fraunces', serif", fontSize: 15, lineHeight: 1.5, background: 'var(--bg)', border: '1.5px solid var(--gold)', borderRadius: 2, outline: 'none', resize: 'vertical', color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button className="ghost-btn small" onClick={() => { setSpawnFor(null); setSpawnQuestion(''); }}>Cancel</button>
              <button
                className="primary-btn"
                style={{ padding: '8px 14px', fontSize: 13 }}
                disabled={!spawnQuestion.trim()}
                onClick={() => { onSpawn(it, spawnQuestion); setSpawnFor(null); setSpawnQuestion(''); }}
              >Open new thread →</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="stats-row">
        {cards.map(c => (
          <div
            key={c.key}
            className={`stat clickable ${expanded === c.key ? 'expanded' : ''}`}
            onClick={() => toggle(c.key)}
            style={{ cursor: 'pointer' }}
          >
            <div className="stat-num" style={{ color: c.color }}>{c.num}</div>
            <div className="stat-label">{c.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--ink-faded)', marginTop: 4, letterSpacing: '0.1em' }}>
              {expanded === c.key ? '▾ hide' : '▸ show'}
            </div>
          </div>
        ))}
      </div>

      {expanded === 'sessions' && (
        <div style={{ marginTop: 16, padding: 18, background: 'var(--bg-deep)', borderLeft: '3px solid var(--gold)' }}>
          {sessions.map((s, idx) => (
            <div key={s.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: idx < sessions.length - 1 ? '1px dashed var(--rule-soft)' : 'none' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: 'var(--ink-faded)', marginBottom: 6 }}>
                Session {idx + 1} · {new Date(s.startedAt).toLocaleDateString()}
              </div>
              {s.questionAtClose && s.questionAtClose !== s.questionAtOpen && (
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: 'var(--ink)', marginBottom: 6 }}>
                  → "{s.questionAtClose}"
                </div>
              )}
              {s.diffMoves && s.diffMoves.length > 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {s.diffMoves.map((m, i) => (
                    <span key={i}>{i > 0 && ' · '}<strong>{m.label}</strong></span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--ink-faded)', fontStyle: 'italic' }}>No re-articulation recorded.</div>
              )}
            </div>
          ))}
        </div>
      )}

      {(expanded === 'sharpen' || expanded === 'neutral' || expanded === 'close') && (
        <div style={{ marginTop: 16, padding: 18, background: 'var(--bg-deep)', borderLeft: '3px solid ' + (expanded === 'sharpen' ? 'var(--accent)' : 'var(--rule)') }}>
          {itemsBySignal[expanded].length === 0 ? (
            <p style={{ color: 'var(--ink-faded)', fontStyle: 'italic', margin: 0, fontSize: 13 }}>No items in this category yet.</p>
          ) : (
            itemsBySignal[expanded].map((it, i) => renderItem(it, i, expanded))
          )}
        </div>
      )}
    </>
  );
}

// ============================================================
// THREAD HISTORY — multi-session view of a single thread
// ============================================================

function ThreadHistoryScreen({ thread, sessions, onContinue, onBack, onDelete, onSpawn }) {
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };

  // Aggregate signal counts across sessions
  const allSignals = sessions.flatMap(s => Object.values(s.signals || {}));
  const totals = {
    sharpen: allSignals.filter(v => v === 'sharpen').length,
    neutral: allSignals.filter(v => v === 'neutral').length,
    close: allSignals.filter(v => v === 'close').length,
  };

  // Slot responsiveness across sessions
  const slotStats = {};
  for (const slot of ['sharpen', 'complicate', 'bridge', 'ground']) {
    slotStats[slot] = { sharpened: 0, neutral: 0, closed: 0, unread: 0 };
  }
  for (const s of sessions) {
    (s.feed || []).forEach((it, i) => {
      if (!slotStats[it.slot]) return;
      const sig = (s.signals || {})[i];
      if (sig === 'sharpen') slotStats[it.slot].sharpened++;
      else if (sig === 'neutral') slotStats[it.slot].neutral++;
      else if (sig === 'close') slotStats[it.slot].closed++;
      else slotStats[it.slot].unread++;
    });
  }

  // Articulation evolution chain
  const articulations = [thread.originalQuestion, ...sessions.filter(s => s.questionAtClose).map(s => s.questionAtClose)];

  return (
    <div className="profile-screen fade-in">
      <div className="eyebrow">Thread · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</div>
      <h1>The shape of this <em>inquiry.</em></h1>
      <p className="lede">A thread held across {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}, with {allSignals.length} items signaled and {sessions.filter(s => s.diffMoves?.length).length} articulation shifts recorded.</p>

      <section className="profile-section">
        <div className="section-label">Articulation evolution</div>
        {thread.artifactSummary?.thumbnail && (
          <img src={thread.artifactSummary.thumbnail} alt="" style={{ maxWidth: 160, marginBottom: 14, border: '1px solid var(--rule-soft)', borderRadius: 2 }} />
        )}
        {articulations.map((q, i) => (
          <React.Fragment key={i}>
            <div className={i === 0 ? "articulation-old" : (i === articulations.length - 1 ? "articulation-new" : "articulation-old")}>
              {q}
            </div>
            {i < articulations.length - 1 && <div className="diff-arrow">↓ session {i + 1}</div>}
          </React.Fragment>
        ))}
      </section>

      <section className="profile-section">
        <div className="section-label">Heatmap — how each session moved you</div>
        <p style={{ marginBottom: 16, color: 'var(--ink-soft)', fontSize: 14 }}>
          Each column is a session in order. Each row is a slot. Darker cells carried more weight — combining your signal with whether the item showed up in what actually moved.
        </p>
        <MultiSessionHeatmap sessions={sessions} />
      </section>

      <section className="profile-section">
        <div className="section-label">Cumulative engagement</div>
        <CollapsibleStats sessions={sessions} totals={totals} slotLabels={slotLabels} onSpawn={onSpawn} />

        <div className="slot-responsiveness">
          <h4>Slot responsiveness across all sessions</h4>
          {Object.entries(slotStats).map(([slot, stats]) => {
            const total = stats.sharpened + stats.neutral + stats.closed + stats.unread;
            const sharpenedPct = total ? Math.round((stats.sharpened / total) * 100) : 0;
            return (
              <div key={slot} className={`slot-row slot-${slot}`}>
                <div className="slot-name"><span className="dot" />{slotLabels[slot]}</div>
                <div className="slot-item-name">
                  ✦ {stats.sharpened} moved · ○ {stats.neutral} · – {stats.closed} {stats.unread > 0 && `· ${stats.unread} unread`}
                </div>
                <div className="slot-sig">{sharpenedPct}% moved me</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="actions-row">
        <button className="ghost-btn" onClick={onBack}>← All threads</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ghost-btn" onClick={() => { if (confirm('Delete this thread and all its sessions? This cannot be undone.')) onDelete(); }} style={{ color: 'var(--accent)' }}>Delete thread</button>
          <button className="primary-btn" onClick={onContinue}>Continue this thread →</button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// CHOOSING (after artifact upload)
// ============================================================

function ChoosingScreen({ artifact, candidates, onChoose, onBack }) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('');

  const filePreview = artifact.kind === 'image'
    ? `data:${artifact.mediaType};base64,${artifact.base64}`
    : null;

  return (
    <div className="choosing-screen fade-in">
      <div className="eyebrow">Step 01b · Choose your question</div>
      <h1>What are you <em>actually</em> holding?</h1>
      <p className="lede">Three ways this artifact could anchor an inquiry. Pick the one closest to what you're holding — or write your own. The feed will compose on whichever you choose.</p>

      <div className="choosing-two-col">
        <div className="artifact-pane">
          <div className="section-label">The artifact</div>
          {filePreview ? (
            <img src={filePreview} alt="Uploaded artifact" className="choosing-image" />
          ) : (
            <div className="pdf-preview compact">
              <div className="pdf-icon">PDF</div>
              <div className="pdf-filename">{artifact.filename}</div>
            </div>
          )}

          {artifact.note && (
            <div className="artifact-note">
              <div className="section-label">Your note</div>
              <p>"{artifact.note}"</p>
            </div>
          )}

          <div className="artifact-observation">
            <div className="section-label">What the system saw</div>
            <p>{artifact.observation}</p>
          </div>
        </div>

        <div className="candidates-pane">
          <div className="section-label">Candidate questions</div>

          {candidates.map((c, i) => (
            <button key={i} className="candidate-card" onClick={() => onChoose(c.question)}>
              <div className="candidate-angle">{c.angle}</div>
              <div className="candidate-question">{c.question}</div>
              <div className="candidate-cta">Open thread on this →</div>
            </button>
          ))}

          <div className="custom-wrap">
            {!customMode ? (
              <button className="custom-toggle" onClick={() => setCustomMode(true)}>
                ✎ None of these — write my own
              </button>
            ) : (
              <div className="custom-compose">
                <div className="section-label">Write your question</div>
                <textarea
                  placeholder="The question the artifact made you want to hold, in your own words…"
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="custom-actions">
                  <button className="ghost-btn" onClick={() => setCustomMode(false)}>Back to candidates</button>
                  <button
                    className="primary-btn"
                    disabled={!customText.trim()}
                    onClick={() => onChoose(customText)}
                  >Open thread →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="actions-row" style={{ marginTop: 32 }}>
        <button className="ghost-btn" onClick={onBack}>← Upload something else</button>
      </div>
    </div>
  );
}

// ============================================================
// FEED
// ============================================================

function FeedScreen({ question, artifact, characterization, feed, loadingSlots, signals, onSignal, onOpen, onReview, onRetry }) {
  const slotOrder = ['sharpen', 'complicate', 'bridge', 'ground'];
  const slotLabels = {
    sharpen: 'Sharpen',
    complicate: 'Complicate',
    bridge: 'Bridge',
    ground: 'Ground',
  };

  const byIndex = feed.map((it, i) => ({ ...it, i }));
  const signaledCount = Object.values(signals).filter(Boolean).length;

  return (
    <div className="feed-screen fade-in">
      <div className="two-col">
        <div className="primary-col">
          <div className="eyebrow">Step 02 · The first feed</div>
          <div className="thread-card">
            <div className="meta">Thread · Open</div>
            <div className="question">{question}</div>
            {artifact && <ArtifactBadge artifact={artifact} />}
          </div>

          <div className="feed-header">
            <h3>Feed</h3>
            <div className="note">Four slots · Tap to read · Signal at the bottom</div>
          </div>

          {slotOrder.map(slot => {
            const item = byIndex.find(x => x.slot === slot);
            if (loadingSlots[slot] && !item) {
              return (
                <div key={slot} className={`feed-item loading slot-${slot}`}>
                  <div className="slot-tag"><span className="dot" />{slotLabels[slot]}</div>
                  <div className="loading-item">Searching for a {slot} move…</div>
                </div>
              );
            }
            if (!item) return null;
            if (item.failed) {
              return (
                <div key={slot} className={`feed-item failed slot-${slot}`}>
                  <div className="slot-tag"><span className="dot" />{slotLabels[slot]}</div>
                  <div className="loading-item">
                    The {slot} slot didn't return a good item.
                    <button className="ghost-btn small" onClick={() => onRetry(slot)}>Try again</button>
                  </div>
                </div>
              );
            }
            const sig = signals[item.i];
            return (
              <div key={slot} className={`feed-item slot-${slot}`}>
                <div onClick={() => onOpen(item.i)} style={{ cursor: 'pointer' }}>
                  <div className="slot-tag"><span className="dot" />{slotLabels[slot]}</div>
                  {(() => {
                    const thumb = getThumbnail(item);
                    const isVideo = item.mediaType === 'video' || !!extractYouTubeId(item.url);
                    return (
                      <div className="feed-thumb-wrap">
                        {thumb ? (
                          <img src={thumb} alt="" className="feed-thumb-img" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('placeholder'); }} />
                        ) : (
                          <div className={`feed-thumb-placeholder media-${item.mediaType || 'essay'}`}>
                            <span className="placeholder-label">{(item.mediaType || 'item').toUpperCase()}</span>
                          </div>
                        )}
                        {isVideo && thumb && <div className="play-overlay">▶</div>}
                      </div>
                    );
                  })()}
                  <div className="title">{item.title}</div>
                  <div className="source">
                    <span className={`media-tag media-${item.mediaType}`}>{item.mediaType}</span>
                    {item.source}
                  </div>
                  <div className="preview">{item.preview}</div>
                  <div className="open-hint">Open inline →</div>
                </div>
                <div className="feed-signal-row">
                  <SignalBar value={sig} onChange={(v) => onSignal(item.i, v)} />
                  <button
                    className="ghost-btn small"
                    onClick={(e) => { e.stopPropagation(); onRetry(slot); }}
                    title="Replace this item with a different one"
                    style={{ marginLeft: 'auto' }}
                  >↻ different item</button>
                </div>
              </div>
            );
          })}

          <div className="review-cta">
            <div className="review-cta-note">
              {signaledCount === 0 ? 'Signal at least one item before reviewing — but read them first.' :
               signaledCount === 1 ? '1 item signaled. You can review whenever you\'re ready.' :
               `${signaledCount} items signaled. You can review whenever you're ready.`}
            </div>
            <button className="primary-btn" onClick={onReview} disabled={feed.length < 2}>
              End session · Review →
            </button>
          </div>
        </div>

        <aside className="margin-col">
          {characterization && (
            <>
              <div className="margin-label">How the system read your thread</div>
              {characterization.register && (
                <div className="margin-block" style={{ background: 'var(--bg-deep)', padding: '12px 14px', borderLeft: '3px solid var(--accent)', marginBottom: 14 }}>
                  <h4 style={{ color: 'var(--accent)' }}>Register</h4>
                  <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink)' }}>
                    {characterization.register}
                  </p>
                </div>
              )}
              <div className="margin-block">
                <h4>Domain</h4>
                <p>{characterization.domain}</p>
              </div>
              <div className="margin-block">
                <h4>Question type</h4>
                <p>{characterization.questionType}</p>
              </div>
              <div className="margin-block">
                <h4>Presuppositions carried</h4>
                <ul>{characterization.presuppositions.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
              <div className="margin-block">
                <h4>Conspicuously absent</h4>
                <ul>{characterization.absent.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
              <div className="margin-block">
                <h4>Opening move</h4>
                <p><em>{characterization.openingMove}</em></p>
              </div>

              <div className="margin-label" style={{ marginTop: 28 }}>Why each item is in its slot</div>
              {feed.map((it, i) => (
                <div key={i} className="margin-block">
                  <h4>{slotLabels[it.slot]}</h4>
                  <p>{it.why}</p>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ============================================================
// READER
// ============================================================

function ReaderScreen({ item, question, artifact, signal, onSignal, onClose }) {
  return (
    <div className="reader-screen fade-in">
      <div className="reader-thread-pin">
        <button className="close-reader" onClick={onClose}>← Back to feed</button>
        <div className="pinned-question">
          <div className="meta">Held thread</div>
          <div className="q">{question}</div>
          {artifact && <ArtifactBadge artifact={artifact} size="small" />}
        </div>
      </div>

      <div className="reader-body">
        <div className="reader-slot-tag">
          <span className={`media-tag media-${item.mediaType}`}>{item.mediaType}</span>
          <span className="reader-slot">{item.slot} slot</span>
        </div>
        <h1 className="reader-title">{item.title}</h1>
        <div className="reader-source">{item.source}</div>

        <div className="reader-preview-block">
          <div className="preview-label">Preview</div>
          <p>{item.preview}</p>
        </div>

        <div className="reader-inline-note">
          <p><em>In the full platform, the item content renders here inline — Wikipedia via their API, Reddit via public JSON, YouTube embedded, essays via reader-mode extraction. This prototype shows the preview and links out. The signal goes below either way — inside the reader, not back in the list.</em></p>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="external-link">
            Open the source → <span className="url">{item.url}</span>
          </a>
        </div>

        <div className="reader-why">
          <div className="why-label">Why this item, for this thread</div>
          <p>{item.why}</p>
        </div>

        <div className="reader-signal">
          <div className="signal-prompt">Signal before closing</div>
          <SignalBar value={signal} onChange={onSignal} size="large" />
        </div>

        <button className="primary-btn" onClick={onClose}>Close and return to feed</button>
      </div>
    </div>
  );
}

// ============================================================
// REVIEW
// ============================================================

function ReviewScreen({ question, artifact, feed, signals, evolved, onSubmit, onRetry, onSkip, onSpawn, hasError, onBack }) {
  const [evolvedText, setEvolvedText] = useState(evolved || question);
  const [reasoning, setReasoning] = useState('');
  const [spawnFor, setSpawnFor] = useState(null); // index of item being spawned from
  const [spawnQuestion, setSpawnQuestion] = useState('');

  const sharpenedBy = feed.filter((_, i) => signals[i] === 'sharpen');
  const other = feed.filter((_, i) => signals[i] && signals[i] !== 'sharpen');

  // Items eligible for spawn = those that moved the user (sharpen) and have a real URL
  const spawnable = feed
    .map((it, i) => ({ ...it, _i: i }))
    .filter(it => signals[it._i] === 'sharpen' && !it.failed);

  return (
    <div className="review-screen fade-in">
      <div className="eyebrow">Step 04 · Session review</div>
      <h1>Which of these moved your question?</h1>
      <p className="lede">Session review is where Mosaic gets its strongest signal. The answers train the model — not clicks, not dwell, not signals alone.</p>

      <div className="review-block">
        <h3>Items that moved you ✦</h3>
        {sharpenedBy.length === 0 ? (
          <p className="quiet">None. That's fine — it's also a signal.</p>
        ) : (
          <ul className="pill-list">
            {sharpenedBy.map((it, i) => <li key={i} className="pill sharpen">{it.title}</li>)}
          </ul>
        )}
        {other.length > 0 && (
          <>
            <h3 style={{ marginTop: 20 }}>And others</h3>
            <ul className="pill-list">
              {other.map((it, i) => (
                <li key={i} className={`pill ${signals[feed.indexOf(it)]}`}>
                  <Glyph sig={signals[feed.indexOf(it)]} /> {it.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="review-block">
        <h3>How would you state your question now?</h3>
        {artifact && (
          <div style={{ marginBottom: 12 }}>
            <ArtifactBadge artifact={artifact} size="small" />
          </div>
        )}
        <div className="articulation-old">{question}</div>
        <div className="diff-arrow">↓ after this session</div>
        <textarea
          className="articulation-input"
          value={evolvedText}
          onChange={e => setEvolvedText(e.target.value)}
          rows={4}
          placeholder="Re-articulate the question. It might have sharpened, widened, split in two, or mostly stayed."
        />
        <div className="quiet-note">
          The re-articulation is the highest-value artifact of the session. It's what the system diffs against the original to learn what kind of move actually worked on this thread.
        </div>
      </div>

      {onSpawn && spawnable.length > 0 && (
        <div className="review-block" style={{ borderLeft: '3px solid var(--gold)' }}>
          <h3>Or follow a thread from one of these</h3>
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink-soft)', marginBottom: 16 }}>
            One of the items moved you. Pursue it — open a new thread anchored to that item, with a question of your own. The current thread will be saved as it stands.
          </p>
          {spawnable.map(it => (
            <div key={it._i} className="spawn-item">
              <div className="spawn-item-head">
                <span className={`media-tag media-${it.mediaType}`}>{it.mediaType}</span>
                <span className="spawn-slot-label">{it.slot}</span>
              </div>
              <div className="spawn-item-title">{it.title}</div>
              <div className="spawn-item-source">{it.source}</div>

              {spawnFor === it._i ? (
                <div className="spawn-form">
                  <textarea
                    autoFocus
                    placeholder="What do you want to ask about this?"
                    value={spawnQuestion}
                    onChange={e => setSpawnQuestion(e.target.value)}
                    rows={3}
                  />
                  <div className="spawn-form-actions">
                    <button className="ghost-btn small" onClick={() => { setSpawnFor(null); setSpawnQuestion(''); }}>Cancel</button>
                    <button
                      className="primary-btn"
                      style={{ padding: '8px 14px', fontSize: 13 }}
                      disabled={!spawnQuestion.trim()}
                      onClick={() => { onSpawn(it, spawnQuestion); setSpawnFor(null); setSpawnQuestion(''); }}
                    >Open new thread →</button>
                  </div>
                </div>
              ) : (
                <button className="ghost-btn small" onClick={() => setSpawnFor(it._i)} style={{ marginTop: 8 }}>
                  → Pursue this
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="actions-row">
        <button className="ghost-btn" onClick={onBack}>← Back to feed</button>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {onSkip && (
            <button className="ghost-btn" onClick={onSkip} title="Save the session without re-articulating">
              Skip — ask me another time
            </button>
          )}
          {hasError && onRetry && (
            <button
              className="ghost-btn"
              onClick={onRetry}
              disabled={!evolvedText.trim()}
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >↻ Retry diff</button>
          )}
          <button
            className="primary-btn"
            onClick={() => onSubmit(evolvedText)}
            disabled={!evolvedText.trim()}
          >{hasError ? 'Submit again →' : 'Submit review →'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DIFF
// ============================================================

function DiffScreen({ original, artifact, evolved, moves, nextFeed, loadingNext, onProfile }) {
  const slotOrder = ['sharpen', 'complicate', 'bridge', 'ground'];
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };

  return (
    <div className="diff-screen fade-in">
      <div className="eyebrow">Step 05 · What the system learned</div>
      <h1>The articulation-diff is <em>the learning signal.</em></h1>
      <p className="lede">The system doesn't learn "user liked item X." It learns: when this user held a question of this shape, these moves produced these shifts. That's what transfers.</p>

      <div className="review-block">
        <div className="section-label">Articulation evolution</div>
        {artifact && (
          <div style={{ marginBottom: 12 }}>
            <ArtifactBadge artifact={artifact} size="small" />
          </div>
        )}
        <div className="articulation-old">{original}</div>
        <div className="diff-arrow">↓</div>
        <div className="articulation-new">{evolved}</div>

        <div className="diff-grid">
          {moves.map((m, i) => (
            <div key={i} className="diff-card">
              <div className="label">{m.label}</div>
              <div className="content">{m.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="claim-block">
        <div className="claim-eyebrow">Naming it</div>
        <div className="claim-text">
          This is the effect-measurement loop. From this point, every session contributes empirical signal to the model: which item, in which thread-state, produced which shift. At n=1 it corrects your feed. At scale, it generalizes.
        </div>
      </div>

      <div className="actions-row" style={{ marginTop: 40 }}>
        <button className="primary-btn" onClick={onProfile}>See the shape of this session →</button>
      </div>
    </div>
  );
}

// ============================================================
// SHAPE VISUALIZATION — single-session slot heatmap
// ============================================================

function SessionShape({ feed, signals, moves }) {
  if (!feed || feed.length === 0) return null;
  const safeMoves = moves || [];
  const safeSignals = signals || {};
  const slots = ['sharpen', 'complicate', 'bridge', 'ground'];
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };
  const slotColors = {
    sharpen: '#8f2418',
    complicate: '#6b7559',
    bridge: '#b8923a',
    ground: '#4a4038',
  };

  // Derive per-slot intensity from signals + diff evidence
  const slotData = slots.map(slot => {
    const item = feed.find(x => x && x.slot === slot && !x.failed);
    if (!item) return { slot, intensity: 0, sig: null, title: '—' };
    const sig = safeSignals[feed.indexOf(item)];
    let intensity = 0.5;
    if (sig === 'sharpen') intensity = 3;
    else if (sig === 'neutral') intensity = 1;
    else if (sig === 'close') intensity = 0.2;

    const titleWords = (item.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const diffText = safeMoves.map(m => (m.content || '').toLowerCase()).join(' ');
    const referenced = titleWords.some(w => diffText.includes(w)) || diffText.includes(slot);
    if (referenced) intensity += 1.5;

    return { slot, intensity, sig, title: item.title };
  });

  const maxIntensity = Math.max(...slotData.map(d => d.intensity), 1);

  // 2x2 grid layout: sharpen, complicate top row; bridge, ground bottom row
  const cells = [
    { ...slotData[0], x: 0, y: 0 },
    { ...slotData[1], x: 1, y: 0 },
    { ...slotData[2], x: 0, y: 1 },
    { ...slotData[3], x: 1, y: 1 },
  ];

  const cellSize = 140;
  const gap = 8;
  const width = cellSize * 2 + gap;
  const height = cellSize * 2 + gap + 40; // extra for caption

  return (
    <div className="session-shape">
      <svg viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 360, display: 'block' }}>
        {cells.map((c, i) => {
          const normalized = c.intensity / maxIntensity;
          const opacity = 0.15 + normalized * 0.85;
          const color = slotColors[c.slot];
          const x = c.x * (cellSize + gap);
          const y = c.y * (cellSize + gap);
          return (
            <g key={i}>
              <rect x={x} y={y} width={cellSize} height={cellSize} fill={color} opacity={opacity} rx="2" />
              <text x={x + 10} y={y + 20} fontFamily="'JetBrains Mono', monospace" fontSize="10" letterSpacing="1.5" fill="#f5f0e6" opacity={normalized > 0.4 ? 1 : 0.7}>
                {slotLabels[c.slot].toUpperCase()}
              </text>
              <text x={x + 10} y={y + cellSize - 14} fontFamily="'Fraunces', serif" fontStyle="italic" fontSize="10" fill="#f5f0e6" opacity={normalized > 0.4 ? 0.95 : 0.6}>
                {c.sig === 'sharpen' ? '✦ sharpened' : c.sig === 'neutral' ? '○ neutral' : c.sig === 'close' ? '– closed' : 'unread'}
              </text>
              {/* subtle center dot indicating intensity */}
              <circle cx={x + cellSize / 2} cy={y + cellSize / 2} r={4 + normalized * 14} fill="#f5f0e6" opacity={0.25 + normalized * 0.4} />
            </g>
          );
        })}
        <text x={width / 2} y={height - 8} textAnchor="middle" fontFamily="'Fraunces', serif" fontStyle="italic" fontSize="11" fill="#8a7f72">
          intensity = signal strength + referenced in diff
        </text>
      </svg>
    </div>
  );
}

// ============================================================
// PROFILE
// ============================================================

function ProfileScreen({ question, artifact, characterization, feed, signals, evolved, moves, nextFeed, onRestart }) {
  const slotLabels = { sharpen: 'Sharpen', complicate: 'Complicate', bridge: 'Bridge', ground: 'Ground' };
  const signalCount = {
    sharpen: Object.values(signals).filter(v => v === 'sharpen').length,
    neutral: Object.values(signals).filter(v => v === 'neutral').length,
    close: Object.values(signals).filter(v => v === 'close').length,
  };
  const read = Object.keys(signals).length;

  return (
    <div className="profile-screen fade-in">
      <div className="eyebrow">Profile · Session one</div>
      <h1>The shape of your inquiry.</h1>
      <p className="lede">Not a history of what you did. A structural reading of the thread you held, how it moved, and where it's heading.</p>

      <section className="profile-section">
        <div className="section-label">The thread you held</div>
        <div className="thread-card">
          <div className="meta">Opened</div>
          <div className="question">{question}</div>
          {artifact && <ArtifactBadge artifact={artifact} size="small" />}
        </div>
        <div className="thread-card evolved" style={{ marginTop: 12 }}>
          <div className="meta">Evolved</div>
          <div className="question">{evolved}</div>
        </div>
      </section>

      <section className="profile-section">
        <div className="section-label">Structural signature</div>
        <div className="signature-grid">
          <div>
            <h4>Domain</h4>
            <p>{characterization.domain}</p>
          </div>
          <div>
            <h4>Question type</h4>
            <p>{characterization.questionType}</p>
          </div>
          <div>
            <h4>Presuppositions</h4>
            <ul>{characterization.presuppositions.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div>
            <h4>Absent</h4>
            <ul>{characterization.absent.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className="profile-section">
        <div className="section-label">Shape of the session</div>
        <p style={{ marginBottom: 16, color: 'var(--ink-soft)', fontSize: 14 }}>
          A quick visual: which slots carried weight in this session. Intensity combines your signals with whether the slot's item showed up in what actually moved.
        </p>
        <SessionShape feed={feed} signals={signals} moves={moves} />
      </section>

      <section className="profile-section">
        <div className="section-label">Session engagement</div>
        <div className="stats-row">
          <div className="stat"><div className="stat-num">{read}/{feed.length}</div><div className="stat-label">items signaled</div></div>
          <div className="stat"><div className="stat-num" style={{ color: 'var(--accent)' }}>{signalCount.sharpen}</div><div className="stat-label">✦ sharpened</div></div>
          <div className="stat"><div className="stat-num">{signalCount.neutral}</div><div className="stat-label">○ neutral</div></div>
          <div className="stat"><div className="stat-num">{signalCount.close}</div><div className="stat-label">– closed</div></div>
        </div>

        <div className="slot-responsiveness">
          <h4>Which slots moved you</h4>
          {['sharpen', 'complicate', 'bridge', 'ground'].map(slot => {
            const item = feed.find(x => x.slot === slot);
            if (!item) return null;
            const sig = signals[feed.indexOf(item)];
            return (
              <div key={slot} className={`slot-row slot-${slot}`}>
                <div className="slot-name"><span className="dot" />{slotLabels[slot]}</div>
                <div className="slot-item-name">{item.title}</div>
                <div className="slot-sig"><Glyph sig={sig} /> {sig || 'unread'}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="profile-section">
        <div className="section-label">What moved</div>
        <div className="diff-grid">
          {moves.map((m, i) => (
            <div key={i} className="diff-card">
              <div className="label">{m.label}</div>
              <div className="content">{m.content}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-section close-note">
        <p><em>This is the shape of a single session. The full profile accretes: threads held, their evolutions, the structural signatures that recur, the slots your inquiry tends to be moved by, the domains your thinking bridges toward. A reader — not an algorithm's picture of you.</em></p>
      </section>

      <div className="actions-row">
        <button className="primary-btn" onClick={onRestart}>Hold another thread →</button>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap');

.wm-root {
  --bg: #f5f0e6;
  --bg-deep: #efe8d8;
  --ink: #1a1612;
  --ink-soft: #4a4038;
  --ink-faded: #8a7f72;
  --rule: #d4c9b4;
  --rule-soft: #e5dcc8;
  --accent: #8f2418;
  --accent-soft: #b84a3c;
  --sage: #6b7559;
  --gold: #b8923a;
  --highlight: #f0e6cc;

  --sharpen-color: #8f2418;
  --complicate-color: #6b7559;
  --bridge-color: #b8923a;
  --ground-color: #4a4038;

  background: var(--bg);
  background-image:
    radial-gradient(ellipse at top left, rgba(184, 146, 58, 0.06) 0%, transparent 50%),
    radial-gradient(ellipse at bottom right, rgba(107, 117, 89, 0.05) 0%, transparent 50%);
  color: var(--ink);
  font-family: 'Instrument Sans', -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

.wm-root *, .wm-root *::before, .wm-root *::after { box-sizing: border-box; }

/* ---------- TOP BAR ---------- */
.topbar {
  position: sticky; top: 0; z-index: 50;
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
  padding: 14px 32px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px;
}
.brand {
  font-family: 'Fraunces', serif;
  font-weight: 500; font-size: 20px;
  letter-spacing: -0.01em; font-style: italic;
}
.brand::before {
  content: "✦ "; color: var(--accent); font-style: normal;
}
.screen-indicator {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--ink-faded);
  letter-spacing: 0.14em; text-transform: uppercase;
}

.ghost-btn {
  background: transparent; border: 1px solid var(--rule);
  padding: 7px 14px; font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-soft); cursor: pointer;
  transition: all 0.15s;
}
.ghost-btn:hover { background: var(--highlight); color: var(--ink); }
.ghost-btn.small { padding: 4px 10px; font-size: 10px; margin-left: 12px; }

.primary-btn {
  background: var(--accent); color: var(--bg);
  border: none; padding: 11px 22px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
  letter-spacing: 0.01em;
}
.primary-btn:hover:not(:disabled) { background: var(--accent-soft); }
.primary-btn:disabled { background: var(--rule); cursor: not-allowed; color: var(--ink-faded); }

/* ---------- STAGE ---------- */
.stage { max-width: 1280px; margin: 0 auto; padding: 40px 32px 80px; }

.eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--accent);
  letter-spacing: 0.16em; text-transform: uppercase;
  margin-bottom: 16px; font-weight: 500;
}

.wm-root h1 {
  font-family: 'Fraunces', serif;
  font-weight: 400; font-size: 40px;
  line-height: 1.15; letter-spacing: -0.02em;
  color: var(--ink); margin-bottom: 18px;
  max-width: 720px;
}
.wm-root h1 em { font-style: italic; color: var(--accent); }

.wm-root h2 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 22px; margin: 28px 0 10px; color: var(--ink); }
.wm-root h3 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 18px; margin: 20px 0 10px; color: var(--ink); }
.wm-root h4 { font-family: 'Instrument Sans', sans-serif; font-weight: 600; font-size: 12.5px; letter-spacing: 0.05em; text-transform: uppercase; margin: 0 0 6px; color: var(--ink-soft); }

.wm-root p { color: var(--ink-soft); font-size: 15.5px; line-height: 1.65; max-width: 640px; margin-bottom: 14px; }
.wm-root .lede { color: var(--ink); font-family: 'Fraunces', serif; font-weight: 300; font-size: 19px; line-height: 1.55; margin-bottom: 28px; max-width: 700px; font-style: italic; }
.wm-root .quiet { color: var(--ink-faded); font-style: italic; }
.wm-root ul { padding-left: 18px; color: var(--ink-soft); font-size: 14.5px; }
.wm-root li { margin-bottom: 4px; }

.fade-in { animation: fade 0.45s ease-out; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ---------- ERROR ---------- */
.error-banner {
  background: #fef0ee; border-left: 3px solid var(--accent);
  padding: 12px 18px; font-size: 14px; color: var(--ink-soft);
  margin-bottom: 24px; border-radius: 2px;
  display: flex; align-items: center; gap: 10px;
}

/* ---------- ENTRY ---------- */
.entry-screen { max-width: 760px; margin: 0 auto; }
.mode-toggle {
  display: flex; gap: 0; border: 1px solid var(--rule);
  border-radius: 2px; margin: 22px 0 16px; overflow: hidden;
  background: var(--bg-deep);
}
.mode-btn {
  flex: 1; padding: 10px 16px;
  background: transparent; border: none;
  font-family: 'Instrument Sans', sans-serif; font-size: 13px;
  color: var(--ink-faded); cursor: pointer;
  transition: all 0.15s;
}
.mode-btn.active { background: var(--bg); color: var(--ink); font-weight: 500; }
.mode-toggle.three .mode-btn:not(:last-child) { border-right: 1px solid var(--rule); }
.mode-toggle .mode-btn:first-child { border-right: 1px solid var(--rule); }

.compose {
  background: var(--bg-deep); border: 1px solid var(--rule);
  padding: 20px; border-radius: 2px; margin-bottom: 20px;
}
.compose textarea {
  width: 100%; border: none; background: transparent;
  font-family: 'Fraunces', serif; font-size: 18px;
  line-height: 1.5; color: var(--ink);
  resize: vertical; outline: none; min-height: 80px;
  margin-bottom: 14px;
}
.compose textarea::placeholder { color: var(--ink-faded); font-style: italic; }

.examples { margin: 28px 0; }
.examples-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--ink-faded);
  letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 10px;
}
.example-btn {
  display: block; width: 100%; text-align: left;
  background: transparent; border: 1px solid var(--rule-soft);
  padding: 12px 16px; margin-bottom: 8px; border-radius: 2px;
  font-family: 'Fraunces', serif; font-size: 15.5px;
  color: var(--ink-soft); cursor: pointer;
  transition: all 0.15s; font-style: italic;
}
.example-btn:hover { border-color: var(--accent); background: var(--bg-deep); color: var(--ink); }
.q-mark { color: var(--accent); font-weight: 600; margin-right: 8px; font-style: normal; }

.note-aside {
  margin-top: 40px; padding: 24px;
  background: var(--bg-deep);
  border-left: 3px solid var(--gold);
}
.note-aside p { font-size: 14.5px; }

/* ---------- LOADING ---------- */
.loading-block {
  max-width: 600px; margin: 80px auto; text-align: center;
  padding: 60px 40px;
}
.loading-glyph {
  font-size: 40px; color: var(--accent);
  animation: pulse 1.6s ease-in-out infinite;
  margin-bottom: 24px;
}
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.loading-text {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 19px; color: var(--ink-soft);
  animation: fadein 0.4s ease-out;
}
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }

/* ---------- FEED / TWO-COL ---------- */
.two-col {
  display: grid; grid-template-columns: 1fr 340px;
  gap: 48px; align-items: start;
}
@media (max-width: 960px) { .two-col { grid-template-columns: 1fr; } }

.primary-col { min-width: 0; }

.margin-col {
  position: sticky; top: 80px;
  max-height: calc(100vh - 100px); overflow-y: auto;
  padding-left: 24px; border-left: 1px solid var(--rule);
}
.margin-col::-webkit-scrollbar { width: 6px; }
.margin-col::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 3px; }

.margin-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--ink-faded);
  letter-spacing: 0.16em; text-transform: uppercase;
  margin-bottom: 14px; font-weight: 500;
}
.margin-block {
  margin-bottom: 18px; padding-bottom: 18px;
  border-bottom: 1px dashed var(--rule-soft);
}
.margin-block:last-child { border-bottom: none; }
.margin-block p, .margin-block ul { font-size: 13px; line-height: 1.55; }
.margin-block h4 { margin-bottom: 6px; font-size: 11px; color: var(--ink-soft); }

/* ---------- THREAD CARD ---------- */
.thread-card {
  background: var(--bg-deep); border: 1px solid var(--rule);
  padding: 20px 24px; border-radius: 2px;
  margin-bottom: 28px;
}
.thread-card.evolved { border-left: 3px solid var(--sage); }
.thread-card .meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; color: var(--ink-faded);
  letter-spacing: 0.14em; text-transform: uppercase;
  margin-bottom: 8px;
}
.thread-card .question {
  font-family: 'Fraunces', serif; font-size: 19px;
  line-height: 1.45; color: var(--ink);
  font-style: italic;
}

.feed-header {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 16px; border-bottom: 1px solid var(--rule);
  padding-bottom: 10px;
}
.feed-header h3 { margin: 0; }
.feed-header .note {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; color: var(--ink-faded);
  letter-spacing: 0.1em; text-transform: uppercase;
}

/* ---------- FEED ITEM ---------- */
.feed-item {
  background: var(--bg); border: 1px solid var(--rule-soft);
  padding: 18px 22px 12px; margin-bottom: 14px;
  border-radius: 2px; transition: all 0.18s;
  border-left-width: 3px;
}
.feed-item:not(.inert):hover { border-color: var(--rule); background: var(--bg-deep); }
.feed-item.slot-sharpen { border-left-color: var(--sharpen-color); }
.feed-item.slot-complicate { border-left-color: var(--complicate-color); }
.feed-item.slot-bridge { border-left-color: var(--bridge-color); }
.feed-item.slot-ground { border-left-color: var(--ground-color); }
.feed-item.loading { opacity: 0.75; background: var(--bg-deep); }
.feed-item.failed { background: #fef7f5; }
.feed-item.compact { padding: 14px 18px; }

.slot-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-soft);
  margin-bottom: 10px; display: flex; align-items: center; gap: 6px;
  font-weight: 500;
}
.slot-tag .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.slot-sharpen .slot-tag .dot, .slot-sharpen .dot { background: var(--sharpen-color); }
.slot-complicate .slot-tag .dot, .slot-complicate .dot { background: var(--complicate-color); }
.slot-bridge .slot-tag .dot, .slot-bridge .dot { background: var(--bridge-color); }
.slot-ground .slot-tag .dot, .slot-ground .dot { background: var(--ground-color); }

.feed-item .title {
  font-family: 'Fraunces', serif; font-size: 19px;
  font-weight: 500; line-height: 1.3;
  color: var(--ink); margin-bottom: 6px;
  letter-spacing: -0.01em;
}
.feed-item .source {
  font-size: 13px; color: var(--ink-faded);
  margin-bottom: 10px; display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.media-tag {
  display: inline-block; padding: 2px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px; letter-spacing: 0.1em;
  text-transform: uppercase; border-radius: 2px;
  background: var(--rule-soft); color: var(--ink-soft);
  font-weight: 500;
}
.media-video, .media-film { background: #e8d8c5; color: #6b4a2e; }
.media-essay, .media-primer, .media-paper { background: #e0dccf; color: #4a4038; }
.media-reddit { background: #f0d9c8; color: #7a3a1c; }
.media-interview, .media-podcast { background: #d9dcc8; color: #4a5030; }
.media-art, .media-classical { background: #e8d8b8; color: #5a4020; }

.feed-thumb-wrap {
  position: relative;
  margin: -4px 0 12px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--bg-deep);
  max-height: 180px;
  min-height: 120px;
}
.feed-thumb-placeholder {
  width: 100%;
  height: 120px;
  background: linear-gradient(135deg, var(--bg-deep) 0%, var(--rule-soft) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.feed-thumb-placeholder::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(143, 36, 24, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(184, 146, 58, 0.08) 0%, transparent 40%);
}
.feed-thumb-placeholder.media-video,
.feed-thumb-placeholder.media-film {
  background: linear-gradient(135deg, #4a3a28 0%, #6b4a2e 100%);
}
.feed-thumb-placeholder.media-essay,
.feed-thumb-placeholder.media-paper,
.feed-thumb-placeholder.media-primer {
  background: linear-gradient(135deg, var(--bg-deep) 0%, var(--rule) 100%);
}
.feed-thumb-placeholder.media-interview,
.feed-thumb-placeholder.media-podcast {
  background: linear-gradient(135deg, #4a5030 0%, #6b7559 100%);
}
.feed-thumb-placeholder.media-reddit {
  background: linear-gradient(135deg, #7a3a1c 0%, #b84a3c 100%);
}
.feed-thumb-placeholder.media-art,
.feed-thumb-placeholder.media-classical,
.feed-thumb-placeholder.media-image {
  background: linear-gradient(135deg, #5a4020 0%, #b8923a 100%);
}
.placeholder-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--bg);
  opacity: 0.55;
  font-weight: 500;
  position: relative;
  z-index: 1;
}
.feed-thumb-img {
  width: 100%;
  height: auto;
  max-height: 180px;
  object-fit: cover;
  display: block;
}
.play-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 48px;
  height: 48px;
  background: rgba(143, 36, 24, 0.88);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  padding-left: 4px;
}

.feed-item .preview {
  font-size: 14px; color: var(--ink-soft);
  line-height: 1.55; margin-bottom: 10px;
  font-family: 'Fraunces', serif; font-weight: 300;
}
.feed-item .open-hint {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--accent);
  letter-spacing: 0.1em; text-transform: uppercase;
}
.feed-item .preview-why {
  font-size: 13.5px; color: var(--ink-soft);
  background: var(--bg-deep); padding: 10px 14px;
  border-left: 2px solid var(--rule);
  margin-top: 10px; line-height: 1.55;
}
.feed-item .preview-why strong { color: var(--ink); }

.loading-item {
  font-family: 'Fraunces', serif; font-style: italic;
  color: var(--ink-faded); font-size: 15px;
}

.feed-signal-row {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed var(--rule-soft);
}

/* ---------- SIGNAL BAR ---------- */
.signal-bar { display: flex; gap: 8px; }
.signal-btn {
  flex: 0 0 auto; background: transparent;
  border: 1px solid var(--rule); border-radius: 2px;
  padding: 6px 12px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  font-family: 'Instrument Sans', sans-serif;
  font-size: 12px; color: var(--ink-faded);
  transition: all 0.15s;
}
.signal-btn:hover { border-color: var(--ink-soft); }
.signal-btn .g { font-size: 14px; }
.signal-btn.active.sig-sharpen { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.signal-btn.active.sig-neutral { background: var(--ink-soft); color: var(--bg); border-color: var(--ink-soft); }
.signal-btn.active.sig-close { background: var(--ink-faded); color: var(--bg); border-color: var(--ink-faded); }
.signal-btn.active .l { font-weight: 500; }
.signal-bar.large .signal-btn { padding: 10px 20px; font-size: 14px; }

/* ---------- REVIEW CTA ---------- */
.review-cta {
  margin-top: 40px; padding: 24px;
  background: var(--bg-deep); border: 1px solid var(--rule);
  display: flex; align-items: center; justify-content: space-between;
  gap: 20px; flex-wrap: wrap;
}
.review-cta-note {
  font-family: 'Fraunces', serif; font-size: 15px;
  color: var(--ink-soft); font-style: italic; flex: 1 1 auto;
}

/* ---------- READER ---------- */
.reader-screen { max-width: 760px; margin: 0 auto; }
.reader-thread-pin {
  position: sticky; top: 60px;
  background: var(--bg); padding: 16px 0; z-index: 10;
  border-bottom: 1px solid var(--rule); margin-bottom: 32px;
}
.close-reader {
  background: transparent; border: none;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-soft); cursor: pointer;
  padding: 4px 0; margin-bottom: 10px;
}
.pinned-question .meta {
  font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  color: var(--ink-faded); letter-spacing: 0.14em;
  text-transform: uppercase; margin-bottom: 4px;
}
.pinned-question .q {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 16.5px; color: var(--ink); line-height: 1.4;
}

.reader-body { padding: 0 0 60px; }
.reader-slot-tag {
  display: flex; gap: 10px; align-items: center;
  margin-bottom: 16px;
}
.reader-slot {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-faded);
}
.reader-title {
  font-size: 32px; margin-bottom: 8px;
}
.reader-source {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 16px; color: var(--ink-soft);
  margin-bottom: 24px;
}
.reader-preview-block {
  padding: 20px 24px; background: var(--bg-deep);
  border-left: 3px solid var(--accent);
  margin-bottom: 20px;
}
.preview-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-faded);
  margin-bottom: 8px;
}
.reader-preview-block p { font-family: 'Fraunces', serif; font-size: 17px; line-height: 1.6; color: var(--ink); }
.reader-inline-note {
  padding: 20px; background: #f8f0dc;
  border-left: 3px solid var(--gold);
  margin-bottom: 28px; font-size: 13.5px;
}
.reader-inline-note p { font-size: 13.5px; color: var(--ink-soft); margin-bottom: 12px; }
.external-link {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--accent); text-decoration: none;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 8px 14px; border: 1px solid var(--accent);
  border-radius: 2px; transition: all 0.15s;
}
.external-link:hover { background: var(--accent); color: var(--bg); }
.external-link .url {
  font-size: 10.5px; letter-spacing: 0; text-transform: none;
  color: inherit; opacity: 0.8;
}
.reader-why {
  padding: 18px 22px; background: var(--bg-deep);
  border: 1px dashed var(--rule); margin-bottom: 32px;
}
.why-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-faded);
  margin-bottom: 8px;
}
.reader-why p { margin-bottom: 0; font-size: 14.5px; color: var(--ink-soft); }
.reader-signal {
  padding: 24px; border: 1px solid var(--rule);
  margin-bottom: 24px; text-align: center;
  background: var(--bg);
}
.signal-prompt {
  font-family: 'Fraunces', serif; font-style: italic;
  font-size: 17px; color: var(--ink); margin-bottom: 16px;
}
.reader-signal .signal-bar { justify-content: center; }

/* ---------- REVIEW SCREEN ---------- */
.review-screen { max-width: 780px; margin: 0 auto; }
.review-block {
  padding: 24px 28px; background: var(--bg-deep);
  border: 1px solid var(--rule); border-radius: 2px;
  margin-bottom: 20px;
}
.review-block h3 { margin-top: 0; }
.pill-list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
.pill {
  padding: 6px 12px; background: var(--bg); border: 1px solid var(--rule);
  border-radius: 2px; font-size: 13.5px; color: var(--ink);
  font-family: 'Fraunces', serif;
}
.pill.sharpen { border-color: var(--accent); color: var(--accent); }
.pill.quiet { color: var(--ink-faded); font-style: italic; }

.articulation-old {
  font-family: 'Fraunces', serif; font-size: 17px;
  line-height: 1.5; color: var(--ink-faded);
  font-style: italic;
  padding: 14px 16px; background: var(--bg);
  border-left: 2px solid var(--rule); border-radius: 2px;
  margin-bottom: 12px;
}
.articulation-new {
  font-family: 'Fraunces', serif; font-size: 18px;
  line-height: 1.5; color: var(--ink);
  padding: 16px 18px; background: var(--bg);
  border-left: 3px solid var(--sage); border-radius: 2px;
  margin-bottom: 12px;
}
.articulation-input {
  width: 100%; padding: 14px 16px;
  font-family: 'Fraunces', serif; font-size: 17px;
  background: var(--bg); border: 1px solid var(--rule);
  border-left: 3px solid var(--sage); border-radius: 2px;
  color: var(--ink); outline: none; resize: vertical;
  line-height: 1.5;
}
.articulation-input:focus { border-color: var(--sage); }

.diff-arrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; color: var(--ink-faded);
  letter-spacing: 0.14em; text-transform: uppercase;
  margin: 6px 0; padding-left: 16px;
}

.quiet-note {
  font-size: 13px; color: var(--ink-faded);
  font-style: italic; margin-top: 10px;
  font-family: 'Fraunces', serif;
}

/* ---------- SPAWN ITEMS in review ---------- */
.spawn-item {
  padding: 14px 16px;
  margin-bottom: 10px;
  background: var(--bg);
  border: 1px solid var(--rule-soft);
  border-left: 3px solid var(--gold);
  border-radius: 2px;
}
.spawn-item-head {
  display: flex; gap: 10px; align-items: center;
  margin-bottom: 6px;
}
.spawn-slot-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-faded);
}
.spawn-item-title {
  font-family: 'Fraunces', serif; font-size: 16px;
  color: var(--ink); line-height: 1.35; margin-bottom: 4px;
}
.spawn-item-source {
  font-size: 12px; color: var(--ink-faded);
  margin-bottom: 6px;
}
.spawn-form {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule-soft);
}
.spawn-form textarea {
  width: 100%; padding: 10px 12px;
  font-family: 'Fraunces', serif; font-size: 15px;
  background: var(--bg-deep);
  border: 1px solid var(--rule);
  border-radius: 2px; outline: none; resize: vertical;
  color: var(--ink);
}
.spawn-form textarea:focus { border-color: var(--gold); }
.spawn-form-actions {
  display: flex; justify-content: flex-end;
  gap: 8px; margin-top: 8px;
}
.actions-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 24px; flex-wrap: wrap; }

/* ---------- DIFF SCREEN ---------- */
.diff-screen { max-width: 820px; margin: 0 auto; }
.section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-faded);
  margin-bottom: 12px;
}
.diff-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 14px; margin-top: 20px;
}
@media (max-width: 700px) { .diff-grid { grid-template-columns: 1fr; } }
.diff-card {
  padding: 16px 18px; background: var(--bg);
  border: 1px solid var(--rule); border-radius: 2px;
  border-top: 3px solid var(--gold);
}
.diff-card .label {
  font-family: 'Instrument Sans', sans-serif;
  font-weight: 600; font-size: 12px;
  color: var(--gold); letter-spacing: 0.04em;
  text-transform: uppercase; margin-bottom: 8px;
}
.diff-card .content {
  font-family: 'Fraunces', serif; font-size: 14.5px;
  line-height: 1.55; color: var(--ink-soft);
}

.claim-block {
  padding: 22px 26px; background: var(--ink);
  color: var(--bg); border-radius: 2px;
  margin: 28px 0;
}
.claim-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--gold);
  margin-bottom: 10px;
}
.claim-text {
  font-family: 'Fraunces', serif; font-size: 18px;
  line-height: 1.55; font-style: italic;
}
.claim-text em { color: var(--gold); font-style: normal; font-weight: 500; }

/* ---------- PROFILE SCREEN ---------- */
.profile-screen { max-width: 900px; margin: 0 auto; }
.profile-section {
  margin-bottom: 40px; padding-bottom: 40px;
  border-bottom: 1px dashed var(--rule-soft);
}
.profile-section:last-child { border-bottom: none; }
.profile-section h3 { margin-top: 0; }

.signature-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 24px; margin-top: 16px;
}
@media (max-width: 700px) { .signature-grid { grid-template-columns: 1fr; } }
.signature-grid h4 { font-family: 'Fraunces', serif; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); font-weight: 500; margin-bottom: 8px; }
.signature-grid p { margin: 0; font-size: 15px; font-family: 'Fraunces', serif; line-height: 1.5; }
.signature-grid ul { padding-left: 16px; margin: 0; font-size: 14px; }

.stats-row {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 16px; margin: 16px 0 28px;
}
@media (max-width: 640px) { .stats-row { grid-template-columns: 1fr 1fr; } }
.stat {
  padding: 18px; background: var(--bg-deep);
  border: 1px solid var(--rule-soft); border-radius: 2px;
  text-align: center;
  transition: all 0.15s;
}
.stat.clickable:hover { background: var(--highlight); border-color: var(--rule); }
.stat.clickable.expanded { background: var(--bg); border-color: var(--accent); }
.stat-num {
  font-family: 'Fraunces', serif; font-size: 36px;
  font-weight: 300; color: var(--ink); line-height: 1;
  margin-bottom: 6px;
}
.stat-label {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--ink-faded);
}

.slot-responsiveness { margin-top: 24px; }
.slot-responsiveness h4 { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--ink); margin-bottom: 12px; }
.slot-row {
  display: grid; grid-template-columns: 140px 1fr 120px;
  gap: 16px; align-items: center;
  padding: 10px 14px; background: var(--bg);
  border: 1px solid var(--rule-soft); margin-bottom: 6px;
  border-left-width: 3px;
}
.slot-row.slot-sharpen { border-left-color: var(--sharpen-color); }
.slot-row.slot-complicate { border-left-color: var(--complicate-color); }
.slot-row.slot-bridge { border-left-color: var(--bridge-color); }
.slot-row.slot-ground { border-left-color: var(--ground-color); }
.slot-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink-soft);
  display: flex; align-items: center; gap: 6px;
}
.slot-name .dot { width: 6px; height: 6px; border-radius: 50%; }
.slot-item-name {
  font-family: 'Fraunces', serif; font-size: 15px;
  color: var(--ink); font-style: italic;
}
.slot-sig {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--ink-faded);
  letter-spacing: 0.08em; text-align: right;
}

.close-note p {
  font-family: 'Fraunces', serif; font-size: 16px;
  color: var(--ink-soft); line-height: 1.6;
  padding: 20px 24px; background: var(--bg-deep);
  border-left: 3px solid var(--gold);
  max-width: none;
}

/* ---------- UPLOAD ZONE (entry, artifact mode) ---------- */
.upload-compose { margin-bottom: 24px; }

.upload-zone {
  border: 2px dashed var(--rule);
  background: var(--bg-deep);
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.2s;
}
.upload-zone:hover {
  border-color: var(--accent);
  background: var(--highlight);
}
.upload-glyph {
  font-size: 44px;
  color: var(--accent);
  line-height: 1;
  margin-bottom: 18px;
  font-family: 'Fraunces', serif;
  font-weight: 300;
}
.upload-primary {
  font-family: 'Fraunces', serif;
  font-size: 22px;
  font-weight: 400;
  color: var(--ink);
  margin-bottom: 8px;
  letter-spacing: -0.01em;
}
.upload-secondary {
  font-family: 'Fraunces', serif;
  font-size: 15px;
  font-style: italic;
  color: var(--ink-soft);
  max-width: 440px;
  margin: 0 auto 14px;
  line-height: 1.55;
}
.upload-tertiary {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faded);
}

.upload-status {
  margin-top: 14px;
  font-family: 'Fraunces', serif;
  font-style: italic;
  color: var(--ink-soft);
  text-align: center;
  font-size: 14px;
}
.upload-error {
  margin-top: 14px;
  padding: 10px 14px;
  background: #fef0ee;
  border-left: 3px solid var(--accent);
  color: var(--ink-soft);
  font-size: 13.5px;
  border-radius: 2px;
}

/* ---------- UPLOAD PREVIEW (after file picked) ---------- */
.upload-preview {
  position: relative;
  padding: 20px;
  background: var(--bg-deep);
  border: 1px solid var(--rule);
  border-radius: 2px;
  margin-bottom: 18px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 140px;
}
.upload-preview img {
  max-width: 100%;
  max-height: 360px;
  display: block;
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
}
.clear-file {
  position: absolute;
  top: 12px;
  right: 12px;
  background: var(--bg);
  z-index: 2;
}

.pdf-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px;
  text-align: center;
}
.pdf-preview.compact { padding: 16px; }
.pdf-icon {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.18em;
  color: var(--accent);
  padding: 10px 16px;
  border: 1.5px solid var(--accent);
  border-radius: 2px;
  background: var(--bg);
}
.pdf-filename {
  font-family: 'Fraunces', serif;
  font-size: 15px;
  font-style: italic;
  color: var(--ink);
  word-break: break-all;
  max-width: 300px;
}
.pdf-size {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faded);
  text-transform: uppercase;
}

.note-compose {
  margin-bottom: 16px;
  padding: 18px 20px;
  background: var(--bg);
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
}
.note-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--ink-faded);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.note-label .optional {
  text-transform: none;
  letter-spacing: 0;
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 12px;
  margin-left: 6px;
  color: var(--ink-faded);
}
.note-compose textarea {
  width: 100%;
  border: none;
  background: transparent;
  font-family: 'Fraunces', serif;
  font-size: 15.5px;
  line-height: 1.5;
  color: var(--ink);
  resize: vertical;
  outline: none;
}
.note-compose textarea::placeholder {
  color: var(--ink-faded);
  font-style: italic;
}

.upload-next-note {
  margin-top: 14px;
  padding: 14px 18px;
  background: var(--bg-deep);
  border-left: 3px solid var(--gold);
  font-family: 'Fraunces', serif;
  font-size: 14px;
  font-style: italic;
  color: var(--ink-soft);
  line-height: 1.55;
}

/* ---------- CHOOSING SCREEN ---------- */
.choosing-screen { max-width: 1100px; margin: 0 auto; }
.choosing-two-col {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 40px;
  align-items: start;
  margin-top: 24px;
}
@media (max-width: 900px) {
  .choosing-two-col { grid-template-columns: 1fr; }
}

.artifact-pane {
  position: sticky;
  top: 90px;
  padding: 20px;
  background: var(--bg-deep);
  border: 1px solid var(--rule);
  border-radius: 2px;
}
.choosing-image {
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  display: block;
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
  background: var(--bg);
  margin-bottom: 18px;
}
.artifact-note {
  margin-top: 18px;
  padding: 14px 16px;
  background: var(--bg);
  border-left: 2px solid var(--sage);
  border-radius: 2px;
}
.artifact-note p {
  font-family: 'Fraunces', serif;
  font-size: 14px;
  font-style: italic;
  color: var(--ink);
  margin: 4px 0 0;
  line-height: 1.5;
}
.artifact-observation {
  margin-top: 18px;
  padding: 14px 16px;
  background: var(--bg);
  border-left: 2px solid var(--gold);
  border-radius: 2px;
}
.artifact-observation p {
  font-family: 'Fraunces', serif;
  font-size: 14px;
  color: var(--ink-soft);
  margin: 4px 0 0;
  line-height: 1.55;
}

.candidates-pane { min-width: 0; }

.candidate-card {
  display: block;
  width: 100%;
  text-align: left;
  padding: 22px 26px;
  margin-bottom: 14px;
  background: var(--bg);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.candidate-card:hover {
  background: var(--bg-deep);
  border-left-color: var(--accent-soft);
  transform: translateX(2px);
}
.candidate-card:nth-child(2) { border-left-color: var(--sage); }
.candidate-card:nth-child(2):hover { border-left-color: var(--sage); }
.candidate-card:nth-child(3) { border-left-color: var(--gold); }
.candidate-card:nth-child(3):hover { border-left-color: var(--gold); }

.candidate-angle {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faded);
  margin-bottom: 12px;
}
.candidate-question {
  font-family: 'Fraunces', serif;
  font-size: 20px;
  line-height: 1.4;
  color: var(--ink);
  margin-bottom: 14px;
  letter-spacing: -0.01em;
}
.candidate-cta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.custom-wrap { margin-top: 18px; }
.custom-toggle {
  display: block;
  width: 100%;
  padding: 14px 20px;
  background: transparent;
  border: 1px dashed var(--rule);
  border-radius: 2px;
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 15px;
  color: var(--ink-soft);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.custom-toggle:hover {
  border-color: var(--ink-soft);
  color: var(--ink);
  background: var(--bg-deep);
}

.custom-compose {
  padding: 20px 22px;
  background: var(--bg);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--ink-soft);
  border-radius: 2px;
}
.custom-compose textarea {
  width: 100%;
  margin-top: 10px;
  border: 1px solid var(--rule-soft);
  background: var(--bg);
  font-family: 'Fraunces', serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--ink);
  padding: 10px 12px;
  resize: vertical;
  outline: none;
}
.custom-compose textarea:focus { border-color: var(--ink-soft); }
.custom-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  gap: 12px;
}

/* ---------- ARTIFACT BADGE (shown in thread cards throughout) ---------- */
.artifact-badge {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
  max-width: fit-content;
}
.artifact-badge img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 2px;
  border: 1px solid var(--rule-soft);
  flex-shrink: 0;
}
.artifact-badge.size-small img {
  width: 40px;
  height: 40px;
}
.artifact-badge-pdf {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.artifact-badge-pdf .pdf-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.16em;
  padding: 4px 8px;
  background: var(--accent);
  color: var(--bg);
  border-radius: 2px;
  font-weight: 500;
}
.artifact-badge-pdf .pdf-name {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 13px;
  color: var(--ink-soft);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artifact-badge-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faded);
}

/* ---------- HOME SCREEN ---------- */
.home-screen { max-width: 820px; margin: 0 auto; }

.threads-list {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.thread-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  padding: 18px 22px;
  background: var(--bg);
  border: 1px solid var(--rule-soft);
  border-left: 3px solid var(--gold);
  border-radius: 2px;
  align-items: center;
  transition: all 0.15s;
}
.thread-row:hover { background: var(--bg-deep); border-left-color: var(--accent); }
.thread-row.is-spawned { border-left-color: var(--sage); margin-left: 16px; }
.thread-row.is-spawned:hover { border-left-color: var(--sage); }

.spawned-from {
  font-family: 'Fraunces', serif;
  font-style: italic;
  font-size: 12.5px;
  color: var(--sage);
  margin: 4px 0;
  line-height: 1.4;
}

.thread-row-main {
  display: flex;
  gap: 14px;
  align-items: center;
  cursor: pointer;
  min-width: 0;
}

.thread-thumb {
  width: 56px; height: 56px;
  object-fit: cover;
  border: 1px solid var(--rule-soft);
  border-radius: 2px;
  flex-shrink: 0;
}
.pdf-thumb {
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-deep);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--accent);
  font-weight: 500;
}

.thread-row-text { min-width: 0; flex: 1; }
.thread-row-question {
  font-family: 'Fraunces', serif;
  font-size: 18px;
  line-height: 1.35;
  color: var(--ink);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.thread-row-original {
  font-family: 'Fraunces', serif;
  font-size: 13px;
  font-style: italic;
  color: var(--ink-faded);
  margin-bottom: 6px;
}
.thread-row-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faded);
  text-transform: uppercase;
}

.thread-row-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

`;
