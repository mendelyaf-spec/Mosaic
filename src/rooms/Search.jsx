// DOS — Depth of Search (§03). Phase 2 wiring.
//
// Input → engine → variable cards. The user types (or arrives with a question
// from a thread), the engine characterizes + fills one card per selected move,
// each card carrying an `estimatedMinutes` time chip. A settings drawer lets
// the user pick which moves run and the time budget per item.
//
// This room is the engine's UI surface. It does NOT render inside the pan/zoom
// canvas — it's a focused, single-column workbench.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Aperture, Breadcrumb, FONT_SERIF, FONT_SANS, FONT_MONO } from '../shell/shell.jsx';
import { characterize, runFeedFill, articulationDiff } from '../lib/mosaicEngine.js';
import { loadMoves, loadPrefs, savePrefs, saveUserMove, TIME_OPTIONS } from '../lib/moves.js';
import { buildThreadFromSession, saveThread } from '../lib/threads.js';
import { WM } from '../data/wm-data.js';

function timeChipLabel(mins) {
  if (mins == null || mins === 0) return '—';
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} day`;
}

function timeChipColor(mins) {
  // surface → middle → well, by reported item time, not by move identity.
  if (mins == null || mins === 0) return { ink: '#3A2D86', soft: '#EDE8F8' };
  if (mins <= 15) return { ink: '#1A5C46', soft: '#E8F5F0' };
  if (mins <= 120) return { ink: '#75580D', soft: '#F8F0DC' };
  return { ink: '#3A2D86', soft: '#EDE8F8' };
}

function SignalBar({ value, onChange }) {
  const opts = [
    { v: 'dismiss', label: 'not for me', glyph: '×' },
    { v: 'moved',   label: 'moved me',   glyph: '✦' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10,
      borderTop: '1px dashed rgba(26,23,20,.08)' }}>
      {opts.map(o => {
        const active = value === o.v;
        const isMoved = o.v === 'moved';
        return (
          <button key={o.v}
            onClick={() => onChange(active ? null : o.v)}
            style={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.1em',
              textTransform: 'uppercase', fontWeight: 600,
              padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${active ? (isMoved ? '#1A5C46' : '#8C3A4F') : 'rgba(26,23,20,.15)'}`,
              background: active ? (isMoved ? '#E3EEE9' : '#F5E4E8') : 'transparent',
              color: active ? (isMoved ? '#1A5C46' : '#8C3A4F') : '#7A756F',
            }}>
            <span style={{ marginRight: 5 }}>{o.glyph}</span>{o.label}
          </button>
        );
      })}
    </div>
  );
}

