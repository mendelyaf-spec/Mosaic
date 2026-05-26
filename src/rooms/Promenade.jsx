// PROMENADE ROOM (§05) — the shared discovery walk.
//
// Items cluster around their courtyard's "home" on the canvas. Personal-
// thread items each form a small isolated cluster at the periphery. The
// effect: courtyards carry visible spatial weight; personal threads sit
// lighter at the edges.
//
// Card style follows the standalone design — paper + terracotta, no
// per-domain wash. Thumbnails are honest SVG composites per content kind
// (books look like books, audio like waveforms, async events like
// matrices). No raster assets.
//
// Two registers, one toggle:
//   - wander : pan-zoom canvas with clustered cards
//   - focus  : one item at a time, big card, all five actions inline
//
// Five response actions per item (unchanged from prior pass):
//   1. ask to join the courtyard      — toast
//   2. request to merge (no courtyard yet) — toast
//   3. propose an event               — lightweight composer → toast
//   4. save to a thread               — real
//   5. spawn a new thread             — real

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Room, PanZoomCanvas, Breadcrumb,
} from '../shell/shell.jsx';
import {
  addFindToThread, getAllThreads, isOwnThread, spawnThreadFromCard,
} from '../lib/threads.js';
import {
  getPromenadeItems, buildClusters, layoutCards, ownCourtyardNames,
} from '../lib/promenade.js';
import { Thumbnail } from './PromenadeThumbnail.jsx';

// ─── Palette (from the standalone design) ──────────────────────────────
const P = {
  paper:     '#f3ede1',
  paperDeep: '#ebe3d2',
  paperCard: '#faf5e9',
  paperEdge: '#dfd6c2',
  ink:       '#1f1c17',
  inkSoft:   '#4a453c',
  inkFaint:  '#857e70',
  inkGhost:  '#b8b1a0',
  mark:      '#b25c2e',      // approx of oklch(0.55 0.11 45)
  markSoft:  'rgba(178,92,46,0.12)',
  markLine:  'rgba(178,92,46,0.35)',
};

const SERIF = "'Cormorant Garamond', 'Iowan Old Style', Georgia, serif";
const SANS  = "'DM Sans', 'Inter', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";

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
      zIndex: 80, background: P.ink, color: P.paper,
      padding: '11px 18px', borderRadius: 2,
      fontFamily: SANS, fontSize: 13, letterSpacing: '.01em',
      boxShadow: '0 12px 32px rgba(40,30,15,.32)',
      maxWidth: 480, lineHeight: 1.4,
    }}>{message}</div>
  );
}

