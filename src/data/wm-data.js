// Seeded data for Mosaic Phase 3 prototype.
// Persona: Maya R., mid-session. Three held threads — one active, one spawned, one resting.
// Each thread carries finds, notes, mile-markers (reframes that pulled the question's center).

const PALETTE = {
  paper:      "#F6F3EC",
  paperDeep:  "#EDEAE1",
  paperEdge:  "#E0DCD0",
  ink:        "#1A1714",
  inkSoft:    "#3A3530",
  inkMid:     "#5E5A55",
  inkFaint:   "#9A968F",
  inkGhost:   "#C0BDB6",
  inkPale:    "#DEDBD2",
};

// Per-domain palette — lifted from spatial.jsx so cluster identity is consistent.
const DOMAIN = {
  teal:   { bg: "#E8F5F0", accent: "#1A5C46", dot: "#1A5C46", card: "#F3FAF7", soft: "#E8F5F0" },
  purple: { bg: "#ECEAF9", accent: "#3A2D86", dot: "#3A2D86", card: "#F5F3FC", soft: "#ECEAF9" },
  green:  { bg: "#E8F0E3", accent: "#285A18", dot: "#285A18", card: "#F0F6EC", soft: "#E8F0E3" },
  amber:  { bg: "#F8F0DC", accent: "#75580D", dot: "#75580D", card: "#FAF5E8", soft: "#F8F0DC" },
};

// Maya's held threads. Three only — what she's actually carrying right now.
const THREADS = [
  {
    id: "t-platforms",
    q: "When does a platform stop being a tool and start being a place?",
    state: "active",          // most recent reframe
    courtyardName: "platforms-as-places",
    courtyardTopic: "civic form online",
    kindred: [
      { who: "Priya K.",  since: "2 weeks",  q: "What does a platform owe the people who live on it?" },
      { who: "Tom V.",    since: "2 weeks",  q: "How does power shape civic space?" },
      { who: "Dev M.",    since: "5 weeks",  q: "Are tech campuses private cities?" },
      { who: "Elena F.",  since: "4 weeks",  q: "What rituals do online communities invent for themselves?" },
    ],
    domain: "civic form",
    dc: "teal",
    age: "5 months",
    last: "yesterday",
    finds: 23,
    notes: 6,
    mileMarkers: [
      { age: "5 months ago",  q: "What makes a social network feel like a community?" },
      { age: "3 months ago",  q: "Why do online communities die when they get popular?" },
      { age: "5 weeks ago",   q: "What does a platform owe the people who live on it?" },
      { age: "yesterday",     q: "When does a platform stop being a tool and start being a place?" },
    ],
    fl: [
      { t: "A Pattern Language — Pattern 61", s: "Christopher Alexander", d: "5mo", i: "📖", note: "Public squares as 'rooms a town has.' Reread when I keep wanting to call platforms places.", sharedWith: "3 others" },
      { t: "Plurality, ch. 3 — Audrey Tang & Glen Weyl", s: "plurality.net", d: "4mo", i: "🌐", note: "vTaiwan is the only example I keep coming back to." },
      { t: "What Tech Calls Thinking", s: "Adrian Daub", d: "3mo", i: "📖" },
      { t: "On the social life of small online spaces", s: "Robin Sloan, newsletter", d: "6wk", i: "✉" },
      { t: "The Group That Rules The Web", s: "The Verge, profile of W3C", d: "4wk", i: "◻" },
    ],
    notesList: [
      { type: "audio", cap: "Walking Holloway Road thinking about Reddit moderators as zoning boards", dur: "4:12", d: "5wk", sharedWith: "2 others" },
      { type: "text",  cap: "If a platform is a place, then logging off is leaving — and that's the mechanic that's broken.", d: "3wk" },
      { type: "image", cap: "Photographed: the corkboard at Mosaic Café. Also a platform.", d: "2wk" },
    ],
  },
  {
    id: "t-grief",
    q: "What does an institution do for grief that a private ritual cannot?",
    state: "spawned",   // most recently the user spawned this from another thread
    courtyardName: "rituals of grief",
    courtyardTopic: "ritual & form",
    kindred: [
      { who: "Elena F.",   since: "11 days",  q: "Inherited rituals — what do we keep and what do we hand on?" },
      { who: "Hannah O.",  since: "3 weeks",  q: "What is a wake for, when nobody believes in heaven anymore?" },
      { who: "Marco D.",   since: "5 weeks",  q: "Why are secular funerals so often disappointing?" },
      { who: "Ines G.",    since: "2 months", q: "What does a city owe its dead?" },
    ],
    domain: "ritual & form",
    dc: "purple",
    age: "6 weeks",
    last: "4 days ago",
    finds: 11,
    notes: 3,
    spawnedFrom: { id: "t-platforms", at: "6 weeks ago", reason: "split off when 'ritual' kept appearing in platforms thread" },
    mileMarkers: [
      { age: "6 weeks ago", q: "Why does a funeral feel necessary even for non-religious people?" },
      { age: "3 weeks ago", q: "What does an institution do for grief that a private ritual cannot?" },
    ],
    fl: [
      { t: "The Hour of Our Death", s: "Philippe Ariès", d: "5wk", i: "📖" },
      { t: "On the work of mourning", s: "Judith Butler — lecture, video", d: "4wk", i: "▶" },
      { t: "Funeral practices in non-religious communities", s: "JSTOR Daily", d: "2wk", i: "📰" },
    ],
    notesList: [
      { type: "text",  cap: "What I keep noticing: the people who say they don't need a funeral are the ones who've never planned one.", d: "3wk" },
      { type: "audio", cap: "After Sam's memorial — what was held, what wasn't", dur: "6:08", d: "10d" },
    ],
  },
  {
    id: "t-soft",
    q: "Why do soft tools — pencils, voice memos, paper — keep showing up in the work I respect?",
    courtyardName: "soft tools",
    courtyardTopic: "craft & instruments",
    kindred: [
      { who: "Ines G.",  since: "6 weeks",  q: "Why does the best work I do happen on paper, not on screen?" },
      { who: "Markus T.", since: "4 months", q: "What is a tool teaching me about itself when it slows me down?" },
      { who: "Pia L.",   since: "7 weeks",  q: "Why do the people I admire return to obsolete instruments?" },
    ],
    state: "resting",
    domain: "craft",
    dc: "amber",
    age: "8 months",
    last: "3 weeks ago",
    finds: 17,
    notes: 4,
    mileMarkers: [
      { age: "8 months ago", q: "Why do designers I admire never use the apps they design with?" },
      { age: "4 months ago", q: "Why do soft tools — pencils, voice memos, paper — keep showing up in the work I respect?" },
    ],
    fl: [
      { t: "The Craftsman", s: "Richard Sennett", d: "7mo", i: "📖" },
      { t: "Tools for Conviviality", s: "Ivan Illich", d: "6mo", i: "📖" },
      { t: "On the Yamaha PSR-E300", s: "Brian Eno interview, Pitchfork", d: "5mo", i: "◻" },
      { t: "Workshop visit — letterpress at St Bride", s: "field notes", d: "3mo", i: "✎" },
    ],
    notesList: [
      { type: "image", cap: "My desk on a good day — and on a bad day. The good days have more paper.", d: "2mo" },
      { type: "audio", cap: "Reading aloud from Sennett, ch. 4", dur: "8:20", d: "6wk" },
    ],
  },
];

