// POD (§07/§08) — a curated, time-boxed slice of Mosaic for a child.
//
// PodRoom is the child's restricted surface: a live countdown, whichever
// threads a parent has curated in, and two ways to ask for more — request
// a locked thread, or request extra time. Both land as pending requests
// for PodAdminRoom.
//
// PodAdminRoom is the parent's control panel: open/close the session and
// set its length, approve or decline pending requests, and curate which
// threads are visible in the pod at all. Both rooms read/write the same
// `mosaic.pod.v1` blob, so an approval made here shows up there on next
// read (§07/§08 poll each other via a 1s tick — see useNow below).

import { useState, useEffect, useMemo } from 'react';
import { Room, Breadcrumb, FONT_SERIF as S, FONT_SANS as F, FONT_MONO as M } from '../shell/shell.jsx';
import {
  getAllThreads, getThreadById,
  loadPod, addPodRequest,
  openPodSession, closePodSession, extendPodSession,
  addPodCuration, removePodCuration, resolvePodRequest,
} from '../lib/threads.js';

const INK        = '#1A1714';
const INK_SOFT   = '#3A3530';
const INK_FAINT  = '#9A968F';
const INK_GHOST  = '#C0BDB6';
const PAPER      = '#FBF8F0';
const PAPER_EDGE = '#E0DCD0';
const POD        = '#7C3F7C';
const POD_BG     = 'rgba(140,90,140,.08)';
const POD_BORDER = 'rgba(140,90,140,.35)';

// ── shared bits ─────────────────────────────────────────────────────
// Pod state lives in localStorage, not React state — both rooms (and
// both personas, in separate tabs) read it fresh. useClock subscribes
// to the passage of time on a 1s cadence (for the live countdown) and
// returns a manual bump so an action (approve, open, close, …) can
// force an immediate re-read right after it writes.
function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return [now, () => setNow(Date.now())];
}

function remainingMs(session, now) {
  if (!session.open || !session.openedAt) return 0;
  return Math.max(0, session.openedAt + session.durationMin * 60000 - now);
}

function fmtRemaining(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function Toast({ children }) {
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      background: INK, color: PAPER, fontFamily: F, fontSize: 12.5,
      padding: '10px 18px', borderRadius: 22, boxShadow: '0 6px 24px rgba(0,0,0,.2)',
      zIndex: 50,
    }}>{children}</div>
  );
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2200); };
  return [msg, show];
}

