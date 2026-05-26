// Mosaic — main app router. Mounts the right room based on hash.
// Phase 1: Home / Thread / Courtyard are full; everything else is a stub.

import React from 'react';
import { useRoom } from './shell/shell.jsx';
import { WM } from './data/wm-data.js';
import { getThreadById } from './lib/threads.js';
import { HomeRoom } from './rooms/Home.jsx';
import { ThreadRoom } from './rooms/Thread.jsx';
import { CourtyardRoom } from './rooms/Courtyard.jsx';
import { SearchRoom } from './rooms/Search.jsx';
import {
  TownHallRoom, PodRoom, PodAdminRoom, PromenadeRoom,
} from './rooms/Stubs.jsx';

export default function MosaicApp() {
  const { room, params, navigate } = useRoom();

  const viewMode = 'maya';

  if (room === 'home') {
    return <HomeRoom navigate={navigate} firstUse={false} viewMode={viewMode} />;
  }
  if (room === 'thread') {
    const thread = getThreadById(params.id) || WM.THREADS[0];
    return <ThreadRoom navigate={navigate} thread={thread} viewMode={viewMode} />;
  }
  if (room === 'courtyard') {
    const thread = getThreadById(params.id) || WM.THREADS[0];
    return <CourtyardRoom navigate={navigate} thread={thread} viewMode={viewMode} />;
  }
  if (room === 'townhall')  return <TownHallRoom  navigate={navigate} />;
  if (room === 'pod')       return <PodRoom       navigate={navigate} />;
  if (room === 'pod-admin') return <PodAdminRoom  navigate={navigate} />;
  if (room === 'search')    return <SearchRoom    navigate={navigate} fromThreadId={params.from} deepenCard={params.deepen} settingsParam={params.settings} />;
  if (room === 'promenade') return <PromenadeRoom navigate={navigate} />;

  return (
    <div style={{ padding: 40, fontFamily: 'DM Sans, sans-serif' }}>
      Unknown room: <code>{room}</code>
    </div>
  );
}
