// Scheduler — overlay modal that aggregates all "things on the calendar"
// across the app and lets the user accept / decline incoming proposals,
// dismiss outgoing ones, propose new events, and navigate to the source
// thread / courtyard each item belongs to.
//
// Sources:
//   - localStorage scheduled events    (proposals you've sent / received)
//   - WM.TOWN_HALL.bulletin             (chapter meetups + readings)
//   - WM.TOWN_HALL.chapter.nextMeeting  (the next chapter assembly)
//   - WM.COURTYARD.requests             (incoming courtyard requests)
//
// One flat list, grouped by date, split into three tabs:
//   Upcoming · Requests · Past

import { useState, useMemo } from 'react';
import { WM } from '../data/wm-data.js';
import {
  loadScheduledEvents, saveScheduledEvent,
  updateScheduledEvent, deleteScheduledEvent,
} from '../lib/threads.js';

const SERIF = "'Cormorant Garamond', Georgia, serif";
const SANS  = "'DM Sans', system-ui, sans-serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";
const INK   = '#1A1714';
const INK_SOFT  = '#3A3530';
const INK_FAINT = '#9A968F';
const INK_GHOST = '#C0BDB6';
const PAPER     = '#FBF8F0';
const PAPER_EDGE = '#E0DCD0';
const MARK   = '#1A5C46';

// ── Date parsing ──────────────────────────────────────────────────
// Inputs in the seed data range from precise ("Apr 28, 7pm") to
// recurring ("Thursdays 4-6pm") to relative ("scheduled"). We do a
// best-effort parse — anything that gives us a Date sorts naturally;
// recurring entries float to the top of Upcoming with a "recurring"
// chip; unparseable strings sort at the bottom.
const NOW = () => new Date();
const MS_DAY = 86400000;
const DAY_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function parseWhen(s) {
  if (!s) return { kind: 'unknown' };
  const lc = s.toLowerCase();
  // Recurring patterns: "Thursdays 4–6pm", "Sundays 2pm", "Saturdays 10am-2pm"
  for (const d of DAY_OF_WEEK) {
    if (lc.includes(d.toLowerCase() + 's')) {
      return { kind: 'recurring', day: d };
    }
  }
  // "scheduled" placeholder
  if (lc === 'scheduled') return { kind: 'recurring', day: null };

  // Try Date.parse — handles "Apr 28, 7pm", "May 4, 5pm" reasonably
  // (Date.parse may infer current year if year missing).
  const candidates = [s, s + ' ' + NOW().getFullYear()];
  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) {
      // If parser landed on past date (year missing → defaulted to
      // last year), bump to next year so it shows in Upcoming.
      if (d.getTime() < NOW().getTime() - MS_DAY * 2) {
        const next = new Date(d);
        next.setFullYear(d.getFullYear() + 1);
        return { kind: 'date', date: next };
      }
      return { kind: 'date', date: d };
    }
  }
  return { kind: 'freetext' };
}

