// TOWN HALL (§07) — chapter board for the Hawley, PA Mosaic chapter.
//
// Three columns of paper: pinned posts (insight / complaint / decision),
// the bulletin (recurring + one-time local gatherings), and local content
// (pieces shared into the chapter). A fixed eyebrow at the top holds the
// chapter name, member count, and next-meeting affordance.
//
// Bulletin events can be added to your scheduler with one click; both
// bulletin items and local content with a `threadAnchor` link out to the
// originating thread.

import React, { useState, useMemo } from 'react';
import {
  Room, Breadcrumb,
  FONT_SERIF as S, FONT_SANS as F, FONT_MONO as M,
} from '../shell/shell.jsx';
import { WM } from '../data/wm-data.js';
import {
  getThreadById,
  loadScheduledEvents, saveScheduledEvent,
} from '../lib/threads.js';

const INK        = '#1A1714';
const INK_SOFT   = '#3A3530';
const INK_FAINT  = '#9A968F';
const INK_GHOST  = '#C0BDB6';
const PAPER      = '#FBF8F0';
const PAPER_EDGE = '#E0DCD0';
const MARK       = '#1A5C46';
const COMPLAINT  = '#A8552F';
const DECISION   = '#75580D';

// ── Kind chip ─────────────────────────────────────────────────────────
function KindChip({ kind }) {
  const palette = {
    insight:   { fg: MARK,      bg: '#E8F0EB', label: 'insight'   },
    complaint: { fg: COMPLAINT, bg: '#F4E6DC', label: 'complaint' },
    decision:  { fg: DECISION,  bg: '#F1ECD9', label: 'decision'  },
  }[kind] || { fg: INK_FAINT, bg: '#EEEBE2', label: kind };
  return (
    <span style={{
      fontFamily: M, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
      color: palette.fg, background: palette.bg,
      padding: '2px 7px', borderRadius: 8,
    }}>{palette.label}</span>
  );
}

// ── Pinned post card ──────────────────────────────────────────────────
function PinnedPost({ post, onRespond }) {
  return (
    <div style={{
      background: PAPER,
      border: `1px solid ${PAPER_EDGE}`,
      borderRadius: 10,
      padding: '14px 16px 12px',
      boxShadow: '0 1px 0 rgba(0,0,0,.02)',
      position: 'relative',
    }}>
      {/* tack */}
      <div style={{
        position: 'absolute', top: -5, left: 18,
        width: 9, height: 9, borderRadius: '50%',
        background: post.kind === 'decision' ? DECISION
                  : post.kind === 'complaint' ? COMPLAINT : MARK,
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <KindChip kind={post.kind} />
        <span style={{ fontFamily: M, fontSize: 10.5, color: INK_FAINT }}>
          {post.who}
        </span>
        <span style={{ fontFamily: M, fontSize: 10, color: INK_GHOST, marginLeft: 'auto' }}>
          {post.when}
        </span>
      </div>
      <div style={{
        fontFamily: S, fontSize: 17, lineHeight: 1.35, color: INK,
        fontStyle: post.kind === 'decision' ? 'normal' : 'italic',
      }}>
        {post.kind === 'decision' ? post.text : `"${post.text}"`}
      </div>
      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: F, fontSize: 11, color: INK_FAINT,
      }}>
        <span>{post.responses} {post.responses === 1 ? 'response' : 'responses'}</span>
        <button onClick={() => onRespond(post)} style={{
          marginLeft: 'auto', background: 'transparent', border: `1px solid ${PAPER_EDGE}`,
          fontFamily: F, fontSize: 11, color: INK_SOFT,
          padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
        }}>
          {post.kind === 'decision' ? 'view ballot' : 'respond'}
        </button>
      </div>
    </div>
  );
}