// ═══════════════════════════════════════════════════════════════════
// PodRoom — child view
// ═══════════════════════════════════════════════════════════════════
export function PodRoom({ navigate }) {
  const [now, bump] = useClock(1000);
  const [toast, showToast] = useToast();

  const pod = loadPod();
  const remaining = remainingMs(pod.session, now);
  const isOpen = pod.session.open && remaining > 0;

  // Auto-close the moment time actually runs out.
  useEffect(() => {
    if (pod.session.open && remaining <= 0) {
      closePodSession();
      bump();
    }
  }, [remaining, pod.session.open, bump]);

  const allThreads = useMemo(() => getAllThreads(), []);
  const curated = pod.curated
    .map(c => ({ ...c, thread: getThreadById(c.threadId) }))
    .filter(c => c.thread);
  const curatedIds = new Set(pod.curated.map(c => c.threadId));
  const locked = allThreads.filter(t => !curatedIds.has(t.id));

  const pendingThreadIds = new Set(
    pod.requests.filter(r => r.status === 'pending' && r.kind === 'thread').map(r => r.threadId)
  );
  const pendingExtend = pod.requests.some(r => r.status === 'pending' && r.kind === 'extend');
  const pendingOpen = pod.requests.some(r => r.status === 'pending' && r.kind === 'open');

  const handleRequestAccess = (thread) => {
    if (pendingThreadIds.has(thread.id)) return;
    addPodRequest({ kind: 'thread', threadId: thread.id, label: thread.q });
    bump();
    showToast(`Asked to add "${thread.q.slice(0, 44)}…" to your pod.`);
  };
  const handleRequestTime = () => {
    if (pendingExtend) return;
    addPodRequest({ kind: 'extend', minutes: 15, label: '15 more minutes' });
    bump();
    showToast('Asked for 15 more minutes.');
  };
  const handleRequestOpen = () => {
    if (pendingOpen) { showToast('Already asked — waiting on a parent.'); return; }
    addPodRequest({ kind: 'open', label: 'Open my pod' });
    bump();
    showToast('Asked a parent to open your pod.');
  };

  const breadcrumb = (
    <Breadcrumb here="pod" navigate={navigate} viewMode="child"
      trail={[{ label: 'Home', onClick: () => navigate('home') }, { label: 'Pod' }]} />
  );

  if (!isOpen) {
    return (
      <Room background="#F2EFE6" breadcrumb={breadcrumb}>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32, background: POD_BG,
            border: `1px solid ${POD_BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>🔒</div>
          <h1 style={{
            fontFamily: S, fontStyle: 'italic', fontWeight: 300, fontSize: 32, color: INK, margin: 0,
          }}>Your pod is closed</h1>
          <p style={{ fontFamily: F, fontSize: 13.5, color: '#5E5A55', maxWidth: 380, lineHeight: 1.6 }}>
            {pod.curated.length > 0
              ? `${pod.curated.length} thing${pod.curated.length === 1 ? '' : 's'} waiting for you inside — ask a parent to open it.`
              : 'Ask a parent to open it.'}
          </p>
          <button onClick={handleRequestOpen} style={{
            background: pendingOpen ? 'transparent' : POD,
            color: pendingOpen ? INK_FAINT : '#FFF',
            border: `1px solid ${pendingOpen ? PAPER_EDGE : POD}`,
            fontFamily: F, fontSize: 12.5, padding: '9px 18px', borderRadius: 20,
            cursor: pendingOpen ? 'default' : 'pointer',
          }}>{pendingOpen ? '✓ waiting on a parent' : 'Ask to open my pod'}</button>
        </div>
        {toast && <Toast>{toast}</Toast>}
      </Room>
    );
  }

  return (
    <Room background="#F2EFE6" breadcrumb={breadcrumb}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '56px 40px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
              color: INK_FAINT, fontFamily: M,
            }}>§07 Pod · Iris's curated space</div>
            <h1 style={{
              margin: '10px 0 12px', fontFamily: S, fontStyle: 'italic', fontWeight: 300,
              fontSize: 40, lineHeight: 1.05, color: INK,
            }}>Your pod</h1>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: POD_BG, border: `1px solid ${POD_BORDER}`,
              borderRadius: 20, padding: '6px 16px',
              fontFamily: M, fontSize: 13, color: POD,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: POD,
                boxShadow: '0 0 0 2.5px rgba(140,90,140,.2)',
              }} />
              {fmtRemaining(remaining)} left
            </div>
          </div>

          <h2 style={{ fontFamily: S, fontStyle: 'italic', fontWeight: 400, fontSize: 20, color: INK, margin: '0 0 12px' }}>
            In your pod
          </h2>
          <div style={{ display: 'grid', gap: 10, marginBottom: 36 }}>
            {curated.map(c => {
              const pal = { indigo: '#5B5A9C', moss: '#3F6F3A', bark: '#8A5630', rose: '#A8552F' };
              const dc = pal[c.thread.dc] || '#3A3530';
              return (
                <button key={c.id} onClick={() => navigate('thread', { id: c.thread.id })}
                  style={{
                    textAlign: 'left', background: PAPER, border: `1px solid ${PAPER_EDGE}`,
                    borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                  <span style={{ fontFamily: M, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: dc }}>
                    {c.thread.domain}
                  </span>
                  <span style={{ fontFamily: S, fontSize: 17, lineHeight: 1.35, color: INK }}>
                    {c.thread.q}
                  </span>
                </button>
              );
            })}
            {curated.length === 0 && (
              <div style={{
                textAlign: 'center', fontFamily: S, fontStyle: 'italic', color: INK_FAINT,
                padding: '20px 0',
              }}>Nothing here yet — ask for something below.</div>
            )}
          </div>

          <h2 style={{ fontFamily: S, fontStyle: 'italic', fontWeight: 400, fontSize: 20, color: INK, margin: '0 0 12px' }}>
            Ask for more
          </h2>
          <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
            {locked.map(t => {
              const isPending = pendingThreadIds.has(t.id);
              return (
                <div key={t.id} style={{
                  background: 'rgba(0,0,0,.02)', border: `1px dashed ${PAPER_EDGE}`,
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 15, color: INK_GHOST, flexShrink: 0 }}>🔒</span>
                  <span style={{
                    fontFamily: S, fontSize: 15, lineHeight: 1.35, color: INK_SOFT, flex: 1,
                  }}>{t.q}</span>
                  <button onClick={() => handleRequestAccess(t)} disabled={isPending} style={{
                    flexShrink: 0,
                    background: isPending ? 'transparent' : POD_BG,
                    color: isPending ? INK_FAINT : POD,
                    border: `1px solid ${isPending ? PAPER_EDGE : POD_BORDER}`,
                    fontFamily: F, fontSize: 11, padding: '5px 11px', borderRadius: 14,
                    cursor: isPending ? 'default' : 'pointer',
                  }}>{isPending ? '✓ asked' : 'ask to add'}</button>
                </div>
              );
            })}
            {locked.length === 0 && (
              <div style={{
                textAlign: 'center', fontFamily: F, fontSize: 12.5, color: INK_FAINT, padding: '10px 0',
              }}>Everything is already in your pod.</div>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={handleRequestTime} disabled={pendingExtend} style={{
              background: pendingExtend ? 'transparent' : 'transparent',
              color: pendingExtend ? INK_FAINT : POD,
              border: `1px solid ${pendingExtend ? PAPER_EDGE : POD_BORDER}`,
              fontFamily: F, fontSize: 12, padding: '8px 16px', borderRadius: 18,
              cursor: pendingExtend ? 'default' : 'pointer',
            }}>{pendingExtend ? '✓ asked for more time' : '+ ask for 15 more minutes'}</button>
          </div>
        </div>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </Room>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PodAdminRoom — parent view
// ═══════════════════════════════════════════════════════════════════
const DURATION_PRESETS = [15, 30, 45, 60];

function RequestCard({ req, onApprove, onDecline }) {
  const label = {
    open:   () => 'wants to open the pod',
    extend: () => `wants ${req.minutes} more minutes`,
    thread: () => `wants "${(req.label || '').slice(0, 50)}" added`,
  }[req.kind]?.() || req.label;
  return (
    <div style={{
      background: PAPER, border: `1px solid ${PAPER_EDGE}`, borderRadius: 10,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>
        {req.kind === 'open' ? '🔓' : req.kind === 'extend' ? '⏱' : '✎'}
      </span>
      <span style={{ fontFamily: F, fontSize: 13.5, color: INK, flex: 1 }}>Iris {label}</span>
      <button onClick={() => onDecline(req.id)} style={{
        background: 'transparent', border: `1px solid ${PAPER_EDGE}`,
        fontFamily: F, fontSize: 11, color: INK_FAINT,
        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
      }}>decline</button>
      <button onClick={() => onApprove(req.id)} style={{
        background: POD, border: `1px solid ${POD}`,
        fontFamily: F, fontSize: 11, color: '#FFF',
        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
      }}>approve</button>
    </div>
  );
}

export function PodAdminRoom({ navigate }) {
  const [now, bump] = useClock(1000);
  const [duration, setDuration] = useState(30);
  const [toast, showToast] = useToast();

  const pod = loadPod();
  const remaining = remainingMs(pod.session, now);
  const isOpen = pod.session.open && remaining > 0;

  useEffect(() => {
    if (pod.session.open && remaining <= 0) {
      closePodSession();
      bump();
    }
  }, [remaining, pod.session.open, bump]);

  const allThreads = useMemo(() => getAllThreads(), []);
  const curatedIds = new Set(pod.curated.map(c => c.threadId));
  const pending = pod.requests.filter(r => r.status === 'pending');

  const handleOpen = () => { openPodSession(duration); bump(); showToast(`Pod opened for ${duration} minutes.`); };
  const handleClose = () => { closePodSession(); bump(); showToast('Pod closed.'); };
  const handleExtend = () => { extendPodSession(15); bump(); showToast('+15 minutes added.'); };
  const handleApprove = (id) => { resolvePodRequest(id, 'approved'); bump(); showToast('Approved.'); };
  const handleDecline = (id) => { resolvePodRequest(id, 'declined'); bump(); showToast('Declined.'); };
  const handleToggleCurate = (thread) => {
    if (curatedIds.has(thread.id)) {
      const entry = pod.curated.find(c => c.threadId === thread.id);
      removePodCuration(entry.id);
    } else {
      addPodCuration({ threadId: thread.id, title: thread.q });
    }
    bump();
  };

  const breadcrumb = (
    <Breadcrumb here="pod-admin" navigate={navigate} viewMode="parent"
      trail={[{ label: 'Home', onClick: () => navigate('home') }, { label: "Iris's pod (admin)" }]} />
  );

  return (
    <Room background="#F2EFE6" breadcrumb={breadcrumb}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '56px 40px 80px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
              color: INK_FAINT, fontFamily: M,
            }}>§08 Pod (admin) · curating Iris's space</div>
            <h1 style={{
              margin: '10px 0 4px', fontFamily: S, fontStyle: 'italic', fontWeight: 300,
              fontSize: 40, lineHeight: 1.05, color: INK,
            }}>Iris's pod</h1>
          </div>

          {/* Session control */}
          <div style={{
            background: '#FFF', border: `1px solid ${PAPER_EDGE}`, borderRadius: 12,
            padding: '18px 22px', marginBottom: 28,
          }}>
            {isOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 22, background: POD, color: '#FFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>🔓</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: INK_FAINT, fontFamily: M, marginBottom: 2 }}>
                    Pod is open
                  </div>
                  <div style={{ fontFamily: M, fontSize: 18, color: INK }}>{fmtRemaining(remaining)} left</div>
                </div>
                <button onClick={handleExtend} style={{
                  background: 'transparent', border: `1px solid ${POD_BORDER}`, color: POD,
                  fontFamily: F, fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                }}>+15 min</button>
                <button onClick={handleClose} style={{
                  background: 'transparent', border: `1px solid ${PAPER_EDGE}`, color: INK_SOFT,
                  fontFamily: F, fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                }}>close pod now</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 22, background: '#EEEBE2', color: INK_FAINT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}>🔒</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: INK_FAINT, fontFamily: M, marginBottom: 2 }}>
                    Pod is closed
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DURATION_PRESETS.map(d => (
                      <button key={d} onClick={() => setDuration(d)} style={{
                        background: duration === d ? INK : 'transparent',
                        color: duration === d ? PAPER : INK_SOFT,
                        border: `1px solid ${duration === d ? INK : PAPER_EDGE}`,
                        fontFamily: M, fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      }}>{d}m</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleOpen} style={{
                  background: POD, border: `1px solid ${POD}`, color: '#FFF',
                  fontFamily: F, fontSize: 12.5, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                }}>open pod for {duration} min</button>
              </div>
            )}
          </div>

          {/* Pending requests */}
          <h2 style={{ fontFamily: S, fontStyle: 'italic', fontWeight: 400, fontSize: 20, color: INK, margin: '0 0 12px' }}>
            Pending {pending.length > 0 && <span style={{ fontFamily: M, fontSize: 13, color: INK_FAINT }}>· {pending.length}</span>}
          </h2>
          <div style={{ display: 'grid', gap: 10, marginBottom: 32 }}>
            {pending.map(r => (
              <RequestCard key={r.id} req={r} onApprove={handleApprove} onDecline={handleDecline} />
            ))}
            {pending.length === 0 && (
              <div style={{
                textAlign: 'center', fontFamily: S, fontStyle: 'italic', color: INK_FAINT, padding: '16px 0',
              }}>Nothing waiting on you.</div>
            )}
          </div>

          {/* Curate */}
          <h2 style={{ fontFamily: S, fontStyle: 'italic', fontWeight: 400, fontSize: 20, color: INK, margin: '0 0 6px' }}>
            Curate what's in the pod
          </h2>
          <p style={{ fontFamily: F, fontSize: 12.5, color: INK_FAINT, margin: '0 0 14px' }}>
            {pod.curated.length} of {allThreads.length} threads visible to Iris.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {allThreads.map(t => {
              const inPod = curatedIds.has(t.id);
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: PAPER, border: `1px solid ${PAPER_EDGE}`, borderRadius: 10,
                  padding: '11px 16px',
                }}>
                  <span style={{ fontFamily: S, fontSize: 14.5, color: inPod ? INK : INK_SOFT, flex: 1, lineHeight: 1.3 }}>
                    {t.q}
                  </span>
                  <button onClick={() => handleToggleCurate(t)} style={{
                    flexShrink: 0,
                    background: inPod ? POD_BG : 'transparent',
                    color: inPod ? POD : INK_FAINT,
                    border: `1px solid ${inPod ? POD_BORDER : PAPER_EDGE}`,
                    fontFamily: F, fontSize: 11, padding: '4px 11px', borderRadius: 14, cursor: 'pointer',
                  }}>{inPod ? '✓ in pod' : 'add to pod'}</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </Room>
  );
}
