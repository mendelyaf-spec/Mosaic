// Per-kind SVG thumbnails — honest visual stand-ins for media-rich content.
// No stock images, no AI generation: books look like books, audio looks like
// waveforms, async events look like written matrices.
//
// Lifted from the standalone design (5abb8889) with palette adapted to the
// promenade's paper-and-terracotta scheme.

const SERIF = "'Cormorant Garamond', 'Iowan Old Style', Georgia, serif";
const MONO  = "'JetBrains Mono', ui-monospace, Menlo, monospace";

export function Thumbnail({ media, kind, width = 268, height = null, fill = false }) {
  if (!media) return null;
  // Reference dimensions for the SVG viewBox.
  const refW = typeof width  === 'number' ? width  : 268;
  const refH = typeof height === 'number' ? height : Math.round(refW * 9 / 16);
  // When fill=true, the thumbnail scales to its container (used by the
  // are.na-style Grid tiles, where the cell drives the size). Otherwise
  // it renders at the explicit pixel dimensions (the Promenade canvas).
  const cssW = fill ? '100%' : refW;
  const cssH = fill ? '100%' : refH;

  return (
    <div style={{
      width: cssW, height: cssH,
      display: 'block',
      borderRadius: 2,
      overflow: 'hidden',
      background: `hsl(${media.hue ?? 30}, 20%, 22%)`,
      position: 'relative',
    }} aria-hidden>
      <svg viewBox={`0 0 ${refW} ${refH}`} width="100%" height="100%"
        preserveAspectRatio={fill ? 'xMidYMid slice' : 'none'}
        style={{ display:'block' }}>
        {media.kind === 'photo'      && <PhotoScene w={refW} h={refH} hue={media.hue} scene={media.scene} />}
        {media.kind === 'drawing'    && <DrawingScene w={refW} h={refH} hue={media.hue} />}
        {media.kind === 'book'       && <BookCover w={refW} h={refH} hue={media.hue} title={media.title} author={media.author} spine={media.spine} />}
        {media.kind === 'article'    && <ArticleHero w={refW} h={refH} hue={media.hue} source={media.source} />}
        {media.kind === 'shelf-cover'&& <ShelfCover w={refW} h={refH} hue={media.hue} title={media.title} author={media.author} />}
        {media.kind === 'event-live' && <EventLive w={refW} h={refH} hue={media.hue} participants={media.participants} />}
        {media.kind === 'event-async'&& <EventAsync w={refW} h={refH} hue={media.hue} participants={media.participants} rounds={media.rounds} />}
        {media.kind === 'audio'      && <AudioWave w={refW} h={refH} hue={media.hue} peaks={media.peaks} />}
      </svg>

      {media.kind === 'audio'      && <Chip>{media.duration}</Chip>}
      {media.kind === 'event-live' && <Chip>{media.duration}</Chip>}
      {media.kind === 'photo'      && media.count > 1 && <Chip>{media.count} photos</Chip>}
      {media.kind === 'drawing'    && media.count > 1 && <Chip>{media.count} drawings</Chip>}
      {media.kind === 'event-async'&& <Chip>{media.rounds} rounds · {media.participants.length} voices</Chip>}
      {kind === 'shelf'            && <Chip variant="light">published shelf</Chip>}
    </div>
  );
}

function Chip({ children, variant }) {
  return (
    <div style={{
      position: 'absolute', bottom: 6, right: 6,
      padding: '2px 6px',
      fontFamily: MONO, fontSize: 10, letterSpacing: '.03em',
      background: variant === 'light' ? 'rgba(250,245,233,0.92)' : 'rgba(20,18,14,0.78)',
      color:      variant === 'light' ? '#1f1c17' : '#f5efdf',
      borderRadius: 2,
    }}>{children}</div>
  );
}