// ── Bulletin card ─────────────────────────────────────────────────────
function BulletinCard({ item, onAddToCalendar, onOpenThread, alreadyAdded }) {
  return (
    <div style={{
      background: PAPER,
      border: `1px solid ${PAPER_EDGE}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          fontSize: 22, lineHeight: 1, width: 32, textAlign: 'center', flexShrink: 0,
          paddingTop: 2,
        }}>{item.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: M, fontSize: 9.5, letterSpacing: '.12em',
              textTransform: 'uppercase', color: item.kind === 'recurring' ? MARK : DECISION,
            }}>
              {item.kind}
            </span>
            <span style={{ fontFamily: M, fontSize: 10, color: INK_GHOST }}>
              · {item.attending} attending
            </span>
          </div>
          <div style={{ fontFamily: S, fontSize: 17, lineHeight: 1.3, color: INK }}>
            {item.label}
          </div>
          <div style={{ marginTop: 6, fontFamily: M, fontSize: 10.5, color: INK_SOFT }}>
            {item.when} <span style={{ color: INK_GHOST }}>·</span> {item.where}
          </div>
          {item.detail && (
            <div style={{
              marginTop: 8, fontFamily: F, fontSize: 12.5, lineHeight: 1.5, color: INK_SOFT,
            }}>{item.detail}</div>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              onClick={() => onAddToCalendar(item)}
              disabled={alreadyAdded}
              style={{
                background: alreadyAdded ? 'transparent' : MARK,
                color: alreadyAdded ? INK_FAINT : '#FFF',
                border: alreadyAdded ? `1px solid ${PAPER_EDGE}` : `1px solid ${MARK}`,
                fontFamily: F, fontSize: 11, padding: '4px 10px', borderRadius: 6,
                cursor: alreadyAdded ? 'default' : 'pointer',
              }}>
              {alreadyAdded ? '✓ on your calendar' : '+ add to calendar'}
            </button>
            {item.threadAnchor && (
              <button onClick={() => onOpenThread(item.threadAnchor)} style={{
                background: 'transparent', border: `1px solid ${PAPER_EDGE}`,
                fontFamily: F, fontSize: 11, color: INK_SOFT,
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              }}>
                anchored thread →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Local-content card ───────────────────────────────────────────────
function LocalCard({ item, onOpenThread }) {
  return (
    <div style={{
      background: PAPER,
      border: `1px solid ${PAPER_EDGE}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          fontSize: 20, lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0,
          paddingTop: 2,
        }}>{item.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: M, fontSize: 10.5, color: INK_SOFT }}>{item.who}</span>
            <span style={{ color: INK_GHOST }}>·</span>
            <span style={{
              fontFamily: M, fontSize: 9.5, letterSpacing: '.12em',
              textTransform: 'uppercase', color: INK_FAINT,
            }}>{item.kind}</span>
            <span style={{ fontFamily: M, fontSize: 10, color: INK_GHOST, marginLeft: 'auto' }}>
              {item.finds} {item.finds === 1 ? 'find' : 'finds'}
            </span>
          </div>
          <div style={{ fontFamily: S, fontSize: 16, lineHeight: 1.3, color: INK }}>
            {item.label}
          </div>
          {item.detail && (
            <div style={{
              marginTop: 6, fontFamily: F, fontSize: 12.5, lineHeight: 1.5, color: INK_SOFT,
            }}>{item.detail}</div>
          )}
          {item.threadAnchor && (
            <button onClick={() => onOpenThread(item.threadAnchor)} style={{
              marginTop: 10,
              background: 'transparent', border: `1px solid ${PAPER_EDGE}`,
              fontFamily: F, fontSize: 11, color: INK_SOFT,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            }}>
              anchored thread →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab pill ─────────────────────────────────────────────────────────
function TabPill({ active, count, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? INK : 'transparent',
      color: active ? PAPER : INK_SOFT,
      border: `1px solid ${active ? INK : PAPER_EDGE}`,
      fontFamily: F, fontSize: 12, fontWeight: active ? 500 : 400,
      padding: '6px 14px', borderRadius: 18, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
      <span>{children}</span>
      <span style={{
        fontFamily: M, fontSize: 10,
        color: active ? PAPER : INK_FAINT,
        opacity: 0.8,
      }}>{count}</span>
    </button>
  );
}

// ── The room ─────────────────────────────────────────────────────────
export function TownHallRoom({ navigate }) {
  const data = WM.TOWN_HALL;
  const [tab, setTab] = useState('pinned'); // 'pinned' | 'bulletin' | 'local'
  const [filterKind, setFilterKind] = useState('all'); // for pinned: all|insight|complaint|decision
  const [toast, setToast] = useState(null);
  // Track which bulletin items have been added to the scheduler this session
  const [calendarAdds, setCalendarAdds] = useState(() => {
    const events = loadScheduledEvents();
    const set = new Set();
    for (const ev of events) {
      if (ev.id && ev.id.startsWith('th-bulletin-')) set.add(ev.id.replace('th-bulletin-', ''));
    }
    return set;
  });

  // Pinned, optionally filtered
  const pinned = useMemo(() => {
    const all = data.pinned || [];
    if (filterKind === 'all') return all;
    return all.filter(p => p.kind === filterKind);
  }, [data.pinned, filterKind]);

  // Counts for tab badges and filter chips
  const counts = useMemo(() => ({
    pinned: data.pinned?.length || 0,
    bulletin: data.bulletin?.length || 0,
    local: data.local?.length || 0,
    insight: (data.pinned || []).filter(p => p.kind === 'insight').length,
    complaint: (data.pinned || []).filter(p => p.kind === 'complaint').length,
    decision: (data.pinned || []).filter(p => p.kind === 'decision').length,
  }), [data]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleRespond = (post) => {
    if (post.kind === 'decision') showToast(`Ballot for "${post.text.slice(0, 40)}…" opens Apr 28.`);
    else showToast(`Response drafted to ${post.who} — saved as draft.`);
  };

  const handleAddBulletinToCalendar = (item) => {
    if (calendarAdds.has(item.id)) return;
    saveScheduledEvent({
      id: `th-bulletin-${item.id}`,
      kind: item.kind === 'recurring' ? 'meetup' : 'other',
      title: item.label,
      with: ['Hawley chapter'],
      when: item.when,
      where: item.where,
      note: item.detail || null,
      threadId: item.threadAnchor || null,
      status: 'confirmed',
      direction: 'incoming',
      createdAt: Date.now(),
    });
    setCalendarAdds(prev => new Set(prev).add(item.id));
    showToast(`"${item.label}" added to your scheduler.`);
  };

  const handleAddMeetingToCalendar = () => {
    const id = 'th-chapter-meeting';
    if (calendarAdds.has(id)) {
      showToast('Chapter meeting is already on your scheduler.');
      return;
    }
    saveScheduledEvent({
      id: `th-bulletin-${id}`,
      kind: 'meetup',
      title: `${data.chapter.name} chapter assembly`,
      with: [`${data.chapter.members} chapter members`],
      when: data.chapter.nextMeeting,
      where: 'Town Hall',
      note: 'Chapter-wide vote + open floor.',
      status: 'confirmed',
      direction: 'incoming',
      createdAt: Date.now(),
    });
    setCalendarAdds(prev => new Set(prev).add(id));
    showToast('Chapter assembly added to your scheduler.');
  };

  const handleOpenThread = (threadId) => {
    const t = getThreadById(threadId);
    if (!t) {
      showToast(`Thread ${threadId} not in your library.`);
      return;
    }
    navigate('thread', { id: threadId });
  };

  const breadcrumb = (
    <Breadcrumb
      here="townhall"
      navigate={navigate}
      viewMode="maya"
      trail={[
        { label: 'Home', onClick: () => navigate('home') },
        { label: 'Town Hall' },
      ]}
    />
  );

  return (
    <Room background="#F2EFE6" breadcrumb={breadcrumb}>
      <div style={{
        position: 'absolute', inset: 0,
        overflow: 'auto', padding: '64px 40px 80px',
      }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>

          {/* ── Chapter header ─────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
              color: INK_FAINT, fontFamily: M,
            }}>§07 Town Hall · chapter board</div>
            <h1 style={{
              margin: '10px 0 4px',
              fontFamily: S, fontStyle: 'italic', fontWeight: 300,
              fontSize: 44, lineHeight: 1.05, color: INK,
            }}>
              {data.chapter.name}
            </h1>
            <div style={{ fontFamily: F, fontSize: 13, color: INK_SOFT }}>
              {data.chapter.members} members
            </div>
          </div>

          {/* ── Next-meeting strip ─────────────────────────────────── */}
          <div style={{
            background: '#FFF', border: `1px solid ${PAPER_EDGE}`,
            borderRadius: 12, padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 16,
            marginBottom: 32,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: MARK, color: '#FFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: S, fontStyle: 'italic', fontSize: 18, fontWeight: 500,
            }}>◷</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase',
                color: INK_FAINT, fontFamily: M, marginBottom: 2,
              }}>Next chapter assembly</div>
              <div style={{ fontFamily: S, fontSize: 18, color: INK }}>
                {data.chapter.nextMeeting} <span style={{ color: INK_FAINT, fontSize: 14 }}>· Town Hall</span>
              </div>
            </div>
            <button onClick={handleAddMeetingToCalendar} style={{
              background: calendarAdds.has('th-chapter-meeting') ? 'transparent' : MARK,
              color: calendarAdds.has('th-chapter-meeting') ? INK_FAINT : '#FFF',
              border: `1px solid ${calendarAdds.has('th-chapter-meeting') ? PAPER_EDGE : MARK}`,
              fontFamily: F, fontSize: 12, padding: '7px 14px', borderRadius: 8,
              cursor: calendarAdds.has('th-chapter-meeting') ? 'default' : 'pointer',
            }}>
              {calendarAdds.has('th-chapter-meeting') ? '✓ on calendar' : '+ add to calendar'}
            </button>
          </div>

          {/* ── Tabs ───────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: 8, marginBottom: 18,
            justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <TabPill active={tab === 'pinned'} count={counts.pinned}
              onClick={() => setTab('pinned')}>Pinned</TabPill>
            <TabPill active={tab === 'bulletin'} count={counts.bulletin}
              onClick={() => setTab('bulletin')}>Bulletin</TabPill>
            <TabPill active={tab === 'local'} count={counts.local}
              onClick={() => setTab('local')}>Local content</TabPill>
          </div>

          {/* ── Pinned ─────────────────────────────────────────────── */}
          {tab === 'pinned' && (
            <>
              <div style={{
                display: 'flex', gap: 6, marginBottom: 14,
                justifyContent: 'center', flexWrap: 'wrap',
              }}>
                {[
                  { id: 'all',       label: 'all',        n: counts.pinned    },
                  { id: 'insight',   label: 'insights',   n: counts.insight   },
                  { id: 'complaint', label: 'complaints', n: counts.complaint },
                  { id: 'decision',  label: 'decisions',  n: counts.decision  },
                ].map(f => (
                  <button key={f.id} onClick={() => setFilterKind(f.id)} style={{
                    background: filterKind === f.id ? '#EEEBE2' : 'transparent',
                    border: 'none',
                    fontFamily: M, fontSize: 10.5, color: filterKind === f.id ? INK : INK_FAINT,
                    padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                    letterSpacing: '.04em',
                  }}>
                    {f.label} <span style={{ color: INK_GHOST }}>{f.n}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {pinned.map(p => (
                  <PinnedPost key={p.id} post={p} onRespond={handleRespond} />
                ))}
                {pinned.length === 0 && (
                  <div style={{
                    textAlign: 'center', fontFamily: S, fontStyle: 'italic',
                    color: INK_FAINT, padding: '32px 0',
                  }}>
                    No {filterKind === 'all' ? 'posts' : filterKind + 's'} pinned right now.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Bulletin ───────────────────────────────────────────── */}
          {tab === 'bulletin' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {(data.bulletin || []).map(b => (
                <BulletinCard
                  key={b.id}
                  item={b}
                  alreadyAdded={calendarAdds.has(b.id)}
                  onAddToCalendar={handleAddBulletinToCalendar}
                  onOpenThread={handleOpenThread}
                />
              ))}
            </div>
          )}

          {/* ── Local content ──────────────────────────────────────── */}
          {tab === 'local' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {(data.local || []).map(l => (
                <LocalCard key={l.id} item={l} onOpenThread={handleOpenThread} />
              ))}
            </div>
          )}

          <div style={{
            marginTop: 40, textAlign: 'center',
            fontFamily: S, fontStyle: 'italic', fontSize: 13, color: INK_FAINT,
          }}>
            Pinned posts, bulletin items, and shared work belong to the chapter.
            Anything you save here lives in your own scheduler and thread library.
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: INK, color: PAPER,
          fontFamily: F, fontSize: 12.5,
          padding: '10px 18px', borderRadius: 22,
          boxShadow: '0 6px 24px rgba(0,0,0,.2)',
          zIndex: 50,
        }}>{toast}</div>
      )}
    </Room>
  );
}

export default TownHallRoom;
