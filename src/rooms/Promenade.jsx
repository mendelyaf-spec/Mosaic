// PROMENADE ROOM (§05) — the shared discovery walk.
//
// Two registers, one toggle:
//   - "wander"  : a scatter of cards on a pan-zoom canvas. Click to focus.
//   - "focus"   : one item at a time, big card, prev/next, all actions inline.
//
// Item pool: every find + note from foreign threads (kindred + personal).
// Maya's own things are not on the promenade — discovery is about what's out
// there. Items from threads not yet in a courtyard are still browseable; the
// "ask to join" action is hidden for those and "request to merge" takes its
// place.
//
// Five response actions per item:
//   1. ask to join the courtyard      — toast (receiver UI not built yet)
//   2. request to merge               — toast (receiver UI not built yet)
//   3. schedule an event              — lightweight composer → toast
//   4. save to a thread               — real (addFindToThread)
//   5. spawn a new thread             — real (spawnThreadFromCard)

import { useState, useMemo, useEffect } from 'react';
import {
  Room, PanZoomCanvas, Aperture, Breadcrumb,
  FONT_SERIF, FONT_SANS, FONT_MONO,
} from '../shell/shell.jsx';
import { WM } from '../data/wm-data.js';
import {
  addFindToThread, getAllThreads, isOwnThread, spawnThreadFromCard,
} from '../lib/threads.js';
import {
  getPromenadeItems, scatterPositions, ownCourtyardNames,
} from '../lib/promenade.js';

// ─── Toast ─────────────────────────────────────────────────────────────
function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div data-ui style={{
      position: 'fixed', bottom: 78, left: '50%', transform: 'translateX(-50%)',
      zIndex: 80, background: '#1A1714', color: '#F6F3EC',
      padding: '11px 18px', borderRadius: 4,
      fontFamily: FONT_SANS, fontSize: 13, letterSpacing: '.01em',
      boxShadow: '0 12px 32px rgba(40,30,15,.32)',
      maxWidth: 480, lineHeight: 1.4,
    }}>{message}</div>
  );
}

// ─── Lineage chip — small caption under owner ──────────────────────────
function LineageChip({ item }) {
  const text = item.inCourtyard
    ? `in courtyard · ${item.courtyardName}`
    : `personal thread`;
  return (
    <span style={{
      fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: item.inCourtyard ? WM.DOMAIN[item.dc].accent : '#9A968F',
    }}>{text}</span>
  );
}

