// HomeResume — fourth view of Home (after Spatial, Timeline, Grid).
// A CV-style projection of the viewed member's threads:
//   masthead → metric strip → field × selected output × foundations matrix
// Each thread is one "field"; foundations come from fl[], output from
// notesList[], plus the per-thread competencies array.
//
// Same data as the spatial home; different projection. Every link goes
// to the corresponding thread page so the résumé is fully clickable.

import { useState } from 'react';
import { WM } from '../data/wm-data.js';

const SERIF = "'Cormorant Garamond', Georgia, serif";
const SANS  = "'DM Sans', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";

const PAPER       = '#F2EFE6';
const PAPER_DEEP  = '#EBE3D2';
const PAPER_CARD  = '#FAF5E9';
const PAPER_EDGE  = '#DFD6C2';
const INK         = '#1F1C17';
const INK_SOFT    = '#4A453C';
const INK_FAINT   = '#857E70';
const INK_GHOST   = '#B8B1A0';
const MARK        = '#B25C2E';
const MARK_LINE   = 'rgba(178,92,46,0.35)';

// Date parsing — supports the "Apr 2026" format on Arlo's output as
// well as ageToDays-style fuzzy strings. Returns a sortable integer
// (months since epoch-ish). Newest-first means descending values.
const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
function dateScore(s) {
  if (!s) return 0;
  const m = String(s).match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/);
  if (m) return Number(m[2]) * 12 + MONTHS[m[1]];
  // Fallback: treat as relative ("3 weeks ago") — small score so dated
  // entries always sort above fuzzy ones.
  return -1;
}

