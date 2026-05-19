// THREAD ROOM (§02) — Maya inside one of her own threads.
// Single-thread spatial canvas with the question's mile-markers as a river left→right,
// finds clustered around the active marker, notes floating in between.
//
// Same pan/zoom controls as Promenade.

import React, { useState as useStateT, useRef, useEffect } from 'react';
import {
  PanZoomCanvas as PZCT,
  Aperture as ApT,
  Breadcrumb,
  FONT_SERIF as ST,
  FONT_SANS as FT,
  FONT_MONO as MT,
} from '../shell/shell.jsx';
import { WM } from '../data/wm-data.js';
import { isOwnThread, setFindNote, addFindToThread, spawnThreadFromCard, getAllThreads } from '../lib/threads.js';

// One mile-marker pin on the river
function MileMarker({ mm, x, y, isCurrent, palette, onOpen }) {
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      transform: "translate(-50%, -50%)",
      maxWidth: 280, cursor: "pointer",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translate(-50%, -50%) translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translate(-50%, -50%)"; }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        <div style={{
          width: isCurrent ? 18 : 10, height: isCurrent ? 18 : 10,
          borderRadius: "50%",
          background: isCurrent ? palette.accent : "#FFFFFF",
          border: `2px solid ${palette.accent}`,
          boxShadow: isCurrent ? `0 0 0 6px ${palette.accent}1c` : "none",
        }} />
        <div style={{
          fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase",
          color: palette.accent, fontFamily: MT,
        }}>{mm.age}</div>
        <div style={{
          background: isCurrent ? palette.bg : "rgba(255,255,255,.92)",
          border: `1px solid ${palette.accent}${isCurrent ? "44" : "22"}`,
          borderRadius: 8,
          padding: "10px 14px",
          fontFamily: ST, fontSize: 14, fontStyle: "italic", fontWeight: 300,
          color: "#1A1714", lineHeight: 1.3,
          textAlign: "center", maxWidth: 280,
          textWrap: "pretty",
        }}>
          &ldquo;{mm.q}&rdquo;
        </div>
      </div>
    </div>
  );
}

function FindCard({ find, x, y, palette, onOpen, onShared }) {
  const shared = !!find.sharedWith;
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 240, cursor: "pointer",
      background: "#FFFFFF",
      border: shared ? `1.5px solid ${palette.accent}88` : "1px solid rgba(26,23,20,.08)",
      borderRadius: 6,
      padding: "10px 12px",
      boxShadow: shared ? `0 4px 14px ${palette.accent}22, 0 2px 10px rgba(26,23,20,.05)` : "0 2px 10px rgba(26,23,20,.05)",
      transition: "box-shadow .2s, transform .2s",
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 22px rgba(26,23,20,.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = shared ? `0 4px 14px ${palette.accent}22, 0 2px 10px rgba(26,23,20,.05)` : "0 2px 10px rgba(26,23,20,.05)"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 14, opacity: .6, marginTop: 1 }}>{find.i}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: ST, fontSize: 14, fontWeight: 400, lineHeight: 1.25,
            color: "#1A1714", marginBottom: 3,
          }}>
            {find.t}
          </div>
          <div style={{ fontSize: 10, color: "#9A968F", fontFamily: FT }}>
            {find.s}{find.d ? ` · ${find.d}` : ""}
          </div>
        </div>
      </div>
      {find.note && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px dashed ${palette.accent}33`,
          fontSize: 11, color: "#5E5A55", lineHeight: 1.4,
          fontFamily: ST, fontStyle: "italic",
        }}>
          {find.note}
        </div>
      )}
      {shared && (
        <div onClick={(e) => { e.stopPropagation(); onShared && onShared(); }} style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${palette.accent}33`,
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase",
          fontFamily: MT, color: palette.accent, fontWeight: 600,
        }}>
          <span>⤴</span>
          <span>shared with courtyard · {find.sharedWith}</span>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, x, y, palette, onOpen, onShared }) {
  const icon = note.type === "audio" ? "\ud83c\udf99" : note.type === "image" ? "\ud83d\udcf8" : "\u270e";
  const shared = !!note.sharedWith;
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 220, cursor: "pointer",
      background: palette.card,
      border: `1px solid ${palette.accent}33`,
      borderRadius: 6,
      padding: "10px 12px",
      transform: "rotate(-1deg)",
      boxShadow: "0 2px 10px rgba(26,23,20,.06)",
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: palette.accent, fontFamily: MT, marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span>{note.type} note</span>
        {note.dur && <span style={{ marginLeft: "auto", color: "#9A968F" }}>{note.dur}</span>}
      </div>
      <div style={{
        fontFamily: ST, fontSize: 13, fontStyle: "italic", color: "#3A3530",
        lineHeight: 1.4, fontWeight: 300,
      }}>
        {note.cap}
      </div>
      <div style={{
        marginTop: 6, fontSize: 9.5, color: "#9A968F", fontFamily: FT,
      }}>{note.d}</div>
      {shared && (
        <div onClick={(e) => { e.stopPropagation(); onShared && onShared(); }} style={{
          marginTop: 7, paddingTop: 7,
          borderTop: `1px solid ${palette.accent}33`,
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase",
          fontFamily: MT, color: palette.accent, fontWeight: 600,
        }}>
          <span>⤴</span>
          <span>shared with courtyard · {note.sharedWith}</span>
        </div>
      )}
    </div>
  );
}

// Convert an "age" string like "5 months ago" / "yesterday" / "3wk" / "5mo"
// into days-ago. Used by the timeline scrubber to place mile-markers
// proportionally and to filter finds/notes by the active time window.
function ageToDays(s) {
  if (!s) return 0;
  const t = String(s).toLowerCase().trim();
  if (t === "yesterday") return 1;
  if (t === "today" || t === "now") return 0;
  // tokenized: "5 months ago", "3 weeks ago", "9 days ago"
  const m1 = t.match(/(\d+)\s*(day|week|month|year)/);
  if (m1) {
    const n = parseInt(m1[1], 10);
    const u = m1[2];
    return n * (u === "day" ? 1 : u === "week" ? 7 : u === "month" ? 30 : 365);
  }
  // shorthand: "5mo", "3wk", "9d", "2y"
  const m2 = t.match(/(\d+)\s*(d|wk|mo|y)/);
  if (m2) {
    const n = parseInt(m2[1], 10);
    const u = m2[2];
    return n * (u === "d" ? 1 : u === "wk" ? 7 : u === "mo" ? 30 : 365);
  }
  return 0;
}

