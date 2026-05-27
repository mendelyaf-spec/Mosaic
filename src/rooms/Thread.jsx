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
  getThreadById,
  loadThreadLayout, saveThreadLayout,
  loadThreadShapes, saveThreadShapes,
  loadThreadEther, saveThreadEther,
  loadThreadBorders, saveThreadBorders,
  placeQueuedFind, dismissQueuedFind,
} from '../lib/threads.js';
import { deriveFindMedia, deriveNoteMedia } from '../lib/promenade.js';
import { Thumbnail } from './PromenadeThumbnail.jsx';

// ── Shape library — atomic shapes that wrap a card ────────────────
// Each entry is an SVG path drawn in a 100×100 viewBox. preserveAspectRatio
// is set to 'none' so the path stretches to whatever rectangle the card
// occupies — a hex on a wide card reads as a wide hex. 'rect' is the
// default (no overlay).
export const SHAPE_DEFS = {
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
export const STARTER_SHAPES   = ['rect','circle','hex','soft-hex','oval','square','triangle','diamond'];
export const COMMUNITY_SHAPES = ['octagon','rosette','knot'];

// ── Border library — color & thickness for a single card's outline ──
export const BORDER_COLORS = [
  { id: 'ink',       label: 'Ink',       value: '#1A1714' },
  { id: 'terracotta',label: 'Terracotta',value: '#B25C2E' },
  { id: 'sand',      label: 'Sand',      value: '#C4B79F' },
  { id: 'forest',    label: 'Forest',    value: '#2F5A3A' },
  { id: 'indigo',    label: 'Indigo',    value: '#2A3A6A' },
  { id: 'brown',     label: 'Brown',     value: '#7A4A2A' },
  { id: 'paper',     label: 'Paper',     value: '#EDEAE1' },
];
export const BORDER_THICKNESSES = [
  { id: 'hair',  label: 'Hair',   px: 0.75 },
  { id: 'thin',  label: 'Thin',   px: 1.5 },
  { id: 'med',   label: 'Medium', px: 2.5 },
  { id: 'thick', label: 'Thick',  px: 4 },
];

// ── Ether library — background treatments for the spatial canvas ────
// Each preset renders an SVG layer sized to the canvas. Uploaded images
// short-circuit via { kind: 'image', dataUrl }. coiner is shown on the
// tile when present.
export const ETHER_PRESETS = [
  { id: 'plain',       label: 'Plain',       coiner: null },
  { id: 'dots',        label: 'Dots',        coiner: null },
  { id: 'lines',       label: 'Lines',       coiner: null },
  { id: 'grid',        label: 'Grid',        coiner: null },
  { id: 'rings',       label: 'Rings',       coiner: null },
  { id: 'crosshatch',  label: 'Crosshatch',  coiner: null },
  { id: 'vignette',    label: 'Vignette',    coiner: null },
  { id: 'wayfinding',  label: 'Wayfinding',  coiner: '@asha' },
];

// Render the ether fixed to the viewport, behind the PanZoomCanvas.
// Patterns and uploaded images both behave as wallpaper — they don't
// pan or zoom with the canvas, so the chosen background fills the room
// regardless of where the user has scrolled or zoomed to.
export function EtherLayer({ ether, accent }) {
  if (!ether) return null;
  if (ether.kind === 'image') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: `url(${ether.dataUrl})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.55, pointerEvents: 'none',
        zIndex: 0,
      }} />
    );
  }
  const id = ether.value || ether.kind;
  if (id === 'plain') return null;
  // SVG fills the viewport; viewBox provides a stable coordinate space
  // for centred shapes like rings and wayfinding.
  const VB_W = 1000, VB_H = 700;
  const stroke = '#1A1714';
  const fade   = 0.10;
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 0,
      }}>
      <defs>
        {id === 'dots' && (
          <pattern id="et-dots" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" fill={stroke} fillOpacity={fade + 0.04}/>
          </pattern>
        )}
        {id === 'lines' && (
          <pattern id="et-lines" width="40" height="40" patternUnits="userSpaceOnUse">
            <line x1="0" y1="20" x2="40" y2="20" stroke={stroke} strokeOpacity={fade} strokeWidth="0.6"/>
          </pattern>
        )}
        {id === 'grid' && (
          <pattern id="et-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0 L0 0 L0 48" fill="none" stroke={stroke} strokeOpacity={fade} strokeWidth="0.5"/>
          </pattern>
        )}
        {id === 'crosshatch' && (
          <pattern id="et-cross" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M-1 23 L23 -1 M-1 -1 L23 23" stroke={stroke} strokeOpacity={fade} strokeWidth="0.5"/>
          </pattern>
        )}
      </defs>
      {id === 'dots'       && <rect width="100%" height="100%" fill="url(#et-dots)"/>}
      {id === 'lines'      && <rect width="100%" height="100%" fill="url(#et-lines)"/>}
      {id === 'grid'       && <rect width="100%" height="100%" fill="url(#et-grid)"/>}
      {id === 'crosshatch' && <rect width="100%" height="100%" fill="url(#et-cross)"/>}
      {id === 'rings' && (() => {
        const cxR = VB_W / 2, cyR = VB_H / 2;
        const step = Math.max(VB_W, VB_H) / 26;
        return Array.from({ length: 18 }, (_, i) => (
          <circle key={i} cx={cxR} cy={cyR} r={step * (i + 1)}
            fill="none" stroke={stroke} strokeOpacity={0.08 - i * 0.003}
            strokeWidth="0.7"/>
        ));
      })()}
      {id === 'wayfinding' && (() => {
        const cxR = VB_W / 2, cyR = VB_H / 2;
        const step = Math.max(VB_W, VB_H) / 32;
        return Array.from({ length: 16 }, (_, i) => {
          const rx = step * (i + 1) * (1 + Math.sin(i * 1.3) * 0.06);
          const ry = step * (i + 1) * (1 + Math.cos(i * 1.1) * 0.06);
          const op = 0.12 - i * 0.004;
          return (
            <g key={i} transform={`rotate(${i * 7} ${cxR} ${cyR})`}>
              <ellipse cx={cxR} cy={cyR} rx={rx} ry={ry}
                fill="none" stroke={accent}
                strokeOpacity={op > 0 ? op : 0.02}
                strokeWidth="0.9"/>
            </g>
          );
        });
      })()}
      {id === 'vignette' && (
        <>
          <defs>
            <radialGradient id="et-vig" cx="50%" cy="50%" r="65%">
              <stop offset="60%" stopColor="#1A1714" stopOpacity="0"/>
              <stop offset="100%" stopColor="#1A1714" stopOpacity="0.18"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#et-vig)"/>
        </>
      )}
    </svg>
  );
}


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

// Inline reframes popout — same pattern Home uses on each thread cluster.
// A small dotted track sits next to a "{n} reframes" label; clicking it
// expands a stacked list of every mile-marker (age + question), with the
// current one bolded. Replaces the old MileMarker arc on the spatial
// canvas so the reframes live with the question they belong to instead
// of floating as separate cards.
function ReframesPopout({ mileMarkers, palette, onPick, align = 'center' }) {
  const [open, setOpen] = useStateT(false);
  if (!mileMarkers || mileMarkers.length < 2) return null;
  const total = mileMarkers.length;
  return (
    <div style={{
      marginTop: 12,
      display: 'flex', flexDirection: 'column',
      alignItems: align,
    }}>
      <div role="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title={open ? "Hide reframes" : "See each reframe"}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
          fontFamily: FT, color: '#9A968F',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {mileMarkers.map((_, i) => (
            <React.Fragment key={i}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: i === total - 1 ? palette.accent : palette.accent + '55',
              }}/>
              {i < total - 1 && (
                <div style={{ width: 12, height: 1, background: palette.accent + '33' }}/>
              )}
            </React.Fragment>
          ))}
        </div>
        <span style={{
          fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase',
          color: open ? palette.accent : '#B0ADA6',
          fontWeight: open ? 600 : 500, marginLeft: 4,
        }}>{total} reframes</span>
        <span style={{
          fontSize: 8, color: '#B0ADA6',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform .15s', display: 'inline-block',
        }}>▸</span>
      </div>

      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{
          marginTop: 8, width: '100%',
          background: 'rgba(255,255,255,.78)',
          border: `1px solid ${palette.accent}22`,
          borderRadius: 6, padding: '10px 14px',
          textAlign: 'left',
        }}>
          {mileMarkers.map((mm, i) => {
            const isCurrent = i === total - 1;
            return (
              <div key={i}
                onClick={() => onPick && onPick(mm, isCurrent)}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  cursor: onPick ? 'pointer' : 'default',
                  paddingBottom: i < total - 1 ? 8 : 0,
                  marginBottom: i < total - 1 ? 8 : 0,
                  borderBottom: i < total - 1 ? '1px dashed rgba(26,23,20,.08)' : 'none',
                }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                  background: isCurrent ? palette.accent : palette.accent + '55',
                }}/>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase',
                    color: '#B0ADA6', fontFamily: FT, marginBottom: 2,
                  }}>{mm.age}{isCurrent ? ' · current' : ''}</div>
                  <div style={{
                    fontFamily: ST, fontStyle: 'italic', fontSize: 13,
                    color: isCurrent ? '#1A1714' : '#5E5A55', lineHeight: 1.35,
                  }}>{mm.q}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

function FindCard({ find, x, y, palette, onOpen, onShared, shapeId = 'rect', selected = false, borderOverride = null }) {
  const shared = !!find.sharedWith;
  const shaped = shapeId && shapeId !== 'rect';
  const borderColor = borderOverride?.color;
  const borderPx    = borderOverride?.thickness;
  const customBorder = !!(borderColor || borderPx);
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 240, cursor: "pointer",
      background: shaped ? "transparent" : "#FFFFFF",
      border: shaped
        ? (customBorder ? `${borderPx || 1.6}px solid transparent` : "1px solid transparent")
        : (customBorder
            ? `${borderPx || 1.5}px solid ${borderColor || palette.accent}`
            : (shared ? `1.5px solid ${palette.accent}88` : "1px solid rgba(26,23,20,.08)")),
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
            stroke={customBorder ? (borderColor || palette.accent) : (palette.accent + 'CC')}
            strokeWidth={customBorder ? (borderPx || 1.6) : 1.6}
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

function NoteCard({ note, x, y, palette, onOpen, onShared, shapeId = 'rect', selected = false, borderOverride = null }) {
  const icon = note.type === "audio" ? "\ud83c\udf99" : note.type === "image" ? "\ud83d\udcf8" : "\u270e";
  const shared = !!note.sharedWith;
  const shaped = shapeId && shapeId !== 'rect';
  const borderColor = borderOverride?.color;
  const borderPx    = borderOverride?.thickness;
  const customBorder = !!(borderColor || borderPx);
  return (
    <div data-card onClick={onOpen} style={{
      position: "absolute", left: x, top: y,
      width: 220, cursor: "pointer",
      background: shaped ? "transparent" : palette.card,
      border: shaped
        ? (customBorder ? `${borderPx || 1.6}px solid transparent` : "1px solid transparent")
        : (customBorder
            ? `${borderPx || 1.5}px solid ${borderColor || palette.accent}`
            : `1px solid ${palette.accent}33`),
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
            stroke={customBorder ? (borderColor || palette.accent) : (palette.accent + 'CC')}
            strokeWidth={customBorder ? (borderPx || 1.6) : 1.6}
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
  const rawSpan = Math.max(oldestDays, ...enriched.map(m => m.days));
  // Span runs from oldest mile-marker → 0 (now). Clamp to ≥1 so the
  // math below doesn't divide by zero even when we end up not
  // rendering.
  const span = Math.max(rawSpan, 1);
  const [head, setHead] = useStateT(0); // days-ago at the head (0 = now)
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  // If everything reads as "just now" — typical for user-created
  // threads straight out of a DOS session, where every find and
  // mile-marker carries age 'just now' — there's no real range to
  // scrub through. Hide the scrubber entirely rather than rendering a
  // collapsed control that only resolves to two endpoints.
  const meaningfulRange = rawSpan >= 2;

  const setFromX = (clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    // left = oldest, right = now
    const days = Math.round(span * (1 - t));
    setHead(days);
    onScrub && onScrub(days);
  };

  // Pointer events + pointer capture: the track keeps receiving events
  // even when the cursor moves outside it (e.g. over the grid body),
  // which the previous window-mousemove approach was missing on the
  // grid view.
  const onPointerDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    setFromX(e.clientX);
  };
  const onPointerUp = (e) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const headT = 1 - (head / span);   // 0..1 across the track

  if (!meaningfulRange) return null;

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
      <div ref={trackRef}
           onPointerDown={onPointerDown}
           onPointerMove={onPointerMove}
           onPointerUp={onPointerUp}
           onPointerCancel={onPointerUp}
           style={{
             position: "relative",
             height: 38,
             cursor: "ew-resize",
             userSelect: "none",
             touchAction: "none",
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

// Design panel — unified surface for the design tools (Rearrange,
// Shape, Border, Ether). Sits in the top-left chrome below the View
// Mode toggle.
export function DesignPanel({
  mode, onSwitch, palette,
  layoutDirty, shapesDirty, bordersDirty, etherDirty,
  onLockLayout, onLockShapes, onLockBorders, onLockEther,
  onResetLayout, onResetShapes, onResetBorders, onResetEther,
  onExit,
  selectedCardKey, currentShapeForSelected,
  currentBorderForSelected,
  onPickShape, onPickBorderColor, onPickBorderThickness,
  currentEther, onPickEther, onUploadEther,
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
      marginTop: 6, width: 280,
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
        {tabBtn("rearrange", "Move")}
        {tabBtn("shape",     "Shape")}
        {tabBtn("border",    "Border")}
        {tabBtn("ether",     "Ether")}
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

      {mode === "border" && (
        <>
          <p style={{
            margin: "0 0 8px", fontSize: 10.5, lineHeight: 1.4,
            color: "#5E5A55", fontFamily: FT,
          }}>
            {selectedCardKey
              ? "Choose a color, then a thickness."
              : "Click a card to select it, then pick a border."}
          </p>
          <BorderLibrary
            palette={palette}
            disabled={!selectedCardKey}
            current={currentBorderForSelected}
            onPickColor={onPickBorderColor}
            onPickThickness={onPickBorderThickness} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={onLockBorders} disabled={!bordersDirty} style={{
              fontSize: 10, fontWeight: 600, padding: "5px 11px", borderRadius: 6,
              cursor: bordersDirty ? "pointer" : "default", fontFamily: FT,
              border: "none",
              background: bordersDirty ? palette.accent : "rgba(26,23,20,.08)",
              color: bordersDirty ? "#FAF5E9" : "#9A968F",
            }}>Lock borders</button>
            <button onClick={onResetBorders} style={{
              fontSize: 10, padding: "5px 11px", borderRadius: 6,
              cursor: "pointer", fontFamily: FT,
              border: `1px solid ${palette.accent}33`,
              background: "transparent", color: "#5E5A55",
            }} title="Restore the default border on every card">Reset all</button>
          </div>
        </>
      )}

      {mode === "ether" && (
        <>
          <p style={{
            margin: "0 0 8px", fontSize: 10.5, lineHeight: 1.4,
            color: "#5E5A55", fontFamily: FT,
          }}>Pick a background for the spatial canvas — or upload your own.</p>
          <EtherLibrary
            palette={palette}
            current={currentEther}
            onPick={onPickEther}
            onUpload={onUploadEther} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={onLockEther} disabled={!etherDirty} style={{
              fontSize: 10, fontWeight: 600, padding: "5px 11px", borderRadius: 6,
              cursor: etherDirty ? "pointer" : "default", fontFamily: FT,
              border: "none",
              background: etherDirty ? palette.accent : "rgba(26,23,20,.08)",
              color: etherDirty ? "#FAF5E9" : "#9A968F",
            }}>Lock ether</button>
            <button onClick={onResetEther} style={{
              fontSize: 10, padding: "5px 11px", borderRadius: 6,
              cursor: "pointer", fontFamily: FT,
              border: `1px solid ${palette.accent}33`,
              background: "transparent", color: "#5E5A55",
            }} title="Restore the default paper background">Clear</button>
          </div>
        </>
      )}
    </div>
  );
}

// Two-row library: color swatches above, thickness rules below.
export function BorderLibrary({ palette, disabled, current, onPickColor, onPickThickness }) {
  const wrapDim = disabled ? { opacity: 0.5, pointerEvents: 'none' } : null;
  return (
    <div style={wrapDim}>
      <div style={{
        fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: FT, marginBottom: 4,
      }}>color</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {BORDER_COLORS.map(c => {
          const active = current?.color === c.value;
          return (
            <button key={c.id} title={c.label} onClick={() => onPickColor(c.value)} style={{
              height: 28, padding: 0, cursor: "pointer",
              background: c.value,
              border: active ? `2px solid ${palette.accent}` : '1px solid rgba(26,23,20,.10)',
              borderRadius: 3,
            }}/>
          );
        })}
      </div>
      <div style={{
        fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: FT, marginTop: 10, marginBottom: 4,
      }}>thickness</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
        {BORDER_THICKNESSES.map(t => {
          const active = current?.thickness === t.px;
          return (
            <button key={t.id} title={t.label} onClick={() => onPickThickness(t.px)} style={{
              height: 28, padding: 0, cursor: "pointer",
              background: "#FFFFFF",
              border: active ? `1.5px solid ${palette.accent}` : '1px solid rgba(26,23,20,.10)',
              borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: '70%', height: t.px,
                background: current?.color || "#3A3530",
                borderRadius: 1,
              }}/>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Ether library: preset tiles + upload tile.
export function EtherLibrary({ palette, current, onPick, onUpload }) {
  const fileInputRef = useRef(null);
  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2_500_000) {
      alert('That image is bigger than ~2.5MB — try a smaller one. (Local storage is limited.)');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUpload({ kind: 'image', dataUrl: reader.result });
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div>
      <div style={{
        fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: FT, marginBottom: 4,
      }}>presets</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {ETHER_PRESETS.map(p => {
          const active = current?.kind === 'preset' && current.value === p.id;
          return (
            <button key={p.id} onClick={() => onPick({ kind: 'preset', value: p.id })}
              title={p.label + (p.coiner ? ` · ${p.coiner}` : '')}
              style={{
                position: 'relative', height: 50, padding: 0,
                background: '#FFFFFF',
                border: active ? `1.5px solid ${palette.accent}` : '1px solid rgba(26,23,20,.10)',
                borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
              }}>
              <EtherTilePreview id={p.id} accent={palette.accent} />
              {p.coiner && (
                <span style={{
                  position: 'absolute', bottom: 2, right: 4,
                  fontFamily: MT, fontSize: 7.5, color: '#B0ADA6',
                }}>{p.coiner.replace('@','')}</span>
              )}
            </button>
          );
        })}
        <button onClick={() => fileInputRef.current?.click()}
          title="Upload an image from your computer"
          style={{
            height: 50, padding: 0, cursor: "pointer",
            background: "transparent",
            border: current?.kind === 'image'
              ? `1.5px solid ${palette.accent}` : '1px dashed rgba(26,23,20,.22)',
            borderRadius: 4, color: "#9A968F",
            fontFamily: FT, fontSize: 8.5, lineHeight: 1.2,
            display: "flex", alignItems: "center", justifyContent: "center",
            textAlign: "center", padding: "2px 4px",
            position: 'relative', overflow: 'hidden',
          }}>
          {current?.kind === 'image' ? (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${current.dataUrl})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }}/>
          ) : <>+ upload<br/>image</>}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*"
          onChange={onFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

// Small live preview of an ether preset shown inside a tile.
function EtherTilePreview({ id, accent }) {
  const common = { width: '100%', height: '100%', display: 'block' };
  if (id === 'plain') return <div style={{ ...common, background: '#F8F4E8' }} />;
  return (
    <svg viewBox="0 0 50 30" preserveAspectRatio="xMidYMid slice" style={common}>
      <rect width="50" height="30" fill="#F8F4E8" />
      {id === 'dots' && Array.from({length: 24}, (_,i) => (
        <circle key={i} cx={2 + (i % 6) * 8} cy={3 + Math.floor(i / 6) * 7} r="0.7" fill="#1A1714" opacity="0.5"/>
      ))}
      {id === 'lines' && [0,1,2,3,4].map(i => (
        <line key={i} x1="2" y1={3 + i * 6} x2="48" y2={3 + i * 6} stroke="#1A1714" strokeOpacity="0.3" strokeWidth="0.4"/>
      ))}
      {id === 'grid' && (
        <>
          {[0,1,2,3,4,5,6].map(i => <line key={'v'+i} x1={2 + i * 7} y1="0" x2={2 + i * 7} y2="30" stroke="#1A1714" strokeOpacity="0.25" strokeWidth="0.3"/>)}
          {[0,1,2,3,4].map(i => <line key={'h'+i} x1="0" y1={3 + i * 6} x2="50" y2={3 + i * 6} stroke="#1A1714" strokeOpacity="0.25" strokeWidth="0.3"/>)}
        </>
      )}
      {id === 'rings' && Array.from({length: 5}, (_,i) => (
        <circle key={i} cx="25" cy="15" r={3 + i * 3} fill="none" stroke="#1A1714" strokeOpacity={0.32 - i * 0.05} strokeWidth="0.4"/>
      ))}
      {id === 'crosshatch' && Array.from({length: 12}, (_,i) => (
        <line key={i} x1={-5 + i * 6} y1="0" x2={5 + i * 6} y2="30" stroke="#1A1714" strokeOpacity="0.25" strokeWidth="0.3"/>
      ))}
      {id === 'wayfinding' && Array.from({length: 7}, (_,i) => (
        <ellipse key={i} cx="25" cy="15"
          rx={3 + i * 3 + Math.sin(i) * 1.5}
          ry={2 + i * 2.5 + Math.cos(i) * 1.2}
          fill="none" stroke={accent} strokeOpacity={0.35 - i * 0.04} strokeWidth="0.5"/>
      ))}
      {id === 'vignette' && (
        <>
          <defs>
            <radialGradient id="tile-vig" cx="50%" cy="50%" r="60%">
              <stop offset="55%" stopColor="#1A1714" stopOpacity="0"/>
              <stop offset="100%" stopColor="#1A1714" stopOpacity="0.4"/>
            </radialGradient>
          </defs>
          <rect width="50" height="30" fill="url(#tile-vig)"/>
        </>
      )}
    </svg>
  );
}

// Mini visual catalogue from the shape library. Renders 7 starter shapes
// + 3 community-coined, plus an inert "draw your own / import" tile that
// reads as a coming-soon affordance.
export function ShapeLibrary({ palette, disabled, current, onPick }) {
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

// Grid view — implements the design handoff in /tmp/ts_design.
// Sticky white chrome at top (back-to-promenade · ON {OWNER}'S THREAD ·
// view toggle), thread header (meta + question), then a responsive grid
// of square uniform tiles. Text tiles show title + body fading; image-
// kind tiles (photo/drawing) show a striped placeholder + silhouette +
// mono tag. Each tile has a muted-teal caption beneath with a pin
// glyph and the title.
const GRID_FONT_SANS = "'Inter', system-ui, sans-serif";
const GRID_FONT_SERIF = "'Fraunces', Georgia, serif";
const GRID_FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

export function GridStyleTag() {
  return (
    <style>{`
      .tg-root { position: fixed; inset: 0; background: #fff; overflow: auto;
        font-family: ${GRID_FONT_SANS}; color: #1a1a1a; }
      .tg-chrome { position: sticky; top: 0; z-index: 10;
        background: rgba(255,255,255,0.96); backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-bottom: 1px solid #e6e6e6;
        padding: 11px 22px;
        display: flex; align-items: center; gap: 14px;
        font-family: ${GRID_FONT_MONO}; font-size: 11px; color: #8a8a8a; letter-spacing: 0.04em; }
      .tg-chrome > .left { flex: 0 0 auto; }
      .tg-chrome > .center { flex: 1 1 auto; min-width: 0; text-align: center; }
      .tg-chrome > .right { flex: 0 0 auto; }
      .tg-back { background: none; border: none; cursor: pointer;
        font-family: ${GRID_FONT_MONO}; font-size: 11px; color: #555;
        letter-spacing: 0.04em; padding: 0; }
      .tg-back:hover { color: #111; }
      .tg-center-label { text-transform: uppercase; }
      .tg-vt { display: inline-flex; border: 1px solid #e6e6e6; background: #fff; }
      .tg-vt button { background: none; border: none; cursor: pointer;
        padding: 6px 11px; font-family: ${GRID_FONT_MONO};
        font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
        color: #555; display: inline-flex; align-items: center; gap: 6px;
        border-right: 1px solid #e6e6e6; }
      .tg-vt button:last-child { border-right: none; }
      .tg-vt button.on { background: #111; color: #fff; }

      .tg-pad { max-width: 1480px; margin: 0 auto; padding: 36px 22px 120px; }
      .tg-thead { margin-bottom: 44px; max-width: 760px; }
      .tg-thead .meta { font-family: ${GRID_FONT_MONO}; font-size: 11px;
        color: #8a8a8a; letter-spacing: 0.06em; margin-bottom: 14px;
        display: flex; gap: 14px; flex-wrap: wrap; }
      .tg-thead .meta .sep { color: #ccc; }
      .tg-thead .q { font-family: ${GRID_FONT_SERIF}; font-weight: 400;
        font-size: 30px; line-height: 1.18; margin: 0; color: #111;
        text-wrap: pretty; letter-spacing: -0.01em; }

      .tg-grid { display: grid; grid-template-columns: repeat(5, 1fr);
        column-gap: 16px; row-gap: 36px; }
      @media (max-width: 1280px) { .tg-grid { grid-template-columns: repeat(4, 1fr); } }
      @media (max-width: 980px)  { .tg-grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 700px)  { .tg-grid { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 460px)  { .tg-grid { grid-template-columns: 1fr; } }

      .tg-cell { display: flex; flex-direction: column; min-width: 0; cursor: pointer; }
      .tg-tile { background: #fff; border: 1px solid #e6e6e6;
        aspect-ratio: 1 / 1; position: relative; overflow: hidden;
        transition: border-color 180ms ease, box-shadow 180ms ease; }
      .tg-cell:hover .tg-tile { border-color: #b8b8b8;
        box-shadow: 0 1px 0 0 rgba(0,0,0,0.02); }

      .tg-text { position: absolute; inset: 0; padding: 18px 18px 0;
        display: flex; flex-direction: column; background: #fff; }
      .tg-text .t { font-family: ${GRID_FONT_SANS}; font-weight: 600;
        font-size: 13.5px; line-height: 1.28; color: #111;
        margin-bottom: 9px; text-wrap: pretty; }
      .tg-text .b { font-family: ${GRID_FONT_SANS}; font-weight: 400;
        font-size: 12px; line-height: 1.5; color: #333;
        text-wrap: pretty; flex: 1; overflow: hidden; }
      .tg-text .b em, .tg-text .b i { color: #555; }
      .tg-fade { position: absolute; left: 0; right: 0; bottom: 0;
        height: 56px; background: linear-gradient(to bottom, rgba(255,255,255,0), #fff 85%);
        pointer-events: none; }

      .tg-img { position: absolute; inset: 0; }
      .tg-img-fig { position: absolute; inset: 0; opacity: 0.55; }
      .tg-img-tag { position: absolute; left: 10px; bottom: 10px;
        font-family: ${GRID_FONT_MONO}; font-size: 9px;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: rgba(20,20,20,0.55); background: rgba(255,255,255,0.78);
        padding: 4px 7px; }

      .tg-cap { margin-top: 9px; display: flex; gap: 5px; align-items: flex-start;
        font-family: ${GRID_FONT_SANS}; font-size: 12.5px; color: #6b8a96; min-width: 0; }
      .tg-cap .pin { flex: 0 0 auto; margin-top: 3px; color: #6b8a96; }
      .tg-cap .t { white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis; min-width: 0; flex: 1; }
      .tg-cell:hover .tg-cap { color: #2e4f5a; }
    `}</style>
  );
}

function GridViewToggle({ current, onSwitch }) {
  const opts = [
    { id: 'timeline', l: 'timeline', glyph: <TimelineGlyph active={current === 'timeline'}/> },
    { id: 'grid',     l: 'grid',     glyph: <GridGlyph    active={current === 'grid'}/> },
  ];
  return (
    <div className="tg-vt">
      {opts.map(o => (
        <button key={o.id} className={current === o.id ? 'on' : ''}
          onClick={() => onSwitch(o.id)}>
          {o.glyph} {o.l}
        </button>
      ))}
    </div>
  );
}

function TimelineGlyph({ active }) {
  const c = active ? '#fff' : '#555';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <line x1="0" y1="5" x2="10" y2="5" stroke={c} strokeWidth="1"/>
      <circle cx="2" cy="5" r="1" fill={c}/>
      <circle cx="5" cy="5" r="1" fill={c}/>
      <circle cx="8" cy="5" r="1" fill={c}/>
    </svg>
  );
}
function GridGlyph({ active }) {
  const c = active ? '#fff' : '#555';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <rect x="0.5" y="0.5" width="3.5" height="3.5" fill="none" stroke={c} strokeWidth="1"/>
      <rect x="6"   y="0.5" width="3.5" height="3.5" fill="none" stroke={c} strokeWidth="1"/>
      <rect x="0.5" y="6"   width="3.5" height="3.5" fill="none" stroke={c} strokeWidth="1"/>
      <rect x="6"   y="6"   width="3.5" height="3.5" fill="none" stroke={c} strokeWidth="1"/>
    </svg>
  );
}

export function PinGlyph() {
  return (
    <svg className="pin" width="9" height="11" viewBox="0 0 9 11">
      <circle cx="4.5" cy="3.5" r="2.7" fill="none" stroke="currentColor" strokeWidth="1"/>
      <path d="M4.5 6.5 L4.5 10.5" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

function GridView({ thread, headDays = 0, activeQ, onOpenFind, onOpenNote }) {
  const items = [
    ...thread.fl.map(f => ({ kind: 'find', data: f, days: ageToDays(f.d), age: f.d })),
    ...(thread.notesList || []).map(n => ({ kind: 'note', data: n, days: ageToDays(n.d), age: n.d })),
  ];
  // Newest first — smaller days-ago = more recent.
  items.sort((a, b) => a.days - b.days);
  // The scrubber filters the grid to only what existed at the head's
  // moment. Items NEWER than the head (days < headDays) are hidden:
  // they hadn't been saved to the thread yet at that point in time.
  // Use the same 3-day grace window the spatial view uses so dragging
  // the head slightly past a card doesn't pop it out abruptly.
  const visible = headDays > 0
    ? items.filter(it => it.days >= headDays - 3)
    : items;
  return (
    <div className="tg-root">
      <GridStyleTag />
      <div className="tg-pad" style={{ paddingTop: 130 }}>
        <div className="tg-thead">
          <div className="meta">
            <span>{thread.owner || 'Maya R.'}&rsquo;s thread</span>
            <span className="sep">·</span>
            <span>pursuing for {thread.age || '—'}</span>
            <span className="sep">·</span>
            <span>{visible.length}{headDays > 0 ? ` of ${items.length}` : ''} cards on the promenade</span>
            {headDays > 0 && (
              <>
                <span className="sep">·</span>
                <span style={{ color: '#1A5C46' }}>{daysToLabel(headDays)} view</span>
              </>
            )}
          </div>
          <h1 className="q">{activeQ || thread.q}</h1>
        </div>
        <div className="tg-grid">
          {visible.map((it, idx) => (
            <GridTile key={idx} item={it}
              onOpen={() => it.kind === 'find' ? onOpenFind(it.data) : onOpenNote(it.data)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GridTile({ item, onOpen }) {
  const isFind = item.kind === 'find';
  const titleText = isFind ? item.data.t : item.data.cap;
  // Image-tile path: only photo/drawing per the spec. Everything else
  // (book, article, audio, podcast, notes-text, etc.) renders as a
  // text tile with title + body fading.
  const isImage = isFind
    ? (item.data.i === '📸' || item.data.i === '🎞' || item.data.i === '✎')
    : (item.data.type === 'image');
  const hue = isFind
    ? (() => {
        const id = item.data.id || (item.data.t + item.data.s + item.data.d);
        return etherHueFor(id);
      })()
    : etherHueFor((item.data.cap || '') + (item.data.d || ''));
  const body = isFind
    ? (item.data.note || item.data.s || '')
    : (item.data.cap || '');
  // For notes we have no separate title/body; show the caption as both
  // (title at top, no body) since the caption IS the content.
  const title = isFind
    ? titleText
    : (item.data.dur ? `${titleText} (${item.data.dur})` : titleText);
  return (
    <div className="tg-cell" onClick={onOpen}>
      <div className="tg-tile">
        {isImage
          ? <ImageTilePlaceholder hue={hue} scene={isFind ? 'photo' : (item.data.type || 'image')} count={1} />
          : <TextTileBody title={title} body={isFind ? body : ''} />}
      </div>
      <div className="tg-cap">
        <PinGlyph />
        <span className="t">{titleText}</span>
      </div>
    </div>
  );
}

export function TextTileBody({ title, body }) {
  return (
    <div className="tg-text">
      <div className="t">{title}</div>
      {body && <div className="b">{body}</div>}
      <div className="tg-fade" />
    </div>
  );
}

function ImageTilePlaceholder({ hue, scene, count }) {
  const a = `oklch(0.86 0.025 ${hue})`;
  const b = `oklch(0.79 0.035 ${hue})`;
  return (
    <div className="tg-img" style={{
      background: `repeating-linear-gradient(135deg, ${a} 0 14px, ${b} 14px 28px)`,
    }}>
      <svg className="tg-img-fig" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="64" width="100" height="36" fill={`oklch(0.5 0.05 ${hue})`} opacity="0.55"/>
        <circle cx="50" cy="44" r="14" fill="none" stroke={`oklch(0.42 0.06 ${hue})`} strokeWidth="1"/>
      </svg>
      <div className="tg-img-tag">{scene} · {count}</div>
    </div>
  );
}

// Stable hue per item id so the striped placeholder colour is consistent
// across renders. Limited to warm/earth/cool palette that plays with
// the white tile background.
function etherHueFor(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const palette = [18, 28, 40, 78, 160, 200, 230, 260, 340];
  return palette[(h >>> 0) % palette.length];
}

// Queue dock — the "stumbled on this find" area. Finds saved into a
// thread from the Promenade land here in a raw state. The owner gives
// them form (places them in the orbit) or dismisses them.
function QueueDock({ queued, palette, onPlace, onDismiss }) {
  return (
    <div data-ui style={{
      position: "fixed", right: 24, bottom: 24, zIndex: 24,
      width: 320, maxHeight: "60vh", overflowY: "auto",
      background: "rgba(255,255,255,.97)",
      border: `1px solid ${palette.accent}55`,
      borderRadius: 8, padding: "12px 14px 14px",
      boxShadow: "0 12px 30px rgba(40,30,15,.14)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase",
          color: palette.accent, fontFamily: FT, fontWeight: 700,
        }}>↓ stumbled · {queued.length} waiting</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {queued.map(f => (
          <div key={f.id} style={{
            padding: "10px 11px",
            background: "#FBF8F0",
            border: `1px solid ${palette.accent}66`,
            borderRadius: 4,
          }}>
            <div style={{
              fontSize: 8.5, letterSpacing: ".12em", textTransform: "uppercase",
              color: palette.accent, fontFamily: MT, fontWeight: 600,
              marginBottom: 4, display: "flex", justifyContent: "space-between",
            }}>
              <span>stumbled on this find</span>
              <span style={{ color: "#9A968F" }}>{f.d}</span>
            </div>
            <div style={{
              fontFamily: ST, fontSize: 13, color: "#1A1714",
              lineHeight: 1.3, marginBottom: 4,
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{f.t}</div>
            {f.s && (
              <div style={{
                fontSize: 10, color: "#7A756F", fontFamily: FT,
                marginBottom: 8, lineHeight: 1.3,
              }}>{f.s}</div>
            )}
            <div style={{
              fontFamily: FT, fontSize: 10, color: "#5E5A55",
              padding: "6px 8px",
              border: "1px dashed rgba(26,23,20,.18)",
              borderRadius: 3, marginBottom: 8,
              fontStyle: "italic",
            }}>
              In your thread but not yet placed. No shape, no border,
              no orbit position.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onPlace(f.id)} style={{
                fontSize: 10, fontWeight: 600, padding: "5px 11px", borderRadius: 4,
                cursor: "pointer", fontFamily: MT, letterSpacing: ".08em",
                textTransform: "uppercase", border: "none",
                background: palette.accent, color: "#FAF5E9",
              }}>↓ Give it form</button>
              <button onClick={() => onDismiss(f.id)} style={{
                fontSize: 10, padding: "5px 11px", borderRadius: 4,
                cursor: "pointer", fontFamily: MT, letterSpacing: ".08em",
                textTransform: "uppercase",
                border: "1px solid rgba(26,23,20,.12)",
                background: "transparent", color: "#7A756F",
              }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadRoomImpl({ navigate, thread: propThread, viewMode = "maya", onClose = null }) {
  // queueVersion bumps when the user places or dismisses a queued find;
  // re-deriving the thread from storage refreshes the spatial layout.
  const [queueVersion, setQueueVersion] = useStateT(0);
  const thread = React.useMemo(
    () => (typeof window !== 'undefined' ? (getThreadById(propThread.id) || propThread) : propThread),
    [propThread, queueVersion]
  );
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
  // designMode: 'off' | 'rearrange' | 'shape' | 'border' | 'ether'
  const [designMode, setDesignMode] = useStateT('off');
  // Position overrides
  const [savedOverrides, setSavedOverrides] = useStateT(() => loadThreadLayout(thread.id));
  const [overrides, setOverrides] = useStateT(savedOverrides);
  const layoutDirty = designMode === 'rearrange' && JSON.stringify(overrides) !== JSON.stringify(savedOverrides);
  // Shape overrides
  const [savedShapes, setSavedShapes] = useStateT(() => loadThreadShapes(thread.id));
  const [shapes, setShapes] = useStateT(savedShapes);
  const shapesDirty = designMode === 'shape' && JSON.stringify(shapes) !== JSON.stringify(savedShapes);
  // Border overrides
  const [savedBorders, setSavedBorders] = useStateT(() => loadThreadBorders(thread.id));
  const [borders, setBorders] = useStateT(savedBorders);
  const bordersDirty = designMode === 'border' && JSON.stringify(borders) !== JSON.stringify(savedBorders);
  // Ether
  const [savedEther, setSavedEther] = useStateT(() => loadThreadEther(thread.id));
  const [ether, setEther] = useStateT(savedEther);
  const etherDirty = designMode === 'ether' && JSON.stringify(ether) !== JSON.stringify(savedEther);

  const [selectedCardKey, setSelectedCardKey] = useStateT(null);
  const layoutEdit = designMode === 'rearrange';
  const shapeEdit  = designMode === 'shape';
  const borderEdit = designMode === 'border';

  const enterRearrange = () => { setOverrides(savedOverrides); setSelectedCardKey(null); setDesignMode('rearrange'); };
  const enterShape     = () => { setShapes(savedShapes);       setSelectedCardKey(null); setDesignMode('shape'); };
  const enterBorder    = () => { setBorders(savedBorders);     setSelectedCardKey(null); setDesignMode('border'); };
  const enterEther     = () => { setEther(savedEther);         setSelectedCardKey(null); setDesignMode('ether'); };
  const exitDesign     = () => {
    setOverrides(savedOverrides); setShapes(savedShapes);
    setBorders(savedBorders); setEther(savedEther);
    setSelectedCardKey(null); setDesignMode('off');
  };
  const lockLayout     = () => { saveThreadLayout(thread.id, overrides); setSavedOverrides(overrides); setDesignMode('off'); };
  const lockShapes     = () => { saveThreadShapes(thread.id, shapes);    setSavedShapes(shapes);       setSelectedCardKey(null); setDesignMode('off'); };
  const lockBorders    = () => { saveThreadBorders(thread.id, borders);  setSavedBorders(borders);     setSelectedCardKey(null); setDesignMode('off'); };
  const lockEther      = () => { saveThreadEther(thread.id, ether);      setSavedEther(ether);         setDesignMode('off'); };
  const resetLayout    = () => { setOverrides({}); };
  const resetShapes    = () => { setShapes({}); setSelectedCardKey(null); };
  const resetBorders   = () => { setBorders({}); setSelectedCardKey(null); };
  const resetEther     = () => { setEther(null); };
  const setCardPos     = (key, pos) => setOverrides(prev => ({ ...prev, [key]: pos }));
  const setCardShape   = (key, shapeId) => setShapes(prev => {
    const next = { ...prev };
    if (!shapeId || shapeId === 'rect') delete next[key]; else next[key] = shapeId;
    return next;
  });
  const setCardBorderColor = (color) => {
    if (!selectedCardKey) return;
    setBorders(prev => ({ ...prev, [selectedCardKey]: { ...(prev[selectedCardKey] || {}), color } }));
  };
  const setCardBorderThickness = (thickness) => {
    if (!selectedCardKey) return;
    setBorders(prev => ({ ...prev, [selectedCardKey]: { ...(prev[selectedCardKey] || {}), thickness } }));
  };

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
  // Queued finds (just stumbled-in, not yet placed) are filtered out of
  // the orbital layout — they live in the QueueDock until given form.
  const placedFinds = thread.fl.filter(f => !f.queued);
  const queuedFinds = thread.fl.filter(f => f.queued);
  const finds = placedFinds.map((f, i) => {
    const t = (i + 0.5) / Math.max(1, placedFinds.length);
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
  // Design is available whenever you own the thread (the tools auto-switch
  // to spatial since that's where they have something to act on).
  const showRearrange = canEdit;
  const enterDesign = () => {
    if (threadView !== 'spatial') setThreadView('spatial');
    if (designMode === 'off') enterRearrange();
  };
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
          { id: "grid",     l: "Grid" },
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
        {showRearrange && (
          <button onClick={enterDesign} title="Rearrange, shape, border, ether" style={{
            fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 9,
            cursor: "pointer", fontFamily: FT,
            border: `1px solid ${designMode !== 'off' ? palette.accent : palette.accent + "66"}`,
            background: designMode !== 'off' ? palette.bg : "rgba(246,243,236,.7)",
            color: palette.accent,
            transition: "all .15s",
          }}>✦ Design</button>
        )}
      </div>
      {showRearrange && designMode !== 'off' && (
        <DesignPanel
          mode={designMode}
          onSwitch={(next) => {
            // Switching tabs cancels unsaved edits in the previous tab
            // (you'd lose them on exit anyway). Keeps the model simple.
            if (next === 'rearrange') enterRearrange();
            else if (next === 'shape') enterShape();
            else if (next === 'border') enterBorder();
            else if (next === 'ether') enterEther();
          }}
          palette={palette}
          layoutDirty={layoutDirty}
          shapesDirty={shapesDirty}
          bordersDirty={bordersDirty}
          etherDirty={etherDirty}
          onLockLayout={lockLayout}
          onLockShapes={lockShapes}
          onLockBorders={lockBorders}
          onLockEther={lockEther}
          onResetLayout={resetLayout}
          onResetShapes={resetShapes}
          onResetBorders={resetBorders}
          onResetEther={resetEther}
          onExit={exitDesign}
          selectedCardKey={selectedCardKey}
          currentShapeForSelected={selectedCardKey ? (shapes[selectedCardKey] || 'rect') : null}
          currentBorderForSelected={selectedCardKey ? (borders[selectedCardKey] || null) : null}
          onPickShape={(shapeId) => {
            if (!selectedCardKey) return;
            setCardShape(selectedCardKey, shapeId);
          }}
          onPickBorderColor={setCardBorderColor}
          onPickBorderThickness={setCardBorderThickness}
          currentEther={ether}
          onPickEther={(e) => setEther(e)}
          onUploadEther={(e) => setEther(e)} />
      )}
    </div>
  );

  // Courtyard aperture only when there's actually a courtyard: a
  // courtyardName AND at least one kindred thread. Solo "courtyards of
  // one" (user-spawned threads without invited members) don't get the
  // door — there's nothing to enter.
  const hasCourtyard = !!thread.courtyardName && (thread.kindred?.length || 0) > 0;
  const apertures = [
    ...(hasCourtyard ? [{
      position: "right", label: "Courtyard",
      hint: `→ §04 · the ${thread.courtyardName} courtyard`,
      onActivate: () => navigate("courtyard", { id: thread.id }),
    }] : []),
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

  // ============ GRID VIEW (are.na-style) ============
  // Chronological masonry grid of every find and note in this thread.
  // Newest first, reading row by row (top-left → bottom-right). Each tile
  // is the same SVG thumbnail used on the Promenade — books, waveforms,
  // duotone photos — so the grid reads as media-rich without any raster
  // assets. Click a tile to open it (same overlay as the other views).
  if (threadView === "grid") {
    const scrubber = (
      <TimelineScrubber
        markers={thread.mileMarkers.map((m, i, a) => ({ ...m, isCurrent: i === a.length - 1 }))}
        oldestDays={ageToDays(thread.age)}
        label={`thread time · ${thread.age} old`}
        onScrub={setHeadDays}
      />
    );
    return (
      <>
        <GridView
          thread={thread}
          headDays={headDays}
          activeQ={activeQ}
          onOpenFind={(find) => { setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "find", data: find }); }}
          onOpenNote={(note) => { setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "note", data: note }); }}
        />
        {header}
        {scrubber}
        {breadcrumb}
        {identityCard}
        {viewToggle}
        {apertures.map((a, i) => <ApT key={i} {...a} />)}
        {cardOverlay}
      </>
    );
  }

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
  const hasEther = !!ether;
  return (
    <>
      <EtherLayer ether={ether} accent={palette.accent} />
    <PZCT
      canvasW={canvasW} canvasH={canvasH}
      background={hasEther ? 'transparent' : palette.soft}
      showGround={!hasEther}
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
          {canEdit && queuedFinds.length > 0 && (
            <QueueDock
              queued={queuedFinds}
              palette={palette}
              onPlace={(findId) => {
                placeQueuedFind(thread.id, findId);
                // mutate in-place — local re-render via state bump
                setQueueVersion(v => v + 1);
              }}
              onDismiss={(findId) => {
                dismissQueuedFind(thread.id, findId);
                setQueueVersion(v => v + 1);
              }}
            />
          )}
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
            {/* Reframes popout — replaces the old mile-marker arc. Lives
                with the question instead of floating as separate cards. */}
            <ReframesPopout
              mileMarkers={thread.mileMarkers}
              palette={palette}
              onPick={(mm, isCurrent) => {
                setNoteDraft(null); setSpawnDraft(null); setSavedMsg(null);
                setActiveCard({ kind: "marker", data: { q: mm.q, age: mm.age, isCurrent } });
              }} />
          </div>

          {/* Finds — only items that existed by the head's moment in time. */}
          {finds.map((F, i) => (
            <div key={"fw" + i} style={{
              opacity: (layoutEdit || shapeEdit || borderEdit) ? 1 : (F.days < headDays - 3 ? 0.12 : 1),
              transition: "opacity .25s ease",
              outline: layoutEdit ? `1.5px dashed ${palette.accent}77` : 'none',
              outlineOffset: layoutEdit ? 4 : 0,
              borderRadius: 8,
            }}>
              <Draggable cardKey={F.key} x={F.x} y={F.y} zoom={zoom}
                editing={layoutEdit} onDragMove={setCardPos}>
                <FindCard find={F.f} x={F.x} y={F.y} palette={palette}
                  shapeId={shapes[F.key] || 'rect'}
                  borderOverride={borders[F.key] || null}
                  selected={(shapeEdit || borderEdit) && selectedCardKey === F.key}
                  onOpen={() => {
                    if (layoutEdit) return;
                    if (shapeEdit || borderEdit) { setSelectedCardKey(F.key); return; }
                    setNoteDraft(null); setSavedMsg(null); setActiveCard({ kind: "find", data: F.f });
                  }}
                  onShared={() => navigate("courtyard", { id: thread.id })} />
              </Draggable>
            </div>
          ))}

          {/* Notes */}
          {notes.map((N, i) => (
            <div key={"nw" + i} style={{
              opacity: (layoutEdit || shapeEdit || borderEdit) ? 1 : (N.days < headDays - 3 ? 0.12 : 1),
              transition: "opacity .25s ease",
              outline: layoutEdit ? `1.5px dashed ${palette.accent}77` : 'none',
              outlineOffset: layoutEdit ? 4 : 0,
              borderRadius: 8,
            }}>
              <Draggable cardKey={N.key} x={N.x} y={N.y} zoom={zoom}
                editing={layoutEdit} onDragMove={setCardPos}>
                <NoteCard note={N.n} x={N.x} y={N.y} palette={palette}
                  shapeId={shapes[N.key] || 'rect'}
                  borderOverride={borders[N.key] || null}
                  selected={(shapeEdit || borderEdit) && selectedCardKey === N.key}
                  onOpen={() => {
                    if (layoutEdit) return;
                    if (shapeEdit || borderEdit) { setSelectedCardKey(N.key); return; }
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
    </>
  );
}

export const ThreadRoom = ThreadRoomImpl;
export default ThreadRoomImpl;