// Per-field accent. Pulls from WM.DOMAIN by dc key.
function fieldAccent(dc, alpha) {
  const pal = WM.DOMAIN[dc];
  if (!pal) return alpha == null ? INK : INK;
  const hex = pal.accent || INK;
  if (alpha == null) return hex;
  // Convert hex → rgba for alpha control.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Glyph per output kind. Drawn as an SVG so it inherits currentColor.
function KindGlyph({ kind, size = 10 }) {
  const common = {
    width: size, height: size, viewBox: '0 0 10 10',
    style: { display: 'inline-block', verticalAlign: 'middle' },
  };
  const s = 'currentColor';
  switch (kind) {
    case 'note':    return <svg {...common}><path d="M1 5 L9 5" stroke={s} strokeWidth="1"/></svg>;
    case 'project': return <svg {...common}><path d="M5 1 L9 5 L5 9 L1 5 Z" fill="none" stroke={s} strokeWidth="1"/></svg>;
    case 'event':   return <svg {...common}><circle cx="5" cy="5" r="3.5" fill="none" stroke={s} strokeWidth="1"/></svg>;
    case 'shelf':   return <svg {...common}><rect x="1" y="1" width="8" height="8" fill="none" stroke={s} strokeWidth="1"/></svg>;
    case 'find':    return <svg {...common}><path d="M1 1 L9 1 M1 9 L9 9" stroke={s} strokeWidth="1"/></svg>;
    default:        return <svg {...common}><circle cx="5" cy="5" r="1.5" fill={s}/></svg>;
  }
}

// A tiny spine swatch for the Foundations column — book → its spine
// hex, paper → field accent.
function SpineSwatch({ find, dc }) {
  const isBook = find.bookKind === 'book' || find.bookSpine;
  const bg = isBook && find.bookSpine ? find.bookSpine : fieldAccent(dc, 0.85);
  return (
    <span title={find.t} style={{
      width: 9, height: 26, borderRadius: 1.5, background: bg,
      display: 'inline-block', boxShadow: '0 1px 2px rgba(40,30,15,0.28)',
      flex: '0 0 auto',
    }} />
  );
}

function FieldRow({ thread, maxOutputs, active, dim, onToggle, onOpenThread }) {
  const accent = fieldAccent(thread.dc);
  const outputs = (thread.notesList || [])
    .slice()
    .sort((a, b) => dateScore(b.date) - dateScore(a.date));
  const competencies = thread.competencies || [];
  const foundations = thread.fl || [];
  const fieldName = thread.domain || thread.q;

  const topIdx = competencies.reduce(
    (m, c, i, a) => (c.endorsements > (a[m]?.endorsements || 0) ? i : m),
    0
  );

  const goToThread = (e) => {
    e.stopPropagation();
    onOpenThread(thread.id);
  };

  return (
    <div onClick={() => onToggle(thread.id)} style={{
      display: 'grid', gridTemplateColumns: '248px 1fr 188px', gap: 28,
      padding: '20px 16px', borderTop: `1px solid ${PAPER_EDGE}`,
      alignItems: 'start', cursor: 'pointer', borderRadius: 6,
      background: active ? fieldAccent(thread.dc, 0.07) : 'transparent',
      opacity: dim ? 0.3 : 1, filter: dim ? 'grayscale(0.55)' : 'none',
      transition: 'background .2s, opacity .3s, filter .3s',
    }}>
      {/* Field cell */}
      <div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{
            width: active ? 12 : 10, height: active ? 12 : 10,
            borderRadius: '50%', marginTop: 6,
            background: accent, flex: '0 0 auto',
            boxShadow: active ? `0 0 0 3px ${fieldAccent(thread.dc, 0.2)}` : 'none',
            transition: 'all .2s',
          }} />
          <div style={{ minWidth: 0 }}>
            <a onClick={goToThread} style={{
              fontFamily: SERIF, fontSize: 16.5, fontWeight: 600,
              color: INK, lineHeight: 1.18, cursor: 'pointer',
            }}>{fieldName}</a>
            {thread.q && thread.q !== fieldName && (
              <div style={{
                fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5,
                color: INK_FAINT, marginTop: 6, textWrap: 'pretty',
              }}>{thread.q}</div>
            )}
          </div>
        </div>

        {/* Activity bar */}
        <div style={{ marginLeft: 20, marginTop: 13, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            flex: 1, height: 5, borderRadius: 3, background: PAPER_EDGE,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${maxOutputs > 0 ? (outputs.length / maxOutputs) * 100 : 0}%`,
              background: accent, borderRadius: 3,
            }} />
          </div>
          <span style={{
            fontFamily: MONO, fontSize: 9, color: INK_FAINT, whiteSpace: 'nowrap',
          }}>{outputs.length} work{outputs.length === 1 ? '' : 's'}</span>
        </div>

        {/* Competencies */}
        {competencies.length > 0 && (
          <div style={{ marginLeft: 20, marginTop: 16 }}>
            <div style={{
              fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: INK_GHOST, marginBottom: 9,
            }}>Competencies</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {competencies.map((c, idx) => (
                <span key={c.name} title={`endorsed by ${c.endorsements}`} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '4px 9px', borderRadius: 999,
                  border: `1px solid ${fieldAccent(thread.dc, idx === topIdx ? 0.5 : 0.3)}`,
                  background: fieldAccent(thread.dc, idx === topIdx ? 0.12 : 0.05),
                }}>
                  <span style={{
                    fontFamily: SERIF, fontSize: 11.5, color: INK, lineHeight: 1.1,
                  }}>{c.name}</span>
                  <span style={{
                    fontFamily: MONO, fontSize: 9, color: accent,
                    letterSpacing: '0.02em',
                  }}>✦{c.endorsements}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Output timeline (centre cell) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {outputs.length === 0 && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 13,
            color: INK_GHOST,
          }}>nothing produced yet — still reading.</div>
        )}
        {outputs.map(o => (
          <div key={o.id || o.cap}>
            <div style={{ display: 'flex', gap: 13, alignItems: 'baseline' }}>
              <span style={{
                fontFamily: MONO, fontSize: 10, color: INK_FAINT,
                width: 62, flex: '0 0 auto', letterSpacing: '0.01em',
              }}>{o.date || ''}</span>
              <span style={{ flex: '0 0 auto', color: accent, transform: 'translateY(1px)' }}>
                <KindGlyph kind={o.kind || 'note'} size={10} />
              </span>
              <a onClick={goToThread} style={{
                fontFamily: SERIF, fontSize: 14, color: INK,
                lineHeight: 1.3, textWrap: 'pretty', cursor: 'pointer',
              }}>{o.cap || o.title}</a>
            </div>
            {(o.meta || o.kind) && (
              <div style={{
                marginLeft: 75, fontFamily: MONO, fontSize: 9,
                letterSpacing: '0.03em', color: INK_GHOST, marginTop: 2,
              }}>
                {(o.kind || 'note')}{o.meta ? ` · ${o.meta}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Foundations (right cell) */}
      <div style={{ textAlign: 'right' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6,
        }}>
          <span style={{
            fontFamily: SERIF, fontSize: 27, fontWeight: 500, color: INK, lineHeight: 1,
          }}>{foundations.length}</span>
          <span style={{
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: INK_FAINT,
          }}>foundations</span>
        </div>
        {foundations.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 5,
            marginTop: 10, flexWrap: 'wrap',
          }}>
            {foundations.map(f => (
              <SpineSwatch key={f.id || f.t} find={f} dc={thread.dc} />
            ))}
          </div>
        )}
        {foundations.length > 0 && (
          <div style={{
            marginTop: 12, display: 'flex', flexDirection: 'column',
            gap: 5, alignItems: 'flex-end',
          }}>
            {foundations.map(f => (
              <a key={(f.id || f.t) + '-link'} onClick={goToThread} style={{
                fontFamily: SERIF, fontStyle: 'italic', fontSize: 11.5,
                color: INK_SOFT, cursor: 'pointer', lineHeight: 1.3,
                textWrap: 'pretty', maxWidth: 188,
              }}>{f.t || f.title}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HomeResume({ threads, profile, onOpenThread }) {
  const [activeField, setActiveField] = useState(null);
  const onToggle = (id) => setActiveField(prev => prev === id ? null : id);
  const maxOutputs = threads.reduce((n, t) => Math.max(n, (t.notesList || []).length), 0);
  const stats = profile?.stats || {
    foundations: threads.reduce((n, t) => n + (t.fl?.length || 0), 0),
    works:       threads.reduce((n, t) => n + (t.notesList?.length || 0), 0),
    fields:      new Set(threads.map(t => t.domain).filter(Boolean)).size,
    followers:   0,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto',
      background: `radial-gradient(circle at 28% 0%, #ece6d8 0%, transparent 55%), radial-gradient(circle at 100% 100%, #e3dccb 0%, transparent 55%), #e7e1d2`,
      fontFamily: SANS, color: INK,
    }}>
      <div style={{
        maxWidth: 968, margin: '40px auto 80px',
        padding: '56px 60px 48px',
        background: PAPER, borderRadius: 3,
        boxShadow: '0 1px 2px rgba(40,30,15,.1), 0 30px 70px -40px rgba(40,30,15,.5)',
      }}>
        {/* Masthead */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          gap: 24,
        }}>
          <div>
            <h1 style={{
              margin: 0, fontFamily: SERIF, fontSize: 46, fontWeight: 500,
              letterSpacing: '-0.02em', color: INK, lineHeight: 1.05,
            }}>{profile?.name || 'Member'}</h1>
            {profile?.role && (
              <div style={{
                marginTop: 11, fontFamily: MONO, fontSize: 11,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: MARK,
              }}>{profile.role}</div>
            )}
          </div>
          <div style={{
            textAlign: 'right', fontFamily: MONO, fontSize: 10.5,
            color: INK_FAINT, lineHeight: 1.75,
          }}>
            {profile?.handle && <div>@{profile.handle} · town square</div>}
            {profile?.place && <div>{profile.place}</div>}
            {profile?.since && <div>{profile.since}</div>}
          </div>
        </div>
        {profile?.creed && (
          <p style={{
            marginTop: 20, fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 16.5, lineHeight: 1.55, color: INK_SOFT,
            maxWidth: 660,
          }}>{profile.creed}</p>
        )}

        {/* Metric strip */}
        <div style={{
          marginTop: 26, display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          border: `1px solid ${PAPER_EDGE}`, borderRadius: 6,
          overflow: 'hidden', background: PAPER_CARD,
        }}>
          {[
            ['foundations', stats.foundations, 'foundations cited'],
            ['works',       stats.works,       'works produced'],
            ['fields',      stats.fields,      'fields'],
            ['followers',   stats.followers,   'followers'],
          ].map(([k, n, label], i) => (
            <div key={k} style={{
              padding: '13px 16px', textAlign: 'center',
              borderLeft: i === 0 ? 'none' : `1px solid ${PAPER_EDGE}`,
            }}>
              <div style={{
                fontFamily: SERIF, fontSize: 23, fontWeight: 500, color: INK,
              }}>{n}</div>
              <div style={{
                fontFamily: MONO, fontSize: 9, color: INK_FAINT,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                marginTop: 2,
              }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Matrix */}
        <div style={{ marginTop: 36 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
          }}>
            <span style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: INK_SOFT,
            }}>Practice, by field</span>
            <div style={{ flex: 1, height: 1, background: PAPER_EDGE }}/>
            {activeField && (() => {
              const t = threads.find(th => th.id === activeField);
              const label = t?.domain || t?.q || 'field';
              return (
                <button onClick={() => setActiveField(null)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '5px 11px', borderRadius: 999,
                  background: PAPER_CARD, border: `1px solid ${PAPER_EDGE}`,
                  fontFamily: MONO, fontSize: 9.5, color: INK_SOFT,
                  cursor: 'pointer',
                }}>showing {label} · clear ✕</button>
              );
            })()}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '248px 1fr 188px', gap: 28,
            padding: '0 16px 10px', fontFamily: MONO, fontSize: 9,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_GHOST,
          }}>
            <span>Field</span>
            <span>Selected output · most recent first</span>
            <span style={{ textAlign: 'right' }}>Foundations</span>
          </div>

          {threads.map(t => (
            <FieldRow key={t.id}
              thread={t}
              maxOutputs={maxOutputs || 1}
              active={activeField === t.id}
              dim={activeField && activeField !== t.id}
              onToggle={onToggle}
              onOpenThread={onOpenThread} />
          ))}
        </div>

        {/* Output-type key */}
        <div style={{
          marginTop: 30, paddingTop: 18, borderTop: `1px solid ${PAPER_EDGE}`,
          display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center',
        }}>
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: INK_FAINT,
          }}>output types</span>
          {[
            ['note',    'written or audio note'],
            ['project', 'real-world project, shared'],
            ['event',   'live or async exchange'],
            ['shelf',   'published collection'],
          ].map(([kind, desc]) => (
            <span key={kind} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              color: INK_SOFT,
            }}>
              <KindGlyph kind={kind} size={10} />
              <span style={{
                fontFamily: MONO, fontSize: 10, color: INK,
              }}>{kind}</span>
              <span style={{
                fontFamily: SANS, fontSize: 11, color: INK_FAINT,
              }}>{desc}</span>
            </span>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 30, display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', gap: 16,
        }}>
          <span style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5, color: INK_FAINT,
          }}>A record of attention and output — what fed the work, and what came of it.</span>
          {profile?.handle && (
            <span style={{
              fontFamily: MONO, fontSize: 9.5, color: INK_GHOST,
            }}>town square · @{profile.handle}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomeResume;