// ─── Wander card (YouTube-style: thumbnail dominates) ──────────────────
function WanderCard({ item, x, y, rot, onOpen, detail }) {
  const w = 260;
  const hasMedia = !!item.media;
  return (
    <div data-card
      onClick={onOpen}
      style={{
        position: 'absolute', left: x, top: y,
        width: w,
        transform: `translate(-50%,-50%) rotate(${rot}deg)`,
        transformOrigin: 'center',
        cursor: 'pointer',
        transition: 'transform .18s ease, filter .18s ease',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `translate(-50%,-50%) rotate(${rot * 0.4}deg) scale(1.03)`;
        e.currentTarget.style.filter = 'drop-shadow(0 14px 28px rgba(40,30,15,.18))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
        e.currentTarget.style.filter = 'none';
      }}>
      <div style={{
        background: P.paperCard,
        border: `1px solid ${P.paperEdge}`,
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 10px 26px -18px rgba(40,30,15,0.4), 0 1px 2px -1px rgba(40,30,15,0.14)',
      }}>
        {hasMedia
          ? <Thumbnail media={item.media} kind={item.kind} width={w} />
          : <QuoteBand title={item.title} />}

        <div style={{ padding: detail === 'compact' ? '7px 11px 9px' : '10px 13px 12px' }}>
          <div style={{
            fontFamily: MONO, fontSize: detail === 'compact' ? 8.5 : 9.5,
            letterSpacing: '.08em', textTransform: 'uppercase',
            color: P.inkFaint, display: 'flex', alignItems: 'center',
            marginBottom: detail === 'compact' ? 3 : 5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            <KindGlyph kind={item.kind === 'note' ? 'note' : 'find'} />
            <span style={{ marginLeft: 4 }}>{item.kind === 'note' ? 'note' : 'find'}</span>
            <span style={{ margin: '0 6px', opacity: .5 }}>·</span>
            <span style={{
              textTransform: 'none', letterSpacing: 0, fontFamily: SANS,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>on <em style={{ fontFamily: SERIF, fontStyle: 'italic', color: P.inkSoft }}>
              {item.owner.split(' ')[0]}&rsquo;s
            </em> thread</span>
          </div>
          {(detail !== 'compact' || !hasMedia) && (
            <div style={{
              fontFamily: SERIF, fontWeight: 500,
              fontSize: detail === 'compact' ? 13 : 15,
              lineHeight: 1.25, color: P.ink,
              textWrap: 'pretty',
              display: '-webkit-box',
              WebkitLineClamp: detail === 'compact' ? 2 : 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{item.title}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteBand({ title }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '16 / 9',
      background: 'linear-gradient(135deg, #e9e1cf 0%, #dcd2bb 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '14px 22px',
    }}>
      <div style={{
        fontFamily: SERIF, fontStyle: 'italic',
        fontSize: 15, lineHeight: 1.35, color: P.inkSoft,
        textAlign: 'center', textWrap: 'pretty', maxWidth: '92%',
        display: '-webkit-box', WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>&ldquo;{title}&rdquo;</div>
    </div>
  );
}

function KindGlyph({ kind }) {
  const common = {
    width: 10, height: 10, viewBox: '0 0 10 10',
    style: { display: 'inline-block', verticalAlign: 'middle' },
  };
  const s = 'currentColor';
  if (kind === 'note')  return <svg {...common}><path d="M1 5 L9 5" stroke={s} strokeWidth="1"/></svg>;
  return <svg {...common}><path d="M1 1 L9 1 M1 9 L9 9" stroke={s} strokeWidth="1"/></svg>;
}

// ─── Courtyard halo + label ────────────────────────────────────────────
// Only courtyards get a halo and label. Personal-thread items are loose
// singletons in the field — their owner shows on the card itself.
function CourtyardHalo({ cluster, home }) {
  const hue = cluster.hue;
  return (
    <div style={{
      position: 'absolute', left: home.x, top: home.y,
      transform: 'translate(-50%,-50%)',
      width: 1100, height: 1100, borderRadius: '50%',
      background: `radial-gradient(circle at center, hsla(${hue},45%,68%,0.14) 0%, hsla(${hue},45%,68%,0.06) 38%, transparent 68%)`,
      pointerEvents: 'none',
    }} />
  );
}

function CourtyardLabel({ cluster, home }) {
  const hue = cluster.hue;
  return (
    <div style={{
      position: 'absolute', left: home.x, top: home.y,
      transform: 'translate(-50%,-50%)',
      width: 320, textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '.22em',
        textTransform: 'uppercase',
        color: `hsl(${hue}, 35%, 32%)`,
        marginBottom: 4, fontWeight: 600,
      }}>the courtyard</div>
      <div style={{
        fontFamily: SERIF, fontStyle: 'italic', fontSize: 20,
        fontWeight: 400, lineHeight: 1.2, color: P.ink,
        textWrap: 'balance',
      }}>{cluster.name}</div>
      {cluster.topic && (
        <div style={{
          marginTop: 4, fontFamily: SANS, fontSize: 10.5,
          color: P.inkFaint, fontStyle: 'italic',
        }}>{cluster.topic}</div>
      )}
    </div>
  );
}

// ─── Event composer ────────────────────────────────────────────────────
function EventComposer({ item, onSend, onCancel }) {
  const [kind, setKind] = useState('live');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const ref = useRef(null);
  const noteRef = useRef(null);
  useEffect(() => {
    // Scroll the composer into view inside the focus card and focus the
    // note field, so the click reads as an immediate response.
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => noteRef.current?.focus(), 220);
  }, []);
  return (
    <div ref={ref} style={{
      marginTop: 14, padding: '14px 16px',
      background: P.paper,
      border: `1px solid ${P.paperEdge}`, borderRadius: 2,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
        textTransform: 'uppercase', color: P.mark, marginBottom: 10,
      }}>propose an event to {item.owner.split(' ')[0]}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={kind} onChange={e => setKind(e.target.value)} style={{
          fontFamily: SANS, fontSize: 12, padding: '6px 8px',
          border: `1px solid ${P.paperEdge}`, borderRadius: 2,
          background: P.paperCard, color: P.ink,
        }}>
          <option value="live">live</option>
          <option value="async">async (over a week)</option>
        </select>
        <input
          placeholder="suggested when (e.g. Thursday 4pm)"
          value={when} onChange={e => setWhen(e.target.value)}
          style={{
            flex: 1, fontFamily: SANS, fontSize: 12,
            padding: '6px 10px', border: `1px solid ${P.paperEdge}`,
            borderRadius: 2, background: P.paperCard,
          }} />
      </div>
      <textarea
        ref={noteRef}
        placeholder="why this — one line is fine"
        value={note} onChange={e => setNote(e.target.value)}
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box',
          fontFamily: SANS, fontSize: 12, lineHeight: 1.4,
          padding: '8px 10px', border: `1px solid ${P.paperEdge}`,
          borderRadius: 2, background: P.paperCard, resize: 'vertical',
        }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onSend({ kind, when, note })} style={primaryBtn()}>
          send proposal
        </button>
        <button onClick={onCancel} style={ghostBtn()}>cancel</button>
      </div>
    </div>
  );
}

// ─── Focus card (one item, full actions) ───────────────────────────────
function FocusCard({ item, ownCourtyards, onAction, navigate, onPrev, onNext, position, total }) {
  const isNote = item.kind === 'note';
  const [composing, setComposing] = useState(false);
  const [savedTo, setSavedTo] = useState(null);
  const myThreads = getAllThreads().filter(t => isOwnThread(t.id));

  useEffect(() => { setComposing(false); setSavedTo(null); }, [item.id]);

  const alreadyInCourtyard = item.inCourtyard && ownCourtyards.has(item.courtyardName);
  const canJoin  = item.inCourtyard && !alreadyInCourtyard;
  const canMerge = !item.inCourtyard;

  return (
    <div data-ui style={{
      width: 'min(620px, 92vw)',
      background: P.paperCard,
      border: `1px solid ${P.paperEdge}`,
      borderRadius: 3,
      boxShadow: '0 30px 80px -20px rgba(40,30,15,0.45)',
      padding: 0,
      maxHeight: '88vh', overflowY: 'auto',
    }}>
      {item.media && <Thumbnail media={item.media} kind={item.kind} width={620} />}
      {!item.media && (
        <div style={{
          height: 180, background: 'linear-gradient(135deg, #e9e1cf 0%, #dcd2bb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30,
        }}>
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 22,
            lineHeight: 1.3, color: P.inkSoft, textAlign: 'center',
            textWrap: 'pretty', maxWidth: '90%',
          }}>&ldquo;{item.title}&rdquo;</div>
        </div>
      )}

      <div style={{ padding: '22px 28px 26px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14, fontFamily: MONO, fontSize: 9.5,
          letterSpacing: '.14em', textTransform: 'uppercase', color: P.inkFaint,
        }}>
          <button onClick={onPrev} disabled={!onPrev} style={navBtn(!!onPrev)}>← prev</button>
          <span>{position} of {total}</span>
          <button onClick={onNext} disabled={!onNext} style={navBtn(!!onNext)}>next →</button>
        </div>

        <div style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '.16em',
          textTransform: 'uppercase', color: P.mark, marginBottom: 8,
        }}>{isNote ? `${item.noteType} note` : 'find'} · {item.age}</div>

        {item.media && (
          <h2 style={{
            margin: '0 0 12px',
            fontFamily: SERIF, fontWeight: 500, fontSize: 22,
            lineHeight: 1.22, color: P.ink, textWrap: 'balance',
          }}>{item.title}</h2>
        )}

        {!isNote && item.source && (
          <div style={{
            fontFamily: SANS, fontSize: 13, color: P.inkSoft,
            marginBottom: 14, lineHeight: 1.45,
          }}>{item.source}</div>
        )}

        {item.note && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 13.5,
            color: P.inkSoft, lineHeight: 1.5,
            borderLeft: `2px solid ${P.markLine}`,
            paddingLeft: 12, marginBottom: 16,
          }}>{item.owner}&rsquo;s note: {item.note}</div>
        )}

        <div style={{
          padding: '10px 12px', marginBottom: 18,
          background: P.paper,
          border: `1px solid ${P.paperEdge}`, borderRadius: 2,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '.16em',
            textTransform: 'uppercase', color: P.inkFaint, marginBottom: 5,
          }}>from</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: P.ink }}>
            <strong style={{ color: P.mark }}>{item.owner}</strong>&rsquo;s thread —{' '}
            <em style={{ fontFamily: SERIF, color: P.inkSoft }}>&ldquo;{item.threadQ}&rdquo;</em>
          </div>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 8.5,
            letterSpacing: '.14em', textTransform: 'uppercase',
            color: item.inCourtyard ? P.mark : P.inkFaint }}>
            {item.inCourtyard ? `in courtyard · ${item.courtyardName}` : 'personal thread'}
            {alreadyInCourtyard && <span style={{ color: P.inkSoft }}> · you&rsquo;re already in</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {canJoin && (
            <button onClick={() => onAction('join', item)} style={primaryBtn()}>
              ask to join the courtyard
            </button>
          )}
          {canMerge && (
            <button onClick={() => onAction('merge', item)} style={primaryBtn()}>
              request to merge threads
            </button>
          )}
          <button
            onClick={() => setComposing(true)}
            disabled={composing}
            style={{
              ...secondaryBtn(),
              ...(composing ? { background: P.markSoft, cursor: 'default' } : null),
            }}
            onMouseEnter={(e) => { if (!composing) e.currentTarget.style.background = P.markSoft; }}
            onMouseLeave={(e) => { if (!composing) e.currentTarget.style.background = 'transparent'; }}>
            {composing ? 'composing event…' : 'propose an event'}
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
                mediaType: isNote ? (item.noteType || 'note') : 'find',
                fromOwner: item.owner,
              });
              if (res) {
                const q = res.thread.q || 'your thread';
                setSavedTo(q.length > 44 ? q.slice(0, 44) + '…' : q);
                onAction('save', item, { threadQ: res.thread.q });
              }
              e.target.value = '';
            }}
            style={ghostBtn()}>
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
          }} style={ghostBtn()}>spawn a new thread →</button>
        </div>

        {savedTo && (
          <div style={{
            marginTop: 14, fontFamily: SERIF, fontStyle: 'italic',
            fontSize: 13.5, color: P.mark,
          }}>Saved to &ldquo;{savedTo}&rdquo;. Pinned there now.</div>
        )}

        {composing && (
          <EventComposer item={item}
            onSend={(payload) => { setComposing(false); onAction('event', item, payload); }}
            onCancel={() => setComposing(false)} />
        )}
      </div>
    </div>
  );
}