// ─── Compact card (wander mode) ────────────────────────────────────────
function WanderCard({ item, x, y, onOpen }) {
  const pal = WM.DOMAIN[item.dc];
  const isNote = item.kind === 'note';
  return (
    <div data-card onClick={onOpen} style={{
      position: 'absolute', left: x, top: y,
      transform: 'translate(-50%,-50%)',
      width: 232,
      background: '#FFFFFF',
      border: `1px solid ${pal.accent}33`,
      borderRadius: 4,
      padding: '11px 13px 12px',
      boxShadow: '0 6px 18px rgba(40,30,15,.06)',
      cursor: 'pointer',
      transition: 'transform .12s ease, box-shadow .12s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translate(-50%,-50%) translateY(-2px)';
      e.currentTarget.style.boxShadow = `0 14px 28px rgba(40,30,15,.10), inset 0 0 0 1px ${pal.accent}66`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translate(-50%,-50%)';
      e.currentTarget.style.boxShadow = '0 6px 18px rgba(40,30,15,.06)';
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7,
        fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.14em',
        textTransform: 'uppercase', color: pal.accent,
      }}>
        <span>{item.glyph}</span>
        <span>{isNote ? `${item.noteType} note` : 'find'}</span>
        <span style={{ marginLeft: 'auto', color: '#9A968F' }}>{item.age}</span>
      </div>
      <div style={{
        fontFamily: isNote ? FONT_SERIF : FONT_SANS,
        fontStyle: isNote ? 'italic' : 'normal',
        fontSize: isNote ? 13 : 12.5, fontWeight: isNote ? 300 : 500,
        lineHeight: 1.3, color: '#1A1714',
        marginBottom: 9, display: '-webkit-box',
        WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{isNote ? `"${item.title}"` : item.title}</div>
      {!isNote && item.source && (
        <div style={{
          fontFamily: FONT_SANS, fontSize: 10.5, color: '#5E5A55',
          marginBottom: 8, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{item.source}</div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: FONT_SANS, fontSize: 10, color: '#9A968F',
        borderTop: '1px solid rgba(26,23,20,.06)', paddingTop: 7, gap: 8,
      }}>
        <span style={{ color: '#3A3530' }}>{item.owner}</span>
        <LineageChip item={item} />
      </div>
    </div>
  );
}

// ─── Event composer (lightweight) ──────────────────────────────────────
function EventComposer({ item, onSend, onCancel }) {
  const [kind, setKind] = useState('live');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const pal = WM.DOMAIN[item.dc];
  return (
    <div style={{
      marginTop: 14, padding: '14px 16px',
      background: '#FAF5E9',
      border: `1px solid ${pal.accent}33`, borderRadius: 4,
    }}>
      <div style={{
        fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.18em',
        textTransform: 'uppercase', color: pal.accent, marginBottom: 10,
      }}>propose an event to {item.owner.split(' ')[0]}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={kind} onChange={e => setKind(e.target.value)} style={{
          fontFamily: FONT_SANS, fontSize: 12, padding: '6px 8px',
          border: '1px solid rgba(26,23,20,.15)', borderRadius: 3,
          background: '#FFFFFF', color: '#1A1714', flexShrink: 0,
        }}>
          <option value="live">live</option>
          <option value="async">async (over a week)</option>
        </select>
        <input
          placeholder="suggested when (e.g. Thursday 4pm)"
          value={when} onChange={e => setWhen(e.target.value)}
          style={{
            flex: 1, fontFamily: FONT_SANS, fontSize: 12,
            padding: '6px 10px', border: '1px solid rgba(26,23,20,.15)',
            borderRadius: 3, background: '#FFFFFF',
          }} />
      </div>
      <textarea
        placeholder="why this — one line is fine"
        value={note} onChange={e => setNote(e.target.value)}
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box',
          fontFamily: FONT_SANS, fontSize: 12, lineHeight: 1.4,
          padding: '8px 10px', border: '1px solid rgba(26,23,20,.15)',
          borderRadius: 3, background: '#FFFFFF', resize: 'vertical',
        }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onSend({ kind, when, note })} style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em',
          textTransform: 'uppercase', color: '#FAF5E9',
          background: pal.accent, border: 'none',
          padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
        }}>send proposal</button>
        <button onClick={onCancel} style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em',
          textTransform: 'uppercase', color: '#5E5A55',
          background: 'transparent', border: '1px solid rgba(26,23,20,.15)',
          padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
        }}>cancel</button>
      </div>
    </div>
  );
}

