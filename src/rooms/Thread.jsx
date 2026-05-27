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
import {
  isOwnThread, setFindNote, addFindToThread, spawnThreadFromCard, getAllThreads,
  loadThreadLayout, saveThreadLayout,
  loadThreadShapes, saveThreadShapes,
} from '../lib/threads.js';

// ── Shape library — atomic shapes that wrap a card ────────────────
// Each entry is an SVG path drawn in a 100×100 viewBox. preserveAspectRatio
// is set to 'none' so the path stretches to whatever rectangle the card
// occupies — a hex on a wide card reads as a wide hex. 'rect' is the
// default (no overlay).
const SHAPE_DEFS = {
  rect:    { label: 'Rectangle', coiner: null, path: null },
  circle:  { label: 'Circle',    coiner: null, path: 'M50 2 a48 48 0 1 0 0 96 a48 48 0 1 0 0 -96 Z' },
  hex:     { label: 'Hexagon',   coiner: null, path: 'M50 4 L92 27 L92 73 L50 96 L8 73 L8 27 Z' },
  'soft-hex': { label: 'Soft hex', coiner: null,
                path: 'M50 4 Q70 4 90 27 Q92 50 90 73 Q70 96 50 96 Q30 96 10 73 Q8 50 10 27 Q30 4 50 4 Z' },
  oval:    { label: 'Oval',      coiner: null, path: 'M50 12 a44 38 0 1 0 0 76 a44 38 0 1 0 0 -76 Z' },
  square:  { label: 'Soft square', coiner: null, path: 'M14 4 L86 4 Q96 4 96 14 L96 86 Q96 96 86 96 L14 96 Q4 96 4 86 L4 14 Q4 4 14 4 Z' },
  triangle:{ label: 'Triangle',  coiner: null, path: 'M50 4 L94 92 L6 92 Z' },
  diamond: { label: 'Diamond',   coiner: null, path: 'M50 4 L96 50 L50 96 L4 50 Z' },
  // Community-coined
  octagon: { label: 'Octagon',   coiner: '@asha',
             path: 'M30 4 L70 4 L96 30 L96 70 L70 96 L30 96 L4 70 L4 30 Z' },
  rosette: { label: 'Rosette',   coiner: '@samira',
             // 8-petal rosette built from sinusoidal radius — pre-baked path.
             path: 'M50 6 Q60 16 50 26 Q60 36 70 36 Q80 46 70 56 Q80 66 70 76 Q60 86 50 76 Q40 86 30 76 Q20 66 30 56 Q20 46 30 36 Q40 36 50 26 Q40 16 50 6 Z' },
  knot:    { label: 'Knot',      coiner: '@ezra',
             // Trefoil-ish overlapping loops, drawn as a stylised path.
             path: 'M50 8 C70 8 88 22 84 50 C80 78 60 92 50 92 C40 92 20 78 16 50 C12 22 30 8 50 8 M30 36 Q50 50 70 36 M30 64 Q50 50 70 64' },
};
const STARTER_SHAPES   = ['rect','circle','hex','soft-hex','oval','square','triangle','diamond'];
const COMMUNITY_SHAPES = ['octagon','rosette','knot'];


// Stable key for an item's saved position. Finds carry an id when they
// came from a DOS session; seeded finds fall back to title+source+date.
// Notes use caption+date.
function fingerprintKey(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(36);
}
function findKey(f) {
  return f.id || ('f-' + fingerprintKey((f.t || '') + '|' + (f.s || '') + '|' + (f.d || '')));
}
function noteKey(n) {
  return 'n-' + fingerprintKey((n.cap || '') + '|' + (n.d || ''));
}

