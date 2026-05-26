// Mosaic shell — Room frame, Aperture (door treatment), Breadcrumb.
// All rooms render <Room> with apertures on their edges.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WM } from '../data/wm-data.js';

// ---------------- Type tokens ----------------
const FONT_SERIF = "'Cormorant Garamond', Georgia, serif";
const FONT_SANS  = "'DM Sans', system-ui, sans-serif";
const FONT_MONO  = "'JetBrains Mono', ui-monospace, monospace";

// ---------------- ROUTER ----------------
// Hash-based: #room=home / #room=thread&id=t-platforms / etc.
function useRoom() {
  const parse = () => {
    const h = window.location.hash.slice(1);
    if (!h) return { room: "home", params: {} };
    const params = Object.fromEntries(new URLSearchParams(h));
    return { room: params.room || "home", params };
  };
  const [state, setState] = useState(parse);
  useEffect(() => {
    const onHash = () => setState(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = (room, params = {}) => {
    const usp = new URLSearchParams({ room, ...params });
    window.location.hash = usp.toString();
  };
  return { ...state, navigate };
}

// ---------------- APERTURE ----------------
// An edge-tab on the room frame. Always visible; hover lifts it slightly.
// Position: 'top' | 'right' | 'bottom' | 'left'.
// Two registers: 'open' (always nav-able) and 'gated' (locked icon, tooltip).

function Aperture({
  position = "right",
  label,                  // long-form name of where it goes
  hint,                   // short verb or whisper, e.g. "side door · search"
  onActivate,
  gated = false,
  gateMessage,
  warm = false,           // 'challenges' style — warmer chip, upward arrow
}) {
  const [hover, setHover] = useState(false);
  const isHorizontal = position === "left" || position === "right";

  const arrow = warm ? "↑" : (
    position === "right"  ? "→" :
    position === "left"   ? "←" :
    position === "bottom" ? "↓" : "↑"
  );

  // The aperture lives in its own BAY — a paper-toned recess set into the
  // room edge, exactly the size of the door + breathing room. Content sits
  // inside the room proper; the bay sits in the margin OUTSIDE content,
  // so the door no longer overlaps anything.
  //
  // Geometry:
  //  - bay depth (perpendicular to the edge):  the door body + 12px padding
  //  - bay span  (along the edge):             door extent + 22px on each side
  //  - bay color: a slightly recessed paper tone with a fine inner edge
  //
  // The Aperture renders the bay AND the door together. The Room frame
  // does not need to know about margins — bays are local to each door.

  // Door dimensions (used to size the bay)
  const doorW = isHorizontal ? 168 : 220;     // along-edge for top/bottom is wider (more text)
  const doorH = isHorizontal ? 84  : 64;
  const bayPadAlong = 22;
  const bayPadDeep  = 14;

  const bayLong  = (isHorizontal ? doorH : doorW) + bayPadAlong * 2;
  const bayDeep  = (isHorizontal ? doorW : doorH) + bayPadDeep;

  const bayStyle = (() => {
    const base = {
      position: "absolute",
      zIndex: 7,
      background: "#EDE7D6",                   // paper, slightly deeper than room
      borderRadius: 4,
      boxShadow: "inset 0 0 0 1px rgba(26,23,20,.06)",
      transition: "all .25s cubic-bezier(.4,0,.2,1)",
    };
    if (position === "right") {
      return { ...base,
        top: "50%", right: 0,
        width: bayDeep, height: bayLong,
        transform: "translateY(-50%)",
        borderTopLeftRadius: 10, borderBottomLeftRadius: 10,
      };
    }
    if (position === "left") {
      return { ...base,
        top: "50%", left: 0,
        width: bayDeep, height: bayLong,
        transform: "translateY(-50%)",
        borderTopRightRadius: 10, borderBottomRightRadius: 10,
      };
    }
    if (position === "bottom") {
      return { ...base,
        bottom: 0, left: "50%",
        width: bayLong, height: bayDeep,
        transform: "translateX(-50%)",
        borderTopLeftRadius: 10, borderTopRightRadius: 10,
      };
    }
    if (position === "top") {
      return { ...base,
        top: 0, left: "50%",
        width: bayLong, height: bayDeep,
        transform: "translateX(-50%)",
        borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
      };
    }
    return base;
  })();

  // Door sits centered inside the bay; hover nudges it slightly outward
  // (toward the edge, away from content) for tactile feedback.
  const doorOuter = (() => {
    const base = {
      position: "absolute",
      zIndex: 8,
      transition: "transform .25s cubic-bezier(.4,0,.2,1)",
    };
    const lift = hover ? 3 : 0;
    if (position === "right")  return { ...base, top: "50%", right: 12 - lift, transform: "translateY(-50%)" };
    if (position === "left")   return { ...base, top: "50%", left:  12 - lift, transform: "translateY(-50%)" };
    if (position === "bottom") return { ...base, bottom: 12 - lift, left: "50%", transform: "translateX(-50%)" };
    if (position === "top")    return { ...base, top:    12 - lift, left: "50%", transform: "translateX(-50%)" };
    return base;
  })();

  const tabStyle = {
    background: warm ? "#F4E6C8" : gated ? "#EDEAE1" : "#FFFFFF",
    border: `1px solid ${warm ? "#B5A06A" : gated ? "rgba(26,23,20,.1)" : "rgba(26,92,70,.25)"}`,
    boxShadow: gated ? "none" : "0 4px 16px rgba(26,23,20,.06)",
    borderRadius: 8,
    padding: "10px 14px",
    cursor: gated ? "help" : "pointer",
    fontFamily: FONT_SANS,
    width: isHorizontal ? doorW : doorW,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  };

  return (
    <>
      {/* the door itself — bay removed; door floats directly on the room */}
      <div data-aperture style={doorOuter}
           onMouseEnter={() => setHover(true)}
           onMouseLeave={() => setHover(false)}
           onClick={() => { if (!gated) onActivate(); }}>
        <div style={tabStyle}
             title={gated ? gateMessage : ""}>
          <div style={{
            fontSize: 8.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase",
            color: warm ? "#75580D" : gated ? "#9A968F" : "#1A5C46",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span>{arrow}</span>
            <span>{gated ? "locked" : "door"}</span>
            {gated && <span style={{ marginLeft: "auto" }}>🔒</span>}
          </div>
          <div style={{
            fontFamily: FONT_SERIF, fontStyle: "italic", fontSize: 16, fontWeight: 400,
            color: gated ? "#9A968F" : "#1A1714", lineHeight: 1.15,
          }}>{label}</div>
          {hint && (
            <div style={{ fontSize: 10.5, color: "#9A968F", lineHeight: 1.3 }}>{hint}</div>
          )}
          {gated && gateMessage && (
            <div style={{ fontSize: 10, color: "#B5A06A", marginTop: 3, fontStyle: "italic" }}>
              {gateMessage}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- BREADCRUMB ----------------
// Bottom-left chrome — names the room and the trail back. The only persistent UI.

function Breadcrumb({ trail, onNavigate, here, navigate, viewMode = "maya", showSwitcher = true }) {
  // The bottom-left chrome is now the only navigator.
  // It does two things: (1) names where you are with a back-trail, (2) provides
  // single-click access to all top-level rooms via dotted "doors" on the right.
  // viewMode: "maya" | "parent" | "child" — child has Home/Courtyard/Pod; parent has parent's surfaces.
  const rooms = viewMode === "child"
    ? [
        { id: "home",      label: "Home" },
        { id: "courtyard", label: "Courtyard" },
        { id: "pod",       label: "Pod" },
      ]
    : viewMode === "parent"
    ? [
        { id: "home",      label: "Home" },
        { id: "pod-admin", label: "Pod (admin)" },
      ]
    : [
        { id: "home",      label: "Home" },
        { id: "promenade", label: "Promenade" },
        { id: "townhall",  label: "Town Hall" },
        { id: "search",    label: "Search" },
      ];
  // Courtyard removed from the global switcher — it is now thread-scoped and
  // only reachable from inside a thread.

  // Trail is hidden inside Thread (room owns the canvas) but back-out remains via a single ← arrow.
  const showTrail = trail && trail.length > 0;

  return (
    <div style={{
      position: "fixed", bottom: 18, left: 22, zIndex: 30,
      display: "flex", alignItems: "stretch", gap: 0,
      background: "rgba(246,243,236,.94)", backdropFilter: "blur(8px)",
      borderRadius: 7,
      border: "1px solid rgba(26,23,20,.06)",
      fontSize: 11, fontFamily: FONT_SANS, color: "#5E5A55",
      boxShadow: "0 2px 12px rgba(26,23,20,.04)",
      maxWidth: "calc(100vw - 44px)",
    }}>
      {/* Wordmark + trail (left) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px 7px 12px" }}>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 13, letterSpacing: ".02em", color: "#1A1714" }}>
          Wander<em style={{ color: "#1A5C46", fontStyle: "normal" }}>mark</em>
        </span>
        {showTrail && trail.map((t, i) => (
          <React.Fragment key={i}>
            <span style={{ color: "#C0BDB6" }}>·</span>
            {t.onClick ? (
              <button onClick={t.onClick} style={{
                background: "none", border: "none",
                color: i === trail.length - 1 ? "#1A1714" : "#1A5C46",
                fontFamily: FONT_SANS, fontSize: 11, cursor: "pointer", padding: 0,
                fontWeight: i === trail.length - 1 ? 500 : 400,
              }}>{t.label}</button>
            ) : (
              <span style={{
                color: i === trail.length - 1 ? "#1A1714" : "#9A968F",
                fontWeight: i === trail.length - 1 ? 500 : 400,
              }}>{t.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Vertical hairline separator */}
      {showSwitcher && <div style={{ width: 1, background: "rgba(26,23,20,.08)", margin: "6px 0" }} />}

      {/* Room switcher (right) */}
      {showSwitcher && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "5px 6px 5px 8px" }}>
          {rooms.map((r) => {
            const active = r.id === here;
            return (
              <button key={r.id} onClick={() => !active && navigate && navigate(r.id)}
                disabled={active}
                title={active ? `You're in ${r.label}` : `Go to ${r.label}`}
                style={{
                  background: active ? "#1A5C46" : "transparent",
                  color: active ? "#F6F3EC" : "#3A3530",
                  border: "none", borderRadius: 4,
                  padding: "4px 9px", fontSize: 10.5, fontFamily: FONT_SANS,
                  fontWeight: active ? 600 : 500, letterSpacing: ".01em",
                  cursor: active ? "default" : "pointer",
                  transition: "all .12s ease",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(26,92,70,.08)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >{r.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- ROOM FRAME ----------------
// The 100vw/100vh container that every room renders inside.
// Gives the room its background, holds the apertures, exposes a content area.

function Room({ background = "#F2EFE6", children, apertures = [], breadcrumb }) {
  return (
    <div style={{
      position: "fixed", inset: 0, overflow: "hidden",
      background, fontFamily: FONT_SANS, color: "#1A1714",
    }}>
      {children}
      {apertures.map((a, i) => <Aperture key={i} {...a} />)}
      {breadcrumb}
    </div>
  );
}

// ---------------- DOMAIN PILL ----------------
function DomainPill({ domain, dc }) {
  const pal = WM.DOMAIN[dc];
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 500, padding: "2px 7px", borderRadius: 8,
      background: pal.bg, color: pal.accent,
      fontFamily: FONT_SANS, letterSpacing: ".01em",
    }}>{domain}</span>
  );
}

// ---------------- PAN-ZOOM CANVAS ----------------
// Reusable spatial canvas (lifted from promenade.jsx). Children render at
// absolute positions in canvas-coords; the wrapper handles pan/zoom.
//
// Controls (matched to Promenade.html):
//   - Click & drag empty space → pan
//   - Mouse near screen edge → drift pan in that direction
//   - Wheel → zoom around cursor
//   - Arrow keys → nudge pan
//   - +/- → zoom; 0 → reset; Z → toggle bird's-eye

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;
const ZOOM_BIRD = 0.45;
const ZOOM_DEFAULT = 0.95;

function clampPan(p, z, cw, ch) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = vw - cw * z - 200;
  const maxX = 200;
  const minY = vh - ch * z - 200;
  const maxY = 200;
  return {
    x: Math.max(minX, Math.min(maxX, p.x)),
    y: Math.max(minY, Math.min(maxY, p.y)),
  };
}

function GroundPattern({ pan, zoom, dot = "#1A1714" }) {
  const size = 48 * zoom;
  return (
    <svg style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', opacity: 0.07,
    }}>
      <defs>
        <pattern id={`gp-${dot.slice(1)}`} x={pan.x} y={pan.y}
                 width={size} height={size} patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill={dot} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#gp-${dot.slice(1)})`} />
    </svg>
  );
}

function EdgeIndicators() {
  const common = { position: 'fixed', pointerEvents: 'none', zIndex: 4 };
  const grad = (dir) => `linear-gradient(${dir}, rgba(26,23,20,0.07), rgba(26,23,20,0) 60%)`;
  return (
    <>
      <div style={{ ...common, left: 0, top: 0, width: 40, height: '100%', background: grad('to right') }}/>
      <div style={{ ...common, right: 0, top: 0, width: 40, height: '100%', background: grad('to left') }}/>
      <div style={{ ...common, left: 0, top: 0, width: '100%', height: 40, background: grad('to bottom') }}/>
      <div style={{ ...common, left: 0, bottom: 0, width: '100%', height: 40, background: grad('to top') }}/>
    </>
  );
}

function ZoomControl({ zoom, onZoom }) {
  const btn = {
    width: 28, height: 28,
    border: '1px solid rgba(26,23,20,.12)',
    background: 'rgba(246,243,236,0.92)',
    color: '#3A3530', cursor: 'pointer',
    fontFamily: FONT_MONO, fontSize: 14, borderRadius: 4,
  };
  const pct = Math.round(zoom * 100);
  return (
    <div style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 25,
      display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center',
    }} data-ui>
      <button style={btn} onClick={() => onZoom(zoom * 1.18)} title="Zoom in (+)">+</button>
      <div style={{
        fontFamily: FONT_MONO, fontSize: 9, color: '#5E5A55',
        background: 'rgba(246,243,236,0.92)', padding: '3px 4px',
        border: '1px solid rgba(26,23,20,.12)', borderRadius: 3,
        minWidth: 28, textAlign: 'center',
      }}>{pct}%</div>
      <button style={btn} onClick={() => onZoom(zoom / 1.18)} title="Zoom out (−)">−</button>
      <button style={{ ...btn, fontSize: 10, marginTop: 4 }}
              onClick={() => onZoom(zoom > ZOOM_BIRD + 0.05 ? ZOOM_BIRD : ZOOM_DEFAULT)}
              title="Bird's-eye (Z)">{zoom > ZOOM_BIRD + 0.05 ? '⊟' : '⊞'}</button>
    </div>
  );
}

function PanHint({ children }) {
  return (
    <div data-ui style={{
      position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
      zIndex: 25, fontFamily: FONT_MONO, fontSize: 9.5,
      color: '#9A968F', letterSpacing: '.08em',
      background: 'rgba(246,243,236,0.85)', padding: '5px 12px',
      border: '1px solid rgba(26,23,20,.06)', borderRadius: 3,
      pointerEvents: 'none',
    }}>
      {children || 'drag · wheel zoom · arrows nudge · Z bird\'s-eye'}
    </div>
  );
}

// PanZoomCanvas — drop your spatial content inside, sized to canvasW × canvasH.
// children receive { zoom, detail, isDragging } via cloneElement is unnecessary;
// we expose them via a render-prop pattern.
function PanZoomCanvas({
  canvasW = 2400, canvasH = 1800,
  background = "#F2EFE6",
  initialPan,            // { x, y } in canvas coordinates (top-left of viewport in canvas space, negated)
  initialZoom = ZOOM_DEFAULT,
  showPanHint = true,
  panHint,
  showZoomControl = true,
  showGround = true,
  groundDot = "#1A1714",
  children,              // function: ({ zoom, detail, isDragging }) => ReactNode rendered inside the transformed canvas
  overlay,               // ReactNode rendered fixed (not transformed)
  onPanZoom,             // optional callback ({ pan, zoom })
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [pan, setPan] = useState(() => initialPan || ({
    x: -canvasW * initialZoom / 2 + window.innerWidth / 2,
    y: -canvasH * initialZoom / 2 + window.innerHeight / 2,
  }));
  const panRef = useRef(pan);
  panRef.current = pan;

  useEffect(() => { onPanZoom && onPanZoom({ pan, zoom }); }, [pan, zoom, onPanZoom]);

  // Drag-to-pan
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Mouse position for edge wander. `overUi` suppresses wander when the
  // cursor is over chrome (view toggles, scrubber, identity card,
  // breadcrumb, zoom controls, pan hint, apertures) so passive hovering
  // near an edge doesn't pan the canvas. Cards ([data-card]) are content,
  // not chrome — drift still works over them.
  const mouseRef = useRef({ x: 0, y: 0, inside: false, overUi: false });
  useEffect(() => {
    const onMove = (e) => {
      const t = e.target;
      const overUi = !!(t && t.closest && t.closest('[data-ui], [data-aperture], [data-aperture-bay]'));
      mouseRef.current = { x: e.clientX, y: e.clientY, inside: true, overUi };
    };
    const markOut = () => { mouseRef.current.inside = false; };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', markOut);
    window.addEventListener('blur', markOut);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', markOut);
      window.removeEventListener('blur', markOut);
    };
  }, []);

  // Edge-wander rAF loop
  useEffect(() => {
    let raf, last = performance.now();
    const tick = (ts) => {
      const dt = Math.min(40, ts - last);
      last = ts;
      if (mouseRef.current.inside && !mouseRef.current.overUi && !dragRef.current.dragging) {
        const { x, y } = mouseRef.current;
        const W = window.innerWidth, H = window.innerHeight;
        const margin = 90, maxV = 0.55;
        const ease = (t) => t * t;
        let vx = 0, vy = 0;
        if (x < margin)        vx = +ease((margin - x) / margin) * maxV;
        else if (x > W-margin) vx = -ease((x - (W-margin)) / margin) * maxV;
        if (y < margin)        vy = +ease((margin - y) / margin) * maxV;
        else if (y > H-margin) vy = -ease((y - (H-margin)) / margin) * maxV;
        if (vx !== 0 || vy !== 0) {
          setPan(p => clampPan({ x: p.x + vx * dt, y: p.y + vy * dt }, zoomRef.current, canvasW, canvasH));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasW, canvasH]);

  // Zoom helpers
  const zoomToAt = useCallback((next, screenX, screenY) => {
    next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    const prev = zoomRef.current;
    const canvasX = (screenX - panRef.current.x) / prev;
    const canvasY = (screenY - panRef.current.y) / prev;
    const newPanX = screenX - canvasX * next;
    const newPanY = screenY - canvasY * next;
    setZoom(next);
    setPan(clampPan({ x: newPanX, y: newPanY }, next, canvasW, canvasH));
  }, [canvasW, canvasH]);

  const zoomTo = useCallback((next) => {
    zoomToAt(next, window.innerWidth/2, window.innerHeight/2);
  }, [zoomToAt]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing inside inputs
      if (e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      const step = 180;
      if (e.key === 'ArrowLeft')  setPan(p => clampPan({ ...p, x: p.x + step }, zoomRef.current, canvasW, canvasH));
      if (e.key === 'ArrowRight') setPan(p => clampPan({ ...p, x: p.x - step }, zoomRef.current, canvasW, canvasH));
      if (e.key === 'ArrowUp')    setPan(p => clampPan({ ...p, y: p.y + step }, zoomRef.current, canvasW, canvasH));
      if (e.key === 'ArrowDown')  setPan(p => clampPan({ ...p, y: p.y - step }, zoomRef.current, canvasW, canvasH));
      if (e.key === '+' || e.key === '=') zoomTo(zoomRef.current * 1.15);
      if (e.key === '-' || e.key === '_') zoomTo(zoomRef.current / 1.15);
      if (e.key === '0')                  zoomTo(ZOOM_DEFAULT);
      if (e.key === 'z' || e.key === 'Z') zoomTo(zoomRef.current > ZOOM_BIRD + 0.05 ? ZOOM_BIRD : ZOOM_DEFAULT);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvasW, canvasH, zoomTo]);

  // Wheel zoom
  const elRef = useRef(null);
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1/1.08;
      zoomToAt(zoomRef.current * factor, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomToAt]);

  // Pointer drag — only on empty canvas (not on cards or UI)
  const onPointerDown = (e) => {
    dragRef.current = { dragging: false, sx: e.clientX, sy: e.clientY,
                        ox: panRef.current.x, oy: panRef.current.y, moved: 0 };
    if (e.target.closest('[data-card]')) return;
    if (e.target.closest('[data-ui]')) return;
    if (e.target.closest('[data-aperture]')) return;
    dragRef.current.dragging = true;
    setIsDragging(true);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    dragRef.current.moved = Math.max(dragRef.current.moved, Math.hypot(dx, dy));
    setPan(clampPan({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy },
                    zoomRef.current, canvasW, canvasH));
  };
  const onPointerUp = () => {
    dragRef.current.dragging = false;
    setIsDragging(false);
  };

  const detail = zoom < 0.6 ? 'compact' : 'full';
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <div ref={elRef}
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerUp}
         onPointerLeave={onPointerUp}
         style={{
           position: 'fixed', inset: 0, overflow: 'hidden',
           background, cursor: isDragging ? 'grabbing' : 'grab',
         }}>
      {showGround && <GroundPattern pan={pan} zoom={zoom} dot={groundDot} />}
      <EdgeIndicators />
      <div style={{
        position: 'absolute', width: canvasW, height: canvasH,
        transform, transformOrigin: '0 0', willChange: 'transform',
      }}>
        {typeof children === 'function' ? children({ zoom, detail, isDragging, dragRef }) : children}
      </div>
      {overlay}
      {showZoomControl && <ZoomControl zoom={zoom} onZoom={zoomTo} />}
      {showPanHint && <PanHint>{panHint}</PanHint>}
    </div>
  );
}

// RoomNav — persistent top-right strip with doors to all main rooms.
function RoomNav({ navigate, here }) {
  const rooms = [
    { id: "home",      label: "Home" },
    { id: "promenade", label: "Promenade" },
    { id: "courtyard", label: "Courtyard" },
    { id: "townhall",  label: "Town Hall" },
    { id: "search",    label: "Search" },
  ];
  return (
    <div data-ui style={{
      position: "fixed", top: 18, right: 22, zIndex: 30,
      display: "flex", alignItems: "center", gap: 2,
      background: "rgba(246,243,236,.94)", backdropFilter: "blur(8px)",
      padding: "5px 6px", borderRadius: 8,
      border: "1px solid rgba(26,23,20,.08)",
      fontFamily: FONT_SANS, fontSize: 11,
      boxShadow: "0 2px 10px rgba(26,23,20,.06)",
    }}>
      {rooms.map(r => {
        const active = r.id === here;
        return (
          <button key={r.id} onClick={() => !active && navigate(r.id)}
            disabled={active}
            style={{
              background: active ? "#1A5C46" : "transparent",
              color: active ? "#F6F3EC" : "#3A3530",
              border: "none", borderRadius: 5,
              padding: "5px 10px",
              cursor: active ? "default" : "pointer",
              fontFamily: FONT_SANS, fontSize: 11,
              fontWeight: active ? 500 : 400,
              transition: "background .15s, color .15s",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(26,23,20,.06)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >{r.label}</button>
        );
      })}
    </div>
  );
}

export {
  useRoom, Aperture, Breadcrumb, Room, DomainPill, RoomNav,
  FONT_SERIF, FONT_SANS, FONT_MONO,
  PanZoomCanvas, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, ZOOM_BIRD, clampPan,
};