// KINDRED THREADS — full thread data for the people sharing each courtyard.
// Clicking a kindred room in the courtyard navigates into one of these. They
// look identical to Maya's threads (same canvas, same mile-markers, same
// finds/notes), but their right-side aperture still opens to the same
// shared courtyard so you can wander back.

const KINDRED_THREADS = [
  // ── platforms-as-places courtyard ──────────────────────────────
  {
    id: "k-priya-platforms",
    q: "What does a platform owe the people who live on it?",
    state: "active",
    courtyardName: "platforms-as-places",
    courtyardTopic: "civic form online",
    owner: "Priya K.",
    kindred: [
      { who: "Maya R.",  since: "2 weeks",  q: "When does a platform stop being a tool and start being a place?" },
      { who: "Tom V.",   since: "3 weeks",  q: "How does power shape civic space?" },
      { who: "Dev M.",   since: "5 weeks",  q: "Are tech campuses private cities?" },
      { who: "Elena F.", since: "4 weeks",  q: "What rituals do online communities invent for themselves?" },
    ],
    domain: "civic form",
    dc: "teal",
    age: "4 months",
    last: "2 days ago",
    finds: 19,
    notes: 5,
    mileMarkers: [
      { age: "4 months ago", q: "Who pays the cost when a platform breaks?" },
      { age: "2 months ago", q: "What does landlord-tenant law have to teach about Reddit?" },
      { age: "3 weeks ago",  q: "What does a platform owe the people who live on it?" },
    ],
    fl: [
      { t: "Exit, Voice, and Loyalty", s: "Albert Hirschman", d: "4mo", i: "📖", note: "The whole spine of my thread sits in chapter 3." },
      { t: "Section 230, plain-language summary", s: "EFF", d: "3mo", i: "📰" },
      { t: "What landlord-tenant law actually does", s: "Matthew Desmond, NYT", d: "8wk", i: "📰", sharedWith: "Maya R." },
      { t: "Mastodon's federation problem", s: "rebecca-watson.net", d: "5wk", i: "🌐" },
      { t: "Plurality, ch. 3 — Audrey Tang & Glen Weyl", s: "plurality.net", d: "4wk", i: "🌐", note: "Maya pointed me here.", sharedWith: "Maya R." },
    ],
    notesList: [
      { type: "text",  cap: "If users are tenants and the platform is a landlord, what's the equivalent of an eviction notice?", d: "6wk" },
      { type: "audio", cap: "Talking with my brother about what he expected from Discord servers", dur: "5:40", d: "3wk" },
      { type: "text",  cap: "Reframe: the question isn't what platforms owe — it's whether they can owe anything at all.", d: "3wk", sharedWith: "Maya R." },
    ],
  },
  {
    id: "k-tom-platforms",
    q: "How does power shape civic space?",
    state: "active",
    courtyardName: "platforms-as-places",
    courtyardTopic: "civic form online",
    owner: "Tom V.",
    kindred: [
      { who: "Maya R.",  since: "2 weeks",  q: "When does a platform stop being a tool and start being a place?" },
      { who: "Priya K.", since: "3 weeks",  q: "What does a platform owe the people who live on it?" },
      { who: "Dev M.",   since: "6 weeks",  q: "Are tech campuses private cities?" },
      { who: "Elena F.", since: "1 month",  q: "What rituals do online communities invent for themselves?" },
    ],
    domain: "civic form",
    dc: "purple",
    age: "7 months",
    last: "5 days ago",
    finds: 28,
    notes: 9,
    mileMarkers: [
      { age: "7 months ago", q: "Why do cities feel different even when they look the same?" },
      { age: "4 months ago", q: "What does a plaza make possible that a sidewalk doesn't?" },
      { age: "6 weeks ago",  q: "How does power shape civic space?" },
    ],
    fl: [
      { t: "The Death and Life of Great American Cities", s: "Jane Jacobs", d: "7mo", i: "📖", note: "The eyes-on-the-street chapter. Foundation." },
      { t: "Seeing Like a State", s: "James C. Scott", d: "6mo", i: "📖" },
      { t: "Bowling Alone, ch. 12", s: "Robert Putnam", d: "5mo", i: "📖" },
      { t: "On the design of public toilets", s: "Lezlie Lowe — feature", d: "3mo", i: "📰" },
      { t: "Hostile architecture, a photo series", s: "Failed Architecture", d: "8wk", i: "📸" },
    ],
    notesList: [
      { type: "audio", cap: "Walking Times Square at 2am — the empty privatized plaza problem", dur: "7:14", d: "9wk" },
      { type: "image", cap: "The bench with armrests every 18 inches. Whom is this not for?", d: "6wk" },
      { type: "text",  cap: "Maya's question about platforms-as-places — same shape, different scale. Whose place is it?", d: "2wk", sharedWith: "Maya R." },
    ],
  },
  {
    id: "k-dev-platforms",
    q: "Are tech campuses private cities?",
    state: "resting",
    courtyardName: "platforms-as-places",
    courtyardTopic: "civic form online",
    owner: "Dev M.",
    kindred: [
      { who: "Maya R.",  since: "5 weeks",  q: "When does a platform stop being a tool and start being a place?" },
      { who: "Priya K.", since: "5 weeks",  q: "What does a platform owe the people who live on it?" },
      { who: "Tom V.",   since: "6 weeks",  q: "How does power shape civic space?" },
      { who: "Elena F.", since: "2 months", q: "What rituals do online communities invent for themselves?" },
    ],
    domain: "craft",
    dc: "amber",
    age: "9 months",
    last: "3 weeks ago",
    finds: 31,
    notes: 7,
    mileMarkers: [
      { age: "9 months ago", q: "Why do tech campuses all look the same?" },
      { age: "5 months ago", q: "What is the difference between a campus and a town?" },
      { age: "10 weeks ago", q: "Are tech campuses private cities?" },
    ],
    fl: [
      { t: "Pullman: An Experiment in Industrial Order", s: "Stanley Buder", d: "9mo", i: "📖" },
      { t: "Apple Park — a critical reading", s: "Allison Arieff, NYT", d: "7mo", i: "📰" },
      { t: "Disney's Celebration, FL — 25 years on", s: "The Atlantic", d: "5mo", i: "📰" },
      { t: "Plurality, ch. 3 — Audrey Tang & Glen Weyl", s: "plurality.net", d: "4mo", i: "🌐", note: "Saved from Maya's thread.", sharedWith: "Maya R." },
      { t: "On master-planned communities", s: "Witold Rybczynski", d: "3mo", i: "📖" },
    ],
    notesList: [
      { type: "audio", cap: "Driving through Mountain View after a Googleplex tour — the unease", dur: "6:30", d: "4mo" },
      { type: "image", cap: "The Apple Park visitor center gift shop. A city has gift shops too.", d: "10wk" },
      { type: "text",  cap: "A campus pretends not to be a city. That pretending is the design choice.", d: "5wk" },
    ],
  },
  {
    id: "k-elena-platforms",
    q: "What rituals do online communities invent for themselves?",
    state: "spawned",
    courtyardName: "platforms-as-places",
    courtyardTopic: "civic form online",
    owner: "Elena F.",
    kindred: [
      { who: "Maya R.",  since: "4 weeks",  q: "When does a platform stop being a tool and start being a place?" },
      { who: "Priya K.", since: "4 weeks",  q: "What does a platform owe the people who live on it?" },
      { who: "Tom V.",   since: "1 month",  q: "How does power shape civic space?" },
      { who: "Dev M.",   since: "2 months", q: "Are tech campuses private cities?" },
    ],
    domain: "ritual & form",
    dc: "green",
    age: "3 months",
    last: "today",
    finds: 14,
    notes: 8,
    mileMarkers: [
      { age: "3 months ago", q: "Why do online spaces feel ritually empty?" },
      { age: "6 weeks ago",  q: "What does an emoji react actually replace?" },
      { age: "2 weeks ago",  q: "What rituals do online communities invent for themselves?" },
    ],
    fl: [
      { t: "Ritual: Perspectives and Dimensions", s: "Catherine Bell", d: "3mo", i: "📖" },
      { t: "On the upvote as social currency", s: "Mike Caulfield, blog", d: "10wk", i: "✉" },
      { t: "Twitch chat as call-and-response", s: "T.L. Taylor, paper", d: "8wk", i: "📰" },
      { t: "Birthday wishes on Facebook — the persistence study", s: "Pew Research", d: "5wk", i: "📊" },
      { t: "How Discord servers invent welcome ceremonies", s: "field notes by E.F.", d: "3wk", i: "✎" },
    ],
    notesList: [
      { type: "audio", cap: "Watching my niece's Animal Crossing 'birthday party'. The form is older than the medium.", dur: "5:08", d: "6wk" },
      { type: "text",  cap: "Reframe: the question isn't whether online has rituals — it's which old rituals it's borrowing without noticing.", d: "3wk" },
      { type: "image", cap: "Screenshot: the 'press F to pay respects' meme. Sincere ritual or its parody?", d: "10d" },
    ],
  },

  // ── rituals of grief courtyard ─────────────────────────────────
  {
    id: "k-elena-grief",
    q: "Inherited rituals — what do we keep and what do we hand on?",
    state: "active",
    courtyardName: "rituals of grief",
    courtyardTopic: "ritual & form",
    owner: "Elena F.",
    kindred: [
      { who: "Maya R.",  since: "11 days",  q: "What does an institution do for grief that a private ritual cannot?" },
      { who: "Hannah O.", since: "3 weeks", q: "What is a wake for, when nobody believes in heaven anymore?" },
      { who: "Marco D.",  since: "5 weeks", q: "Why are secular funerals so often disappointing?" },
      { who: "Ines G.",   since: "2 months", q: "What does a city owe its dead?" },
    ],
    domain: "ritual & form",
    dc: "purple",
    age: "5 months",
    last: "yesterday",
    finds: 22,
    notes: 11,
    mileMarkers: [
      { age: "5 months ago", q: "Which of my grandmother's rituals am I unconsciously keeping?" },
      { age: "2 months ago", q: "What gets passed down when nobody calls it tradition anymore?" },
      { age: "3 weeks ago",  q: "Inherited rituals — what do we keep and what do we hand on?" },
    ],
    fl: [
      { t: "The Invention of Tradition", s: "Hobsbawm & Ranger", d: "5mo", i: "📖" },
      { t: "On the work of mourning", s: "Judith Butler — lecture, video", d: "3mo", i: "▶", sharedWith: "Maya R." },
      { t: "Mexican Day of the Dead, secular adaptations", s: "NYT travel feature", d: "8wk", i: "📰" },
      { t: "A history of the kaddish", s: "Leon Wieseltier", d: "5wk", i: "📖" },
    ],
    notesList: [
      { type: "image", cap: "My grandmother's prayer book — every other page dog-eared. I keep it but never open it.", d: "3mo" },
      { type: "text",  cap: "Maya asked the institution question. I'm asking the inheritance question. They meet somewhere.", d: "2wk", sharedWith: "Maya R." },
      { type: "audio", cap: "Calling my mother to ask what we did for funerals before we stopped going to church", dur: "12:04", d: "10d" },
    ],
  },
  {
    id: "k-hannah-grief",
    q: "What is a wake for, when nobody believes in heaven anymore?",
    state: "active",
    courtyardName: "rituals of grief",
    courtyardTopic: "ritual & form",
    owner: "Hannah O.",
    kindred: [
      { who: "Maya R.",  since: "3 weeks",  q: "What does an institution do for grief that a private ritual cannot?" },
      { who: "Elena F.", since: "3 weeks",  q: "Inherited rituals — what do we keep and what do we hand on?" },
      { who: "Marco D.", since: "6 weeks",  q: "Why are secular funerals so often disappointing?" },
      { who: "Ines G.",  since: "8 weeks",  q: "What does a city owe its dead?" },
    ],
    domain: "civic form",
    dc: "teal",
    age: "4 months",
    last: "4 days ago",
    finds: 17,
    notes: 6,
    mileMarkers: [
      { age: "4 months ago", q: "Why did I cry at the wake of someone I barely knew?" },
      { age: "2 months ago", q: "What does the body of the deceased do in a wake?" },
      { age: "5 weeks ago",  q: "What is a wake for, when nobody believes in heaven anymore?" },
    ],
    fl: [
      { t: "Death's Door — Sandra Gilbert", s: "Sandra Gilbert", d: "4mo", i: "📖" },
      { t: "Irish wakes — an oral history", s: "RTÉ archive", d: "3mo", i: "▶" },
      { t: "The Hour of Our Death", s: "Philippe Ariès", d: "10wk", i: "📖" },
      { t: "Why we look at the body", s: "Thomas Lynch, essay", d: "5wk", i: "📰" },
    ],
    notesList: [
      { type: "text",  cap: "A wake is for the living. We knew that already. The question is what kind of work it does on the living.", d: "8wk" },
      { type: "audio", cap: "After M's wake — the strange comfort of being in a room of strangers crying", dur: "9:22", d: "3wk" },
    ],
  },
  {
    id: "k-marco-grief",
    q: "Why are secular funerals so often disappointing?",
    state: "resting",
    courtyardName: "rituals of grief",
    courtyardTopic: "ritual & form",
    owner: "Marco D.",
    kindred: [
      { who: "Maya R.",  since: "5 weeks",  q: "What does an institution do for grief that a private ritual cannot?" },
      { who: "Elena F.", since: "5 weeks",  q: "Inherited rituals — what do we keep and what do we hand on?" },
      { who: "Hannah O.", since: "6 weeks", q: "What is a wake for, when nobody believes in heaven anymore?" },
      { who: "Ines G.",   since: "3 months", q: "What does a city owe its dead?" },
    ],
    domain: "craft",
    dc: "amber",
    age: "8 months",
    last: "2 weeks ago",
    finds: 25,
    notes: 4,
    mileMarkers: [
      { age: "8 months ago", q: "Why did my father's service feel like a corporate offsite?" },
      { age: "5 months ago", q: "What's missing when there's nothing to do with your hands at a funeral?" },
      { age: "10 weeks ago", q: "Why are secular funerals so often disappointing?" },
    ],
    fl: [
      { t: "The Undertaking — Thomas Lynch", s: "Thomas Lynch", d: "8mo", i: "📖" },
      { t: "What atheists do at funerals — interview series", s: "Aeon", d: "6mo", i: "📰" },
      { t: "Humanist celebrant training, syllabus", s: "BHA", d: "4mo", i: "✎" },
      { t: "On the choreography of religious services", s: "Liturgy Studies vol. 22", d: "10wk", i: "📖" },
    ],
    notesList: [
      { type: "text",  cap: "The problem isn't that secular services are short on meaning. It's that they're short on form.", d: "10wk" },
      { type: "image", cap: "The PowerPoint slide at my uncle's memorial. We can do better than this.", d: "8wk" },
    ],
  },
  {
    id: "k-ines-grief",
    q: "What does a city owe its dead?",
    state: "active",
    courtyardName: "rituals of grief",
    courtyardTopic: "ritual & form",
    owner: "Ines G.",
    kindred: [
      { who: "Maya R.",  since: "2 months", q: "What does an institution do for grief that a private ritual cannot?" },
      { who: "Elena F.", since: "2 months", q: "Inherited rituals — what do we keep and what do we hand on?" },
      { who: "Hannah O.", since: "8 weeks", q: "What is a wake for, when nobody believes in heaven anymore?" },
      { who: "Marco D.",  since: "3 months", q: "Why are secular funerals so often disappointing?" },
    ],
    domain: "civic form",
    dc: "teal",
    age: "10 months",
    last: "1 week ago",
    finds: 33,
    notes: 12,
    mileMarkers: [
      { age: "10 months ago", q: "Why are there no public memorials for the COVID dead?" },
      { age: "6 months ago",  q: "Who is responsible for civic grief?" },
      { age: "2 months ago",  q: "What does a city owe its dead?" },
    ],
    fl: [
      { t: "The Architecture of Mourning", s: "various essays — MIT Press", d: "10mo", i: "📖" },
      { t: "On the Vietnam Memorial — design history", s: "Maya Lin, interview", d: "8mo", i: "▶" },
      { t: "The AIDS Memorial Quilt — archive", s: "Smithsonian", d: "6mo", i: "🌐" },
      { t: "Why London has so few plaques for plague victims", s: "Spitalfields Life, blog", d: "3mo", i: "✉" },
    ],
    notesList: [
      { type: "image", cap: "The wall of names at the COVID memorial in NYC. Took me twenty minutes to find anyone.", d: "4mo" },
      { type: "audio", cap: "Standing in front of the Vietnam Memorial — what the design does", dur: "8:55", d: "10wk" },
      { type: "text",  cap: "A city without monuments to its dead is a city pretending not to know what it is.", d: "5wk" },
    ],
  },

  // ── soft tools courtyard ───────────────────────────────────────
  {
    id: "k-ines-soft",
    q: "Why does the best work I do happen on paper, not on screen?",
    state: "active",
    courtyardName: "soft tools",
    courtyardTopic: "craft & instruments",
    owner: "Ines G.",
    kindred: [
      { who: "Maya R.",   since: "6 weeks",  q: "Why do soft tools — pencils, voice memos, paper — keep showing up in the work I respect?" },
      { who: "Markus T.", since: "3 months", q: "What is a tool teaching me about itself when it slows me down?" },
      { who: "Pia L.",    since: "8 weeks",  q: "Why do the people I admire return to obsolete instruments?" },
    ],
    domain: "craft",
    dc: "amber",
    age: "4 months",
    last: "5 days ago",
    finds: 18,
    notes: 9,
    mileMarkers: [
      { age: "4 months ago", q: "Why do I keep printing things I could just read on screen?" },
      { age: "2 months ago", q: "What does paper do that a screen can't?" },
      { age: "3 weeks ago",  q: "Why does the best work I do happen on paper, not on screen?" },
    ],
    fl: [
      { t: "The Craftsman", s: "Richard Sennett", d: "4mo", i: "📖", sharedWith: "Maya R." },
      { t: "How notebooks teach", s: "Roland Allen", d: "3mo", i: "📖" },
      { t: "The Cognitive Style of PowerPoint", s: "Edward Tufte", d: "10wk", i: "✉" },
      { t: "A printer's apprentice — interview", s: "Eye magazine", d: "6wk", i: "📰" },
    ],
    notesList: [
      { type: "image", cap: "Side by side: notebook draft and Figma draft. The notebook is better. Embarrassing.", d: "3mo" },
      { type: "text",  cap: "Paper holds attention because it can't ping you.", d: "8wk" },
      { type: "audio", cap: "At the letterpress workshop — the way time slows down around a tray of type", dur: "4:48", d: "5wk" },
    ],
  },
  {
    id: "k-markus-soft",
    q: "What is a tool teaching me about itself when it slows me down?",
    state: "resting",
    courtyardName: "soft tools",
    courtyardTopic: "craft & instruments",
    owner: "Markus T.",
    kindred: [
      { who: "Maya R.",  since: "4 months", q: "Why do soft tools — pencils, voice memos, paper — keep showing up in the work I respect?" },
      { who: "Ines G.",  since: "3 months", q: "Why does the best work I do happen on paper, not on screen?" },
      { who: "Pia L.",   since: "5 months", q: "Why do the people I admire return to obsolete instruments?" },
    ],
    domain: "ritual & form",
    dc: "purple",
    age: "11 months",
    last: "1 month ago",
    finds: 26,
    notes: 5,
    mileMarkers: [
      { age: "11 months ago", q: "Why did I get faster on the violin only after switching to a worse bow?" },
      { age: "7 months ago",  q: "What slowness is functional and what is just friction?" },
      { age: "5 months ago",  q: "What is a tool teaching me about itself when it slows me down?" },
    ],
    fl: [
      { t: "Tools for Conviviality", s: "Ivan Illich", d: "11mo", i: "📖", sharedWith: "Maya R." },
      { t: "On the embouchure of the Baroque oboe", s: "Bruce Haynes", d: "8mo", i: "📖" },
      { t: "Why pianists practice scales the slow way", s: "interview, The Strad", d: "6mo", i: "📰" },
      { t: "Slow programming, a manifesto", s: "Github gist", d: "4mo", i: "✉" },
    ],
    notesList: [
      { type: "audio", cap: "Practicing the same eight bars at half speed. Hearing them for the first time.", dur: "7:02", d: "5mo" },
      { type: "text",  cap: "The friction is the lesson. Lower the friction and you skip the lesson.", d: "3mo" },
    ],
  },
  {
    id: "k-pia-soft",
    q: "Why do the people I admire return to obsolete instruments?",
    state: "active",
    courtyardName: "soft tools",
    courtyardTopic: "craft & instruments",
    owner: "Pia L.",
    kindred: [
      { who: "Maya R.",   since: "7 weeks",  q: "Why do soft tools — pencils, voice memos, paper — keep showing up in the work I respect?" },
      { who: "Ines G.",   since: "8 weeks",  q: "Why does the best work I do happen on paper, not on screen?" },
      { who: "Markus T.", since: "5 months", q: "What is a tool teaching me about itself when it slows me down?" },
    ],
    domain: "ritual & form",
    dc: "green",
    age: "6 months",
    last: "2 weeks ago",
    finds: 20,
    notes: 7,
    mileMarkers: [
      { age: "6 months ago", q: "Why is every great photographer I know shooting film again?" },
      { age: "3 months ago", q: "What does an obsolete tool give back?" },
      { age: "7 weeks ago",  q: "Why do the people I admire return to obsolete instruments?" },
    ],
    fl: [
      { t: "On the Yamaha PSR-E300", s: "Brian Eno interview, Pitchfork", d: "5mo", i: "◻", sharedWith: "Maya R." },
      { t: "Why filmmakers still cut on film", s: "Walter Murch — interview", d: "4mo", i: "▶" },
      { t: "The aesthetic of constraint", s: "Steven Johnson, blog", d: "10wk", i: "✉" },
      { t: "Riso printers — a profile", s: "It's Nice That", d: "6wk", i: "📰" },
    ],
    notesList: [
      { type: "image", cap: "A roll of Portra 400 next to the iPhone shot of the same scene. The film one is asking a question.", d: "3mo" },
      { type: "text",  cap: "Obsolete tools survive because they're carrying something the new tool dropped on the way.", d: "8wk" },
    ],
  },
];

