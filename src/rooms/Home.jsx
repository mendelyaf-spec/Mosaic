// HOME — Maya's held threads on a pan/zoom canvas.
// Same controls as Promenade.html: drag, edge-wander, wheel zoom, arrows.

import React, { useState as useStateH } from 'react';
import {
  Aperture as ApertureH,
  DomainPill as DomainPillH,
  PanZoomCanvas as PZCH,
  Breadcrumb,
  FONT_SERIF as SH,
  FONT_SANS as FH,
  ZOOM_DEFAULT,
} from '../shell/shell.jsx';
import { WM } from '../data/wm-data.js';
import {
  getAllThreads, getThreadById, deleteThread,
  loadHomeLayout, saveHomeLayout,
  loadHomeShapes, saveHomeShapes,
  loadHomeBorders, saveHomeBorders,
  loadHomeEther, saveHomeEther,
} from '../lib/threads.js';
import {
  DesignPanel, EtherLayer, SHAPE_DEFS,
} from './Thread.jsx';

function ThreadCluster({
  thread, pos, onOpen, onDelete, centerAnchor = false,
  // Design-mode props — when undefined, the cluster behaves as before.
  editMode = 'off',          // 'off' | 'rearrange' | 'shape' | 'border'
  zoom = 1,
  shapeId = 'rect',
  borderOverride = null,
  selected = false,
  onMove,                    // (threadId, { x, y }) => void
  onSelect,                  // (threadId) => void
}) {
  const pal = WM.DOMAIN[thread.dc];
  const [hover, setHover] = useStateH(false);
  const [showReframes, setShowReframes] = useStateH(false);

  const items = [
    ...(thread.fl || []).slice(0, 3).map(f => ({ ...f, _t: "find" })),
    ...(thread.notesList || []).slice(0, 1).map(n => ({ ...n, _t: "note" })),
  ];

  const stateBadge = thread.state === "active" ? "active"
                   : thread.state === "spawned" ? "newly spawned"
                   : "resting";

  // Drag state for Move mode. Track screen deltas, convert to canvas
  // coords via zoom. In Shape/Border mode the click selects the cluster.
  const downRef = React.useRef({ x: 0, y: 0, t: 0, ox: 0, oy: 0, dragging: false });
  const swallow = (e) => { e.stopPropagation(); };

  const onPointerDown = (e) => {
    downRef.current = {
      x: e.clientX, y: e.clientY, t: Date.now(),
      ox: pos.x, oy: pos.y,
      dragging: editMode === 'rearrange',
    };
    if (editMode === 'rearrange') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    if (!downRef.current.dragging) return;
    const dx = (e.clientX - downRef.current.x) / Math.max(0.0001, zoom);
    const dy = (e.clientY - downRef.current.y) / Math.max(0.0001, zoom);
    if (onMove) onMove(thread.id, { x: downRef.current.ox + dx, y: downRef.current.oy + dy });
  };
  const onPointerUp = (e) => {
    const d = downRef.current;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const moved = Math.hypot(dx, dy);
    downRef.current.dragging = false;
    if (editMode === 'rearrange') return; // suppress click after drag
    if (moved < 6 && Date.now() - d.t < 600) {
      if (editMode === 'shape' || editMode === 'border') {
        onSelect && onSelect(thread.id);
      } else {
        onOpen(thread);
      }
    }
  };

  const shaped = shapeId && shapeId !== 'rect';
  const bColor = borderOverride?.color;
  const bPx    = borderOverride?.thickness;
  const customBorder = !!(bColor || bPx);
  return (
    <div data-card
         onPointerDown={onPointerDown}
         onPointerMove={onPointerMove}
         onPointerUp={onPointerUp}
         onPointerCancel={() => { downRef.current.dragging = false; }}
         onMouseEnter={() => setHover(true)}
         onMouseLeave={() => setHover(false)}
         style={{
      position: "absolute", left: pos.x, top: pos.y,
      width: 380, cursor: editMode === 'rearrange' ? 'grab' : 'pointer',
      transition: "transform .25s cubic-bezier(.4,0,.2,1)",
      touchAction: editMode === 'rearrange' ? 'none' : 'auto',
      transform: centerAnchor
        ? (hover ? "translate(-50%, calc(-50% - 3px))" : "translate(-50%, -50%)")
        : (hover ? "translateY(-3px)" : "translateY(0)"),
    }}>
      {thread.mileMarkers && thread.mileMarkers.length > 1 && (
        <div style={{ paddingLeft: 14, marginBottom: 6 }}>
          <div
            role="button"
            title={showReframes ? "Hide reframes" : "See each reframe"}
            onMouseDown={swallow}
            onMouseUp={e => { swallow(e); setShowReframes(v => !v); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 8.5, color: "#9A968F", fontFamily: FH,
              cursor: "pointer", padding: "3px 6px 3px 0", borderRadius: 4,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {thread.mileMarkers.map((mm, i) => (
                <React.Fragment key={i}>
                  <div style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: i === thread.mileMarkers.length - 1 ? pal.accent : pal.accent + "55",
                  }} />
                  {i < thread.mileMarkers.length - 1 && (
                    <div style={{ width: 12, height: 1, background: pal.accent + "33" }} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <span style={{ fontSize: 8, letterSpacing: ".06em", textTransform: "uppercase",
                            color: showReframes ? pal.accent : "#B0ADA6", marginLeft: 4,
                            fontWeight: showReframes ? 600 : 400 }}>
              {thread.mileMarkers.length} reframes
            </span>
            <span style={{
              fontSize: 8, color: "#B0ADA6", marginLeft: 2,
              transform: showReframes ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform .15s", display: "inline-block",
            }}>▸</span>
          </div>

          {showReframes && (
            <div
              onMouseDown={swallow}
              onMouseUp={swallow}
              style={{
                marginTop: 6, marginBottom: 4,
                background: "rgba(255,255,255,.7)",
                border: `1px solid ${pal.accent}22`,
                borderRadius: 6, padding: "10px 12px",
                cursor: "default",
              }}>
              {thread.mileMarkers.map((mm, i) => {
                const isCurrent = i === thread.mileMarkers.length - 1;
                return (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "flex-start",
                    paddingBottom: i < thread.mileMarkers.length - 1 ? 8 : 0,
                    marginBottom: i < thread.mileMarkers.length - 1 ? 8 : 0,
                    borderBottom: i < thread.mileMarkers.length - 1
                      ? "1px dashed rgba(26,23,20,.08)" : "none",
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                      background: isCurrent ? pal.accent : pal.accent + "55",
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 8, letterSpacing: ".06em", textTransform: "uppercase",
                        color: "#B0ADA6", fontFamily: FH, marginBottom: 2,
                      }}>
                        {mm.age}{isCurrent ? " · current" : ""}
                      </div>
                      <div style={{
                        fontFamily: SH, fontStyle: "italic", fontSize: 12.5,
                        color: isCurrent ? "#1A1714" : "#5E5A55", lineHeight: 1.35,
                      }}>
                        {mm.q}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{
        position: "relative",
        background: shaped ? "transparent" : pal.bg,
        borderRadius: shaped ? 0 : 10,
        padding: "16px 20px",
        border: shaped
          ? "1.5px solid transparent"
          : (customBorder
              ? `${bPx || 1.5}px solid ${bColor || pal.accent}`
              : `1.5px solid ${pal.accent}28`),
        boxShadow: shaped ? "none" : (hover
          ? `0 8px 32px ${pal.accent}1c`
          : `0 2px 14px ${pal.accent}0c`),
        transition: "box-shadow .25s",
        outline: selected ? `2px solid ${pal.accent}` : 'none',
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
              stroke={customBorder ? (bColor || pal.accent) : (pal.accent + 'AA')}
              strokeWidth={customBorder ? (bPx || 1.6) : 1.6}
              vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {onDelete && (
          <button
            title="Delete this thread"
            onMouseDown={swallow}
            onMouseUp={(e) => {
              swallow(e);
              const q = (thread.q || '').trim();
              const label = q.length > 60 ? q.slice(0, 60) + '…' : q;
              if (window.confirm(`Delete this thread?\n\n“${label}”\n\nThis can't be undone.`)) {
                onDelete(thread);
              }
            }}
            style={{
              position: "absolute", top: 8, right: 8,
              width: 22, height: 22, borderRadius: "50%",
              border: `1px solid ${pal.accent}33`,
              background: hover ? "#FFFFFF" : "transparent",
              color: hover ? pal.accent : "#B0ADA6",
              fontSize: 12, lineHeight: 1, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: hover ? 1 : 0.0,
              transition: "opacity .15s, color .15s, background .15s",
              padding: 0,
            }}>×</button>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 6,
            background: thread.state === "resting" ? "#9A968F" : pal.dot,
          }} />
          <div style={{
            fontFamily: SH, fontSize: 18, fontStyle: "italic", fontWeight: 300,
            color: "#1A1714", lineHeight: 1.18, flex: 1,
          }}>
            {thread.q}
          </div>
        </div>

        <div style={{
          display: "flex", gap: 9, fontSize: 10, color: "#9A968F",
          fontFamily: FH, flexWrap: "wrap", alignItems: "center",
          paddingLeft: 16, marginBottom: 10,
        }}>
          <span>{thread.finds} finds</span>
          <span>{thread.notes} notes</span>
          <span>{thread.age}</span>
          <DomainPillH domain={thread.domain} dc={thread.dc} />
          <span style={{
            fontSize: 8.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase",
            color: thread.state === "resting" ? "#9A968F" : pal.accent,
            paddingLeft: 6, borderLeft: `1px solid ${pal.accent}33`,
          }}>{stateBadge}</span>
        </div>

        {thread.mileMarkers && (
          <div style={{
            paddingLeft: 16, marginBottom: 12,
            fontSize: 10.5, color: "#5E5A55",
            fontFamily: FH, lineHeight: 1.4,
          }}>
            <span style={{
              fontSize: 8, letterSpacing: ".08em", textTransform: "uppercase",
              color: "#B0ADA6", display: "block", marginBottom: 2,
            }}>last reframe — {thread.last}</span>
            <em style={{ fontFamily: SH, fontSize: 12.5, color: "#5E5A55" }}>
              {thread.mileMarkers[thread.mileMarkers.length - 1].q}
            </em>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingLeft: 16 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              background: it._t === "find" ? "#FFFFFF" : pal.card,
              border: "1px solid rgba(26,23,20,.07)",
              borderRadius: 5, padding: "5px 9px",
              fontSize: 10.5, fontFamily: FH, color: "#3A3530",
              lineHeight: 1.3, maxWidth: 200,
              display: "flex", alignItems: "flex-start", gap: 5,
            }}>
              <span style={{ fontSize: 10, opacity: .55, flexShrink: 0, marginTop: 1 }}>
                {it._t === "find" ? it.i : (it.type === "audio" ? "🎙" : it.type === "image" ? "📸" : "✎")}
              </span>
              <span style={{
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {it._t === "find" ? it.t : it.cap}
              </span>
            </div>
          ))}
          {thread.finds > items.filter(i => i._t === "find").length && (
            <div style={{
              fontSize: 9, color: "#9A968F", padding: "4px 8px",
              background: "rgba(26,23,20,.025)", borderRadius: 4,
              display: "flex", alignItems: "center",
            }}>
              + {thread.finds + thread.notes - items.length} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// (Thread used to expand in place on top of Home; now it's its own
// page at #room=thread&id=<id>, so the constellation never sits faintly
// behind a focused thread.)


function HomeRoom({ navigate, firstUse, viewMode: whoseView = "maya", openerStage, openerMode }) {
  // version bumps on delete so getAllThreads() re-runs against fresh storage
  const [version, setVersion] = useStateH(0);
  const threads = React.useMemo(() => getAllThreads(), [version]);
  const [zoom, setZoom] = useStateH(ZOOM_DEFAULT);
  const [viewPeriod, setViewPeriod] = useStateH("all");
  const [viewMode, setViewMode] = useStateH("spatial"); // "spatial" | "timeline"
  const [schedulerOpen, setSchedulerOpen] = useStateH(false);

  // Clicking a thread routes to its own page. Each thread lives at
  // #room=thread&id=<id> so it's deep-linkable and Home recedes
  // entirely behind it (rather than peeking through faintly).
  const openThread = (id) => navigate('thread', { id });

  const handleDelete = (thread) => {
    deleteThread(thread.id);
    setVersion(v => v + 1);
  };

  // ── Home design state (mirrors Thread.jsx) ────────────────────────
  // designMode: 'off' | 'rearrange' | 'shape' | 'border' | 'ether'
  const [designMode, setDesignMode] = useStateH('off');
  const [savedHomeLayout,  setSavedHomeLayout]  = useStateH(() => loadHomeLayout());
  const [homeLayoutEdit,   setHomeLayoutEdit]   = useStateH(savedHomeLayout);
  const [savedHomeShapes,  setSavedHomeShapes]  = useStateH(() => loadHomeShapes());
  const [homeShapesEdit,   setHomeShapesEdit]   = useStateH(savedHomeShapes);
  const [savedHomeBorders, setSavedHomeBorders] = useStateH(() => loadHomeBorders());
  const [homeBordersEdit,  setHomeBordersEdit]  = useStateH(savedHomeBorders);
  const [savedHomeEther,   setSavedHomeEther]   = useStateH(() => loadHomeEther());
  const [homeEtherEdit,    setHomeEtherEdit]    = useStateH(savedHomeEther);
  const [selectedClusterId, setSelectedClusterId] = useStateH(null);
  const [canvasZoom, setCanvasZoom] = useStateH(ZOOM_DEFAULT);
  const layoutDirty  = designMode === 'rearrange' && JSON.stringify(homeLayoutEdit)  !== JSON.stringify(savedHomeLayout);
  const shapesDirty  = designMode === 'shape'     && JSON.stringify(homeShapesEdit)  !== JSON.stringify(savedHomeShapes);
  const bordersDirty = designMode === 'border'    && JSON.stringify(homeBordersEdit) !== JSON.stringify(savedHomeBorders);
  const etherDirty   = designMode === 'ether'     && JSON.stringify(homeEtherEdit)   !== JSON.stringify(savedHomeEther);
  const enterMode = (m) => {
    setHomeLayoutEdit(savedHomeLayout);
    setHomeShapesEdit(savedHomeShapes);
    setHomeBordersEdit(savedHomeBorders);
    setHomeEtherEdit(savedHomeEther);
    setSelectedClusterId(null);
    setDesignMode(m);
  };
  const exitDesign = () => { enterMode('off'); };
  const lockLayout  = () => { saveHomeLayout(homeLayoutEdit);   setSavedHomeLayout(homeLayoutEdit);   setDesignMode('off'); };
  const lockShapes  = () => { saveHomeShapes(homeShapesEdit);   setSavedHomeShapes(homeShapesEdit);   setSelectedClusterId(null); setDesignMode('off'); };
  const lockBorders = () => { saveHomeBorders(homeBordersEdit); setSavedHomeBorders(homeBordersEdit); setSelectedClusterId(null); setDesignMode('off'); };
  const lockEther   = () => { saveHomeEther(homeEtherEdit);     setSavedHomeEther(homeEtherEdit);     setDesignMode('off'); };
  const resetLayout  = () => setHomeLayoutEdit({});
  const resetShapes  = () => { setHomeShapesEdit({}); setSelectedClusterId(null); };
  const resetBorders = () => { setHomeBordersEdit({}); setSelectedClusterId(null); };
  const resetEther   = () => setHomeEtherEdit(null);
  const setClusterPos    = (tid, p) => setHomeLayoutEdit(prev => ({ ...prev, [tid]: p }));
  const setClusterShape  = (tid, s) => setHomeShapesEdit(prev => {
    const next = { ...prev };
    if (!s || s === 'rect') delete next[tid]; else next[tid] = s;
    return next;
  });
  const setClusterBorderColor     = (color)     => selectedClusterId && setHomeBordersEdit(prev => ({ ...prev, [selectedClusterId]: { ...(prev[selectedClusterId] || {}), color } }));
  const setClusterBorderThickness = (thickness) => selectedClusterId && setHomeBordersEdit(prev => ({ ...prev, [selectedClusterId]: { ...(prev[selectedClusterId] || {}), thickness } }));
  // The "Maya" persona accent — used for the design panel highlights on
  // Home (no per-thread palette at the page level).
  const homePalette = { accent: '#1A5C46', bg: '#FAF5E9' };

  // Per-thread activity weight per period — 1 = bright, 0 = dim out.
  // Hand-tuned from each thread's `last` timestamp + mile-marker dates.
  const ACTIVITY = {
    all:    { "t-platforms": 1,   "t-grief": 1,   "t-soft": 1   },
    week:   { "t-platforms": 1,   "t-grief": .15, "t-soft": 0   }, // platforms reframed yesterday
    month:  { "t-platforms": 1,   "t-grief": 1,   "t-soft": .25 }, // grief 4 days ago, soft 3 weeks
    year:   { "t-platforms": 1,   "t-grief": 1,   "t-soft": 1   }, // all three live within a year
    older:  { "t-platforms": .15, "t-grief": 0,   "t-soft": .6  }, // soft started 8 months ago, others recent
  };

  // Concentric nested boxes — visible when a period is selected. Outer box is
  // "older", innermost is "week". Coordinates are canvas-relative; centered
  // around the cluster layout below.
  const NESTING = {
    older: { x: 280,  y: 150,  w: 1820, h: 1380, label: "Before this year" },
    year:  { x: 460,  y: 290,  w: 1460, h: 1100, label: "This year" },
    month: { x: 660,  y: 440,  w: 1060, h: 800,  label: "This month" },
    week:  { x: 880,  y: 580,  w: 620,  h: 480,  label: "This week" },
  };

  // Cluster layouts per period — in "all" the threads spread; with a period
  // selected, the active threads pull into that box, dim ones drift out.
  const canvasW = 2400, canvasH = 1700;
  const LAYOUTS = {
    all: {
      "t-platforms": { x: 700,  y: 600  },
      "t-grief":     { x: 1240, y: 380  },
      "t-soft":      { x: 900,  y: 1080 },
    },
    week: { // tight cluster inside week box
      "t-platforms": { x: 940,  y: 720  },
      "t-grief":     { x: 1340, y: 250  }, // outside, dim
      "t-soft":      { x: 480,  y: 1280 }, // far outside, dim
    },
    month: { // platforms + grief sit inside month
      "t-platforms": { x: 760,  y: 720  },
      "t-grief":     { x: 1300, y: 540  },
      "t-soft":      { x: 1700, y: 1320 }, // outside month, dim
    },
    year: {
      "t-platforms": { x: 700,  y: 700  },
      "t-grief":     { x: 1300, y: 480  },
      "t-soft":      { x: 900,  y: 1180 },
    },
    older: { // soft drifts in (its origin is 8mo ago); others fade
      "t-platforms": { x: 1700, y: 250  },
      "t-grief":     { x: 200,  y: 250  },
      "t-soft":      { x: 1100, y: 800  },
    },
  };
  const layout = LAYOUTS[viewPeriod] || LAYOUTS.all;
  const activity = ACTIVITY[viewPeriod] || ACTIVITY.all;
  const isNested = viewPeriod !== "all";

  const TIME_PILLS = [
    { id: "all",   l: "All" },
    { id: "older", l: "Before this year" },
    { id: "year",  l: "This year" },
    { id: "month", l: "This month" },
    { id: "week",  l: "This week" },
  ];

  // Convert an age string like "5 months ago" / "yesterday" / "3wk" / "10d" to days.
  const parseAge = (s) => {
    if (!s) return 365;
    s = s.toLowerCase();
    if (s.includes("yesterday")) return 1;
    if (s.includes("just now") || s === "today") return 0;
    const m = s.match(/(\d+)\s*(d|w|wk|mo|m|y)/);
    if (!m) {
      const m2 = s.match(/(\d+)\s*(day|week|month|year)/);
      if (!m2) return 365;
      const n = +m2[1], u = m2[2];
      return u === "day" ? n : u === "week" ? n*7 : u === "month" ? n*30 : n*365;
    }
    const n = +m[1], u = m[2];
    return u === "d" ? n : (u === "w" || u === "wk") ? n*7 : (u === "mo" || u === "m") ? n*30 : n*365;
  };

  // Period bucket for an age (in days)
  const periodOf = (days) => {
    if (days <= 7)   return "week";
    if (days <= 30)  return "month";
    if (days <= 365) return "year";
    return "older";
  };

  // Collect every artifact across threads tagged with its period bucket.
  // Each artifact gets a deterministic position inside its period box.
  const artifacts = React.useMemo(() => {
    const out = [];
    threads.forEach((t, ti) => {
      (t.fl || []).forEach((f, i) => {
        out.push({ kind: "find", icon: f.i, label: f.t, source: f.s, threadId: t.id,
                   dc: t.dc, days: parseAge(f.d), seed: ti * 100 + i });
      });
      (t.notesList || []).forEach((n, i) => {
        out.push({ kind: "note", icon: n.type === "audio" ? "🎙" : n.type === "image" ? "📸" : "✎",
                   label: n.cap, threadId: t.id, dc: t.dc, days: parseAge(n.d), seed: ti * 200 + i + 50 });
      });
      (t.mileMarkers || []).forEach((mm, i) => {
        out.push({ kind: "reframe", icon: "↳", label: mm.q, threadId: t.id,
                   dc: t.dc, days: parseAge(mm.age), seed: ti * 300 + i + 80 });
      });
    });
    return out.map(a => ({ ...a, period: periodOf(a.days) }));
  }, [threads]);

  // Period-bucket boundary in days — what defines "older than this period"
  const PERIOD_DAYS = { week: 7, month: 30, year: 365, older: 365 * 5 };

  // Scatter artifacts CONCENTRICALLY around the active period box's center.
  // Recent items sit near center; older items push to the edges.
  // Returns { x, y, ageRatio } where ageRatio is 0 (now) → 1 (period boundary).
  const scatterArtifact = (a, box, period, idx) => {
    // Pseudo-random angle, deterministic per seed
    let s = (a.seed + 1) * 9301 + 49297;
    const r1 = ((s * 1103515245 + 12345) >>> 0) / 0xFFFFFFFF;
    s = (s * 1103515245 + 12345) >>> 0;
    const r2 = (s / 0xFFFFFFFF);

    // ageRatio: 0 = now (center), 1 = period edge
    const maxDays = PERIOD_DAYS[period] || 365;
    // Use sqrt for friendlier distribution (lots of room near edge)
    const ageRatio = Math.min(1, Math.sqrt(a.days / maxDays));

    // Box center & radii. Reserve a center reservation so we don't overlap thread cards.
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const innerReserve = 0.18; // skip the very center (where threads cluster)
    const outerPad = 0.04;     // small inset from box edge
    const t = innerReserve + ageRatio * (1 - innerReserve - outerPad);

    // Angular jitter — spread evenly + a little randomness
    // Deterministic angle from r1, with small wobble from r2
    const angle = r1 * Math.PI * 2;
    const wobble = (r2 - 0.5) * 0.3; // ±0.15 rad
    const theta = angle + wobble;

    // Box has aspect; convert unit-circle to box-fitted ellipse
    const radX = (box.w / 2) * t;
    const radY = (box.h / 2) * t;
    const x = cx + Math.cos(theta) * radX;
    const y = cy + Math.sin(theta) * radY;

    return { x, y, ageRatio };
  };

  const apertures = whoseView === "child"
    ? [
        { position: "bottom", label: "Pod",
          hint: "↓ §07 · 12 things waiting · open until 6:00pm",
          onActivate: () => navigate("pod") },
      ]
    : whoseView === "parent"
    ? [
        { position: "bottom", label: "Iris's pod (admin)",
          hint: "↓ §08 · curate · 1 pending",
          onActivate: () => navigate("pod-admin") },
      ]
    : [
        { position: "top", label: "Begin a new question",
          hint: "top door · §03 · opens a fresh thread",
          onActivate: () => navigate("search") },
      ];
  // Home no longer has a courtyard aperture — courtyards are thread-scoped now,
  // reachable only from inside a thread.

  const breadcrumb = (
    <Breadcrumb
      here="home"
      navigate={navigate}
      viewMode={whoseView}
      trail={[{ label: "Home" }]}
    />
  );

  if (firstUse) {
    // Opener flow not ported in Phase 1.
    return <div style={{ padding: 40, fontFamily: FH }}>Opener (placeholder)</div>;
  }

  // Identity card — fixed overlay. Sits TOP-RIGHT, above the right-edge Search
  // aperture (which is vertically centered, so this corner is clear). Fades out
  // when the user zooms in past 1.0 — at that closeness the chrome competes
  // with the cluster they're inspecting.
  const fade = zoom > 1.0 ? Math.max(0, 1 - (zoom - 1.0) * 4) : 1;
  const personaLabel = whoseView === "parent"
    ? "Parent — managing Iris's phone"
    : whoseView === "child"
    ? "Iris (child) — Maya's phone"
    : "Maya R.";
  const personaSection = whoseView === "parent"
    ? "§01 Parent · co-parent admin"
    : whoseView === "child"
    ? "§01 Home · two threads held"
    : "§01 Home · three threads held";
  const identityCard = (
    <div data-ui style={{
      position: "fixed", top: 24, right: 28, zIndex: 20,
      maxWidth: 260, textAlign: "right",
      opacity: fade, transition: "opacity .2s",
      pointerEvents: fade > 0 ? "auto" : "none",
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase",
        color: "#9A968F", marginBottom: 4,
      }}>Mosaic · Hawley, PA</div>
      <h1 style={{
        fontFamily: SH, fontSize: 26, fontStyle: "italic", fontWeight: 300,
        margin: 0, lineHeight: 1, color: "#1A1714", letterSpacing: "-.01em",
      }}>{personaLabel}</h1>
      <p style={{
        fontSize: 11.5, color: "#5E5A55", fontWeight: 300, margin: "6px 0 0",
        lineHeight: 1.4,
      }}>
        {personaSection}
      </p>
      <div style={{
        marginTop: 14, display: "flex", flexDirection: "column",
        alignItems: "flex-end", gap: 5,
      }}>
        <button onClick={() => setSchedulerOpen(true)} style={{
          background: "transparent", border: "1px solid rgba(26,92,70,.25)",
          color: "#1A5C46", fontFamily: FH, fontSize: 10.5, fontWeight: 500,
          padding: "5px 10px", borderRadius: 12, cursor: "pointer",
          letterSpacing: ".02em",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,92,70,.07)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >◷ Scheduler</button>
        {whoseView === "child" && (
          <button onClick={() => navigate("pod")} style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(140,90,140,.08)",
            border: "1px solid rgba(140,90,140,.35)",
            color: "#5E2E5E", fontFamily: FH, fontSize: 10.5, fontWeight: 500,
            padding: "5px 10px 5px 9px", borderRadius: 12, cursor: "pointer",
            letterSpacing: ".02em",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(140,90,140,.14)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(140,90,140,.08)"; }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#7C3F7C",
              boxShadow: "0 0 0 2.5px rgba(140,90,140,.2)",
            }} />
            Pod open · 18 min left
          </button>
        )}
      </div>
    </div>
  );

  const periodPills = (
    <div data-ui style={{
      position: "fixed", top: 24, left: 24, zIndex: 20,
      display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start",
      opacity: fade, transition: "opacity .2s",
    }}>
      <span style={{
        fontSize: 8.5, fontWeight: 600, letterSpacing: ".08em",
        textTransform: "uppercase", color: "#B0ADA6", fontFamily: FH,
      }}>View period</span>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {TIME_PILLS.map(m => (
          <button key={m.id} onClick={() => setViewPeriod(m.id)} style={{
            fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 9,
            cursor: "pointer", fontFamily: FH,
            border: `1px solid ${viewPeriod === m.id ? "#1A5C46" : "rgba(26,23,20,.08)"}`,
            background: viewPeriod === m.id ? "#E3EEE9" : "rgba(246,243,236,.7)",
            color: viewPeriod === m.id ? "#1A5C46" : "#7A756F",
            transition: "all .15s",
          }}>{m.l}</button>
        ))}
      </div>
      <span style={{
        fontSize: 8.5, fontWeight: 600, letterSpacing: ".08em",
        textTransform: "uppercase", color: "#B0ADA6", fontFamily: FH, marginTop: 8,
      }}>View mode</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[
          { id: "spatial",  l: "Spatial" },
          { id: "timeline", l: "Timeline" },
        ].map(m => (
          <button key={m.id} onClick={() => setViewMode(m.id)} style={{
            fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 9,
            cursor: "pointer", fontFamily: FH,
            border: `1px solid ${viewMode === m.id ? "#1A5C46" : "rgba(26,23,20,.08)"}`,
            background: viewMode === m.id ? "#E3EEE9" : "rgba(246,243,236,.7)",
            color: viewMode === m.id ? "#1A5C46" : "#7A756F",
            transition: "all .15s",
          }}>{m.l}</button>
        ))}
        <button
          onClick={() => {
            if (viewMode !== 'spatial') setViewMode('spatial');
            if (designMode === 'off') enterMode('rearrange');
          }}
          title="Rearrange clusters, pick shapes, borders, ether"
          style={{
            fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 9,
            cursor: "pointer", fontFamily: FH,
            border: `1px solid ${designMode !== 'off' ? "#1A5C46" : "rgba(26,92,70,.4)"}`,
            background: designMode !== 'off' ? "#E3EEE9" : "rgba(246,243,236,.7)",
            color: "#1A5C46",
            transition: "all .15s",
          }}>✦ Design</button>
      </div>
    </div>
  );

  // Courtyards summary — bottom-right, above the zoom control. Only threads
  // that actually have a courtyard (the seeded ones; user-created threads
  // carry courtyardName: null until shared). "new" counts come from
  // COURTYARD.incoming keyed by threadId.
  const courtyardThreads = threads.filter(t => t.courtyardName);
  const incoming = WM.COURTYARD?.incoming || [];
  const newFor = (tid) => incoming.filter(r => r.threadId === tid).length;
  const totalNew = courtyardThreads.reduce((n, t) => n + newFor(t.id), 0);

  const courtyardsPanel = courtyardThreads.length > 0 && (
    <div data-ui style={{
      position: "fixed", right: 58, bottom: 18, zIndex: 20,
      width: 268, background: "rgba(248,244,233,.96)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(26,23,20,.1)", borderRadius: 8,
      boxShadow: "0 4px 20px rgba(40,30,15,.08)",
      padding: "12px 14px 10px",
      opacity: fade, transition: "opacity .2s",
      fontFamily: FH,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase",
          color: "#5E5A55", fontWeight: 600,
        }}>♥ Your courtyards</span>
        {totalNew > 0 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase",
            color: "#75580D", fontWeight: 600,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: "#C58A1A",
            }} />
            {totalNew} new
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {courtyardThreads.map(t => {
          const pal = WM.DOMAIN[t.dc] || WM.DOMAIN.teal;
          const nNew = newFor(t.id);
          const nKindred = (t.kindred || []).length;
          return (
            <div key={t.id}
              onClick={() => navigate("courtyard", { id: t.id })}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", padding: "4px 4px", borderRadius: 5,
                transition: "background .12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(26,23,20,.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              {/* mini orbit dots */}
              <div style={{
                display: "flex", alignItems: "center", gap: 2, flexShrink: 0,
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: i === 1 ? 7 : 4, height: i === 1 ? 7 : 4,
                    borderRadius: "50%",
                    background: i === 1 ? pal.accent : pal.accent + "44",
                  }} />
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: SH, fontStyle: "italic", fontSize: 14,
                  fontWeight: 400, color: "#1A1714", lineHeight: 1.2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{t.courtyardName}</div>
                <div style={{
                  fontSize: 9.5, color: "#9A968F", marginTop: 2,
                }}>
                  {nKindred} kindred
                  {nNew > 0 && (
                    <span style={{ color: pal.accent, fontWeight: 600 }}> · {nNew} new</span>
                  )}
                </div>
              </div>
              <span style={{
                fontSize: 13, color: pal.accent, flexShrink: 0,
              }}>→</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ============ TIMELINE VIEW ============
  // Horizontal time axis. Three thread lanes stacked vertically. Recent right, older left.
  // Reuses `artifacts` (finds, notes, reframes) — placed by date along the axis.
  if (viewMode === "timeline") {
    const PIXELS_PER_DAY = 8;          // density along axis
    const MAX_DAYS = 270;              // ~9 months back; clip older
    const LANE_H = 150;
    const LANE_GAP = 18;
    const TIME_NOW_X = 80;             // right side (now)
    const totalW = TIME_NOW_X + MAX_DAYS * PIXELS_PER_DAY + 60;

    // Date markers
    const ticks = [
      { d: 0,    l: "Now" },
      { d: 7,    l: "1 wk" },
      { d: 30,   l: "1 mo" },
      { d: 90,   l: "3 mo" },
      { d: 180,  l: "6 mo" },
      { d: 270,  l: "9 mo" },
    ];

    // Build per-thread artifact lanes
    const threadArtifacts = (threadId) =>
      artifacts.filter(a => a.threadId === threadId && a.days <= MAX_DAYS)
               .sort((a, b) => a.days - b.days);

    return (
      <div style={{
        position: "fixed", inset: 0, background: "#F2EFE6",
        fontFamily: FH, color: "#1A1714", overflow: "auto",
      }}>
        {identityCard}
        {periodPills}
        {courtyardsPanel}
        {breadcrumb}

        {/* Timeline canvas — horizontal scroll if needed */}
        <div style={{
          paddingTop: 200, paddingLeft: 40, paddingRight: 40, paddingBottom: 80,
          minWidth: totalW + 80,
        }}>
          {/* Time axis at top */}
          <div style={{
            position: "relative", height: 50, marginBottom: 12,
            borderBottom: "1px solid rgba(26,23,20,.15)",
          }}>
            {ticks.map((t, i) => {
              // Right-anchored: now is on the right, older to the left
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
                    fontSize: 10, color: "#7A756F", fontFamily: FH,
                    letterSpacing: ".05em", whiteSpace: "nowrap",
                  }}>{t.l}</div>
                </React.Fragment>
              );
            })}
            {/* Now indicator */}
            <div style={{
              position: "absolute", left: totalW - TIME_NOW_X, top: -10, bottom: -8,
              width: 2, background: "#1A5C46", opacity: .8,
            }} />
            <div style={{
              position: "absolute", left: totalW - TIME_NOW_X + 6, top: -22,
              fontSize: 9, fontWeight: 600, color: "#1A5C46",
              fontFamily: FH, letterSpacing: ".1em", textTransform: "uppercase",
            }}>now</div>
          </div>

          {/* Thread lanes */}
          {threads.map((t, ti) => {
            const arts = threadArtifacts(t.id);
            const pal = WM.DOMAIN[t.dc];
            const a = activity[t.id] ?? 1;
            const dimLane = isNested && a < 0.7;

            return (
              <div key={t.id} style={{
                position: "relative",
                height: LANE_H, marginBottom: LANE_GAP,
                background: dimLane ? "rgba(246,243,236,.4)" : "rgba(251,248,238,.7)",
                border: `1px solid ${pal.accent}22`,
                borderRadius: 6,
                opacity: dimLane ? 0.45 : 1,
                filter: dimLane ? "saturate(.5)" : "none",
                transition: "opacity .3s, filter .3s",
              }}>
                {/* Thread header */}
                <div style={{
                  position: "absolute", left: 14, top: 12, maxWidth: 240, zIndex: 5,
                  background: "rgba(251,248,238,.95)",
                  padding: "8px 12px", borderRadius: 4,
                  borderLeft: `3px solid ${pal.accent}`,
                  cursor: "pointer",
                }} onClick={() => openThread(t.id)}>
                  <div style={{
                    fontSize: 9, fontFamily: FH, color: pal.accent,
                    letterSpacing: ".08em", textTransform: "uppercase",
                    fontWeight: 600, marginBottom: 3,
                  }}>{t.domain}</div>
                  <div style={{
                    fontFamily: SH, fontSize: 13, fontStyle: "italic",
                    fontWeight: 400, color: "#1A1714",
                    lineHeight: 1.25, textWrap: "pretty",
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>{t.q}</div>
                </div>

                {/* The lane line */}
                <div style={{
                  position: "absolute", left: 270, right: 14,
                  top: LANE_H / 2, height: 1,
                  background: `${pal.accent}33`,
                }} />

                {/* Artifacts on the lane */}
                {arts.map((art, i) => {
                  const x = totalW - TIME_NOW_X - art.days * PIXELS_PER_DAY;
                  if (x < 280) return null;
                  // Stagger top/bottom so labels don't collide
                  const above = i % 2 === 0;
                  const isReframe = art.kind === "reframe";
                  return (
                    <div key={`${art.kind}-${i}`} style={{
                      position: "absolute",
                      left: x, top: LANE_H / 2,
                      transform: `translate(-50%,-50%)`,
                    }}>
                      {/* Dot */}
                      <div style={{
                        width: isReframe ? 10 : 7, height: isReframe ? 10 : 7,
                        borderRadius: "50%",
                        background: isReframe ? pal.accent : "#FBF8EE",
                        border: `${isReframe ? 2 : 1.5}px solid ${pal.accent}`,
                        boxShadow: "0 1px 3px rgba(26,23,20,.1)",
                      }} />
                      {/* Label */}
                      <div style={{
                        position: "absolute",
                        left: "50%", [above ? "bottom" : "top"]: "calc(100% + 6px)",
                        transform: "translateX(-50%)",
                        background: isReframe ? `${pal.accent}18` : "rgba(251,248,238,.95)",
                        border: `1px solid ${pal.accent}33`,
                        borderRadius: 3, padding: "2px 6px",
                        fontSize: 9.5, fontFamily: FH, color: "#3A3530",
                        whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden",
                        textOverflow: "ellipsis", display: "flex",
                        alignItems: "center", gap: 3,
                        boxShadow: "0 1px 3px rgba(26,23,20,.05)",
                        fontStyle: isReframe ? "italic" : "normal",
                      }}>
                        <span style={{ fontSize: 8, opacity: .7 }}>{art.icon}</span>
                        <span>{art.label}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Last-activity tag at right edge */}
                <div style={{
                  position: "absolute", right: 14, top: LANE_H / 2,
                  transform: "translateY(-50%)",
                  fontSize: 10, fontFamily: FH, color: "#9A968F",
                  fontStyle: "italic",
                }}>last: {t.last}</div>
              </div>
            );
          })}

          {/* Footer note */}
          <div style={{
            marginTop: 24, fontSize: 11, fontFamily: FH, color: "#9A968F",
            fontStyle: "italic", textAlign: "center", maxWidth: 600,
            margin: "24px auto 0",
          }}>
            One lane per thread. Filled circles = your reframings (mile-markers).
            Hollow circles = finds and notes you collected. Click a thread question to enter.
          </div>
        </div>
      </div>
    );
  }

  // ============ SPATIAL VIEW ============
  const hasEther = !!homeEtherEdit;
  // The Design entry now lives inside periodPills (next to Spatial /
  // Timeline). The panel itself docks under it at the top-left when
  // designMode !== 'off'.
  const designPanel = designMode === 'off' ? null : (
    <div data-ui style={{ position: "fixed", top: 110, left: 24, zIndex: 22 }}>
      <DesignPanel
        mode={designMode}
        onSwitch={(next) => enterMode(next)}
        palette={homePalette}
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
        selectedCardKey={selectedClusterId}
        currentShapeForSelected={selectedClusterId ? (homeShapesEdit[selectedClusterId] || 'rect') : null}
        currentBorderForSelected={selectedClusterId ? (homeBordersEdit[selectedClusterId] || null) : null}
        onPickShape={(s) => selectedClusterId && setClusterShape(selectedClusterId, s)}
        onPickBorderColor={setClusterBorderColor}
        onPickBorderThickness={setClusterBorderThickness}
        currentEther={homeEtherEdit}
        onPickEther={(e) => setHomeEtherEdit(e)}
        onUploadEther={(e) => setHomeEtherEdit(e)} />
    </div>
  );
  return (
    <>
    <EtherLayer ether={homeEtherEdit} accent={homePalette.accent} />
    <PZCH
      canvasW={canvasW} canvasH={canvasH}
      background={hasEther ? "transparent" : "#F2EFE6"}
      showGround={!hasEther}
      panHint="drag · wheel zoom · click a thread to enter"
      onPanZoom={({ zoom: z }) => { setZoom(z); setCanvasZoom(z); }}
      overlay={
        <>
          {identityCard}
          {periodPills}
          {courtyardsPanel}
          {apertures.map((a, i) => <ApertureH key={i} {...a} />)}
          {breadcrumb}
          {designPanel}
        </>
      }>
      {({ zoom: zz }) => (
        <>
          {/* Nested period boxes — visible when a period is selected. */}
          {isNested && (
            <svg style={{
              position: "absolute", left: 0, top: 0, width: canvasW, height: canvasH,
              pointerEvents: "none", transition: "opacity .4s",
            }}>
              {Object.entries(NESTING).map(([key, n]) => {
                const isActive = key === viewPeriod;
                // "inside" = boxes at-or-larger-than the active period. Outer to inner: older>year>month>week.
                const order = ["older", "year", "month", "week"];
                const isInside = order.indexOf(key) <= order.indexOf(viewPeriod);
                return (
                  <g key={key}>
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={16}
                      fill="none"
                      stroke={isActive ? "#1A5C46" : "rgba(26,23,20,.12)"}
                      strokeWidth={isActive ? 2 : 1}
                      strokeDasharray={isActive ? "none" : "8 6"}
                      opacity={isInside ? 1 : 0.25} />
                    <text x={n.x + 16} y={n.y + 22}
                      style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: ".1em",
                        textTransform: "uppercase", fontFamily: FH,
                        fill: isActive ? "#1A5C46" : "#B0ADA6",
                      }}>{n.label}</text>
                  </g>
                );
              })}
            </svg>
          )}
          {/* Scattered artifacts inside the active period box */}
          {isNested && (() => {
            const box = NESTING[viewPeriod];
            if (!box) return null;
            const inPeriod = artifacts.filter(a => {
              // Show artifacts that fall within the active period bucket OR more recent
              const order = ["week", "month", "year", "older"];
              return order.indexOf(a.period) <= order.indexOf(viewPeriod);
            });
            return inPeriod.map((a, i) => {
              const pos = scatterArtifact(a, box, viewPeriod, i);
              const pal = WM.DOMAIN[a.dc];
              // Visual prominence: recent = full opacity & size; older = faded & smaller
              const prom = 1 - pos.ageRatio * 0.7;       // 1 → 0.3
              const fontSize = 9 + (1 - pos.ageRatio) * 3.5; // 12.5 → 9
              const maxW = 130 + (1 - pos.ageRatio) * 90;    // 220 → 130
              return (
                <div key={`art-${a.seed}-${i}`} title={`${a.kind} · ${a.label}`}
                  style={{
                    position: "absolute", left: pos.x, top: pos.y,
                    transform: "translate(-50%,-50%)",
                    pointerEvents: "auto", cursor: "default",
                    opacity: prom,
                    animation: `wmArtIn .35s ease ${i * 0.02}s both`,
                    zIndex: Math.round((1 - pos.ageRatio) * 10),
                  }}>
                  <div style={{
                    background: a.kind === "reframe" ? pal.accent + "22" : "rgba(251,248,238,.95)",
                    border: `1px solid ${pal.accent}${pos.ageRatio < 0.4 ? "55" : "33"}`,
                    borderRadius: 4, padding: pos.ageRatio < 0.4 ? "4px 9px" : "3px 7px",
                    fontSize, fontFamily: FH, color: "#3A3530",
                    display: "flex", alignItems: "center", gap: 4,
                    maxWidth: maxW,
                    boxShadow: pos.ageRatio < 0.4
                      ? "0 2px 8px rgba(26,23,20,.08)"
                      : "0 1px 3px rgba(26,23,20,.04)",
                  }}>
                    <span style={{ fontSize: fontSize - 0.5, opacity: .7, flexShrink: 0 }}>{a.icon}</span>
                    <span style={{
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontStyle: a.kind === "reframe" ? "italic" : "normal",
                      fontWeight: pos.ageRatio < 0.3 ? 500 : 400,
                    }}>{a.label}</span>
                  </div>
                </div>
              );
            });
          })()}
          <style>{`@keyframes wmArtIn{from{opacity:0;transform:translate(-50%,-50%) scale(.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>

          {threads.map((t, ti) => {
            const a = activity[t.id] ?? 1;
            // In the default view, lay threads out in an orbit around the
            // (now-empty) canvas center; each cluster anchors at its own
            // visual center so all sit exactly the same distance from center.
            // In period drill-downs keep the hand-tuned top-left layout.
            let pos, centerAnchor = false;
            if (!isNested) {
              const cx = canvasW / 2, cy = canvasH / 2;
              const N = Math.max(threads.length, 1);
              // Start at top (12 o'clock) and walk clockwise.
              const theta = -Math.PI / 2 + (ti / N) * Math.PI * 2;
              const r = 520;
              pos = { x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r };
              centerAnchor = true;
            } else {
              const seedPos = layout[t.id];
              pos = seedPos || (() => {
                const userIdx = threads.filter(x => !layout[x.id])
                                       .findIndex(x => x.id === t.id);
                const col = userIdx % 3;
                const row = Math.floor(userIdx / 3);
                return { x: 360 + col * 460, y: 1320 + row * 360 };
              })();
            }
            // Apply Home-design overrides on top of the algorithmic layout.
            const ovPos = homeLayoutEdit[t.id];
            if (ovPos) { pos = ovPos; centerAnchor = false; }
            const designOpacity = designMode !== 'off';
            return (
              <div key={t.id} style={{
                opacity: designOpacity ? 1 : (a < 0.3 ? 0.28 : a < 0.7 ? 0.6 : 1),
                filter: designOpacity ? 'none' : (a < 0.3 ? "saturate(.4)" : a < 0.7 ? "saturate(.75)" : "none"),
                transition: "opacity .4s, filter .4s",
              }}>
                <ThreadCluster thread={t} pos={pos} centerAnchor={centerAnchor}
                  editMode={designMode}
                  zoom={canvasZoom}
                  shapeId={homeShapesEdit[t.id] || 'rect'}
                  borderOverride={homeBordersEdit[t.id] || null}
                  selected={(designMode === 'shape' || designMode === 'border') && selectedClusterId === t.id}
                  onMove={setClusterPos}
                  onSelect={setSelectedClusterId}
                  onOpen={th => openThread(th.id)}
                  onDelete={handleDelete} />
              </div>
            );
          })}
        </>
      )}
    </PZCH>
    </>
  );
}

export { HomeRoom };
export default HomeRoom;