// ─── PHOTO: duotone urban/architectural scenes ─────────────────────────
function PhotoScene({ w, h, hue, scene }) {
  const dark  = `hsl(${hue}, 25%, 18%)`;
  const mid   = `hsl(${hue}, 30%, 38%)`;
  const light = `hsl(${hue}, 45%, 72%)`;
  const sky   = `hsl(${hue}, 25%, 58%)`;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={sky}/>
      {scene === 'bench' && (
        <g>
          <rect x={0} y={h*0.62} width={w} height={h*0.38} fill={mid}/>
          <ellipse cx={w*0.78} cy={h*0.42} rx={w*0.16} ry={h*0.28} fill={dark}/>
          <rect x={w*0.775} y={h*0.58} width={4} height={h*0.18} fill={dark}/>
          <rect x={w*0.18} y={h*0.72} width={w*0.38} height={6} fill={dark}/>
          <rect x={w*0.18} y={h*0.72} width={4} height={h*0.22} fill={dark}/>
          <rect x={w*0.53} y={h*0.72} width={4} height={h*0.22} fill={dark}/>
          <rect x={w*0.18} y={h*0.82} width={w*0.38} height={3} fill={dark}/>
          <circle cx={w*0.28} cy={h*0.66} r={h*0.06} fill={light}/>
          <rect   x={w*0.255} y={h*0.7} width={h*0.1} height={h*0.1} fill={light}/>
          <circle cx={w*0.44} cy={h*0.66} r={h*0.06} fill={light}/>
          <rect   x={w*0.415} y={h*0.7} width={h*0.1} height={h*0.1} fill={light}/>
        </g>
      )}
      {scene === 'kiln' && (
        <g>
          <rect x={0} y={h*0.7} width={w} height={h*0.3} fill={mid}/>
          <rect x={w*0.3} y={h*0.35} width={w*0.4} height={h*0.4} fill={dark}/>
          <rect x={w*0.32} y={h*0.5} width={w*0.36} height={h*0.18} fill={`hsl(${hue}, 80%, 55%)`}/>
          <rect x={w*0.36} y={h*0.52} width={w*0.28} height={h*0.12} fill={`hsl(${hue}, 90%, 72%)`}/>
          <rect x={w*0.46} y={h*0.12} width={w*0.08} height={h*0.25} fill={dark}/>
          <ellipse cx={w*0.5} cy={h*0.08} rx={w*0.12} ry={h*0.06} fill={light} opacity="0.7"/>
        </g>
      )}
      {scene === 'medina' && (
        <g>
          <rect x={0} y={h*0.2} width={w*0.42} height={h*0.8} fill={dark}/>
          <rect x={w*0.58} y={h*0.3} width={w*0.42} height={h*0.7} fill={mid}/>
          <rect x={w*0.42} y={h*0.5} width={w*0.16} height={h*0.5} fill={`hsl(${hue}, 40%, 80%)`}/>
          <path d={`M ${w*0.42} ${h*0.5} L ${w*0.42} ${h*0.6} Q ${w*0.5} ${h*0.48} ${w*0.58} ${h*0.6} L ${w*0.58} ${h*0.5} Z`} fill={dark}/>
          <circle cx={w*0.5} cy={h*0.75} r={h*0.05} fill={light}/>
          <rect x={w*0.485} y={h*0.78} width={h*0.06} height={h*0.15} fill={light}/>
        </g>
      )}
      {scene === 'wayfinding' && (
        <g>
          <rect x={0} y={h*0.68} width={w} height={h*0.32} fill={mid}/>
          <line x1={w*0.1} y1={h*0.25} x2={w*0.9} y2={h*0.32} stroke={dark} strokeWidth={1}/>
          <rect x={w*0.2} y={h*0.26} width={w*0.08} height={h*0.2} fill={light}/>
          <rect x={w*0.33} y={h*0.28} width={w*0.06} height={h*0.18} fill={`hsl(${hue+20}, 50%, 70%)`}/>
          <rect x={w*0.45} y={h*0.3} width={w*0.1} height={h*0.22} fill={light}/>
          <rect x={w*0.62} y={h*0.3} width={w*0.07} height={h*0.16} fill={`hsl(${hue-20}, 50%, 70%)`}/>
          <rect x={w*0.75} y={h*0.31} width={w*0.08} height={h*0.2} fill={light}/>
          <rect x={0} y={0} width={w*0.15} height={h} fill={dark}/>
          <rect x={w*0.85} y={0} width={w*0.15} height={h} fill={dark}/>
        </g>
      )}
    </g>
  );
}

