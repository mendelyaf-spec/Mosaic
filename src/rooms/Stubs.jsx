// Stub rooms for Phase 1. Each renders a simple "coming next" placeholder
// inside the shared Room frame with the breadcrumb so navigation works.

import React from 'react';
import { Room, Breadcrumb, FONT_SERIF, FONT_SANS } from '../shell/shell.jsx';

function Placeholder({ here, title, note, navigate }) {
  return (
    <Room
      breadcrumb={<Breadcrumb here={here} navigate={navigate} viewMode="maya" trail={[{ label: title }]} />}
    >
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14, padding: 40, textAlign: 'center',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
          color: '#9A968F', fontFamily: FONT_SANS,
        }}>Mosaic · Phase 1 placeholder</div>
        <h1 style={{
          margin: 0,
          fontFamily: FONT_SERIF, fontStyle: 'italic', fontWeight: 300,
          fontSize: 40, lineHeight: 1.1, color: '#1A1714',
        }}>{title}</h1>
        <p style={{
          maxWidth: 520, color: '#5E5A55', fontFamily: FONT_SANS,
          fontSize: 14, lineHeight: 1.5,
        }}>{note}</p>
      </div>
    </Room>
  );
}

export function TownHallRoom({ navigate }) {
  return <Placeholder navigate={navigate} here="townhall" title="Town Hall"
    note="Chapter board — pinned notes, bulletin, local content. Not yet ported to ES modules in Phase 1." />;
}

export function PodRoom({ navigate }) {
  return <Placeholder navigate={navigate} here="pod" title="Pod"
    note="Child-view pod surface. Out of scope for Phase 1." />;
}

export function PodAdminRoom({ navigate }) {
  return <Placeholder navigate={navigate} here="pod-admin" title="Pod (admin)"
    note="Parent-view co-parent admin. Out of scope for Phase 1." />;
}