// Format days-ago back into a soft label for the scrubber readout.
function daysToLabel(d) {
  if (d <= 0) return "now";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  return `${(d / 365).toFixed(1)} years ago`;
}

// ── Timeline scrubber ────────────────────────────────────────────────
// A thin band that sits at the top of the thread room (below the header).
// It shows the thread's mile-markers as anchored notches across a span
// from "thread origin" → "now". A draggable head can sweep across; the
// active position controls which finds/notes are visible (everything
// older than the head is dim; the head itself names the moment in time).
//
// Default head position: now (rightmost). Click any notch to jump.
// The component announces its current days-ago value to the parent so
// the parent can dim out-of-window cards. Self-contained.
function TimelineScrubber({ markers, oldestDays, onScrub, label = "thread time" }) {
  // markers: [{ age: '5 months ago', q: '...', isCurrent }]
  const enriched = markers.map((m, i) => ({
    ...m, idx: i, days: ageToDays(m.age),
  }));
  // span runs from oldest mile-marker → 0 (now)
  const span = Math.max(oldestDays, ...enriched.map(m => m.days), 1);
  const [head, setHead] = useStateT(0); // days-ago at the head (0 = now)
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const setFromX = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    // left = oldest, right = now
    const days = Math.round(span * (1 - t));
    setHead(days);
    onScrub && onScrub(days);
  };

  const onDown = (e) => {
    draggingRef.current = true;
    setFromX(e.clientX);
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => { if (draggingRef.current) setFromX(e.clientX); };
    const onUp   = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [span]);

  const headT = 1 - (head / span);   // 0..1 across the track

  return (
    <div data-ui style={{
      position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
      zIndex: 25, width: "min(880px, 76vw)",
      background: "rgba(247,243,234,.92)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(26,23,20,.08)",
      borderRadius: 4,
      padding: "10px 18px 12px",
      pointerEvents: "auto",
      fontFamily: FT,
    }}>
      {/* row 1: tiny label + head readout */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontFamily: MT, fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase",
        color: "#9A968F", marginBottom: 6,
      }}>
        <span>{label}</span>
        <span style={{ color: "#1A1714", fontWeight: 500 }}>{daysToLabel(head)}</span>
      </div>
      {/* row 2: the track */}
      <div ref={trackRef} onMouseDown={onDown} style={{
        position: "relative",
        height: 38,
        cursor: "ew-resize",
        userSelect: "none",
      }}>
        {/* baseline */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: 18, height: 1,
          background: "rgba(26,23,20,.18)",
        }} />
        {/* origin label (left) */}
        <div style={{
          position: "absolute", left: 0, top: 24,
          fontSize: 9.5, color: "#9A968F", fontStyle: "italic",
        }}>{enriched[0]?.age || "origin"}</div>
        {/* now label (right) */}
        <div style={{
          position: "absolute", right: 0, top: 24,
          fontSize: 9.5, color: "#9A968F", fontStyle: "italic",
        }}>now</div>
        {/* mile-marker notches */}
        {enriched.map(m => {
          const t = 1 - (m.days / span);
          return (
            <div key={m.idx}
                 onClick={(e) => { e.stopPropagation(); setHead(m.days); onScrub && onScrub(m.days); }}
                 title={m.q}
                 style={{
                   position: "absolute",
                   left: `${t * 100}%`,
                   top: 12,
                   transform: "translateX(-50%)",
                   width: 2, height: 14,
                   background: m.isCurrent ? "#1A5C46" : "rgba(26,23,20,.45)",
                   cursor: "pointer",
                 }} />
          );
        })}
        {/* head */}
        <div style={{
          position: "absolute",
          left: `${headT * 100}%`, top: 6,
          transform: "translateX(-50%)",
          width: 12, height: 26,
          borderRadius: 2,
          background: "#1A5C46",
          boxShadow: "0 2px 8px rgba(26,92,70,.25)",
        }} />
      </div>
    </div>
  );
}