// ─── Focus card (one item, full actions) ───────────────────────────────
function FocusCard({ item, ownCourtyards, onAction, navigate, onPrev, onNext, position, total }) {
  const pal = WM.DOMAIN[item.dc];
  const isNote = item.kind === 'note';
  const [composing, setComposing] = useState(false);
  const [savedTo, setSavedTo] = useState(null);
  const myThreads = getAllThreads().filter(t => isOwnThread(t.id));

  // Reset composer state when item changes.
  useEffect(() => { setComposing(false); setSavedTo(null); }, [item.id]);

  const alreadyInCourtyard = item.inCourtyard && ownCourtyards.has(item.courtyardName);
  const canJoin  = item.inCourtyard && !alreadyInCourtyard;
  const canMerge = !item.inCourtyard;

  return (
    <div data-ui style={{
      width: 'min(600px, 92vw)',
      background: '#FAF5E9',
      border: `1px solid ${pal.accent}55`, borderRadius: 6,
      boxShadow: '0 30px 80px -20px rgba(40,30,15,0.45)',
      padding: '28px 32px 30px',
      maxHeight: '88vh', overflowY: 'auto',
    }}>
      {/* prev/next + count */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, fontFamily: FONT_MONO, fontSize: 9.5,
        letterSpacing: '.14em', textTransform: 'uppercase', color: '#9A968F',
      }}>
        <button onClick={onPrev} disabled={!onPrev} style={{
          background: 'transparent', border: 'none',
          color: onPrev ? pal.accent : '#C0BDB6',
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
          textTransform: 'uppercase', cursor: onPrev ? 'pointer' : 'default',
          padding: 0,
        }}>← prev</button>
        <span>{position} of {total}</span>
        <button onClick={onNext} disabled={!onNext} style={{
          background: 'transparent', border: 'none',
          color: onNext ? pal.accent : '#C0BDB6',
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
          textTransform: 'uppercase', cursor: onNext ? 'pointer' : 'default',
          padding: 0,
        }}>next →</button>
      </div>

      {/* item header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.18em',
        textTransform: 'uppercase', color: pal.accent,
      }}>
        <span style={{ fontSize: 14 }}>{item.glyph}</span>
        <span>{isNote ? `${item.noteType} note` : 'find'}</span>
        <span style={{ marginLeft: 'auto', color: '#9A968F' }}>{item.age}</span>
      </div>

      <h2 style={{
        margin: '0 0 14px',
        fontFamily: isNote ? FONT_SERIF : FONT_SANS,
        fontStyle: isNote ? 'italic' : 'normal',
        fontSize: 22, fontWeight: isNote ? 300 : 500,
        lineHeight: 1.22, color: '#1A1714', textWrap: 'balance',
      }}>{isNote ? `"${item.title}"` : item.title}</h2>

      {!isNote && item.source && (
        <div style={{
          fontFamily: FONT_SANS, fontSize: 13, color: '#5E5A55',
          marginBottom: 14, lineHeight: 1.45,
        }}>{item.source}</div>
      )}
      {item.note && (
        <div style={{
          fontFamily: FONT_SERIF, fontStyle: 'italic', fontSize: 13.5,
          color: '#5E5A55', lineHeight: 1.5,
          borderLeft: `2px solid ${pal.accent}55`,
          paddingLeft: 12, marginBottom: 16,
        }}>{item.owner}'s note: {item.note}</div>
      )}

      {/* lineage block */}
      <div style={{
        padding: '10px 12px', marginBottom: 18,
        background: '#FFFFFF',
        border: '1px solid rgba(26,23,20,.06)', borderRadius: 4,
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: '.16em',
          textTransform: 'uppercase', color: '#9A968F', marginBottom: 5,
        }}>from</div>
        <div style={{
          fontFamily: FONT_SANS, fontSize: 12.5, color: '#1A1714',
        }}>
          <strong style={{ color: pal.accent }}>{item.owner}</strong>'s thread —{' '}
          <em style={{ color: '#3A3530' }}>"{item.threadQ}"</em>
        </div>
        <div style={{ marginTop: 6 }}>
          <LineageChip item={item} />
          {alreadyInCourtyard && (
            <span style={{
              marginLeft: 10, fontFamily: FONT_MONO, fontSize: 8.5,
              letterSpacing: '.14em', textTransform: 'uppercase', color: '#1A5C46',
            }}>· you're already in</span>
          )}
        </div>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {canJoin && (
          <button onClick={() => onAction('join', item)} style={primaryBtn(pal.accent)}>
            ask to join the courtyard
          </button>
        )}
        {canMerge && (
          <button onClick={() => onAction('merge', item)} style={primaryBtn(pal.accent)}>
            request to merge threads
          </button>
        )}
        <button onClick={() => setComposing(true)} style={secondaryBtn(pal.accent)}>
          propose an event
        </button>
        <select
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const res = addFindToThread(id, {
              title: item.title,
              source: item.source || (isNote ? `note from ${item.owner}` : ''),
              url: item.url || '',
              mediaType: isNote ? (item.noteType || 'note') : (item.glyph || 'find'),
              fromOwner: item.owner,
            });
            if (res) {
              const q = res.thread.q || 'your thread';
              setSavedTo(q.length > 44 ? q.slice(0, 44) + '…' : q);
              onAction('save', item, { threadQ: res.thread.q });
            }
            e.target.value = '';
          }}
          style={{
            fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.06em',
            textTransform: 'uppercase', color: '#5E5A55',
            background: 'transparent', border: '1px solid rgba(26,23,20,.15)',
            padding: '8px 12px', borderRadius: 3, cursor: 'pointer',
          }}>
          <option value="">save to a thread…</option>
          {myThreads.map(t => (
            <option key={t.id} value={t.id}>
              {t.q.length > 46 ? t.q.slice(0, 46) + '…' : t.q}
            </option>
          ))}
        </select>
        <button onClick={() => {
          const spawned = spawnThreadFromCard({
            title: item.title,
            source: item.source || (isNote ? `note from ${item.owner}` : ''),
            url:    item.url || '',
            mediaType: isNote ? (item.noteType || 'note') : 'find',
          }, { owner: item.owner });
          if (spawned) {
            onAction('spawn', item);
            navigate('thread', { id: spawned.id });
          }
        }} style={ghostBtn(pal.accent)}>
          spawn a new thread →
        </button>
      </div>

      {savedTo && (
        <div style={{
          marginTop: 14, fontFamily: FONT_SERIF, fontStyle: 'italic',
          fontSize: 13.5, color: pal.accent,
        }}>Saved to "{savedTo}". Pinned there now.</div>
      )}

      {composing && (
        <EventComposer item={item}
          onSend={(payload) => { setComposing(false); onAction('event', item, payload); }}
          onCancel={() => setComposing(false)} />
      )}
    </div>
  );
}