// Wrapper for cards in the Thread spatial view. Out of edit mode it's a
// pass-through. In edit mode it intercepts pointer drag, converts screen
// deltas to canvas coords using the live zoom, and suppresses the
// underlying card's click so dragging never opens an overlay.
function Draggable({ cardKey, x, y, zoom, editing, onDragMove, onDragEnd, children }) {
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (!editing) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: x, oy: y, moved: 0 };
  };
  const onPointerMove = (e) => {
    if (!editing || !dragRef.current) return;
    const dx = (e.clientX - dragRef.current.sx) / Math.max(0.0001, zoom);
    const dy = (e.clientY - dragRef.current.sy) / Math.max(0.0001, zoom);
    dragRef.current.moved = Math.max(dragRef.current.moved, Math.hypot(dx, dy));
    onDragMove(cardKey, { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  };
  const finish = (e) => {
    if (!editing || !dragRef.current) return;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    if (moved > 4) {
      // Swallow the click the browser is about to synthesize.
      e.stopPropagation();
      e.preventDefault();
      onDragEnd && onDragEnd(cardKey);
    }
  };
  // In edit mode, swallow click outright so cards don't open while
  // rearranging.
  const onClickCapture = (e) => { if (editing) { e.stopPropagation(); e.preventDefault(); } };
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={onClickCapture}
      style={editing ? { cursor: 'grab', touchAction: 'none' } : undefined}>
      {children}
    </div>
  );
}

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

function FindCard({ find, x, y, palette, onOpen, onShared, shapeId = 'rect', selected = false }) {
  const shared = !!find.sharedWith;
  const shaped = shapeId && shapeId !== 'rect';
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 240, cursor: "pointer",
      background: shaped ? "transparent" : "#FFFFFF",
      border: shaped
        ? "1px solid transparent"
        : (shared ? `1.5px solid ${palette.accent}88` : "1px solid rgba(26,23,20,.08)"),
      borderRadius: 6,
      padding: "10px 12px",
      boxShadow: shaped ? "none"
        : (shared ? `0 4px 14px ${palette.accent}22, 0 2px 10px rgba(26,23,20,.05)` : "0 2px 10px rgba(26,23,20,.05)"),
      transition: "box-shadow .2s, transform .2s",
      outline: selected ? `2px solid ${palette.accent}` : 'none',
      outlineOffset: selected ? 6 : 0,
    }}
    onMouseEnter={e => { if (!shaped) { e.currentTarget.style.boxShadow = "0 6px 22px rgba(26,23,20,.1)"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
    onMouseLeave={e => { if (!shaped) { e.currentTarget.style.boxShadow = shared ? `0 4px 14px ${palette.accent}22, 0 2px 10px rgba(26,23,20,.05)` : "0 2px 10px rgba(26,23,20,.05)"; e.currentTarget.style.transform = "translateY(0)"; } }}>
      {shaped && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{
            position: 'absolute', left: 0, top: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}>
          <path d={SHAPE_DEFS[shapeId].path} fill="none"
            stroke={palette.accent + 'CC'}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" />
        </svg>
      )}
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

function NoteCard({ note, x, y, palette, onOpen, onShared, shapeId = 'rect', selected = false }) {
  const icon = note.type === "audio" ? "\ud83c\udf99" : note.type === "image" ? "\ud83d\udcf8" : "\u270e";
  const shared = !!note.sharedWith;
  const shaped = shapeId && shapeId !== 'rect';
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 220, cursor: "pointer",
      background: shaped ? "transparent" : palette.card,
      border: shaped ? "1px solid transparent" : `1px solid ${palette.accent}33`,
      borderRadius: 6,
      padding: "10px 12px",
      transform: shaped ? "none" : "rotate(-1deg)",
      boxShadow: shaped ? "none" : "0 2px 10px rgba(26,23,20,.06)",
      outline: selected ? `2px solid ${palette.accent}` : 'none',
      outlineOffset: selected ? 6 : 0,
    }}>
      {shaped && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{
            position: 'absolute', left: 0, top: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}>
          <path d={SHAPE_DEFS[shapeId].path} fill="none"
            stroke={palette.accent + 'CC'}
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" />
        </svg>
      )}
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