function ThreadRoomImpl({ navigate, thread, viewMode = "maya", onClose = null }) {
  const palette = WM.DOMAIN[thread.dc];
  const canvasW = 3200, canvasH = 2000;
  // Scrubber head — days-ago. Default: now. Cards older than (head + 7) dim.
  const [headDays, setHeadDays] = useStateT(0);
  // spatial | timeline
  const [threadView, setThreadView] = useStateT("spatial");

  // Active-card overlay — opens when a find or note is clicked. Carries the
  // user from "I see this exists" to "I'm reading it".
  const [activeCard, setActiveCard] = useStateT(null); // {kind:'find'|'note', data}
  const [noteDraft, setNoteDraft] = useStateT(null); // string while editing a find's note, else null
  const [spawnDraft, setSpawnDraft] = useStateT(null); // string while naming a thread spawned off a card, else null
  const [savedMsg, setSavedMsg] = useStateT(null);   // confirmation after saving/spawning off a foreign card
  const canEdit = isOwnThread(thread.id); // can't annotate someone else's thread
  const myThreads = getAllThreads().filter(t => isOwnThread(t.id));

  // When rendered as an in-place expansion on Home (onClose provided), Esc
  // collapses back to the constellation instead of leaving the page.
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Orbital layout — title card at center; mile-markers on an inner arc
  // running older→newer along the top half; finds in the upper outer ring,
  // notes in the lower outer ring.
  const cx = 1600, cy = 1000;
  const rInner = 360;   // mile-marker arc radius
  const rOuter = 760;   // items ring radius — kept clear of the marker arc

  const markerCount = thread.mileMarkers.length;
  // Arc sweep from upper-left (older) around the top to upper-right (newer).
  // Use angles in standard math convention: theta=0 → right, π/2 → down.
  // We want markers on the TOP arc, so use negative y (theta from π to 0
  // going clockwise through -π/2).
  const arcStart = Math.PI + 0.45;       // ~upper-left
  const arcEnd   = -0.45;                // ~upper-right (i.e. 2π-0.45)
  const arcRange = arcEnd - arcStart;    // negative — sweep clockwise across top
  const markers = thread.mileMarkers.map((mm, i) => {
    const t = markerCount === 1 ? 0.5 : i / (markerCount - 1);
    const theta = arcStart + t * arcRange;
    return {
      mm, i,
      x: cx + Math.cos(theta) * rInner,
      y: cy + Math.sin(theta) * rInner,
      isCurrent: i === markerCount - 1,
    };
  });

  // Finds scatter on the OUTER ring, upper half (so they sit further from
  // the title than the markers but on roughly the same hemisphere).
  const finds = thread.fl.map((f, i) => {
    const t = (i + 0.5) / Math.max(1, thread.fl.length);
    // Spread across upper 240° arc, with a small wobble
    const baseTheta = Math.PI + 0.2 + t * (Math.PI * 2 - 0.4 - Math.PI);
    const theta = baseTheta + ((i % 3) - 1) * 0.08;
    // Outward-only radial wobble so a find never pulls inward toward the
    // mile-marker arc (that collision hid markers behind the find card).
    const r = rOuter + (i % 3) * 36;
    return {
      f, days: ageToDays(f.d),
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
    };
  });

  // Notes in the LOWER half, also on the outer ring.
  const notes = (thread.notesList || []).map((n, i) => {
    const t = (i + 0.5) / Math.max(1, (thread.notesList || []).length);
    const theta = 0.25 + t * (Math.PI - 0.5);   // sweep right→left along bottom
    const r = rOuter + (i % 2) * 50 - 20;
    return {
      n, days: ageToDays(n.d),
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
    };
  });

  // Initial pan: center on the title card
  const initialZoom = 0.62;
  const initialPan = {
    x: -cx * initialZoom + window.innerWidth / 2,
    y: -cy * initialZoom + window.innerHeight / 2,
  };

  // Header overlay — fixed, top
  const header = (
    <div data-ui style={{
      position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)",
      zIndex: 20, maxWidth: 720, textAlign: "center", pointerEvents: "none",
    }}>
      <div style={{
        fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase",
        color: "#9A968F",
      }}>§02 Thread · {thread.domain} · {thread.age} old · last reframe {thread.last}</div>
    </div>
  );

  // Breadcrumb overlay — Thread room owns the canvas, so no room switcher here.
  // Out is via the breadcrumb trail.
  const breadcrumb = (
    <Breadcrumb
      showSwitcher={false}
      trail={onClose
        ? [
            { label: "← All threads", onClick: () => onClose() },
            { label: "Thread" },
          ]
        : [
            { label: "Home", onClick: () => navigate("home") },
            { label: "Thread" },
          ]}
    />
  );

  // Whose thread this is — top-right, mirroring Home's identity card.
  // Maya's own threads carry no owner field; kindred threads (walked into
  // from the courtyard) carry the holder's name.
  const ownerLabel = thread.owner || "Maya R.";
  const identityCard = (
    <div data-ui style={{
      position: "fixed", top: 24, right: 28, zIndex: 20,
      maxWidth: 260, textAlign: "right",
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase",
        color: "#9A968F", marginBottom: 4,
      }}>Mosaic · Hawley, PA</div>
      <h1 style={{
        fontFamily: ST, fontSize: 26, fontStyle: "italic", fontWeight: 300,
        margin: 0, lineHeight: 1, color: "#1A1714", letterSpacing: "-.01em",
      }}>{ownerLabel}</h1>
      <p style={{
        fontSize: 11.5, color: "#5E5A55", fontWeight: 300, margin: "6px 0 0",
        lineHeight: 1.4,
      }}>{isOwnThread(thread.id) ? "your thread" : `${ownerLabel}’s thread · you can read it, not edit it`}</p>
    </div>
  );

  // View-mode toggle — top-left, mirrors home's chrome
  const viewToggle = (
    <div data-ui style={{
      position: "fixed", top: 24, left: 24, zIndex: 21,
      display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 600, letterSpacing: ".08em",
        textTransform: "uppercase", color: "#B0ADA6", fontFamily: FT,
      }}>View mode</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[
          { id: "spatial",  l: "Spatial" },
          { id: "timeline", l: "Timeline" },
        ].map(m => (
          <button key={m.id} onClick={() => setThreadView(m.id)} style={{
            fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 9,
            cursor: "pointer", fontFamily: FT,
            border: `1px solid ${threadView === m.id ? palette.accent : "rgba(26,23,20,.08)"}`,
            background: threadView === m.id ? palette.bg : "rgba(246,243,236,.7)",
            color: threadView === m.id ? palette.accent : "#7A756F",
            transition: "all .15s",
          }}>{m.l}</button>
        ))}
      </div>
    </div>
  );

  const apertures = [
    { position: "right", label: "Courtyard",
      hint: `→ §04 · the ${thread.courtyardName || "thread"} courtyard`,
      onActivate: () => navigate("courtyard", { id: thread.id }) },
    { position: "left", label: "DOS",
      hint: "side door · §03 · take a question down",
      onActivate: () => navigate("search", { from: thread.id }) },
  ];

  // ── Active-card overlay ──────────────────────────────────────────────
  // Opens when a find or note is clicked. The full content of the card —
  // for a find: title, source, your annotation, and a placeholder for the
  // primary text. For a note: the audio/image/text body in full.
  const cardOverlay = (() => {
    if (!activeCard) return null;
    const { kind, data } = activeCard;
    const close = () => { setActiveCard(null); setNoteDraft(null); setSpawnDraft(null); setSavedMsg(null); };

    // Thread actions for a card on someone else's thread — save it into one
    // of your threads, or spawn a brand-new thread off it. Neither requires
    // "go deeper" first: deepening is one path to a fork, not the only one.
    // `item` is the normalized card { title, source, url, mediaType }.
    const threadActions = (item, { saveable = true } = {}) => (
      <div style={{
        marginTop: 16, paddingTop: 16,
        borderTop: "1px solid rgba(26,23,20,.1)",
      }}>
        {savedMsg ? (
          <div style={{
            fontFamily: ST, fontSize: 13.5, fontStyle: "italic",
            color: palette.accent,
          }}>{savedMsg}</div>
        ) : spawnDraft !== null ? (
          <div>
            <div style={{
              fontFamily: MT, fontSize: 9.5, letterSpacing: ".14em",
              textTransform: "uppercase", color: "#9A968F", marginBottom: 8,
            }}>the question this new thread opens on</div>
            <input
              autoFocus
              value={spawnDraft}
              onChange={(e) => setSpawnDraft(e.target.value)}
              placeholder={item.title || "name the inquiry…"}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: ST, fontSize: 14.5, fontStyle: "italic",
                fontWeight: 300, color: "#1A1714",
                padding: "9px 12px", borderRadius: 4,
                border: `1px solid ${palette.accent}55`, background: "#FFFFFF",
              }} />
            <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  const res = spawnThreadFromCard(item, {
                    owner: thread.owner || null,
                    question: spawnDraft,
                  });
                  if (res) {
                    const q = res.q || "your new thread";
                    setSavedMsg(`Spawned “${q.length > 48 ? q.slice(0, 48) + "…" : q}” — it’s on your Home as a newly-spawned thread, with this card pinned.`);
                  }
                  setSpawnDraft(null);
                }}
                style={{
                  fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                  textTransform: "uppercase", color: "#FAF5E9",
                  background: palette.accent, border: "none",
                  padding: "7px 14px", borderRadius: 3, cursor: "pointer",
                }}>spawn it →</button>
              <button
                onClick={() => setSpawnDraft(null)}
                style={{
                  fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                  textTransform: "uppercase", color: "#5E5A55",
                  background: "transparent", border: "1px solid rgba(26,23,20,.15)",
                  padding: "7px 14px", borderRadius: 3, cursor: "pointer",
                }}>cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {saveable && (
              <>
                <span style={{
                  fontFamily: MT, fontSize: 9.5, letterSpacing: ".14em",
                  textTransform: "uppercase", color: "#9A968F",
                }}>save into my thread</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const res = addFindToThread(id, {
                      title: item.title, source: item.source, url: item.url,
                      mediaType: item.mediaType,
                      fromOwner: thread.owner || null,
                    });
                    if (res) {
                      const q = res.thread.q || "your thread";
                      setSavedMsg(`Saved into “${q.length > 48 ? q.slice(0, 48) + "…" : q}”. It’s pinned there now.`);
                    }
                  }}
                  style={{
                    fontFamily: MT, fontSize: 11, padding: "7px 10px",
                    borderRadius: 3, border: `1px solid ${palette.accent}55`,
                    background: "#FFFFFF", color: palette.accent, cursor: "pointer",
                  }}>
                  <option value="">choose a thread…</option>
                  {myThreads.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.q.length > 50 ? t.q.slice(0, 50) + "…" : t.q}
                    </option>
                  ))}
                </select>
                <span style={{
                  fontFamily: ST, fontSize: 12, fontStyle: "italic", color: "#9A968F",
                }}>or</span>
              </>
            )}
            <button
              onClick={() => setSpawnDraft("")}
              style={{
                fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                textTransform: "uppercase", color: palette.accent,
                background: "transparent", border: `1px solid ${palette.accent}55`,
                padding: "7px 12px", borderRadius: 3, cursor: "pointer",
              }}>{saveable ? "spawn a new thread from this →" : "spawn a thread from this question →"}</button>
          </div>
        )}
      </div>
    );
    return (
      <>
        <div data-ui style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(31,28,23,0.45)",
          backdropFilter: "blur(2px)",
        }} onClick={close} />
        <div data-ui style={{
          position: "fixed", inset: 0, zIndex: 61,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 40, pointerEvents: "none",
        }}>
          <div style={{
            background: "#FAF5E9",
            border: `1px solid ${palette.accent}55`,
            borderRadius: 6,
            boxShadow: "0 30px 80px -20px rgba(40,30,15,0.6)",
            width: "min(640px, 100%)",
            maxHeight: "84vh",
            overflowY: "auto",
            padding: "32px 36px 36px",
            pointerEvents: "auto",
            position: "relative",
          }}>
            <button onClick={close} style={{
              position: "absolute", top: 14, right: 14,
              background: "transparent", border: "none",
              fontFamily: MT, fontSize: 10, letterSpacing: ".14em",
              textTransform: "uppercase", color: "#9A968F",
              cursor: "pointer", padding: "6px 8px",
            }}>close ✕</button>

            {kind === "find" && (
              <>
                <div style={{
                  fontFamily: MT, fontSize: 9, letterSpacing: ".18em",
                  textTransform: "uppercase", color: palette.accent,
                  marginBottom: 8,
                }}>find · {data.s}{data.d ? ` · saved ${data.d}` : ""}</div>
                <h2 style={{
                  fontFamily: ST, fontSize: 26, fontWeight: 400,
                  fontStyle: "italic", lineHeight: 1.2, margin: "0 0 16px",
                  color: "#1A1714", textWrap: "balance",
                }}>
                  <span style={{ marginRight: 10, opacity: .6 }}>{data.i}</span>
                  {data.t}
                </h2>
                {data.note && (
                  <div style={{
                    background: "#FFFFFF",
                    border: `1px dashed ${palette.accent}66`,
                    borderRadius: 4,
                    padding: "12px 14px",
                    marginBottom: 18,
                  }}>
                    <div style={{
                      fontFamily: MT, fontSize: 8.5, letterSpacing: ".18em",
                      textTransform: "uppercase", color: palette.accent,
                      marginBottom: 6,
                    }}>your annotation</div>
                    <p style={{
                      fontFamily: ST, fontSize: 14.5, fontStyle: "italic",
                      fontWeight: 300, lineHeight: 1.45, color: "#3A3530",
                      margin: 0,
                    }}>{data.note}</p>
                  </div>
                )}
                <div style={{
                  fontFamily: MT, fontSize: 9, letterSpacing: ".18em",
                  textTransform: "uppercase", color: "#9A968F",
                  marginBottom: 8,
                }}>excerpt</div>
                <div style={{
                  fontFamily: ST, fontSize: 14, lineHeight: 1.65,
                  color: "#3A3530", fontWeight: 300,
                  borderLeft: `2px solid ${palette.accent}55`,
                  paddingLeft: 14,
                }}>
                  <p style={{ margin: "0 0 12px" }}>
                    [The primary text would sit here — a passage Maya pulled from this
                    source when she saved it. Mosaic holds the excerpt, not just
                    the link, so the reading survives the link.]
                  </p>
                  <p style={{ margin: 0, opacity: .7 }}>
                    The card on the canvas is a marker. This panel is the reading.
                  </p>
                </div>
                <div style={{
                  marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap",
                }}>
                  <button
                    onClick={data.url ? () => window.open(data.url, "_blank", "noopener,noreferrer") : undefined}
                    disabled={!data.url}
                    title={data.url ? data.url : "No link held for this find"}
                    style={{
                      fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                      textTransform: "uppercase", color: palette.accent,
                      background: palette.soft, border: `1px solid ${palette.accent}44`,
                      padding: "7px 12px", borderRadius: 3,
                      cursor: data.url ? "pointer" : "default",
                      opacity: data.url ? 1 : 0.4,
                    }}>open the source →</button>
                  <button
                    onClick={canEdit ? () => setNoteDraft(data.note || "") : undefined}
                    disabled={!canEdit}
                    title={canEdit ? "" : `This is ${thread.owner || "someone else"}'s thread — you can read it, not annotate it`}
                    style={{
                      fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                      textTransform: "uppercase", color: "#5E5A55",
                      background: "transparent", border: "1px solid rgba(26,23,20,.15)",
                      padding: "7px 12px", borderRadius: 3,
                      cursor: canEdit ? "pointer" : "default",
                      opacity: canEdit ? 1 : 0.4,
                    }}>{data.note ? "edit your note" : "add a note on this"}</button>
                  <button onClick={() => navigate("search", {
                    from: thread.id,
                    // JSON-encoded: the hash router stringifies object params.
                    deepen: JSON.stringify({
                      t: data.t, s: data.s, url: data.url, mediaType: data.mediaType,
                      // Crediting the owner when this is someone else's thread
                      // you've walked into from the courtyard — not your own.
                      fromOwner: isOwnThread(thread.id) ? null : (thread.owner || null),
                    }),
                  })} style={{
                    fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                    textTransform: "uppercase", color: palette.accent,
                    background: "transparent", border: `1px solid ${palette.accent}55`,
                    padding: "7px 12px", borderRadius: 3, cursor: "pointer",
                  }}>go deeper (DOS) →</button>
                </div>
                {!canEdit && threadActions({
                  title: data.t, source: data.s, url: data.url, mediaType: data.mediaType,
                })}
                {noteDraft !== null && (
                  <div style={{ marginTop: 16 }}>
                    <textarea
                      autoFocus
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="What does this find do for the question? Why it moved you, what it changed…"
                      style={{
                        width: "100%", minHeight: 90, boxSizing: "border-box",
                        fontFamily: ST, fontSize: 14, lineHeight: 1.5,
                        color: "#3A3530", background: "#FFFFFF",
                        border: `1px dashed ${palette.accent}66`, borderRadius: 4,
                        padding: "12px 14px", resize: "vertical",
                      }} />
                    <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                      <button
                        onClick={() => {
                          const res = setFindNote(thread.id, data, noteDraft);
                          if (res) setActiveCard({ kind: "find", data: { ...data, note: res.find.note } });
                          setNoteDraft(null);
                        }}
                        style={{
                          fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                          textTransform: "uppercase", color: "#FAF5E9",
                          background: palette.accent, border: "none",
                          padding: "7px 14px", borderRadius: 3, cursor: "pointer",
                        }}>save note</button>
                      <button
                        onClick={() => setNoteDraft(null)}
                        style={{
                          fontFamily: MT, fontSize: 10, letterSpacing: ".12em",
                          textTransform: "uppercase", color: "#5E5A55",
                          background: "transparent", border: "1px solid rgba(26,23,20,.15)",
                          padding: "7px 14px", borderRadius: 3, cursor: "pointer",
                        }}>cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {kind === "note" && (
              <>
                <div style={{
                  fontFamily: MT, fontSize: 9, letterSpacing: ".18em",
                  textTransform: "uppercase", color: palette.accent,
                  marginBottom: 10,
                }}>{data.type} note · {data.d}{data.dur ? ` · ${data.dur}` : ""}</div>
                {data.type === "audio" && (
                  <div style={{
                    background: "#FFFFFF",
                    border: `1px solid ${palette.accent}33`,
                    borderRadius: 4,
                    padding: "20px 22px",
                    marginBottom: 18,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 14,
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: "50%",
                        background: palette.accent, color: "#FAF5E9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, cursor: "pointer",
                      }}>▶</div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          height: 4, background: `${palette.accent}22`,
                          borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            width: "0%", height: "100%", background: palette.accent,
                          }} />
                        </div>
                        <div style={{
                          marginTop: 6,
                          fontFamily: MT, fontSize: 9, letterSpacing: ".1em",
                          color: "#9A968F",
                        }}>00:00 / {data.dur || "0:00"}</div>
                      </div>
                    </div>
                  </div>
                )}
                {data.type === "image" && (
                  <div style={{
                    background: `${palette.accent}11`,
                    border: `1px solid ${palette.accent}33`,
                    borderRadius: 4,
                    height: 220,
                    marginBottom: 18,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MT, fontSize: 10, letterSpacing: ".18em",
                    textTransform: "uppercase", color: palette.accent,
                  }}>📸 image placeholder</div>
                )}
                <p style={{
                  fontFamily: ST, fontSize: 17, fontStyle: "italic",
                  fontWeight: 300, lineHeight: 1.45, color: "#1A1714",
                  margin: 0, textWrap: "pretty",
                }}>"{data.cap}"</p>
                {!canEdit && threadActions({
                  title: data.cap,
                  source: `${data.type} note${data.dur ? ` · ${data.dur}` : ""}`,
                  url: "",
                  mediaType: data.type,
                })}
              </>
            )}

            {kind === "marker" && (
              <>
                <div style={{
                  fontFamily: MT, fontSize: 9, letterSpacing: ".18em",
                  textTransform: "uppercase", color: palette.accent,
                  marginBottom: 10,
                }}>{data.isCurrent ? "current reframe" : "reframe"} · {data.age}</div>
                <p style={{
                  fontFamily: ST, fontSize: 22, fontStyle: "italic",
                  fontWeight: 300, lineHeight: 1.35, color: "#1A1714",
                  margin: 0, textWrap: "pretty",
                }}>"{data.q}"</p>
                <div style={{
                  marginTop: 14,
                  fontFamily: ST, fontSize: 13, lineHeight: 1.55,
                  color: "#5E5A55", fontWeight: 300,
                }}>
                  {canEdit
                    ? "A turn in how the question got asked."
                    : `A turn in how ${thread.owner || "they"} asked it. If it opens something for you, take it up as your own thread.`}
                </div>
                {!canEdit && threadActions(
                  { title: data.q, source: "", url: "", mediaType: "reframe" },
                  { saveable: false },
                )}
              </>
            )}
          </div>
        </div>
      </>
    );
  })();

  // ============ TIMELINE VIEW ============
  // Single-thread linear timeline — same metaphor as home's timeline view,
  // but one lane: this thread's mile-markers, finds, and notes laid against a
  // horizontal time axis. Recent right, older left.
  if (threadView === "timeline") {
    const PIXELS_PER_DAY = 9;
    const oldest = Math.max(
      ageToDays(thread.age),
      ...thread.mileMarkers.map(m => ageToDays(m.age)),
      ...thread.fl.map(f => ageToDays(f.d)),
      ...(thread.notesList || []).map(n => ageToDays(n.d)),
    );
    const MAX_DAYS = Math.ceil((oldest + 14) / 30) * 30;
    const TIME_NOW_X = 100;
    const totalW = TIME_NOW_X + MAX_DAYS * PIXELS_PER_DAY + 80;
    const LANE_H = 360;

    const TICK_DAYS = MAX_DAYS <= 60 ? [0, 7, 14, 30, 60]
                    : MAX_DAYS <= 120 ? [0, 7, 30, 60, 90, 120]
                    : MAX_DAYS <= 270 ? [0, 7, 30, 90, 180, 270]
                    : [0, 30, 90, 180, 365, 730];
    const ticks = TICK_DAYS.filter(d => d <= MAX_DAYS).map(d => ({
      d, l: d === 0 ? "Now" : d < 30 ? `${d}d` : d < 365 ? `${Math.round(d/30)}mo` : `${(d/365).toFixed(1)}y`,
    }));

    // Combine artifacts; mile-markers above the lane, finds above, notes below.
    const allArts = [
      ...thread.mileMarkers.map((mm, i) => ({
        kind: "reframe", icon: "↳", label: mm.q, days: ageToDays(mm.age), seed: i,
        isCurrent: i === thread.mileMarkers.length - 1,
        data: { q: mm.q, age: mm.age, isCurrent: i === thread.mileMarkers.length - 1 },
      })),
      ...thread.fl.map((f, i) => ({
        kind: "find", icon: f.i, label: f.t, source: f.s, days: ageToDays(f.d), seed: i+50,
        data: f,
      })),
      ...(thread.notesList || []).map((n, i) => ({
        kind: "note", icon: n.type === "audio" ? "🎙" : n.type === "image" ? "📸" : "✎",
        label: n.cap, days: ageToDays(n.d), seed: i+100, data: n,
      })),
    ];

    return (
      <div style={{
        position: "fixed", inset: 0, background: palette.soft,
        fontFamily: FT, color: "#1A1714", overflow: "auto",
      }}>
        {header}
        {breadcrumb}
        {identityCard}
        {viewToggle}
        {apertures.map((a, i) => <ApT key={i} {...a} />)}
        <TimelineScrubber
          markers={thread.mileMarkers.map((m, i, a) => ({ ...m, isCurrent: i === a.length - 1 }))}
          oldestDays={ageToDays(thread.age)}
          label={`thread time · ${thread.age} old`}
          onScrub={setHeadDays}
        />
        {cardOverlay}

        <div style={{
          paddingTop: 170, paddingLeft: 40, paddingRight: 40, paddingBottom: 100,
          minWidth: totalW + 80,
        }}>
          {/* Time axis */}
          <div style={{
            position: "relative", height: 50, marginBottom: 18,
            borderBottom: "1px solid rgba(26,23,20,.18)",
          }}>
            {ticks.map((t, i) => {
              const x = totalW - TIME_NOW_X - t.d * PIXELS_PER_DAY;
              return (
                <React.Fragment key={i}>
                  <div style={{
                    position: "absolute", left: x, bottom: 0,
                    width: 1, height: 14, background: "rgba(26,23,20,.25)",
                  }} />
                  <div style={{
                    position: "absolute", left: x, bottom: 18,
                    transform: "translateX(-50%)",
                    fontSize: 10, color: "#7A756F", fontFamily: FT,
                    letterSpacing: ".05em", whiteSpace: "nowrap",
                  }}>{t.l}</div>
                </React.Fragment>
              );
            })}
            <div style={{
              position: "absolute", left: totalW - TIME_NOW_X, top: -10, bottom: -8,
              width: 2, background: palette.accent, opacity: .8,
            }} />
            <div style={{
              position: "absolute", left: totalW - TIME_NOW_X + 6, top: -22,
              fontSize: 9, fontWeight: 600, color: palette.accent,
              fontFamily: FT, letterSpacing: ".1em", textTransform: "uppercase",
            }}>now</div>
          </div>

          {/* The lane */}
          <div style={{
            position: "relative", height: LANE_H,
            background: "rgba(255,255,255,.45)",
            border: `1px solid ${palette.accent}22`,
            borderRadius: 6,
          }}>
            {/* baseline */}
            <div style={{
              position: "absolute", left: 14, right: 14,
              top: LANE_H / 2, height: 2,
              background: `${palette.accent}55`,
            }} />

            {/* now-marker indicator on lane */}
            <div style={{
              position: "absolute", left: totalW - TIME_NOW_X - 40, top: LANE_H / 2,
              transform: "translate(-50%,-50%)",
              width: 14, height: 14, borderRadius: "50%",
              background: palette.accent,
              boxShadow: `0 0 0 6px ${palette.accent}1c`,
            }} />

            {/* Artifacts */}
            {allArts.map((art, i) => {
              const x = totalW - TIME_NOW_X - art.days * PIXELS_PER_DAY;
              if (x < 24) return null;
              const isReframe = art.kind === "reframe";
              const isFind = art.kind === "find";
              // reframes ON the lane; finds above; notes below
              const yOffset = isReframe ? 0 : isFind ? -110 - (i % 3) * 30 : 80 + (i % 2) * 36;
              const dim = art.days < headDays - 3 ? 0.18 : 1;
              return (
                <div key={`${art.kind}-${i}`} style={{
                  position: "absolute",
                  left: x, top: LANE_H / 2 + yOffset,
                  transform: "translate(-50%,-50%)",
                  opacity: dim, transition: "opacity .25s",
                }}>
                  {/* connecting spur to baseline */}
                  {!isReframe && (
                    <div style={{
                      position: "absolute",
                      left: "50%", top: isFind ? "100%" : "auto", bottom: isFind ? "auto" : "100%",
                      width: 1, height: Math.abs(yOffset) - 4,
                      background: `${palette.accent}33`,
                    }} />
                  )}
                  {/* dot */}
                  <div style={{
                    position: "absolute", left: "50%", top: isFind ? "calc(100% + 2px)" : isReframe ? "50%" : "auto",
                    bottom: isReframe ? "auto" : isFind ? "auto" : "calc(100% + 2px)",
                    transform: isReframe ? "translate(-50%,-50%)" : "translateX(-50%)",
                    width: isReframe ? (art.isCurrent ? 16 : 11) : 8,
                    height: isReframe ? (art.isCurrent ? 16 : 11) : 8,
                    borderRadius: "50%",
                    background: isReframe ? (art.isCurrent ? palette.accent : "#FFFFFF") : "#FFFFFF",
                    border: `2px solid ${palette.accent}`,
                    boxShadow: art.isCurrent ? `0 0 0 5px ${palette.accent}1c` : "none",
                  }} />
                  {/* label */}
                  <div onClick={() => {
                    setNoteDraft(null); setSpawnDraft(null); setSavedMsg(null);
                    if (art.kind === "find") setActiveCard({ kind: "find", data: art.data });
                    if (art.kind === "note") setActiveCard({ kind: "note", data: art.data });
                    if (art.kind === "reframe") setActiveCard({ kind: "marker", data: art.data });
                  }} style={{
                    background: isReframe ? palette.bg : "#FFFFFF",
                    border: `1px solid ${palette.accent}${isReframe ? "55" : "22"}`,
                    borderRadius: 4,
                    padding: isReframe ? "8px 12px" : "6px 9px",
                    fontFamily: isReframe ? ST : FT,
                    fontStyle: isReframe ? "italic" : "normal",
                    fontWeight: isReframe ? 300 : 400,
                    fontSize: isReframe ? 13 : 10.5,
                    lineHeight: 1.3, color: "#1A1714",
                    maxWidth: isReframe ? 240 : 180,
                    boxShadow: isReframe ? `0 4px 14px ${palette.accent}1a` : "0 1px 4px rgba(26,23,20,.06)",
                    cursor: "pointer",
                    display: isReframe ? "block" : "flex",
                    alignItems: "flex-start", gap: 5,
                    marginTop: isFind ? 8 : 0,
                    marginBottom: isFind ? 0 : 8,
                  }}>
                    {!isReframe && <span style={{ fontSize: 10, opacity: .6, flexShrink: 0 }}>{art.icon}</span>}
                    <span style={{
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: isReframe ? 3 : 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {isReframe && <span style={{ marginRight: 6, opacity: .55 }}>"</span>}
                      {art.label}
                      {isReframe && <span style={{ marginLeft: 4, opacity: .55 }}>"</span>}
                    </span>
                  </div>
                  {isReframe && (
                    <div style={{
                      marginTop: 4, fontFamily: MT, fontSize: 8.5,
                      letterSpacing: ".12em", textTransform: "uppercase",
                      color: palette.accent, textAlign: "center",
                    }}>{art.isCurrent ? "current reframe" : `reframe ${art.seed + 1}`}</div>
                  )}
                </div>
              );
            })}

            {/* Section labels */}
            <div style={{
              position: "absolute", left: 16, top: 16,
              fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase",
              color: palette.accent, fontFamily: MT, opacity: .6,
            }}>finds — sources, links, books</div>
            <div style={{
              position: "absolute", left: 16, bottom: 16,
              fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase",
              color: palette.accent, fontFamily: MT, opacity: .6,
            }}>notes — voice, text, images</div>
            <div style={{
              position: "absolute", right: 16, top: LANE_H / 2 - 10,
              fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase",
              color: palette.accent, fontFamily: MT, fontWeight: 600,
            }}>mile-markers</div>
          </div>

          <div style={{
            marginTop: 24, fontSize: 11, fontFamily: FT, color: "#9A968F",
            fontStyle: "italic", textAlign: "center", maxWidth: 640,
            margin: "24px auto 0",
          }}>
            One lane — this thread's life. Filled circles are reframings (mile-markers).
            Hollow circles above the line are finds; below, notes. Drag the scrubber to
            replay the thread as it stood at that moment.
          </div>
        </div>
      </div>
    );
  }

  // ============ SPATIAL VIEW ============
  return (
    <PZCT
      canvasW={canvasW} canvasH={canvasH}
      background={palette.soft}
      groundDot={palette.accent}
      initialPan={initialPan} initialZoom={initialZoom}
      panHint="drag · wheel zoom · the river runs left→right in time"
      overlay={
        <>
          {header}
          <TimelineScrubber
            markers={thread.mileMarkers.map((m, i, a) => ({ ...m, isCurrent: i === a.length - 1 }))}
            oldestDays={ageToDays(thread.age)}
            label={`thread time · ${thread.age} old`}
            onScrub={setHeadDays}
          />
          {apertures.map((a, i) => <ApT key={i} {...a} />)}
          {breadcrumb}
          {identityCard}
          {viewToggle}
          {cardOverlay}
          {/* Requests / incoming / outgoing live in the Courtyard now —
              the thread interior stays quiet. */}
        </>
      }>
      {({ zoom }) => (
        <>
          {/* Soft halo behind the title card — anchors the orbit's center */}
          <div style={{
            position: "absolute", left: cx, top: cy,
            transform: "translate(-50%,-50%)",
            width: (rOuter + 120) * 2, height: (rOuter + 120) * 2,
            borderRadius: "50%",
            background: `radial-gradient(circle at center, ${palette.bg}cc 0%, ${palette.bg}00 65%)`,
            pointerEvents: "none",
          }} />

          {/* Mile-marker arc — dashed, from oldest (upper-left) to newest (upper-right) */}
          <svg style={{
            position: "absolute",
            left: cx - rInner, top: cy - rInner,
            width: rInner * 2, height: rInner * 2,
            pointerEvents: "none", overflow: "visible",
          }}>
            {(() => {
              const a0 = arcStart, a1 = arcStart + arcRange;
              const x0 = rInner + Math.cos(a0) * rInner;
              const y0 = rInner + Math.sin(a0) * rInner;
              const x1 = rInner + Math.cos(a1) * rInner;
              const y1 = rInner + Math.sin(a1) * rInner;
              return (
                <path d={`M ${x0} ${y0} A ${rInner} ${rInner} 0 1 1 ${x1} ${y1}`}
                      fill="none" stroke={palette.accent + "66"}
                      strokeWidth={2} strokeDasharray="6 5" />
              );
            })()}
          </svg>

          {/* Title card at canvas center — the question the orbit gathers around */}
          <div data-card style={{
            position: "absolute", left: cx, top: cy,
            transform: "translate(-50%,-50%)",
            width: 460, padding: "22px 28px",
            background: palette.bg,
            border: `1.5px solid ${palette.accent}55`,
            borderRadius: 10,
            boxShadow: `0 18px 50px ${palette.accent}26, 0 2px 10px rgba(26,23,20,.06)`,
            textAlign: "center",
            zIndex: 3,
          }}>
            <div style={{
              fontFamily: MT, fontSize: 10, letterSpacing: ".15em",
              textTransform: "uppercase", color: palette.accent, marginBottom: 8,
            }}>{thread.domain} · {thread.age} old</div>
            <div style={{
              fontFamily: ST, fontStyle: "italic", fontWeight: 300,
              fontSize: 26, lineHeight: 1.18, color: "#1A1714",
              textWrap: "balance",
            }}>"{thread.q}"</div>
            <div style={{
              marginTop: 14, display: "flex", justifyContent: "center", gap: 14,
              fontFamily: FT, fontSize: 11, color: "#5E5A55",
            }}>
              <span>{thread.finds} finds</span>
              <span style={{ opacity: .4 }}>·</span>
              <span>{thread.notes} notes</span>
              <span style={{ opacity: .4 }}>·</span>
              <span>last reframe {thread.last}</span>
            </div>
          </div>

          {/* Arc-end labels */}
          {markers.length > 0 && (
            <>
              <div data-ui style={{
                position: "absolute",
                left: markers[0].x - 60, top: markers[0].y - 30,
                fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase",
                color: palette.accent + "AA", fontFamily: MT,
              }}>← earlier</div>
              <div data-ui style={{
                position: "absolute",
                left: markers[markers.length - 1].x + 20,
                top: markers[markers.length - 1].y - 30,
                fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase",
                color: palette.accent, fontFamily: MT, fontWeight: 600,
              }}>now →</div>
            </>
          )}

          {/* Mile-markers */}
          {markers.map(m => (
            <MileMarker key={m.i} mm={m.mm} x={m.x} y={m.y}
              isCurrent={m.isCurrent} palette={palette}
              onOpen={() => { setNoteDraft(null); setSpawnDraft(null); setSavedMsg(null);
                setActiveCard({ kind: "marker", data: { q: m.mm.q, age: m.mm.age, isCurrent: m.isCurrent } }); }} />
          ))}

          {/* Finds — only items that existed by the head's moment in time. */}
          {finds.map((F, i) => (
            <div key={"fw" + i} style={{
              opacity: F.days < headDays - 3 ? 0.12 : 1,
              transition: "opacity .25s ease",
            }}>
              <FindCard find={F.f} x={F.x} y={F.y} palette={palette}
                onOpen={() => { setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "find", data: F.f }); }}
                onShared={() => navigate("courtyard", { id: thread.id })} />
            </div>
          ))}

          {/* Notes */}
          {notes.map((N, i) => (
            <div key={"nw" + i} style={{
              opacity: N.days < headDays - 3 ? 0.12 : 1,
              transition: "opacity .25s ease",
            }}>
              <NoteCard note={N.n} x={N.x} y={N.y} palette={palette}
                onOpen={() => { setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "note", data: N.n }); }}
                onShared={() => navigate("courtyard", { id: thread.id })} />
            </div>
          ))}

          {/* Section labels — orbital. Finds in upper ring, notes in lower. */}
          <div data-ui style={{
            position: "absolute", left: cx, top: cy - rOuter - 60,
            transform: "translateX(-50%)",
            fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
            color: palette.accent, fontFamily: MT, opacity: .55,
          }}>finds — sources, links, books</div>
          <div data-ui style={{
            position: "absolute", left: cx, top: cy + rOuter + 60,
            transform: "translateX(-50%)",
            fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase",
            color: palette.accent, fontFamily: MT, opacity: .55,
          }}>notes — voice, text, images</div>
        </>
      )}
    </PZCT>
  );
}

export const ThreadRoom = ThreadRoomImpl;
export default ThreadRoomImpl;
