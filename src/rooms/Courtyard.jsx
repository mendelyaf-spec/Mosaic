// COURTYARD ROOM (§04) — daisy layout.
//
// Thread the user is carrying sits as one bordered "room" facing a central
// courtyard plate. Kindred threads (others holding adjacent questions) sit
// around the same courtyard, each in their own bordered room with an
// opening facing the center. Multi-engaged items — finds, notes, events
// touched by more than one of us — live IN the courtyard.
//
// Activity (events, requests, incoming, outgoing) lives in a bottom dock.

import React, { useState as useStateC, useMemo as useMemoC, useRef, useEffect } from 'react';
import {
  Room as RoomC,
  PanZoomCanvas as PZC,
  Aperture as ApC,
  Breadcrumb,
  FONT_SERIF as SC,
  FONT_SANS as FC,
  FONT_MONO as MC,
} from '../shell/shell.jsx';
import { WM } from '../data/wm-data.js';

// ─── Bordered thread (frame around one orbit) ─────────────────────────
function BorderedThread({ thread, owner, cx, cy, w = 260, h = 230, openSide = "right", accent, onClick, isMine }) {
  const pal = WM.DOMAIN[thread.dc];
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const r = 14;
  const opening = 110;

  // Build path segments for the frame border with a gap on openSide
  const segs = [];
  const add = (x1, y1, x2, y2) =>
    segs.push(<line key={segs.length} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={pal.accent} strokeWidth={1.5} strokeOpacity={0.5} />);
  const W = w, H = h;
  if (openSide !== "top")    add(r, 0, W - r, 0);
  else { add(r, 0, W / 2 - opening / 2, 0); add(W / 2 + opening / 2, 0, W - r, 0); }
  if (openSide !== "right")  add(W, r, W, H - r);
  else { add(W, r, W, H / 2 - opening / 2); add(W, H / 2 + opening / 2, W, H - r); }
  if (openSide !== "bottom") add(r, H, W - r, H);
  else { add(r, H, W / 2 - opening / 2, H); add(W / 2 + opening / 2, H, W - r, H); }
  if (openSide !== "left")   add(0, r, 0, H - r);
  else { add(0, r, 0, H / 2 - opening / 2); add(0, H / 2 + opening / 2, 0, H - r); }

  return (
    <>
      {/* paper plate — clickable */}
      <div data-card onClick={onClick} style={{
        position: "absolute", left: x0, top: y0, width: w, height: h,
        borderRadius: r,
        background: `radial-gradient(circle at center, ${pal.bg}cc 0%, ${pal.bg}55 70%)`,
        boxShadow: `inset 0 0 0 1px ${pal.accent}22, 0 8px 24px rgba(40,30,15,.05)`,
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, transform .15s",
      }}
      onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.boxShadow = `inset 0 0 0 1.5px ${pal.accent}66, 0 14px 32px rgba(40,30,15,.10)`; }}}
      onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${pal.accent}22, 0 8px 24px rgba(40,30,15,.05)`; }}} />
      {/* frame with opening */}
      <svg style={{
        position: "absolute", left: x0, top: y0, width: w, height: h,
        pointerEvents: "none", overflow: "visible",
      }}>{segs}</svg>

      {/* owner tag at top edge */}
      <div style={{
        position: "absolute", left: cx, top: y0 - 2,
        transform: "translate(-50%,-50%)",
        background: pal.accent, color: "#FAF5E9",
        padding: "3px 10px", borderRadius: 99,
        fontFamily: MC, fontSize: 9, letterSpacing: ".14em",
        textTransform: "uppercase", fontWeight: 600,
        whiteSpace: "nowrap", zIndex: 2, pointerEvents: "none",
      }}>{owner}{isMine ? " \u2022 you" : ""}</div>

      {/* question at center */}
      <div style={{
        position: "absolute", left: cx, top: cy,
        transform: "translate(-50%,-50%)",
        width: w - 32, textAlign: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          fontFamily: SC, fontStyle: "italic", fontWeight: 300,
          fontSize: 13.5, lineHeight: 1.22, color: "#1A1714",
          textWrap: "balance",
        }}>"{thread.q}"</div>
        <div style={{
          marginTop: 7, fontFamily: FC, fontSize: 9.5, color: "#5E5A55",
          display: "flex", justifyContent: "center", gap: 8,
        }}>
          <span>{thread.finds} finds</span>
          <span style={{ opacity: .4 }}>·</span>
          <span>{thread.notes} notes</span>
        </div>
        {/* tiny orbit dots — markers */}
        {thread.mileMarkers && thread.mileMarkers.length > 1 && (
          <div style={{
            marginTop: 8, display: "flex", justifyContent: "center",
            alignItems: "center", gap: 3,
          }}>
            {thread.mileMarkers.map((mm, i) => (
              <React.Fragment key={i}>
                <div style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: i === thread.mileMarkers.length - 1 ? pal.accent : pal.accent + "55",
                }} />
                {i < thread.mileMarkers.length - 1 && (
                  <div style={{ width: 10, height: 1, background: pal.accent + "33" }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Shared item card (multi-engaged) ────────────────────────────────
function SharedItem({ x, y, kind, title, byList, accent, onClick }) {
  const initials = byList.map(b => (b.match(/[A-Z]/g) || b.slice(0, 1).toUpperCase())[0]);
  return (
    <div data-card onClick={onClick} style={{
      position: "absolute", left: x, top: y,
      transform: "translate(-50%,-50%)",
      width: 196,
      background: "#FFFFFF",
      border: `1.5px solid ${accent}`,
      borderRadius: 5,
      padding: "9px 11px",
      boxShadow: `0 8px 22px ${accent}26, 0 2px 6px rgba(26,23,20,.06)`,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{
        fontFamily: MC, fontSize: 8.5, letterSpacing: ".14em",
        textTransform: "uppercase", color: accent,
        marginBottom: 5, display: "flex", justifyContent: "space-between",
      }}>
        <span>{kind} · shared</span>
        <span>{byList.length}×</span>
      </div>
      <div style={{
        fontFamily: SC, fontStyle: "italic", fontSize: 13, fontWeight: 300,
        lineHeight: 1.25, color: "#1A1714", marginBottom: 7,
        textWrap: "pretty",
      }}>"{title}"</div>
      <div style={{
        display: "flex", alignItems: "center",
      }}>
        {initials.map((ini, i) => (
          <div key={i} style={{
            width: 17, height: 17, borderRadius: "50%",
            background: accent, color: "#FAF5E9",
            fontSize: 8.5, fontWeight: 600,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid #FFFFFF", marginLeft: i === 0 ? 0 : -6,
            fontFamily: FC,
          }}>{ini}</div>
        ))}
        <span style={{
          marginLeft: 8, fontFamily: FC, fontSize: 9.5, color: "#5E5A55",
        }}>{byList.join(", ")}</span>
      </div>
    </div>
  );
}

// ─── Activity dock — bottom panel (collapsible) ──────────────────────
function ActivityDock({ thread, navigate }) {
  const data = WM.COURTYARD;
  const incoming = data.incoming.filter(r => r.threadId === thread.id);
  const outgoing = data.outgoing.filter(r => r.threadId === thread.id);
  const requests = data.requests.filter(r => !r.threadId || r.threadId === thread.id);
  const [open, setOpen] = useStateC(false);
  const [tab, setTab] = useStateC("incoming");
  const palette = WM.DOMAIN[thread.dc];

  if (!open) return (
    <div onClick={() => setOpen(true)} style={{
      position: "fixed", left: 24, right: 24, bottom: 64, height: 38,
      background: "rgba(250,245,233,.97)", border: "1px solid rgba(26,23,20,.10)",
      borderRadius: 4, padding: "0 18px",
      display: "flex", alignItems: "center", gap: 16,
      fontFamily: MC, fontSize: 9.5, letterSpacing: ".14em",
      textTransform: "uppercase", color: "#1A1714", cursor: "pointer",
      boxShadow: "0 -6px 18px -10px rgba(40,30,15,.18)",
      zIndex: 30,
    }}>
      <span style={{ fontWeight: 500 }}>activity</span>
      {requests.length > 0 && <span style={{ color: "#B07024" }}>● {requests.length} request{requests.length>1?"s":""}</span>}
      <span style={{ color: palette.accent }}>{incoming.length} in</span>
      <span style={{ color: "#9A968F" }}>{outgoing.length} out</span>
      <span style={{ marginLeft: "auto", color: "#9A968F" }}>open ↑</span>
    </div>
  );

  const tabs = [
    { id: "requests", l: "requests", n: requests.length, c: "#B07024" },
    { id: "incoming", l: "incoming", n: incoming.length, c: palette.accent },
    { id: "outgoing", l: "outgoing", n: outgoing.length, c: "#9A968F" },
  ];
  const rows = tab === "incoming" ? incoming : tab === "outgoing" ? outgoing : requests;

  return (
    <div style={{
      position: "fixed", left: 24, right: 24, bottom: 64,
      background: "rgba(250,245,233,.98)", border: "1px solid rgba(26,23,20,.12)",
      borderRadius: 4, boxShadow: "0 -12px 40px -12px rgba(40,30,15,.22)",
      maxHeight: 280, overflow: "hidden", display: "flex", flexDirection: "column",
      zIndex: 30,
    }}>
      <div style={{
        display: "flex", borderBottom: "1px solid rgba(26,23,20,.08)",
        fontFamily: MC, fontSize: 9.5, letterSpacing: ".14em",
        textTransform: "uppercase",
      }}>
        {tabs.map((t, i) => (
          <div key={i} onClick={() => setTab(t.id)} style={{
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 7,
            borderBottom: tab === t.id ? `2px solid ${t.c}` : "2px solid transparent",
            color: tab === t.id ? "#1A1714" : "#9A968F",
            background: tab === t.id ? "rgba(255,255,255,.6)" : "transparent",
            cursor: "pointer",
          }}>
            <span>{t.l}</span>
            <span style={{
              background: t.c, color: "#FFFFFF", borderRadius: 99,
              padding: "1px 7px", fontSize: 9, fontWeight: 500,
              opacity: tab === t.id ? 1 : 0.6,
            }}>{t.n}</span>
          </div>
        ))}
        <div onClick={() => setOpen(false)} style={{
          marginLeft: "auto", padding: "10px 16px", color: "#9A968F", cursor: "pointer",
        }}>collapse ↓</div>
      </div>
      <div style={{ padding: "12px 18px", overflowY: "auto", flex: 1 }}>
        {rows.length === 0 ? (
          <div style={{ fontFamily: SC, fontStyle: "italic", color: "#9A968F", fontSize: 13 }}>
            nothing here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {rows.map((r, i) => (
              <div key={i} style={{
                fontFamily: FC, fontSize: 12, color: "#3A3530", lineHeight: 1.5,
                padding: "8px 12px", background: "#FFFFFF",
                border: "1px solid rgba(26,23,20,.06)", borderRadius: 4,
              }}>
                <div style={{ fontSize: 13 }}>
                  {tab === "outgoing" ? (
                    <>you {r.what} <strong style={{ color: "#3A2D86" }}>{r.who}</strong></>
                  ) : (
                    <><strong style={{ color: palette.accent }}>{r.who}</strong> {r.asks || r.what}</>
                  )}
                </div>
                {(r.detail || r.their) && (
                  <div style={{
                    marginTop: 4, fontFamily: SC, fontStyle: "italic", fontSize: 12.5,
                    color: "#5E5A55",
                  }}>"{r.detail || r.their}"</div>
                )}
                <div style={{
                  marginTop: 5, fontFamily: MC, fontSize: 9, color: "#9A968F",
                  letterSpacing: ".05em",
                }}>{r.when || r.kind}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── The courtyard view ───────────────────────────────────────────────
function CourtyardRoomImpl({ navigate, thread, viewMode = "maya" }) {
  const palette = WM.DOMAIN[thread.dc];
  const courtyardName = thread.courtyardName || thread.domain;
  const kindred = thread.kindred || [];
  const [detail, setDetail] = useStateC(null); // { kind, title, byList, who, q }

  // Daisy geometry — elliptical (wider than tall) so 5 rooms + the
  // activity dock + the top eyebrow all fit a typical laptop viewport.
  const canvasW = 2400, canvasH = 1700;
  const cx = canvasW / 2, cy = canvasH / 2;
  const Rx = 440, Ry = 220;
  // Maya's thread is at top; kindred orbit around
  const totalRooms = 1 + kindred.length;
  const slots = Array.from({ length: totalRooms }, (_, i) => {
    const angle = -Math.PI / 2 + (i / totalRooms) * Math.PI * 2;
    return { angle, x: cx + Math.cos(angle) * Rx, y: cy + Math.sin(angle) * Ry };
  });
  const openSideFor = (angle) => {
    // Opening faces the center: whichever cardinal direction is opposite the
    // outward radial direction. If room is below center, opening faces up (top).
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a > Math.PI * 1.75 || a <= Math.PI * 0.25) return "left";  // east → open left
    if (a > Math.PI * 0.25 && a <= Math.PI * 0.75) return "top";    // south → open up
    if (a > Math.PI * 0.75 && a <= Math.PI * 1.25) return "right"; // west → open right
    return "bottom";                                                  // north → open down
  };

  const breadcrumb = (
    <Breadcrumb
      here="courtyard"
      navigate={navigate}
      viewMode={viewMode}
      trail={[
        { label: "Home", onClick: () => navigate("home") },
        { label: "Thread", onClick: () => navigate("thread", { id: thread.id }) },
        { label: `${courtyardName} courtyard` },
      ]}
    />
  );

  // Multi-engaged items in the central courtyard plate
  const sharedItems = [
    { dx: -130, dy: -40, kind: "find",
      title: thread.fl?.[0]?.t || "shared find",
      byList: ["Maya R.", "Priya K.", "Dev M."],
      accent: palette.accent },
    { dx: 130, dy: -20, kind: "event",
      title: `Async round · "${(thread.courtyardTopic || courtyardName)}"`,
      byList: ["Maya R.", "Priya K.", "Tom V."],
      accent: "#75580D" },
    { dx: 0, dy: 60, kind: "note",
      title: thread.notesList?.[0]?.cap?.slice(0, 60) || "shared reflection",
      byList: ["Maya R.", "Elena F."],
      accent: palette.accent },
  ];

  const initialZoom = 0.62;
  const initialPan = {
    x: -cx * initialZoom + (typeof window !== 'undefined' ? window.innerWidth : 1200) / 2,
    y: -cy * initialZoom + (typeof window !== 'undefined' ? window.innerHeight : 800) / 2 + 20,
  };

  const eyebrow = (
    <div data-ui style={{
      position: "fixed", top: 24, left: 0, right: 0,
      textAlign: "center", zIndex: 5, pointerEvents: "none",
    }}>
      <div style={{
        fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase",
        color: "#9A968F", fontFamily: MC,
      }}>§04 Courtyard · the {courtyardName} courtyard</div>
      <div style={{
        marginTop: 6, fontFamily: SC, fontStyle: "italic", fontSize: 14,
        color: "#5E5A55",
      }}>rooms around a shared center — items & events more than one of us has touched live here</div>
    </div>
  );

  const carryingBanner = (
    <div data-ui style={{
      position: "fixed", top: 88, left: 28, zIndex: 6, maxWidth: 240,
      background: "#FAF5E9",
      border: `1px solid ${palette.accent}55`,
      borderRadius: 4, padding: "9px 12px",
    }}>
      <div style={{
        fontFamily: MC, fontSize: 8.5, letterSpacing: ".18em",
        textTransform: "uppercase", color: palette.accent, marginBottom: 4,
      }}>you are still carrying</div>
      <p style={{
        fontFamily: SC, fontStyle: "italic", fontWeight: 300,
        fontSize: 13, lineHeight: 1.3, color: "#3A3530", margin: 0,
      }}>"{thread.q}"</p>
    </div>
  );

  return (
    <PZC
      canvasW={canvasW} canvasH={canvasH}
      background="#F3EDE1"
      initialPan={initialPan} initialZoom={initialZoom}
      panHint="drag · wheel zoom · rooms gather around the shared center"
      overlay={
        <>
          {eyebrow}
          {breadcrumb}
          <ApC position="right" label="Promenade"
            hint="→ §05 · open wandering"
            onActivate={() => navigate("promenade", { from: thread.id })} />
          <ActivityDock thread={thread} navigate={navigate} />
          {detail && (
            <>
              <div data-ui onClick={() => setDetail(null)} style={{
                position: "fixed", inset: 0, zIndex: 60,
                background: "rgba(31,28,23,0.45)", backdropFilter: "blur(2px)",
              }} />
              <div data-ui style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%,-50%)", zIndex: 61,
                width: "min(560px,92vw)", background: "#FAF5E9",
                border: `1px solid ${detail.accent}55`, borderRadius: 6,
                boxShadow: "0 30px 80px -20px rgba(40,30,15,0.6)",
                padding: "30px 34px 32px",
              }}>
                <button onClick={() => setDetail(null)} style={{
                  position: "absolute", top: 14, right: 14,
                  background: "transparent", border: "none",
                  fontFamily: MC, fontSize: 10, letterSpacing: ".14em",
                  textTransform: "uppercase", color: "#9A968F",
                  cursor: "pointer", padding: "6px 8px",
                }}>close ✕</button>
                {detail.kind === "kindred" ? (
                  <>
                    <div style={{
                      fontFamily: MC, fontSize: 9, letterSpacing: ".18em",
                      textTransform: "uppercase", color: detail.accent, marginBottom: 10,
                    }}>kindred · {detail.who} is holding</div>
                    <p style={{
                      fontFamily: SC, fontStyle: "italic", fontWeight: 300,
                      fontSize: 22, lineHeight: 1.22, color: "#1A1714",
                      margin: "0 0 18px", textWrap: "balance",
                    }}>"{detail.q}"</p>
                    <p style={{
                      fontFamily: FC, fontSize: 13, color: "#5E5A55",
                      lineHeight: 1.5, margin: "0 0 22px",
                    }}>You're in the same courtyard because your questions touch.
                    Anything either of you saves here becomes available to the other.
                    You can't see inside their thread; you can only meet in this shared space.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button style={{
                        fontFamily: MC, fontSize: 10, letterSpacing: ".12em",
                        textTransform: "uppercase", color: "#FAF5E9",
                        background: detail.accent, border: "none",
                        padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                      }}>leave a note for {detail.who.split(" ")[0]}</button>
                      <button style={{
                        fontFamily: MC, fontSize: 10, letterSpacing: ".12em",
                        textTransform: "uppercase", color: "#5E5A55",
                        background: "transparent", border: "1px solid rgba(26,23,20,.15)",
                        padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                      }}>share a find</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      fontFamily: MC, fontSize: 9, letterSpacing: ".18em",
                      textTransform: "uppercase", color: detail.accent, marginBottom: 10,
                    }}>shared {detail.kind} · {detail.byList.length} of us hold this</div>
                    <p style={{
                      fontFamily: SC, fontStyle: "italic", fontWeight: 300,
                      fontSize: 21, lineHeight: 1.22, color: "#1A1714",
                      margin: "0 0 18px", textWrap: "balance",
                    }}>"{detail.title}"</p>
                    <div style={{
                      fontFamily: MC, fontSize: 9, letterSpacing: ".14em",
                      textTransform: "uppercase", color: "#9A968F", marginBottom: 8,
                    }}>held by</div>
                    <p style={{
                      fontFamily: FC, fontSize: 13.5, color: "#3A3530",
                      margin: "0 0 22px",
                    }}>{detail.byList.join(" · ")}</p>
                    <div style={{
                      fontFamily: SC, fontStyle: "italic", fontSize: 13,
                      color: "#5E5A55", lineHeight: 1.5,
                      borderLeft: `2px solid ${detail.accent}55`,
                      paddingLeft: 14, marginBottom: 22,
                    }}>This {detail.kind} sits in the shared center because more than one of us has touched it. Each of us keeps our own copy back home in our thread; this is the version we hold together.</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button style={{
                        fontFamily: MC, fontSize: 10, letterSpacing: ".12em",
                        textTransform: "uppercase", color: "#FAF5E9",
                        background: detail.accent, border: "none",
                        padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                      }}>open the {detail.kind} →</button>
                      <button style={{
                        fontFamily: MC, fontSize: 10, letterSpacing: ".12em",
                        textTransform: "uppercase", color: "#5E5A55",
                        background: "transparent", border: "1px solid rgba(26,23,20,.15)",
                        padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                      }}>add to my thread</button>
                      <button onClick={() => navigate("search", {
                        // JSON-encoded: the hash router stringifies object params.
                        deepen: JSON.stringify({
                          t: detail.title,
                          s: `shared ${detail.kind}`,
                          mediaType: detail.kind,
                          fromOwner: (detail.byList && detail.byList.join(", ")) || detail.who || null,
                        }),
                      })} style={{
                        fontFamily: MC, fontSize: 10, letterSpacing: ".12em",
                        textTransform: "uppercase", color: detail.accent,
                        background: "transparent", border: `1px solid ${detail.accent}55`,
                        padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                      }}>go deeper (DOS) →</button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      }>
      {({ zoom }) => (
        <>
          {/* Central courtyard plate */}
          <div style={{
            position: "absolute", left: cx, top: cy,
            transform: "translate(-50%,-50%)",
            width: 540, height: 280, borderRadius: 200,
            background: "radial-gradient(ellipse at center, #FAF5E9 0%, #F2EFE6 75%)",
            boxShadow: "inset 0 0 0 1.5px rgba(176,112,36,.4), 0 12px 40px rgba(40,30,15,.07)",
          }} />
          <div style={{
            position: "absolute", left: cx, top: cy - 110,
            transform: "translate(-50%,-50%)",
            fontFamily: MC, fontSize: 9, letterSpacing: ".18em",
            textTransform: "uppercase", color: "#B07024", fontWeight: 600,
          }}>the courtyard</div>

          {/* Maya's thread — first slot */}
          <BorderedThread
            thread={thread} owner="Maya R."
            cx={slots[0].x} cy={slots[0].y}
            openSide={openSideFor(slots[0].angle)}
            accent={palette.accent}
            isMine
            onClick={() => navigate("thread", { id: thread.id })}
          />
          {/* Kindred — others holding adjacent questions */}
          {kindred.map((k, i) => {
            // Find the full kindred thread (if seeded) by courtyard + owner
            const kt = (WM.KINDRED_THREADS || []).find(t =>
              t.courtyardName === courtyardName && t.owner === k.who);
            const fakeThread = kt || {
              q: k.q, dc: ["teal", "purple", "amber", "green"][(i + 1) % 4],
              finds: "—", notes: "—", mileMarkers: [{}, {}],
            };
            const slot = slots[i + 1];
            return (
              <BorderedThread key={i}
                thread={fakeThread} owner={k.who}
                cx={slot.x} cy={slot.y}
                openSide={openSideFor(slot.angle)}
                onClick={() => navigate("thread", { id: (kt && kt.id) || thread.id, from: "courtyard" })}
              />
            );
          })}

          {/* Shared items inside the courtyard plate */}
          {sharedItems.map((it, i) => (
            <SharedItem key={i} x={cx + it.dx} y={cy + it.dy}
                        kind={it.kind} title={it.title}
                        byList={it.byList} accent={it.accent}
                        onClick={() => setDetail({ kind: it.kind, title: it.title, byList: it.byList, accent: it.accent })} />
          ))}
        </>
      )}
    </PZC>
  );
}

export const CourtyardRoom = CourtyardRoomImpl;
export default CourtyardRoomImpl;