// Design panel — unified surface for the two design tools (Rearrange and
// Shape). Sits in the top-left chrome below the View Mode toggle.
function DesignPanel({
  mode, onSwitch, palette,
  layoutDirty, shapesDirty,
  onLockLayout, onLockShapes,
  onResetLayout, onResetShapes,
  onExit,
  selectedCardKey, currentShapeForSelected, onPickShape,
}) {
  const tabBtn = (id, label) => {
    const active = mode === id;
    return (
      <button key={id} onClick={() => onSwitch(id)} style={{
        flex: 1, padding: "5px 9px", borderRadius: 6,
        cursor: active ? "default" : "pointer", fontFamily: FT,
        fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: ".04em",
        border: "none",
        background: active ? palette.accent : "transparent",
        color: active ? "#FAF5E9" : "#5E5A55",
      }}>{label}</button>
    );
  };

  return (
    <div data-ui style={{
      marginTop: 6, width: 244,
      background: "rgba(255,255,255,.96)",
      border: `1px solid ${palette.accent}55`,
      borderRadius: 8, padding: "10px 11px 12px",
      boxShadow: "0 12px 30px rgba(40,30,15,.14)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 8.5, letterSpacing: ".14em", textTransform: "uppercase",
          color: palette.accent, fontFamily: FT, fontWeight: 700,
        }}>✦ Design</span>
        <button onClick={onExit} title="Close design panel" style={{
          background: "transparent", border: "none",
          color: "#9A968F", cursor: "pointer", padding: 2,
          fontFamily: FT, fontSize: 11,
        }}>✕</button>
      </div>

      <div style={{
        display: "flex", gap: 3, padding: 2,
        background: "rgba(26,23,20,.04)", borderRadius: 8, marginBottom: 9,
      }}>
        {tabBtn("rearrange", "Rearrange")}
        {tabBtn("shape", "Shape")}
      </div>

      {mode === "rearrange" && (
        <>
          <p style={{
            margin: "0 0 8px", fontSize: 10.5, lineHeight: 1.4,
            color: "#5E5A55", fontFamily: FT,
          }}>Drag any card to move it. Lock when the layout feels right.</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button onClick={onLockLayout} disabled={!layoutDirty} style={{
              fontSize: 10, fontWeight: 600, padding: "5px 11px", borderRadius: 6,
              cursor: layoutDirty ? "pointer" : "default", fontFamily: FT,
              border: "none",
              background: layoutDirty ? palette.accent : "rgba(26,23,20,.08)",
              color: layoutDirty ? "#FAF5E9" : "#9A968F",
            }}>Lock in place</button>
            <button onClick={onResetLayout} style={{
              fontSize: 10, padding: "5px 11px", borderRadius: 6,
              cursor: "pointer", fontFamily: FT,
              border: `1px solid ${palette.accent}33`,
              background: "transparent", color: "#5E5A55",
            }} title="Restore the default orbital layout">Reset</button>
          </div>
        </>
      )}

      {mode === "shape" && (
        <>
          <p style={{
            margin: "0 0 8px", fontSize: 10.5, lineHeight: 1.4,
            color: "#5E5A55", fontFamily: FT,
          }}>
            {selectedCardKey
              ? "Pick a shape for the selected card."
              : "Click a card to select it, then pick a shape."}
          </p>
          <ShapeLibrary
            palette={palette}
            disabled={!selectedCardKey}
            current={currentShapeForSelected}
            onPick={onPickShape} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={onLockShapes} disabled={!shapesDirty} style={{
              fontSize: 10, fontWeight: 600, padding: "5px 11px", borderRadius: 6,
              cursor: shapesDirty ? "pointer" : "default", fontFamily: FT,
              border: "none",
              background: shapesDirty ? palette.accent : "rgba(26,23,20,.08)",
              color: shapesDirty ? "#FAF5E9" : "#9A968F",
            }}>Lock shapes</button>
            <button onClick={onResetShapes} style={{
              fontSize: 10, padding: "5px 11px", borderRadius: 6,
              cursor: "pointer", fontFamily: FT,
              border: `1px solid ${palette.accent}33`,
              background: "transparent", color: "#5E5A55",
            }} title="Restore the default rectangular shape for all cards">Reset all</button>
          </div>
        </>
      )}
    </div>
  );
}