// ─── DRAWING: pencil doorway elevations ────────────────────────────────
function DrawingScene({ w, h, hue }) {
  const paper  = `hsl(${hue}, 28%, 90%)`;
  const pencil = `hsl(${hue}, 20%, 22%)`;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={paper}/>
      {[0,1,2,3,4,5,6].map(i => {
        const x  = 12 + i * ((w - 24) / 7);
        const bw = (w - 24) / 7 - 4;
        const bh = h * 0.55;
        const top = h - 18 - bh;
        return (
          <g key={i} stroke={pencil} strokeWidth={0.8} fill="none">
            <rect x={x} y={top} width={bw} height={bh} />
            {i % 2 === 0 && (
              <path d={`M ${x} ${top + 8} Q ${x + bw/2} ${top - 6} ${x + bw} ${top + 8}`} />
            )}
            {i === 3 && <circle cx={x + bw/2} cy={top + bh*0.5} r={2} fill={pencil}/>}
            <line x1={x-2} y1={h-18} x2={x+bw+2} y2={h-18} />
          </g>
        );
      })}
      <text x={12} y={h-6} fontFamily={MONO} fontSize="8" fill={pencil} opacity="0.7">
        pencil studies
      </text>
    </g>
  );
}

// ─── BOOK COVER ────────────────────────────────────────────────────────
function BookCover({ w, h, hue, title, author, spine }) {
  const bg = `hsl(${hue}, 30%, 88%)`;
  const coverW = h * 0.7;
  const coverH = h * 0.82;
  const cx = w/2 - coverW/2;
  const cy = h/2 - coverH/2;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      {Array.from({length: 4}, (_,i) => (
        <line key={i} x1={0} y1={h*0.88 + i*2} x2={w} y2={h*0.88 + i*2}
              stroke={`hsl(${hue}, 20%, 78%)`} strokeWidth="0.5"/>
      ))}
      <rect x={cx+3} y={cy+4} width={coverW} height={coverH} fill="#000" opacity="0.18"/>
      <rect x={cx} y={cy} width={coverW} height={coverH} fill={spine}/>
      <rect x={cx+4} y={cy+4} width={coverW-8} height={coverH-8}
            fill="none" stroke="#f5efdf" strokeWidth="0.5" opacity="0.4"/>
      <foreignObject x={cx+4} y={cy + coverH*0.25} width={coverW-8} height={coverH*0.45}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{
          width: '100%', height: '100%', textAlign: 'center', color: '#f5efdf',
          fontFamily: SERIF, fontSize: coverW * 0.11, lineHeight: 1.15,
          padding: '0 4px', overflow: 'hidden', textWrap: 'balance',
        }}>{title}</div>
      </foreignObject>
      <text x={cx + coverW/2} y={cy + coverH*0.9} textAnchor="middle"
            fontFamily={MONO} fontSize={coverW*0.065} fill="#f5efdf" opacity="0.85"
            letterSpacing="1">{author}</text>
    </g>
  );
}

// ─── ARTICLE hero (bridge motif) ───────────────────────────────────────
function ArticleHero({ w, h, hue, source }) {
  const bg = `hsl(${hue}, 40%, 22%)`;
  const fg = `hsl(${hue}, 55%, 85%)`;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      {Array.from({length: 14}, (_,i) => {
        const cluster = i < 7 ? 0 : 1;
        const cx = cluster === 0 ? w*0.28 + (i%7 - 3)*9 : w*0.72 + ((i-7)%7 - 3)*9;
        const cy = cluster === 0 ? h*0.5 + Math.sin(i)*12 : h*0.5 + Math.cos(i)*14;
        return <circle key={i} cx={cx} cy={cy} r={3} fill={fg} opacity={0.7}/>;
      })}
      <line x1={w*0.38} y1={h*0.5} x2={w*0.62} y2={h*0.5}
            stroke={fg} strokeWidth="1.5" strokeDasharray="2 3"/>
      <text x={12} y={h-10} fontFamily={MONO} fontSize="9"
            fill={fg} opacity="0.85" letterSpacing="1">{source}</text>
    </g>
  );
}

// ─── SHELF COVER ───────────────────────────────────────────────────────
function ShelfCover({ w, h, hue, title, author }) {
  const bg = `hsl(${hue}, 35%, 26%)`;
  const fg = `hsl(${hue}, 40%, 92%)`;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      <line x1={16} y1={18} x2={w-16} y2={18} stroke={fg} strokeWidth="0.5" opacity="0.5"/>
      <line x1={16} y1={h-16} x2={w-16} y2={h-16} stroke={fg} strokeWidth="0.5" opacity="0.5"/>
      <foreignObject x={16} y={h*0.3} width={w-32} height={h*0.42}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{
          width: '100%', height: '100%', textAlign: 'center',
          color: fg, fontFamily: SERIF, fontStyle: 'italic',
          fontSize: w * 0.075, lineHeight: 1.2, overflow: 'hidden',
        }}>{title}</div>
      </foreignObject>
      <text x={w/2} y={h-22} textAnchor="middle"
            fontFamily={MONO} fontSize="9" fill={fg} opacity="0.8"
            letterSpacing="1.5">{author}</text>
    </g>
  );
}