function primaryBtn() {
  return {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: P.paperCard,
    background: P.mark, border: 'none',
    padding: '8px 14px', borderRadius: 2, cursor: 'pointer',
  };
}
function secondaryBtn() {
  return {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: P.mark,
    background: 'transparent', border: `1px solid ${P.markLine}`,
    padding: '8px 14px', borderRadius: 2, cursor: 'pointer',
  };
}
function ghostBtn() {
  return {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: P.inkSoft,
    background: 'transparent', border: `1px solid ${P.paperEdge}`,
    padding: '8px 12px', borderRadius: 2, cursor: 'pointer',
  };
}
function navBtn(active) {
  return {
    background: 'transparent', border: 'none', padding: 0,
    fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
    textTransform: 'uppercase',
    color: active ? P.mark : P.inkGhost,
    cursor: active ? 'pointer' : 'default',
  };
}

// ─── Mode toggle ───────────────────────────────────────────────────────
function ModeToggle({ mode, setMode }) {
  const opts = [{ id: 'wander', label: 'wander' }, { id: 'focus', label: 'focus' }];
  return (
    <div data-ui style={{
      display: 'inline-flex', background: P.paperCard,
      border: `1px solid ${P.paperEdge}`, borderRadius: 99,
      padding: 3, gap: 2,
    }}>
      {opts.map(o => {
        const active = mode === o.id;
        return (
          <button key={o.id} onClick={() => setMode(o.id)} style={{
            background: active ? P.ink : 'transparent',
            color: active ? P.paper : P.inkSoft,
            border: 'none', borderRadius: 99,
            padding: '5px 14px', cursor: active ? 'default' : 'pointer',
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '.14em',
            textTransform: 'uppercase', fontWeight: active ? 600 : 500,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ─── The room ──────────────────────────────────────────────────────────
const CANVAS_W = 4000;
const CANVAS_H = 2700;

export function PromenadeRoom({ navigate, cardId }) {
  const allItems = useMemo(() => getPromenadeItems(), []);
  const { clusters, loose } = useMemo(() => buildClusters(allItems), [allItems]);
  const { positions, homes } = useMemo(
    () => layoutCards({ clusters, loose }, CANVAS_W, CANVAS_H),
    [clusters, loose]
  );
  const ownCourtyards = useMemo(() => ownCourtyardNames(), []);

  // Items actually rendered = clustered items + loose items. Drop the rest.
  const items = useMemo(() => {
    const clusteredIds = new Set(clusters.flatMap(c => c.items.map(i => i.id)));
    const looseIds     = new Set(loose.map(i => i.id));
    return allItems.filter(it => clusteredIds.has(it.id) || looseIds.has(it.id));
  }, [allItems, clusters, loose]);

  const [mode, setMode] = useState('wander');
  const [toast, setToast] = useState(null);

  // The focused card is URL-driven: #room=promenade&card=<id>. The
  // wander overlay shows when a cardId is present; focus mode defaults
  // to the first item when no card is specified.
  const focusedIdx = useMemo(() => {
    if (!cardId) return null;
    const idx = items.findIndex(it => it.id === cardId);
    return idx === -1 ? null : idx;
  }, [items, cardId]);

  const openCard = (id) => navigate('promenade', { card: id });
  const closeCard = () => navigate('promenade');

  // Entering focus mode with no card in the URL → land on the first one.
  useEffect(() => {
    if (mode === 'focus' && !cardId && items.length > 0) {
      openCard(items[0].id);
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
        color: P.inkFaint, fontFamily: MONO,
      }}>§05 Promenade</div>
      <div style={{
        fontFamily: SERIF, fontStyle: 'italic', fontSize: 22,
        color: P.ink, marginTop: -2,
      }}>the wandering walk</div>
      <div style={{ pointerEvents: 'auto', marginTop: 4 }}>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>
    </div>
  );

  const focusOverlay = focusedIdx !== null && mode === 'wander' && (
    <>
      <div data-ui onClick={closeCard} style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(31,28,23,0.45)', backdropFilter: 'blur(2px)',
      }} />
      <div data-ui style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', zIndex: 61,
      }}>
        <FocusCard
          item={items[focusedIdx]} ownCourtyards={ownCourtyards}
          onAction={onAction} navigate={navigate}
          position={focusedIdx + 1} total={items.length}
          onPrev={focusedIdx > 0 ? () => openCard(items[focusedIdx - 1].id) : null}
          onNext={focusedIdx < items.length - 1 ? () => openCard(items[focusedIdx + 1].id) : null}
        />
        <button data-ui onClick={closeCard} style={{
          position: 'fixed', top: 24, right: 24, zIndex: 62,
          background: P.paperCard, border: `1px solid ${P.paperEdge}`,
          fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
          textTransform: 'uppercase', color: P.inkSoft,
          cursor: 'pointer', padding: '7px 12px', borderRadius: 2,
        }}>close ✕</button>
      </div>
    </>
  );

  // ─── WANDER ───────────────────────────────────────────────────────
  if (mode === 'wander') {
    return (
      <PanZoomCanvas
        canvasW={CANVAS_W} canvasH={CANVAS_H}
        background={P.paper}
        groundDot="#5a4f3e"
        initialZoom={0.62}
        panHint="drag · wheel zoom · cards cluster by courtyard"
        overlay={
          <>
            {eyebrow}
            {breadcrumb}
            <Toast message={toast} onClose={() => setToast(null)} />
            {focusOverlay}
          </>
        }>
        {({ zoom }) => {
          const detail = zoom < 0.55 ? 'compact' : 'full';
          return (
            <>
              {/* courtyard halos sit under everything */}
              {clusters.map(c => homes[c.id] && (
                <CourtyardHalo key={'h-'+c.id} cluster={c} home={homes[c.id]} />
              ))}
              {/* tether lines from each clustered item back to its courtyard
                  home. Starts just past the label keepout, ends just before
                  the card edge — drawn under the cards. */}
              <svg style={{
                position: 'absolute', left: 0, top: 0,
                width: CANVAS_W, height: CANVAS_H,
                pointerEvents: 'none', overflow: 'visible',
              }}>
                {clusters.flatMap(c => {
                  const home = homes[c.id];
                  if (!home) return [];
                  return c.items.map(it => {
                    const p = positions.get(it.id);
                    if (!p) return null;
                    const dx = p.x - home.x, dy = p.y - home.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const ux = dx / len, uy = dy / len;
                    const sx = home.x + ux * 220;
                    const sy = home.y + uy * 220;
                    const ex = p.x - ux * 130;
                    const ey = p.y - uy * 130;
                    return (
                      <line key={it.id}
                        x1={sx} y1={sy} x2={ex} y2={ey}
                        stroke={`hsl(${c.hue}, 40%, 30%)`}
                        strokeWidth={2}
                        strokeOpacity={0.32}
                        strokeDasharray="7 8" />
                    );
                  });
                })}
              </svg>
              {/* courtyard labels — always readable; the layout keeps cards out */}
              {clusters.map(c => homes[c.id] && (
                <CourtyardLabel key={'l-'+c.id} cluster={c} home={homes[c.id]} />
              ))}
              {/* cards */}
              {items.map((it, i) => {
                const p = positions.get(it.id);
                if (!p) return null;
                return (
                  <WanderCard key={it.id} item={it} x={p.x} y={p.y} rot={p.rot}
                    detail={detail}
                    onOpen={() => openCard(it.id)} />
                );
              })}
            </>
          );
        }}
      </PanZoomCanvas>
    );
  }

  // ─── FOCUS ─────────────────────────────────────────────────────────
  const it = focusedIdx !== null ? items[focusedIdx] : null;
  return (
    <Room background={P.paper}>
      {eyebrow}
      {breadcrumb}
      <Toast message={toast} onClose={() => setToast(null)} />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '140px 40px 100px',
      }}>
        {it ? (
          <FocusCard
            item={it} ownCourtyards={ownCourtyards}
            onAction={onAction} navigate={navigate}
            position={focusedIdx + 1} total={items.length}
            onPrev={focusedIdx > 0 ? () => openCard(items[focusedIdx - 1].id) : null}
            onNext={focusedIdx < items.length - 1 ? () => openCard(items[focusedIdx + 1].id) : null}
          />
        ) : (
          <div style={{ fontFamily: SERIF, fontStyle: 'italic',
            color: P.inkFaint, fontSize: 16 }}>The promenade is empty today.</div>
        )}
      </div>
    </Room>
  );
}

export default PromenadeRoom;