// Mini visual catalogue from the shape library. Renders 7 starter shapes
// + 3 community-coined, plus an inert "draw your own / import" tile that
// reads as a coming-soon affordance.
function ShapeLibrary({ palette, disabled, current, onPick }) {
  const TileGrid = ({ ids, dim }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6,
      opacity: dim ? 0.5 : 1, pointerEvents: dim ? "none" : "auto",
    }}>
      {ids.map(id => {
        const isCurrent = current === id;
        const def = SHAPE_DEFS[id];
        return (
          <button key={id} onClick={() => onPick(id)} title={def.label + (def.coiner ? ` · ${def.coiner}` : '')} style={{
            position: "relative", height: 44, padding: 0,
            background: isCurrent ? palette.bg : "#FFFFFF",
            border: `1px solid ${isCurrent ? palette.accent : 'rgba(26,23,20,.10)'}`,
            borderRadius: 4, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {id === 'rect' ? (
              <div style={{
                width: 28, height: 20, border: `1.5px solid ${isCurrent ? palette.accent : '#5E5A55'}`,
                borderRadius: 2,
              }} />
            ) : (
              <svg viewBox="0 0 100 100" width={28} height={28} style={{ display: 'block' }}>
                <path d={def.path} fill="none"
                  stroke={isCurrent ? palette.accent : '#5E5A55'}
                  strokeWidth={4}
                  strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
            {def.coiner && (
              <span style={{
                position: 'absolute', bottom: 2, right: 4,
                fontFamily: MT, fontSize: 7.5, color: '#B0ADA6',
              }}>{def.coiner.replace('@','')}</span>
            )}
          </button>
        );
      })}
      {/* Draw your own — coming-soon tile */}
      <button onClick={() => alert('Draw / import — coming soon.')} title="Draw your own or import"
        style={{
          height: 44, padding: 0, cursor: "pointer",
          background: "transparent",
          border: `1px dashed rgba(26,23,20,.20)`,
          borderRadius: 4, color: "#9A968F",
          fontFamily: FT, fontSize: 8.5, lineHeight: 1.2,
          display: "flex", alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "2px 4px",
        }}>+ draw<br/>or import</button>
    </div>
  );
  return (
    <div>
      <div style={{
        fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: FT, marginBottom: 4,
      }}>starter</div>
      <TileGrid ids={STARTER_SHAPES} dim={disabled} />
      <div style={{
        fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: FT, marginTop: 9, marginBottom: 4,
      }}>community</div>
      <TileGrid ids={COMMUNITY_SHAPES} dim={disabled} />
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

  // ── Design mode ────────────────────────────────────────────────
  // The owner can enter "design" mode to edit either card POSITIONS
  // (rearrange) or card SHAPES. The two are mutually exclusive within
  // a single Design panel so card clicks always have one clear meaning.
  // designMode: 'off' | 'rearrange' | 'shape'
  const [designMode, setDesignMode] = useStateT('off');
  // Position overrides
  const [savedOverrides, setSavedOverrides] = useStateT(() => loadThreadLayout(thread.id));
  const [overrides, setOverrides] = useStateT(savedOverrides);
  const layoutDirty = designMode === 'rearrange' && JSON.stringify(overrides) !== JSON.stringify(savedOverrides);
  // Shape overrides
  const [savedShapes, setSavedShapes] = useStateT(() => loadThreadShapes(thread.id));
  const [shapes, setShapes] = useStateT(savedShapes);
  const shapesDirty = designMode === 'shape' && JSON.stringify(shapes) !== JSON.stringify(savedShapes);
  const [selectedCardKey, setSelectedCardKey] = useStateT(null);
  const layoutEdit = designMode === 'rearrange';
  const shapeEdit  = designMode === 'shape';

  const enterRearrange = () => { setOverrides(savedOverrides); setSelectedCardKey(null); setDesignMode('rearrange'); };
  const enterShape     = () => { setShapes(savedShapes); setSelectedCardKey(null); setDesignMode('shape'); };
  const exitDesign     = () => { setOverrides(savedOverrides); setShapes(savedShapes); setSelectedCardKey(null); setDesignMode('off'); };
  const lockLayout     = () => { saveThreadLayout(thread.id, overrides); setSavedOverrides(overrides); setDesignMode('off'); };
  const lockShapes     = () => { saveThreadShapes(thread.id, shapes); setSavedShapes(shapes); setSelectedCardKey(null); setDesignMode('off'); };
  const resetLayout    = () => { setOverrides({}); };
  const resetShapes    = () => { setShapes({}); setSelectedCardKey(null); };
  const setCardPos     = (key, pos) => setOverrides(prev => ({ ...prev, [key]: pos }));
  const setCardShape   = (key, shapeId) => setShapes(prev => {
    const next = { ...prev };
    if (!shapeId || shapeId === 'rect') delete next[key]; else next[key] = shapeId;
    return next;
  });

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

  // Which reframing was "live" at the scrubber's moment? — the most recent
  // mile-marker whose days-ago is >= headDays (i.e., already happened by then).
  // Falls back to the oldest marker if the head sits before the thread began.
  const activeMarkerAtHead = (() => {
    const withDays = thread.mileMarkers.map(mm => ({ mm, days: ageToDays(mm.age) }));
    const live = withDays.filter(x => x.days >= headDays);
    return (live.length ? live[live.length - 1] : withDays[0]).mm;
  })();
  const activeQ = activeMarkerAtHead?.q || thread.q;
  const activeAge = activeMarkerAtHead?.age || thread.last;
  const isHeadAtNow = headDays <= 0;

  // Finds scatter on the OUTER ring, upper half (so they sit further from
  // the title than the markers but on roughly the same hemisphere).
  // Any saved override (key → {x,y}) wins over the orbital default.
  const finds = thread.fl.map((f, i) => {
    const t = (i + 0.5) / Math.max(1, thread.fl.length);
    const baseTheta = Math.PI + 0.2 + t * (Math.PI * 2 - 0.4 - Math.PI);
    const theta = baseTheta + ((i % 3) - 1) * 0.08;
    const r = rOuter + (i % 3) * 36;
    const key = findKey(f);
    const ov = overrides[key];
    return {
      f, key, days: ageToDays(f.d),
      x: ov ? ov.x : cx + Math.cos(theta) * r,
      y: ov ? ov.y : cy + Math.sin(theta) * r,
    };
  });

  // Notes in the LOWER half, also on the outer ring.
  const notes = (thread.notesList || []).map((n, i) => {
    const t = (i + 0.5) / Math.max(1, (thread.notesList || []).length);
    const theta = 0.25 + t * (Math.PI - 0.5);
    const r = rOuter + (i % 2) * 50 - 20;
    const key = noteKey(n);
    const ov = overrides[key];
    return {
      n, key, days: ageToDays(n.d),
      x: ov ? ov.x : cx + Math.cos(theta) * r,
      y: ov ? ov.y : cy + Math.sin(theta) * r,
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
  // Owner-card behavior depends on context:
  //   - In ThreadExpansion (opened from home), `onClose` dismisses the overlay.
  //   - On a standalone thread page for *your* thread, click goes home.
  //   - On someone else's thread, the card is informational only (no nav target
  //     — clicking shouldn't send Maya to her own home from Priya's thread).
  const ownThread = isOwnThread(thread.id);
  const inExpansion = typeof onClose === "function";
  const ownerCardClickable = ownThread || inExpansion;
  const ownerCardSubtext = inExpansion
    ? (ownThread ? "your thread · click to close" : `${ownerLabel}’s thread · click to close`)
    : (ownThread ? "your thread · click to go home" : `${ownerLabel}’s thread · you can read it, not edit it`);
  const handleOwnerClick = (e) => {
    if (!ownerCardClickable) return;
    e.preventDefault();
    e.stopPropagation();
    if (inExpansion) onClose();
    else navigate("home");
  };
  const identityCard = (
    <div data-ui
         onClick={handleOwnerClick}
         onPointerUp={handleOwnerClick}
         title={ownerCardClickable ? (inExpansion ? "Close" : "Back to home") : undefined}
         style={{
      position: "fixed", top: 24, right: 28, zIndex: 50,
      maxWidth: 260, textAlign: "right",
      cursor: ownerCardClickable ? "pointer" : "default",
      padding: "6px 10px",
      borderRadius: 8,
      transition: "background .15s ease",
    }}
    onMouseEnter={(e) => { if (ownerCardClickable) e.currentTarget.style.background = "rgba(26,23,20,.06)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <div style={{
        fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase",
        color: "#9A968F", marginBottom: 4, pointerEvents: "none",
      }}>Mosaic · Hawley, PA</div>
      <h1 style={{
        fontFamily: ST, fontSize: 26, fontStyle: "italic", fontWeight: 300,
        margin: 0, lineHeight: 1, color: "#1A1714", letterSpacing: "-.01em",
        pointerEvents: "none",
      }}>{ownerLabel}</h1>
      <p style={{
        fontSize: 11.5, color: "#5E5A55", fontWeight: 300, margin: "6px 0 0",
        lineHeight: 1.4, pointerEvents: "none",
      }}>{ownerCardSubtext}</p>
    </div>
  );

  // View-mode toggle — top-left, mirrors home's chrome
  const showRearrange = canEdit && threadView === 'spatial';
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
      {showRearrange && designMode === 'off' && (
        <button onClick={enterRearrange} style={{
          marginTop: 6, fontSize: 9.5, fontWeight: 500, padding: "4px 10px",
          borderRadius: 9, cursor: "pointer", fontFamily: FT,
          border: `1px solid ${palette.accent}66`,
          background: "rgba(255,255,255,.85)", color: palette.accent,
        }} title="Open the design toolbar — rearrange cards and pick shapes">
          ✦ Design
        </button>
      )}
      {showRearrange && designMode !== 'off' && (
        <DesignPanel
          mode={designMode}
          onSwitch={(next) => {
            // Switching between rearrange ↔ shape resets any unsaved
            // edits in the previous mode (you'd lose them anyway on
            // exit). Cancel-on-switch keeps the model simple.
            if (next === 'rearrange') enterRearrange();
            else if (next === 'shape') enterShape();
          }}
          palette={palette}
          layoutDirty={layoutDirty}
          shapesDirty={shapesDirty}
          onLockLayout={lockLayout}
          onLockShapes={lockShapes}
          onResetLayout={resetLayout}
          onResetShapes={resetShapes}
          onExit={exitDesign}
          selectedCardKey={selectedCardKey}
          currentShapeForSelected={selectedCardKey ? (shapes[selectedCardKey] || 'rect') : null}
          onPickShape={(shapeId) => {
            if (!selectedCardKey) return;
            setCardShape(selectedCardKey, shapeId);
          }} />
      )}
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
            }}>{thread.domain} · {isHeadAtNow ? `${thread.age} old` : `framing from ${activeAge}`}</div>
            <div style={{
              fontFamily: ST, fontStyle: "italic", fontWeight: 300,
              fontSize: 26, lineHeight: 1.18, color: "#1A1714",
              textWrap: "balance",
              transition: "opacity .25s ease",
            }}>"{activeQ}"</div>
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
              opacity: (layoutEdit || shapeEdit) ? 1 : (F.days < headDays - 3 ? 0.12 : 1),
              transition: "opacity .25s ease",
              outline: layoutEdit ? `1.5px dashed ${palette.accent}77` : 'none',
              outlineOffset: layoutEdit ? 4 : 0,
              borderRadius: 8,
            }}>
              <Draggable cardKey={F.key} x={F.x} y={F.y} zoom={zoom}
                editing={layoutEdit} onDragMove={setCardPos}>
                <FindCard find={F.f} x={F.x} y={F.y} palette={palette}
                  shapeId={shapes[F.key] || 'rect'}
                  selected={shapeEdit && selectedCardKey === F.key}
                  onOpen={() => {
                    if (layoutEdit) return;
                    if (shapeEdit) { setSelectedCardKey(F.key); return; }
                    setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "find", data: F.f });
                  }}
                  onShared={() => navigate("courtyard", { id: thread.id })} />
              </Draggable>
            </div>
          ))}

          {/* Notes */}
          {notes.map((N, i) => (
            <div key={"nw" + i} style={{
              opacity: (layoutEdit || shapeEdit) ? 1 : (N.days < headDays - 3 ? 0.12 : 1),
              transition: "opacity .25s ease",
              outline: layoutEdit ? `1.5px dashed ${palette.accent}77` : 'none',
              outlineOffset: layoutEdit ? 4 : 0,
              borderRadius: 8,
            }}>
              <Draggable cardKey={N.key} x={N.x} y={N.y} zoom={zoom}
                editing={layoutEdit} onDragMove={setCardPos}>
                <NoteCard note={N.n} x={N.x} y={N.y} palette={palette}
                  shapeId={shapes[N.key] || 'rect'}
                  selected={shapeEdit && selectedCardKey === N.key}
                  onOpen={() => {
                    if (layoutEdit) return;
                    if (shapeEdit) { setSelectedCardKey(N.key); return; }
                    setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "note", data: N.n });
                  }}
                  onShared={() => navigate("courtyard", { id: thread.id })} />
              </Draggable>
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