function dayLabel(date) {
  const now = NOW();
  const diff = Math.floor((date.getTime() - now.getTime()) / MS_DAY);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff < 0 && diff >= -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DAY_OF_WEEK[date.getDay()];
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Event aggregation ─────────────────────────────────────────────
function aggregateEvents() {
  const events = [];

  // 1. User-created (proposals sent + persistent meetups committed to)
  for (const e of loadScheduledEvents()) {
    events.push({
      id: e.id,
      source: 'user',
      kind: e.kind || 'other',
      title: e.title,
      when: e.when || '',
      where: e.where || '',
      with: e.with || [],
      note: e.note || '',
      threadId: e.threadId || null,
      courtyardName: e.courtyardName || null,
      status: e.status || 'proposed',
      direction: e.direction || 'outgoing',
      createdAt: e.createdAt || 0,
    });
  }

  // 2. Town Hall bulletin — chapter meetups
  for (const b of (WM.TOWN_HALL?.bulletin || [])) {
    events.push({
      id: 'th-' + b.id,
      source: 'townhall',
      kind: 'meetup',
      title: b.label,
      when: b.when || '',
      where: b.where || '',
      with: [`${b.attending} attending`],
      note: b.detail || '',
      threadId: b.threadAnchor || null,
      icon: b.icon,
      status: 'confirmed',
      direction: 'incoming',
      bulletinKind: b.kind, // 'recurring' | 'one-time'
    });
  }

  // 3. Town Hall: next chapter assembly
  if (WM.TOWN_HALL?.chapter?.nextMeeting) {
    const ch = WM.TOWN_HALL.chapter;
    events.push({
      id: 'th-chapter-next',
      source: 'townhall',
      kind: 'meetup',
      title: `${ch.name} chapter assembly`,
      when: ch.nextMeeting,
      where: 'Town Hall',
      with: [`${ch.members} chapter members`],
      icon: '🏛',
      status: 'confirmed',
      direction: 'incoming',
    });
  }

  // 4. Courtyard requests — incoming proposals addressed to you
  for (const r of (WM.COURTYARD?.requests || [])) {
    events.push({
      id: 'cr-' + r.id,
      source: 'courtyard',
      kind: r.kind === 'exchange' ? 'async' : r.kind || 'other',
      title: r.asks,
      when: '',
      with: [r.who],
      note: r.detail || '',
      threadId: r.threadId || null,
      status: 'proposed',
      direction: 'incoming',
    });
  }

  return events;
}

// ── Bucket events by tab ──────────────────────────────────────────
function bucket(events) {
  const upcoming = [];
  const requests = [];
  const past = [];
  for (const ev of events) {
    const parsed = parseWhen(ev.when);
    ev._parsed = parsed;
    if (ev.status === 'proposed') {
      // proposals sit in Requests until accepted/declined
      requests.push(ev);
      continue;
    }
    if (ev.status === 'declined') {
      past.push(ev);
      continue;
    }
    if (parsed.kind === 'date') {
      if (parsed.date.getTime() < NOW().getTime() - MS_DAY) past.push(ev);
      else upcoming.push(ev);
    } else {
      // recurring / freetext / unknown → upcoming
      upcoming.push(ev);
    }
  }
  // sort each bucket
  upcoming.sort((a, b) => {
    const ad = a._parsed.kind === 'date' ? a._parsed.date.getTime() : Infinity;
    const bd = b._parsed.kind === 'date' ? b._parsed.date.getTime() : Infinity;
    return ad - bd;
  });
  past.sort((a, b) => {
    const ad = a._parsed.kind === 'date' ? a._parsed.date.getTime() : 0;
    const bd = b._parsed.kind === 'date' ? b._parsed.date.getTime() : 0;
    return bd - ad;
  });
  requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { upcoming, requests, past };
}

// ── Icon per kind ────────────────────────────────────────────────
function KindBadge({ kind, icon }) {
  if (icon) return <span style={{ fontSize: 17 }}>{icon}</span>;
  const ch = kind === 'live' ? '◉'
           : kind === 'async' ? '↻'
           : kind === 'meetup' ? '☕'
           : '·';
  return <span style={{
    fontFamily: MONO, fontSize: 14, color: MARK, width: 17, textAlign: 'center',
  }}>{ch}</span>;
}

// ── Event card ───────────────────────────────────────────────────
function EventCard({ event, onAccept, onDecline, onDismiss, onOpenThread, navigate }) {
  const parsed = event._parsed;
  const dayBadge = parsed.kind === 'date' ? dayLabel(parsed.date)
                  : parsed.kind === 'recurring' ? (parsed.day ? `${parsed.day}s` : 'recurring')
                  : '';
  const sourceLabel =
      event.source === 'townhall'  ? 'Town Hall'
    : event.source === 'courtyard' ? 'Courtyard request'
    : event.source === 'user' && event.direction === 'outgoing' ? 'Your proposal'
    : event.source === 'user' && event.direction === 'incoming' ? 'Incoming'
    : 'Event';

  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      background: PAPER, border: `1px solid ${PAPER_EDGE}`, borderRadius: 6,
      alignItems: 'flex-start',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flex: '0 0 64px', paddingTop: 2,
      }}>
        {dayBadge && (
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '.06em',
            color: INK_FAINT, textTransform: 'uppercase', marginBottom: 4,
          }}>{dayBadge}</div>
        )}
        <KindBadge kind={event.kind} icon={event.icon} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
          marginBottom: 4,
        }}>
          <span style={{
            fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
            fontSize: 16, color: INK, lineHeight: 1.25,
          }}>{event.title}</span>
          <span style={{
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '.14em',
            textTransform: 'uppercase', color: INK_GHOST,
          }}>· {sourceLabel}</span>
        </div>
        <div style={{
          fontFamily: SANS, fontSize: 11.5, color: INK_SOFT, lineHeight: 1.4,
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4,
        }}>
          {event.when && <span>🕒 {event.when}</span>}
          {event.where && <span>📍 {event.where}</span>}
          {event.with && event.with.length > 0 && (
            <span>· {event.with.join(', ')}</span>
          )}
        </div>
        {event.note && (
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 12.5,
            color: INK_SOFT, lineHeight: 1.45, marginTop: 6,
            paddingLeft: 10, borderLeft: `2px solid ${PAPER_EDGE}`,
          }}>{event.note}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {event.status === 'proposed' && (
            <>
              <button onClick={() => onAccept(event)} style={primaryBtn()}>accept</button>
              <button onClick={() => onDecline(event)} style={ghostBtn()}>decline</button>
            </>
          )}
          {event.status === 'confirmed' && event.source === 'user' && (
            <button onClick={() => onDismiss(event)} style={ghostBtn()}>remove from calendar</button>
          )}
          {event.threadId && (
            <button onClick={() => onOpenThread(event.threadId)} style={ghostBtn()}>
              open thread →
            </button>
          )}
          {event.source === 'townhall' && (
            <button onClick={() => navigate('townhall')} style={ghostBtn()}>
              town hall →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function primaryBtn() {
  return {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: '#FAF5E9',
    background: MARK, border: 'none',
    padding: '7px 13px', borderRadius: 3, cursor: 'pointer',
  };
}
function ghostBtn() {
  return {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
    textTransform: 'uppercase', color: INK_SOFT,
    background: 'transparent', border: `1px solid ${PAPER_EDGE}`,
    padding: '7px 13px', borderRadius: 3, cursor: 'pointer',
  };
}

// ── Inline composer for new events ────────────────────────────────
function NewEventComposer({ onSave, onCancel }) {
  const [kind, setKind] = useState('live');
  const [title, setTitle] = useState('');
  const [withWho, setWithWho] = useState('');
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [note, setNote] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onSave({
      kind,
      title: title.trim(),
      with: withWho.split(',').map(s => s.trim()).filter(Boolean),
      when: when.trim(),
      where: where.trim(),
      note: note.trim(),
      status: 'confirmed',
      direction: 'outgoing',
    });
  };
  return (
    <div style={{
      padding: '16px 18px', background: PAPER,
      border: `1px solid ${MARK}55`, borderRadius: 4, marginBottom: 14,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
        textTransform: 'uppercase', color: MARK, marginBottom: 12,
      }}>add to calendar</div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 8 }}>
        <select value={kind} onChange={e => setKind(e.target.value)} style={input()}>
          <option value="live">live</option>
          <option value="async">async</option>
          <option value="meetup">meetup</option>
          <option value="other">other</option>
        </select>
        <input placeholder="what is it?" value={title}
          onChange={e => setTitle(e.target.value)} style={input()} autoFocus/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
        <input placeholder="when (e.g. Thursday 4pm)" value={when}
          onChange={e => setWhen(e.target.value)} style={input()}/>
        <input placeholder="where (optional)" value={where}
          onChange={e => setWhere(e.target.value)} style={input()}/>
      </div>
      <input placeholder="with whom (comma-separated)" value={withWho}
        onChange={e => setWithWho(e.target.value)} style={{ ...input(), marginBottom: 8 }}/>
      <textarea placeholder="note (optional)" rows={2} value={note}
        onChange={e => setNote(e.target.value)} style={{ ...input(), resize: 'vertical' }}/>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} style={primaryBtn()}>add to calendar</button>
        <button onClick={onCancel} style={ghostBtn()}>cancel</button>
      </div>
    </div>
  );
}
function input() {
  return {
    fontFamily: SANS, fontSize: 12.5, padding: '7px 10px',
    border: `1px solid ${PAPER_EDGE}`, borderRadius: 3,
    background: '#FFFFFF', width: '100%', boxSizing: 'border-box',
  };
}