// PERSONAL THREADS — owners not yet inside a courtyard. Same shape as
// KINDRED_THREADS but with no courtyardName/Topic and no kindred. The
// promenade browses these too; an item from one of these can't be the
// basis of a "join courtyard" action (there's nothing to join yet) — only
// a "request to merge" can fold the two threads into a new courtyard.
const PERSONAL_THREADS = [
  {
    id: "p-juno-letters",
    q: "Why do letters survive when emails don't?",
    state: "active",
    courtyardName: null,
    courtyardTopic: null,
    owner: "Juno R.",
    kindred: [],
    domain: "form & memory",
    dc: "purple",
    age: "5 months",
    last: "3 days ago",
    finds: 9,
    notes: 4,
    mileMarkers: [
      { age: "5 months ago", q: "Why do I still have my grandmother's letters?" },
      { age: "2 months ago", q: "Why do letters survive when emails don't?" },
    ],
    fl: [
      { t: "The Lost Art of Letter Writing", s: "Catherine Field, NYT", d: "4mo", i: "📰" },
      { t: "On the materiality of correspondence", s: "Lydia Davis — essay", d: "10wk", i: "✎" },
      { t: "Why Susan Sontag kept everything", s: "Benjamin Moser, biography excerpt", d: "6wk", i: "📖" },
      { t: "A history of the postal service", s: "Winifred Gallagher", d: "3wk", i: "📖" },
    ],
    notesList: [
      { type: "image", cap: "The shoebox at the back of the closet. Forty years of paper. Nobody's email archive feels like this.", d: "6wk" },
      { type: "text",  cap: "An email asks to be answered. A letter just asks to be kept.", d: "3wk" },
    ],
  },
  {
    id: "p-arno-walking",
    q: "What does a walk give back that a run doesn't?",
    state: "resting",
    courtyardName: null,
    courtyardTopic: null,
    owner: "Arno L.",
    kindred: [],
    domain: "attention",
    dc: "green",
    age: "9 months",
    last: "2 weeks ago",
    finds: 12,
    notes: 5,
    mileMarkers: [
      { age: "9 months ago", q: "Why do my best ideas show up on the walk home?" },
      { age: "4 months ago", q: "What does a walk give back that a run doesn't?" },
    ],
    fl: [
      { t: "Wanderlust: A History of Walking", s: "Rebecca Solnit", d: "8mo", i: "📖" },
      { t: "On the philosophy of walking", s: "Frédéric Gros", d: "6mo", i: "📖" },
      { t: "Why Steve Jobs took walking meetings", s: "Quartz, profile", d: "3mo", i: "📰" },
      { t: "Field notes — the South Downs Way", s: "personal log", d: "10wk", i: "✎" },
    ],
    notesList: [
      { type: "audio", cap: "Recording while walking — the rhythm of the sentences changes", dur: "11:04", d: "3mo" },
      { type: "text",  cap: "A run produces effort. A walk produces noticing. They're not the same currency.", d: "4wk" },
    ],
  },
  {
    id: "p-sora-quiet",
    q: "What is a library doing that a café isn't?",
    state: "active",
    courtyardName: null,
    courtyardTopic: null,
    owner: "Sora M.",
    kindred: [],
    domain: "civic form",
    dc: "teal",
    age: "3 months",
    last: "yesterday",
    finds: 10,
    notes: 3,
    mileMarkers: [
      { age: "3 months ago", q: "Why do I work better in libraries than at home?" },
      { age: "6 weeks ago",  q: "What is a library doing that a café isn't?" },
    ],
    fl: [
      { t: "Palaces for the People", s: "Eric Klinenberg", d: "3mo", i: "📖" },
      { t: "On third places", s: "Ray Oldenburg — chapter scan", d: "10wk", i: "📖" },
      { t: "The economics of the public library", s: "Brookings paper", d: "5wk", i: "📄" },
      { t: "What happens when you defund a library", s: "Guardian longread", d: "2wk", i: "📰" },
    ],
    notesList: [
      { type: "image", cap: "Sunday at the British Library — strangers concentrating in parallel. Café doesn't do this.", d: "5wk" },
      { type: "text",  cap: "A library asks nothing of you. That's the whole technology.", d: "10d" },
    ],
  },
];