function MoveCard({ move, item, loading, signal, onSignal }) {
  const accent = '#1A5C46';
  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${signal === 'moved' ? 'rgba(26,92,70,.5)' : signal === 'dismiss' ? 'rgba(26,23,20,.06)' : 'rgba(26,23,20,.08)'}`,
      borderRadius: 6,
      padding: '16px 18px',
      boxShadow: signal === 'moved'
        ? '0 2px 14px rgba(26,92,70,.14)'
        : '0 1px 8px rgba(26,23,20,.04)',
      opacity: loading ? 0.6 : signal === 'dismiss' ? 0.55 : 1,
      transition: 'opacity .2s, box-shadow .2s, border-color .2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 10, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
          textTransform: 'uppercase', color: accent,
          background: '#E8F5F0', border: `1px solid ${accent}33`,
          padding: '3px 8px', borderRadius: 2, fontWeight: 600,
        }}>{move.label}</span>
        <span style={{
          fontFamily: FONT_SANS, fontSize: 11, color: '#9A968F',
        }}>{move.blurb}</span>
        {!loading && item?.estimatedMinutes != null && (() => {
          const c = timeChipColor(item.estimatedMinutes);
          return (
            <span style={{
              marginLeft: 'auto',
              fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
              textTransform: 'uppercase', color: c.ink,
              background: c.soft, border: `1px solid ${c.ink}33`,
              padding: '3px 8px', borderRadius: 2, fontWeight: 500,
            }}>{timeChipLabel(item.estimatedMinutes)}</span>
          );
        })()}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 12, background: 'rgba(26,23,20,.05)', borderRadius: 3,
              width: i === 3 ? '60%' : '100%',
            }} />
          ))}
        </div>
      )}

      {!loading && item && (
        <>
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', textDecoration: 'none', color: 'inherit',
            marginBottom: 6,
          }}>
            <div style={{
              fontFamily: FONT_SERIF, fontStyle: 'italic', fontWeight: 400,
              fontSize: 19, lineHeight: 1.3, color: '#1A1714',
              marginBottom: 4,
            }}>{item.title}</div>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 10, color: '#5E5A55',
              letterSpacing: '.04em',
            }}>{item.source} {item.mediaType ? `· ${item.mediaType}` : ''}</div>
          </a>
          {item.preview && (
            <p style={{
              margin: '8px 0 6px', fontFamily: FONT_SANS, fontSize: 13,
              lineHeight: 1.45, color: '#3A3530',
            }}>{item.preview}</p>
          )}
          {item.why && (
            <p style={{
              margin: '4px 0 0', fontFamily: FONT_SANS, fontSize: 11.5,
              lineHeight: 1.4, color: '#7A756F', fontStyle: 'italic',
              paddingTop: 8, borderTop: '1px dashed rgba(26,23,20,.08)',
            }}>{item.why}</p>
          )}
          {item.failed && (
            <div style={{
              fontFamily: FONT_MONO, fontSize: 10, color: '#8C3A4F',
              letterSpacing: '.08em',
            }}>This slot failed three attempts. Try a different question or move.</div>
          )}
          {!item.failed && onSignal && (
            <SignalBar value={signal} onChange={onSignal} />
          )}
        </>
      )}
    </div>
  );
}

function SettingsDrawer({ open, prefs, setPrefs, allMoves, onClose, onCoinMove }) {
  const [showCoinForm, setShowCoinForm] = useState(false);
  const [coinLabel, setCoinLabel] = useState('');
  const [coinBlurb, setCoinBlurb] = useState('');
  const [coinPrompt, setCoinPrompt] = useState('');

  if (!open) return null;

  const toggleMove = (id) => {
    const next = prefs.selectedMoves.includes(id)
      ? prefs.selectedMoves.filter(m => m !== id)
      : [...prefs.selectedMoves, id];
    setPrefs({ selectedMoves: next });
  };

  const submitCoin = () => {
    if (!coinLabel.trim() || !coinPrompt.trim()) return;
    onCoinMove({
      label: coinLabel.trim().toUpperCase().slice(0, 24),
      blurb: coinBlurb.trim().slice(0, 80),
      promptDescription: coinPrompt.trim(),
    });
    setCoinLabel(''); setCoinBlurb(''); setCoinPrompt('');
    setShowCoinForm(false);
  };

  return (
    <>
      <div data-ui onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(31,28,23,0.35)', backdropFilter: 'blur(2px)',
      }} />
      <div data-ui style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 92vw)', background: '#FAF5E9',
        borderLeft: '1px solid rgba(26,23,20,.1)',
        boxShadow: '-20px 0 60px rgba(40,30,15,.2)',
        zIndex: 61, overflow: 'auto', padding: '32px 28px',
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.18em',
          textTransform: 'uppercase', color: '#9A968F', marginBottom: 8,
        }}>§03 Settings</div>
        <h1 style={{
          fontFamily: FONT_SERIF, fontStyle: 'italic', fontWeight: 300,
          fontSize: 32, margin: '0 0 24px', color: '#1A1714',
        }}>How DOS works</h1>

        <h2 style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.16em',
          textTransform: 'uppercase', color: '#5E5A55',
          margin: '0 0 10px',
        }}>Time per item</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
          {TIME_OPTIONS.map(o => {
            const active = prefs.maxTimePerItem === o.mins;
            return (
              <button key={String(o.mins)} onClick={() => setPrefs({ maxTimePerItem: o.mins })}
                title={o.cost}
                style={{
                  fontFamily: FONT_SANS, fontSize: 11, fontWeight: 500,
                  padding: '5px 11px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${active ? '#1A5C46' : 'rgba(26,23,20,.12)'}`,
                  background: active ? '#E3EEE9' : '#FFFFFF',
                  color: active ? '#1A5C46' : '#3A3530',
                }}>{o.label}</button>
            );
          })}
        </div>

        <h2 style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.16em',
          textTransform: 'uppercase', color: '#5E5A55',
          margin: '0 0 4px',
        }}>Moves library</h2>
        <p style={{
          fontFamily: FONT_SANS, fontSize: 12, color: '#7A756F',
          margin: '0 0 12px', lineHeight: 1.45,
        }}>Pick which slots DOS will fill for you. Add your own.</p>

        {['starter', 'community', 'user'].map(cat => {
          const moves = allMoves.filter(m => m.category === cat);
          if (!moves.length) return null;
          const heading = cat === 'starter' ? 'Starters'
                        : cat === 'community' ? 'Community-coined'
                        : 'Your moves';
          return (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{
                fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.14em',
                textTransform: 'uppercase', color: '#9A968F',
                margin: '0 0 8px',
              }}>{heading}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {moves.map(m => {
                  const active = prefs.selectedMoves.includes(m.id);
                  return (
                    <label key={m.id} style={{
                      display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '8px 10px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${active ? '#1A5C46' : 'rgba(26,23,20,.1)'}`,
                      background: active ? '#E8F5F0' : '#FFFFFF',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={active}
                          onChange={() => toggleMove(m.id)}
                          style={{ margin: 0 }} />
                        <span style={{
                          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.1em',
                          fontWeight: 600, color: active ? '#1A5C46' : '#3A3530',
                        }}>{m.label}</span>
                      </span>
                      <span style={{
                        fontFamily: FONT_SANS, fontSize: 11, color: '#7A756F',
                        marginLeft: 22, fontStyle: 'italic',
                      }}>{m.blurb}</span>
                      {m.coiner && (
                        <span style={{
                          fontFamily: FONT_MONO, fontSize: 9, color: '#B0ADA6',
                          marginLeft: 22,
                        }}>{m.coiner} · {m.uses}×</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!showCoinForm ? (
          <button onClick={() => setShowCoinForm(true)} style={{
            marginTop: 8, padding: '8px 14px', borderRadius: 3,
            fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
            textTransform: 'uppercase', fontWeight: 600,
            background: 'transparent', border: '1px dashed rgba(26,23,20,.25)',
            color: '#5E5A55', cursor: 'pointer',
          }}>+ Coin a move</button>
        ) : (
          <div style={{
            marginTop: 8, padding: 14, background: '#FFFFFF',
            border: '1px solid rgba(26,23,20,.12)', borderRadius: 4,
          }}>
            <input value={coinLabel} onChange={e => setCoinLabel(e.target.value)}
              placeholder="MOVE NAME (e.g. UNSETTLE)"
              style={{
                width: '100%', marginBottom: 8, padding: '6px 8px',
                fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.1em',
                border: '1px solid rgba(26,23,20,.15)', borderRadius: 3,
              }} />
            <input value={coinBlurb} onChange={e => setCoinBlurb(e.target.value)}
              placeholder="short blurb — what this move does in 3-5 words"
              style={{
                width: '100%', marginBottom: 8, padding: '6px 8px',
                fontFamily: FONT_SANS, fontSize: 12,
                border: '1px solid rgba(26,23,20,.15)', borderRadius: 3,
              }} />
            <textarea value={coinPrompt} onChange={e => setCoinPrompt(e.target.value)}
              placeholder="Long prompt description. Tell the engine what to look for when filling this slot. Any human or computer language. Be specific about register, kind of source, what to avoid. The longer the better."
              rows={6}
              style={{
                width: '100%', marginBottom: 8, padding: '8px 10px',
                fontFamily: FONT_SANS, fontSize: 12, lineHeight: 1.4,
                border: '1px solid rgba(26,23,20,.15)', borderRadius: 3,
                resize: 'vertical',
              }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={submitCoin} style={{
                padding: '6px 12px', borderRadius: 3, cursor: 'pointer',
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
                textTransform: 'uppercase', fontWeight: 600,
                background: '#1A5C46', color: '#F6F3EC', border: 'none',
              }}>Coin it</button>
              <button onClick={() => setShowCoinForm(false)} style={{
                padding: '6px 12px', borderRadius: 3, cursor: 'pointer',
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
                textTransform: 'uppercase', fontWeight: 500,
                background: 'transparent', color: '#7A756F',
                border: '1px solid rgba(26,23,20,.15)',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function SearchRoom({ navigate, fromThreadId }) {
  const fromThread = useMemo(() => {
    if (!fromThreadId) return null;
    const all = [...WM.THREADS, ...(WM.KINDRED_THREADS || [])];
    return all.find(t => t.id === fromThreadId) || null;
  }, [fromThreadId]);

  const [prefsState, setPrefsState] = useState(loadPrefs);
  const [allMoves, setAllMoves] = useState(loadMoves);
  const setPrefs = (patch) => setPrefsState(savePrefs(patch));

  const selectedMoves = useMemo(
    () => prefsState.selectedMoves.map(id => allMoves.find(m => m.id === id)).filter(Boolean),
    [prefsState.selectedMoves, allMoves]
  );

  const [input, setInput] = useState(fromThread ? fromThread.q : '');
  const [submitted, setSubmitted] = useState(null);
  const [characterization, setCharacterization] = useState(null);
  const [items, setItems] = useState({}); // moveId -> item
  const [loadingMoves, setLoadingMoves] = useState({});
  // idle | characterizing | filling | done | reviewing | diffing | diffed | error
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signals, setSignals] = useState({});   // moveId -> 'moved' | 'dismiss' | null
  const [evolvedQ, setEvolvedQ] = useState('');
  const [diffMoves, setDiffMoves] = useState([]);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const onSignal = (moveId, val) =>
    setSignals(prev => ({ ...prev, [moveId]: val }));

  const movedCount = Object.values(signals).filter(v => v === 'moved').length;
  const signalledCount = Object.values(signals).filter(Boolean).length;

  const onCoinMove = (m) => {
    const saved = saveUserMove(m);
    setAllMoves(loadMoves());
    setPrefs({ selectedMoves: [...prefsState.selectedMoves, saved.id] });
  };

  const run = async (text) => {
    if (!text.trim() || selectedMoves.length === 0) return;
    setSubmitted(text);
    setItems({});
    setSignals({});
    setEvolvedQ('');
    setDiffMoves([]);
    setLoadingMoves(Object.fromEntries(selectedMoves.map(m => [m.id, true])));
    setPhase('characterizing');
    setError(null);
    try {
      const ch = await characterize(text, { fromThread });
      setCharacterization(ch);
      setPhase('filling');
      const results = await runFeedFill(text, selectedMoves, ch, {
        fromThread,
        maxTimePerItem: prefsState.maxTimePerItem,
      }, (moveId, item) => {
        setItems(prev => ({ ...prev, [moveId]: item }));
        setLoadingMoves(prev => ({ ...prev, [moveId]: false }));
      });
      // results is already streamed via onSlotDone; the final assignment is a safety net.
      const byMove = {};
      for (const it of results) byMove[it.moveId] = it;
      setItems(byMove);
      setLoadingMoves({});
      setPhase('done');
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setPhase('error');
      setLoadingMoves({});
    }
  };

  const goReview = () => {
    setEvolvedQ(submitted || input);
    setPhase('reviewing');
  };

  const runDiff = async () => {
    setPhase('diffing');
    setError(null);
    try {
      const sharpenedBy = selectedMoves
        .filter(m => signals[m.id] === 'moved')
        .map(m => {
          const it = items[m.id];
          return `${m.label}: ${it?.title || ''}`;
        });
      const moves = await articulationDiff(submitted, evolvedQ, sharpenedBy);
      setDiffMoves(moves);
      setPhase('diffed');
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setPhase('diffed'); // still let them save; diff is best-effort
    }
  };

  const saveSession = () => {
    const orderedItems = selectedMoves
      .map(m => items[m.id])
      .filter(Boolean);
    const thread = buildThreadFromSession({
      originalQ: submitted,
      evolvedQ,
      characterization,
      moves: selectedMoves,
      items: orderedItems,
      signals,
      diffMoves,
    });
    saveThread(thread);
    navigate('thread', { id: thread.id });
  };

  const busy = phase === 'characterizing' || phase === 'filling' || phase === 'diffing';

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto',
      background: '#F2EFE6', fontFamily: FONT_SANS, color: '#1A1714',
    }}>
      <Aperture position="left" label={fromThread ? 'Back to thread' : 'Home'}
        hint={fromThread ? '← back to your thread' : '← home'}
        onActivate={() => fromThread ? navigate('thread', { id: fromThread.id }) : navigate('home')} />

      <Breadcrumb here="search" navigate={navigate}
        trail={fromThread
          ? [{ label: 'Home', onClick: () => navigate('home') },
             { label: 'Thread', onClick: () => navigate('thread', { id: fromThread.id }) },
             { label: 'DOS' }]
          : [{ label: 'Home', onClick: () => navigate('home') },
             { label: 'DOS' }]} />

      <div style={{
        maxWidth: 720, margin: '0 auto', padding: '60px 28px 120px',
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.18em',
          textTransform: 'uppercase', color: '#9A968F', marginBottom: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>§03 DOS · depth of search{fromThread && <span style={{ color: '#1A5C46' }}> · from your thread</span>}</span>
          <button onClick={() => setSettingsOpen(true)} style={{
            fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
            textTransform: 'uppercase', color: '#5E5A55',
            background: 'transparent', border: '1px solid rgba(26,23,20,.15)',
            padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
          }}>⚙ settings</button>
        </div>
        <h1 style={{
          fontFamily: FONT_SERIF, fontStyle: 'italic', fontWeight: 300,
          fontSize: 36, lineHeight: 1.15, margin: '0 0 22px', color: '#1A1714',
        }}>
          {fromThread ? 'Take your question down.' : 'Bring a question down.'}
        </h1>

        <textarea ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(input); }}
          placeholder="Type a question. Cmd/Ctrl+Enter to run."
          rows={3}
          disabled={phase === 'characterizing' || phase === 'filling'}
          style={{
            width: '100%', fontFamily: FONT_SERIF, fontSize: 20, fontStyle: 'italic',
            fontWeight: 300, color: '#1A1714', lineHeight: 1.4,
            background: '#FFFFFF', border: '1px solid rgba(26,23,20,.12)',
            borderRadius: 6, padding: '14px 16px', resize: 'vertical',
            marginBottom: 14,
          }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          flexWrap: 'wrap', marginBottom: 20,
        }}>
          <button onClick={() => run(input)}
            disabled={phase === 'characterizing' || phase === 'filling' || !input.trim() || selectedMoves.length === 0}
            style={{
              fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.14em',
              textTransform: 'uppercase', fontWeight: 600,
              padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
              background: '#1A5C46', color: '#F6F3EC', border: 'none',
              opacity: (phase === 'characterizing' || phase === 'filling' || !input.trim() || selectedMoves.length === 0) ? 0.4 : 1,
            }}>
            {phase === 'characterizing' ? 'Reading…' : phase === 'filling' ? 'Filling slots…' : 'Take it down'}
          </button>
          <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: '#7A756F' }}>
            {selectedMoves.length} move{selectedMoves.length === 1 ? '' : 's'} ·
            time budget: {prefsState.maxTimePerItem == null ? 'no limit' : `${prefsState.maxTimePerItem} min`}
          </span>
        </div>

        {phase === 'characterizing' && (
          <div style={{
            fontFamily: FONT_SANS, fontSize: 13, color: '#5E5A55', fontStyle: 'italic',
            marginBottom: 18,
          }}>Reading the question's structure…</div>
        )}

        {characterization && (
          <details style={{
            marginBottom: 22, padding: '10px 14px',
            background: 'rgba(255,255,255,.5)', border: '1px solid rgba(26,23,20,.06)',
            borderRadius: 4,
          }}>
            <summary style={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.14em',
              textTransform: 'uppercase', color: '#5E5A55', cursor: 'pointer',
            }}>structural reading · {characterization.register} register · {characterization.domain}</summary>
            <div style={{
              marginTop: 8, fontFamily: FONT_SANS, fontSize: 12, lineHeight: 1.55,
              color: '#3A3530',
            }}>
              <div><b>Opening move:</b> {characterization.openingMove}</div>
              {characterization.presuppositions?.length > 0 && (
                <div style={{ marginTop: 4 }}><b>Presuppositions:</b> {characterization.presuppositions.join('; ')}</div>
              )}
              {characterization.absent?.length > 0 && (
                <div style={{ marginTop: 4 }}><b>Conspicuously absent:</b> {characterization.absent.join('; ')}</div>
              )}
            </div>
          </details>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selectedMoves.map(m => (
            <MoveCard key={m.id} move={m}
              item={items[m.id]}
              loading={!!loadingMoves[m.id]}
              signal={signals[m.id] || null}
              onSignal={
                (phase === 'done' || phase === 'reviewing')
                  ? (v) => onSignal(m.id, v)
                  : null
              } />
          ))}
        </div>

        {/* ---- after results: review / diff / save ---- */}
        {phase === 'done' && (
          <div style={{
            marginTop: 22, padding: '16px 18px', borderRadius: 6,
            background: 'rgba(255,255,255,.6)', border: '1px solid rgba(26,23,20,.08)',
          }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: '#5E5A55', marginBottom: 12 }}>
              Mark what landed. {signalledCount > 0
                ? `${movedCount} moved you, ${signalledCount - movedCount} dismissed.`
                : 'Tap “moved me” or “not for me” on the cards above — or skip straight to review.'}
            </div>
            <button onClick={goReview} style={{
              fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.14em',
              textTransform: 'uppercase', fontWeight: 600,
              padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
              background: '#1A5C46', color: '#F6F3EC', border: 'none',
            }}>Review →</button>
          </div>
        )}

        {(phase === 'reviewing' || phase === 'diffing' || phase === 'diffed') && (
          <div style={{
            marginTop: 22, padding: '20px 22px', borderRadius: 6,
            background: '#FBF8F0', border: '1px solid rgba(26,23,20,.1)',
          }}>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.16em',
              textTransform: 'uppercase', color: '#9A968F', marginBottom: 8,
            }}>you opened with</div>
            <div style={{
              fontFamily: FONT_SERIF, fontStyle: 'italic', fontWeight: 300,
              fontSize: 18, color: '#5E5A55', marginBottom: 18, lineHeight: 1.35,
            }}>“{submitted}”</div>

            <div style={{
              fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.16em',
              textTransform: 'uppercase', color: '#9A968F', marginBottom: 8,
            }}>after reading, your question is</div>
            <textarea
              value={evolvedQ}
              onChange={e => setEvolvedQ(e.target.value)}
              rows={3}
              disabled={phase === 'diffing'}
              style={{
                width: '100%', fontFamily: FONT_SERIF, fontSize: 19, fontStyle: 'italic',
                fontWeight: 300, color: '#1A1714', lineHeight: 1.4,
                background: '#FFFFFF', border: '1px solid rgba(26,23,20,.15)',
                borderRadius: 6, padding: '12px 14px', resize: 'vertical',
                marginBottom: 14,
              }} />

            {phase !== 'diffed' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={runDiff} disabled={phase === 'diffing' || !evolvedQ.trim()}
                  style={{
                    fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.14em',
                    textTransform: 'uppercase', fontWeight: 600,
                    padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
                    background: '#1A5C46', color: '#F6F3EC', border: 'none',
                    opacity: (phase === 'diffing' || !evolvedQ.trim()) ? 0.4 : 1,
                  }}>
                  {phase === 'diffing' ? 'Reading the shift…' : 'See what moved →'}
                </button>
                <button onClick={saveSession} style={{
                  fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.14em',
                  textTransform: 'uppercase', fontWeight: 500,
                  padding: '8px 16px', borderRadius: 3, cursor: 'pointer',
                  background: 'transparent', color: '#5E5A55',
                  border: '1px solid rgba(26,23,20,.18)',
                }}>Skip — just save</button>
              </div>
            )}

            {phase === 'diffed' && (
              <>
                <div style={{
                  fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '.16em',
                  textTransform: 'uppercase', color: '#9A968F',
                  margin: '6px 0 10px',
                }}>what moved</div>
                {diffMoves.length === 0 && (
                  <div style={{
                    fontFamily: FONT_SANS, fontSize: 13, color: '#7A756F',
                    fontStyle: 'italic', marginBottom: 16,
                  }}>The articulation barely changed — that's a finding too.</div>
                )}
                {diffMoves.map((d, i) => (
                  <div key={i} style={{
                    marginBottom: 12, paddingLeft: 14,
                    borderLeft: '2px solid rgba(26,92,70,.4)',
                  }}>
                    <div style={{
                      fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '.1em',
                      textTransform: 'uppercase', color: '#1A5C46', fontWeight: 600,
                      marginBottom: 3,
                    }}>{d.label}</div>
                    <div style={{
                      fontFamily: FONT_SANS, fontSize: 13, lineHeight: 1.5, color: '#3A3530',
                    }}>{d.content}</div>
                  </div>
                ))}
                <button onClick={saveSession} style={{
                  marginTop: 8,
                  fontFamily: FONT_MONO, fontSize: 11, letterSpacing: '.14em',
                  textTransform: 'uppercase', fontWeight: 600,
                  padding: '9px 20px', borderRadius: 3, cursor: 'pointer',
                  background: '#1A5C46', color: '#F6F3EC', border: 'none',
                }}>Save this session as a thread →</button>
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 18, padding: '12px 14px', borderRadius: 4,
            background: '#F5E4E8', border: '1px solid #8C3A4F33',
            fontFamily: FONT_SANS, fontSize: 13, color: '#5E2E3E',
          }}>
            <b>Engine error:</b> {error}
          </div>
        )}

        {selectedMoves.length === 0 && (
          <div style={{
            marginTop: 18, padding: '12px 14px', borderRadius: 4,
            background: '#F8F0DC', border: '1px solid #75580D33',
            fontFamily: FONT_SANS, fontSize: 13, color: '#5E5A55',
          }}>
            No moves selected. Open <b>⚙ settings</b> and pick at least one.
          </div>
        )}
      </div>

      <SettingsDrawer open={settingsOpen}
        prefs={prefsState} setPrefs={setPrefs}
        allMoves={allMoves}
        onClose={() => setSettingsOpen(false)}
        onCoinMove={onCoinMove} />
    </div>
  );
}

export default SearchRoom;