// ── Tab pill ───────────────────────────────────────────────────────
function TabPill({ id, label, count, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '.14em',
      textTransform: 'uppercase', color: active ? '#FAF5E9' : INK_SOFT,
      background: active ? MARK : 'transparent',
      border: 'none', borderRadius: 99,
      padding: '6px 14px', cursor: active ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 7,
    }}>
      {label}
      <span style={{
        background: active ? 'rgba(255,255,255,.18)' : PAPER_EDGE,
        color: active ? '#FAF5E9' : INK_SOFT,
        borderRadius: 99, padding: '1px 7px',
        fontSize: 9, fontWeight: 600,
      }}>{count}</span>
    </button>
  );
}

// ── The overlay ──────────────────────────────────────────────────
export function Scheduler({ open, navigate, onClose }) {
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('upcoming');
  const [composing, setComposing] = useState(false);
  // re-aggregate on version bump (after accept/decline/save).
  const events = useMemo(() => aggregateEvents(), [version]);
  const { upcoming, requests, past } = useMemo(() => bucket(events), [events]);
  if (!open) return null;

  const bump = () => setVersion(v => v + 1);

  const handleAccept = (ev) => {
    if (ev.source === 'user') {
      updateScheduledEvent(ev.id, { status: 'confirmed' });
    } else {
      // courtyard/townhall requests: copy into user events as confirmed
      saveScheduledEvent({
        kind: ev.kind, title: ev.title, when: ev.when || 'tbd',
        where: ev.where, with: ev.with, note: ev.note,
        threadId: ev.threadId, courtyardName: ev.courtyardName,
        status: 'confirmed', direction: 'incoming',
      });
    }
    bump();
  };
  const handleDecline = (ev) => {
    if (ev.source === 'user') updateScheduledEvent(ev.id, { status: 'declined' });
    else saveScheduledEvent({
      kind: ev.kind, title: ev.title, when: ev.when || '',
      where: ev.where, with: ev.with, note: ev.note,
      threadId: ev.threadId, courtyardName: ev.courtyardName,
      status: 'declined', direction: 'incoming',
    });
    bump();
  };
  const handleDismiss = (ev) => {
    if (ev.source === 'user') deleteScheduledEvent(ev.id);
    bump();
  };
  const handleOpenThread = (tid) => {
    navigate('thread', { id: tid });
    onClose();
  };
  const handleSaveNew = (data) => {
    saveScheduledEvent(data);
    setComposing(false);
    setTab('upcoming');
    bump();
  };

  const rows = tab === 'upcoming' ? upcoming
             : tab === 'requests' ? requests
             : past;

  return (
    <>
      <div data-ui onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(31,28,23,0.45)', backdropFilter: 'blur(2px)',
      }} />
      <div data-ui style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', zIndex: 91,
        width: 'min(680px, 94vw)', maxHeight: '88vh',
        background: '#FAF5E9', border: `1px solid ${MARK}55`,
        borderRadius: 6, boxShadow: '0 30px 80px -20px rgba(40,30,15,.5)',
        display: 'flex', flexDirection: 'column',
        fontFamily: SANS, color: INK,
      }}>
        {/* header */}
        <div style={{
          padding: '20px 24px 14px', borderBottom: `1px solid ${PAPER_EDGE}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
              textTransform: 'uppercase', color: MARK, marginBottom: 5,
            }}>◷ Scheduler</div>
            <h2 style={{
              margin: 0, fontFamily: SERIF, fontStyle: 'italic',
              fontWeight: 400, fontSize: 24, color: INK, lineHeight: 1.1,
            }}>What you're holding for the calendar</h2>
          </div>
          <button onClick={onClose} title="Close" style={{
            background: 'transparent', border: 'none', color: INK_FAINT,
            cursor: 'pointer', padding: 6, fontFamily: MONO, fontSize: 11,
          }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{
          padding: '12px 24px', borderBottom: `1px solid ${PAPER_EDGE}`,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <TabPill id="upcoming" label="Upcoming" count={upcoming.length}
            active={tab === 'upcoming'} onClick={setTab} />
          <TabPill id="requests" label="Requests" count={requests.length}
            active={tab === 'requests'} onClick={setTab} />
          <TabPill id="past" label="Past" count={past.length}
            active={tab === 'past'} onClick={setTab} />
          <div style={{ flex: 1 }} />
          {!composing && (
            <button onClick={() => setComposing(true)} style={primaryBtn()}>
              + add to calendar
            </button>
          )}
        </div>

        {/* body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '14px 24px 20px',
        }}>
          {composing && (
            <NewEventComposer onSave={handleSaveNew} onCancel={() => setComposing(false)} />
          )}
          {rows.length === 0 ? (
            <div style={{
              padding: '34px 0', textAlign: 'center',
              fontFamily: SERIF, fontStyle: 'italic', fontSize: 14,
              color: INK_FAINT,
            }}>{tab === 'upcoming'
              ? 'Nothing on the calendar yet.'
              : tab === 'requests'
              ? 'No proposals waiting.'
              : 'Nothing past.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(ev => (
                <EventCard key={ev.id} event={ev}
                  navigate={navigate}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  onDismiss={handleDismiss}
                  onOpenThread={handleOpenThread} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Scheduler;