// COURTYARD: activity in BOTH directions.
// (a) what others did to/about Maya's threads (incoming)
// (b) what Maya did to/about others' threads (outgoing)
// (c) requests addressed to Maya — defer / accept / decline
const COURTYARD = {
  incoming: [
    {
      id: "ci1", threadId: "t-platforms", kind: "reframe",
      who: "@priya_k", what: "reframed her thread after reading yours",
      detail: "was: \"How do online communities die?\" — now: \"What does a platform owe the people who live on it?\"",
      when: "6 days ago",
    },
    {
      id: "ci2", threadId: "t-platforms", kind: "find-shared",
      who: "@dev_m", what: "saved your finding of Plurality ch. 3 into",
      detail: "her thread, \"Tech campuses as private cities\"",
      when: "9 days ago",
    },
    {
      id: "ci3", threadId: "t-platforms", kind: "spawn",
      who: "@tom_v", what: "spawned a new thread off yours",
      detail: "\"How power shapes civic space\" — closed shelf forming",
      when: "2 weeks ago",
    },
    {
      id: "ci4", threadId: "t-grief", kind: "incorporate",
      who: "@elena_f", what: "incorporated your note on funerals into",
      detail: "her closed shelf, \"Inherited rituals\"",
      when: "11 days ago",
    },
    {
      id: "ci5", threadId: "t-soft", kind: "find-shared",
      who: "@carlos_t", what: "saved your Sennett finding to",
      detail: "his thread on \"Apprenticeship and tacit knowledge\"",
      when: "4 weeks ago",
    },
  ],
  outgoing: [
    {
      id: "co1", who: "@priya_k", their: "What does a platform owe the people who live on it?",
      what: "you saved 3 of her finds to your platforms thread",
      when: "5 days ago",
    },
    {
      id: "co2", who: "@tom_v", their: "How power shapes civic space",
      what: "you reframed your thread after reading hers",
      when: "12 days ago",
    },
  ],
  requests: [
    {
      id: "r1", who: "@priya_k", asks: "Would you join a written exchange about platforms-as-places?",
      detail: "Three voices, one week, asynchronous. Your thread, hers, and @tom_v's.",
      kind: "exchange",
    },
    {
      id: "r2", who: "@elena_f", asks: "Read the closed-shelf draft of \"Inherited rituals\"?",
      detail: "She'd like a single response — a sentence, a paragraph, a reframe — before she publishes.",
      kind: "review",
    },
  ],
  // The promenade aperture's gating: visit / dwell / respond
  promenadeGate: { visited: true, dwelled: false, responded: false },
};