// ─── EVENT live: waveform + play + speaker dots ────────────────────────
function EventLive({ w, h, hue, participants }) {
  const bg = `hsl(${hue}, 40%, 18%)`;
  const fg = `hsl(${hue}, 60%, 78%)`;
  const bars = 40;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      {Array.from({length: bars}, (_,i) => {
        const x = (w / bars) * i + 2;
        const a = Math.abs(Math.sin(i*0.6) + Math.cos(i*0.27)) * 0.5;
        const bh = 6 + a * h * 0.5;
        return <rect key={i} x={x} y={h/2 - bh/2} width={(w/bars)-2} height={bh}
                     fill={fg} opacity={0.7}/>;
      })}
      <circle cx={w*0.5} cy={h*0.5} r={h*0.22} fill="rgba(245,239,223,0.92)"/>
      <path d={`M ${w*0.5 - 6} ${h*0.5 - 8} L ${w*0.5 + 10} ${h*0.5} L ${w*0.5 - 6} ${h*0.5 + 8} Z`} fill={bg}/>
      {participants.map((p, i) => (
        <g key={i}>
          <circle cx={14 + i*22} cy={16} r={9} fill={`hsl(${hue + i*30}, 40%, 68%)`}/>
          <text x={14 + i*22} y={19} textAnchor="middle"
                fontFamily={MONO} fontSize="8" fill={bg}>{p}</text>
        </g>
      ))}
    </g>
  );
}

// ─── EVENT async: structured matrix ────────────────────────────────────
function EventAsync({ w, h, hue, participants, rounds }) {
  const bg = `hsl(${hue}, 30%, 94%)`;
  const ink = `hsl(${hue}, 40%, 22%)`;
  const soft = `hsl(${hue}, 30%, 68%)`;
  const nRows = participants.length;
  const cellH = (h - 26) / nRows;
  const cellW = (w - 90) / rounds;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      {Array.from({length: rounds}, (_,r) => (
        <text key={r} x={80 + cellW*(r+0.5)} y={14} textAnchor="middle"
              fontFamily={MONO} fontSize="8" fill={ink} letterSpacing="1">R{r+1}</text>
      ))}
      {participants.map((p, i) => (
        <g key={i}>
          <text x={68} y={26 + cellH*(i+0.5) + 3} textAnchor="end"
                fontFamily={MONO} fontSize="9" fill={ink} letterSpacing="1">{p}</text>
          {Array.from({length: rounds}, (_,r) => (
            <g key={r}>
              <rect x={80 + cellW*r + 2} y={22 + cellH*i + 2}
                    width={cellW-4} height={cellH-4}
                    fill="none" stroke={soft} strokeWidth="0.5"/>
              {Array.from({length: 3}, (_,ln) => (
                <line key={ln}
                      x1={80 + cellW*r + 6}
                      y1={22 + cellH*i + 6 + ln*4}
                      x2={80 + cellW*r + cellW - 6 - ((i+r+ln)%3)*6}
                      y2={22 + cellH*i + 6 + ln*4}
                      stroke={ink} strokeWidth="0.4" opacity="0.5"/>
              ))}
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

// ─── AUDIO wave ────────────────────────────────────────────────────────
function AudioWave({ w, h, hue, peaks }) {
  const bg = `hsl(${hue}, 35%, 20%)`;
  const fg = `hsl(${hue}, 60%, 78%)`;
  const n = peaks.length;
  const gap = 2;
  const bw = (w - gap*(n+1)) / n;
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={bg}/>
      {peaks.map((p, i) => {
        const bh = Math.max(3, p * h * 0.72);
        return <rect key={i} x={gap + i*(bw+gap)} y={h/2 - bh/2}
                     width={bw} height={bh} rx={1} fill={fg}/>;
      })}
      <circle cx={h*0.5} cy={h*0.5} r={h*0.22} fill="rgba(245,239,223,0.9)"/>
      <path d={`M ${h*0.5 - 4} ${h*0.5 - 6} L ${h*0.5 + 7} ${h*0.5} L ${h*0.5 - 4} ${h*0.5 + 6} Z`} fill={bg}/>
    </g>
  );
}

export default Thumbnail;