function primaryBtn(accent) {
  return {
    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: '#FAF5E9',
    background: accent, border: 'none',
    padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
  };
}
function secondaryBtn(accent) {
  return {
    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: accent,
    background: 'transparent', border: `1px solid ${accent}55`,
    padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
  };
}
function ghostBtn(accent) {
  return {
    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: '#5E5A55',
    background: 'transparent', border: '1px solid rgba(26,23,20,.15)',
    padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
  };
}

// ─── Mode toggle (wander | focus) ──────────────────────────────────────
function ModeToggle({ mode, setMode }) {
  const opts = [
    { id: 'wander', label: 'wander' },
    { id: 'focus',  label: 'focus' },
  ];
  return (
    <div data-ui style={{
      display: 'inline-flex', background: 'rgba(246,243,236,.94)',
      border: '1px solid rgba(26,23,20,.10)', borderRadius: 99,
      padding: 3, gap: 2,
      fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.14em',
      textTransform: 'uppercase',
    }}>
      {opts.map(o => {
        const active = mode === o.id;
        return (
          <button key={o.id} onClick={() => setMode(o.id)} style={{
            background: active ? '#1A5C46' : 'transparent',
            color: active ? '#F6F3EC' : '#3A3530',
            border: 'none', borderRadius: 99,
            padding: '5px 12px', cursor: active ? 'default' : 'pointer',
            fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: '.14em',
            textTransform: 'uppercase', fontWeight: active ? 600 : 500,
            transition: 'all .12s ease',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ─── The room ──────────────────────────────────────────────────────────
export function PromenadeRoom({ navigate }) {
  const items = useMemo(() => getPromenadeItems(), []);
  const ownCourtyards = useMemo(() => ownCourtyardNames(), []);
  const positions = useMemo(
    () => scatterPositions(items, { canvasW: 2400, canvasH: 1800, cols: 7 }),
    [items]
  );
  const posById = useMemo(() => {
    const m = new Map();
    for (const p of positions) m.set(p.id, p);
    return m;
  }, [positions]);

  const [mode, setMode] = useState('wander');
  const [focusedIdx, setFocusedIdx] = useState(null); // null = no overlay (wander only)
  const [toast, setToast] = useState(null);

  // Open focus card from wander click.
  const openItem = (idx) => setFocusedIdx(idx);
  const closeOverlay = () => setFocusedIdx(null);

  // For "focus" page-mode, we keep an always-on focused index.
  // For "wander" mode, focused only exists when the user clicked a card.
  useEffect(() => {
    if (mode === 'focus' && focusedIdx === null && items.length > 0) {
      setFocusedIdx(0);
    }
    if (mode === 'wander') {
      setFocusedIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onAction = (kind, item, payload = {}) => {
    const first = item.owner.split(' ')[0];
    if (kind === 'join') {
      setToast(`Request sent to ${first} to join the ${item.courtyardName} courtyard.`);
    } else if (kind === 'merge') {
      setToast(`Merge proposal sent to ${first}. If accepted, a new courtyard forms around your two threads.`);
    } else if (kind === 'event') {
      const k = payload.kind === 'async' ? 'an async exchange' : 'a live meeting';
      setToast(`Proposed ${k} to ${first}${payload.when ? ` — ${payload.when}` : ''}.`);
    } else if (kind === 'save') {
      // Save toast handled inline in FocusCard, but keep a global confirmation too.
      // Skip to avoid double-toasting.
    } else if (kind === 'spawn') {
      setToast(`New thread spawned from ${first}'s ${item.kind}. Opening it now.`);
    }
  };

  const breadcrumb = (
    <Breadcrumb
      here="promenade"
      navigate={navigate}
      viewMode="maya"
      trail={[
        { label: 'Home', onClick: () => navigate('home') },
        { label: 'Promenade' },
      ]}
    />
  );

  const eyebrow = (
    <div data-ui style={{
      position: 'fixed', top: 22, left: 0, right: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8, zIndex: 6, pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
        color: '#9A968F', fontFamily: FONT_MONO,
      }}>§05 Promenade · the wandering walk</div>
      <div style={{
        fontFamily: FONT_SERIF, fontStyle: 'italic', fontSize: 14,
        color: '#5E5A55', textAlign: 'center', maxWidth: 560,
      }}>finds and notes from threads you don't yet share — drift, open one, respond</div>
      <div style={{ pointerEvents: 'auto', marginTop: 4 }}>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>
    </div>
  );

  // ----------- WANDER MODE (pan-zoom canvas of cards) -----------
  if (mode === 'wander') {
    return (
      <PanZoomCanvas
        canvasW={2400} canvasH={1800}
        background="#F2EFE6"
        initialZoom={0.7}
        panHint="drag · wheel zoom · click a card to respond"
        overlay={
          <>
            {eyebrow}
            {breadcrumb}
            <Toast message={toast} onClose={() => setToast(null)} />
            {focusedIdx !== null && (
              <>
                <div data-ui onClick={closeOverlay} style={{
                  position: 'fixed', inset: 0, zIndex: 60,
                  background: 'rgba(31,28,23,0.45)', backdropFilter: 'blur(2px)',
                }} />
                <div data-ui style={{
                  position: 'fixed', top: '50%', left: '50%',
                  transform: 'translate(-50%,-50%)', zIndex: 61,
                }}>
                  <FocusCard
                    item={items[focusedIdx]}
                    ownCourtyards={ownCourtyards}
                    onAction={onAction}
                    navigate={navigate}
                    position={focusedIdx + 1}
                    total={items.length}
                    onPrev={focusedIdx > 0 ? () => setFocusedIdx(focusedIdx - 1) : null}
                    onNext={focusedIdx < items.length - 1 ? () => setFocusedIdx(focusedIdx + 1) : null}
                  />
                  <button data-ui onClick={closeOverlay} style={{
                    position: 'fixed', top: 24, right: 24, zIndex: 62,
                    background: '#FAF5E9', border: '1px solid rgba(26,23,20,.15)',
                    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
                    textTransform: 'uppercase', color: '#5E5A55',
                    cursor: 'pointer', padding: '7px 12px', borderRadius: 3,
                  }}>close ✕</button>
                </div>
              </>
            )}
          </>
        }>
        {() => (
          <>
            {items.map((it, i) => {
              const p = posById.get(it.id);
              if (!p) return null;
              return (
                <WanderCard key={it.id} item={it} x={p.x} y={p.y}
                  onOpen={() => openItem(i)} />
              );
            })}
          </>
        )}
      </PanZoomCanvas>
    );
  }

  // ----------- FOCUS MODE (one card at a time, centred) -----------
  const it = focusedIdx !== null ? items[focusedIdx] : null;
  return (
    <Room background="#F2EFE6">
      {eyebrow}
      {breadcrumb}
      <Toast message={toast} onClose={() => setToast(null)} />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '120px 40px 100px',
      }}>
        {it ? (
          <FocusCard
            item={it}
            ownCourtyards={ownCourtyards}
            onAction={onAction}
            navigate={navigate}
            position={focusedIdx + 1}
            total={items.length}
            onPrev={focusedIdx > 0 ? () => setFocusedIdx(focusedIdx - 1) : null}
            onNext={focusedIdx < items.length - 1 ? () => setFocusedIdx(focusedIdx + 1) : null}
          />
        ) : (
          <div style={{
            fontFamily: FONT_SERIF, fontStyle: 'italic',
            color: '#9A968F', fontSize: 16,
          }}>The promenade is empty today.</div>
        )}
      </div>
    </Room>
  );
}

export default PromenadeRoom;