// TOWN HALL: chapter-level. Pinned notes from the local Mosaic chapter.
// Insights and complaints from members. Decisions get a marker.
const TOWN_HALL = {
  chapter: { name: "Hawley, PA", members: 47, nextMeeting: "Apr 28, 7pm" },
  pinned: [
    { id: "p1", kind: "insight",  who: "@maya_r",  text: "The threads I'm proudest of are the ones I almost closed three times.", when: "2 weeks ago", responses: 8 },
    { id: "p2", kind: "complaint", who: "@dev_m",  text: "The courtyard surfaces too much from people I don't know yet. I want a slower introduction.", when: "1 week ago", responses: 4 },
    { id: "p3", kind: "insight",  who: "@elena_f", text: "Mile-markers changed how I write. I keep my reframes in a notebook now, not just here.", when: "3 weeks ago", responses: 12 },
    { id: "p4", kind: "complaint", who: "@tom_v",  text: "Search keeps showing me what I'd already find. I want it to push me into rooms I wouldn't enter.", when: "5 days ago", responses: 6 },
    { id: "p5", kind: "insight",  who: "@priya_k", text: "A thread that gets reframed by another person is different from a thread you reframe yourself. Keep both.", when: "10 days ago", responses: 9 },
    { id: "p6", kind: "decision", who: "chapter",  text: "Apr 28 — vote on whether to open courtyard requests to all members or keep them between threads.", when: "scheduled", responses: 0 },
  ],
  // Bulletin — local get-togethers, recurring or one-time.
  bulletin: [
    { id: "b1", kind: "recurring", icon: "☕", label: "Mosaic Café — study meetup",
      when: "Thursdays 4–6pm", where: "Mosaic Café, Main St.",
      detail: "Open study session. Bring a thread you're working on. Coffee half-price for chapter members.",
      attending: 8, threadAnchor: "t-platforms" },
    { id: "b2", kind: "recurring", icon: "🔧", label: "Hawley Makerspace — open workshop",
      when: "Saturdays 10am–2pm", where: "12 Welwood Ave.",
      detail: "Woodworking, electronics, 3D printing. Mentor hours with local craftspeople. Materials provided for under-18s.",
      attending: 14, threadAnchor: "t-soft" },
    { id: "b3", kind: "one-time", icon: "🎭", label: "'Seeing Like a State' screening",
      when: "Apr 22, 7pm", where: "The Ritz Theatre",
      detail: "Documentary followed by open discussion anchored to Maya R.'s urban-design thread.",
      attending: 23, threadAnchor: "t-platforms" },
    { id: "b4", kind: "recurring", icon: "📚", label: "Reading circle — 'The Ghost Map'",
      when: "Sundays 2pm", where: "Bingham Park Pavilion",
      detail: "Rotating book discussions. Connected to 3 active local threads.",
      attending: 6, threadAnchor: null },
    { id: "b5", kind: "one-time", icon: "🕯", label: "Memorial circle for Sam K.",
      when: "May 4, 5pm", where: "Riverwalk Gazebo",
      detail: "Open to all. Brief readings, then open floor. Connected to @maya_r's grief thread.",
      attending: 11, threadAnchor: "t-grief" },
  ],
  // Local content — pieces by chapter members or shared into the chapter.
  local: [
    { id: "lc1", x: 52, y: 40, icon: "🎨", who: "Sara K.", kind: "Ceramics",
      label: "Kiln-building tutorial — 4-part series",
      detail: "Local ceramicist sharing a video series on building a small wood-fired kiln.",
      finds: 12, threadAnchor: "t-soft" },
    { id: "lc2", x: 35, y: 18, icon: "🌿", who: "Tom Russo", kind: "Permaculture",
      label: "Soil biology fundamentals — repost",
      detail: "Reposting a university lecture series on mycorrhizal networks.",
      finds: 8, threadAnchor: null },
    { id: "lc3", x: 72, y: 62, icon: "⚡", who: "Dev Collective", kind: "Workshop",
      label: "Solar workshop — recording + materials list",
      detail: "Last month's solar panel workshop at the makerspace. Includes local supplier contacts.",
      finds: 19, threadAnchor: null },
    { id: "lc4", x: 20, y: 42, icon: "📸", who: "Elena M.", kind: "Photography",
      label: "Main St. through decades — photo essay",
      detail: "Documenting architectural changes downtown. Connected to urban-design threads.",
      finds: 31, threadAnchor: "t-platforms" },
    { id: "lc5", x: 60, y: 75, icon: "✎", who: "Priya K.", kind: "Essay",
      label: "On apprenticeship and tacit knowledge",
      detail: "Field notes from her thread, reshaped into a public draft.",
      finds: 7, threadAnchor: "t-soft" },
  ],
};

// SEARCH: the four postures the system surfaces when you type a question.
// Used by the Search room as the contract for what Claude returns.
const SEARCH_POSTURES = [
  { id: "sharpen",    label: "Sharpen",    blurb: "cuts closer to what you're actually asking" },
  { id: "complicate", label: "Complicate", blurb: "introduces a tension your framing doesn't hold" },
  { id: "bridge",     label: "Bridge",     blurb: "the same shape of question, in a distant domain" },
  { id: "ground",     label: "Ground",     blurb: "a specific case, a person, a primary source" },
];

// Adjacent users — for the leak-in tweak. When leakIn is on, search results
// include "n others nearby" annotations and a fifth posture-less card.
const ADJACENT_USERS = [
  { handle: "@priya_k", thread: "What does a platform owe the people who live on it?" },
  { handle: "@tom_v",   thread: "How power shapes civic space" },
  { handle: "@dev_m",   thread: "Tech campuses as private cities" },
];

export { PALETTE, DOMAIN, THREADS, KINDRED_THREADS, PERSONAL_THREADS, COURTYARD, TOWN_HALL, SEARCH_POSTURES, ADJACENT_USERS };
export const WM = { PALETTE, DOMAIN, THREADS, KINDRED_THREADS, PERSONAL_THREADS, COURTYARD, TOWN_HALL, SEARCH_POSTURES, ADJACENT_USERS };
