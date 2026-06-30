/* ============================================================================
   FILE: app/model.js — data model, migration, deep links, remote loading.
   Depends on: helpers.js (slug, NEW_TAG_PALETTE).
   Used by: every other file (the state shape + helpers defined here are the
   contract the whole app reads/writes).

   Index of this file, top to bottom:
     defaults             DEFAULT_CATEGORIES / DEFAULT_MATERIALS / starterPieces
                           — only used to seed DEFAULT_STATE / buildDefaultTags
     faceted tag system    CORE_FACETS, buildDefaultTags, DEFAULT_STATE, STORAGE_KEY
                           — the v4 schema: one `tags` vocabulary stamped with a `facet`
     faceted tag helpers   tagIndex, facetTags, pieceFacet, primaryStyle
                           — read-side accessors used throughout the UI
     rooms-as-references   libIndex, roomPieces
                           — the library is the single source of truth; rooms only
                           hold {libId} refs, hydrated into runnable pieces here
     withDefaults()         the v3 → v4 migration (see its own comment below) — runs
                           on every load/remote-fetch/import so old data never breaks
     deep links             ?room= / ?dev=true URL params, findQuizByParam
     scoring constants      MIN_QUESTIONS, ACTIONS (reaction deltas), EXIT_CLASS, sign
     remote loading          fetchJson, loadFromManifest (reads a hosted manifest.json)
   ============================================================================ */

/* ---------------- defaults ---------------- */
const DEFAULT_CATEGORIES = [
  { key: 'scandinavian', label: 'Scandinavian', color: '#E4DCC9', desc: 'Light wood, soft neutrals, and clean lines. Calm, functional, and a little cozy.' },
  { key: 'industrial', label: 'Industrial', color: '#46423C', desc: 'Raw metal, exposed wood, and visible structure. Built with a workshop edge.' },
  { key: 'bohemian', label: 'Bohemian', color: '#C0744A', desc: 'Layered textures, global patterns, and warm color. Collected over time, not all at once.' },
  { key: 'midcentury', label: 'Mid-Century Modern', color: '#5E7A6C', desc: 'Tapered legs, warm walnut, and gentle curves. Retro shapes that still feel current.' },
  { key: 'rustic', label: 'Rustic & Farmhouse', color: '#9C7B52', desc: 'Reclaimed wood, worn finishes, and handcrafted joints. Furniture with some history in it.' },
  { key: 'minimalist', label: 'Minimalist', color: '#F2EEE6', desc: 'Pared-back forms and quiet color. Pieces that earn their place in the room.' },
  { key: 'traditional', label: 'Traditional', color: '#5A352E', desc: 'Rich wood tones and classic silhouettes. Built to be passed down.' },
  { key: 'maximalist', label: 'Maximalist & Eclectic', color: '#CE9A33', desc: 'Bold color, mixed pattern, and fearless pairings. A room that tells a story all at once.' },
  { key: 'coastal', label: 'Coastal', color: '#A9C4CE', desc: 'Breezy, light, and relaxed. Pale woods, soft blues, and natural fibers.' },
  { key: 'japandi', label: 'Japandi', color: '#B7AC97', desc: 'Japanese restraint meets Scandinavian warmth. Low, quiet, and natural.' },
  { key: 'artdeco', label: 'Art Deco', color: '#2F4858', desc: 'Bold geometry, rich contrast, and metallic accents. Glamour with structure.' },
  { key: 'contemporary', label: 'Contemporary', color: '#8A8782', desc: 'Current, neutral, and uncluttered. Of-the-moment without chasing a single era.' },
];
const STARTER = {
  scandinavian: ['Pale Oak Lounge Chair', 'Light Birch Sideboard', 'Linen-Wrapped Sofa'],
  industrial: ['Blackened Steel Shelving', 'Reclaimed Pipe Table', 'Riveted Leather Stool'],
  bohemian: ['Rattan Peacock Chair', 'Patterned Kilim Pouf', 'Macrame Wall Hanging'],
  midcentury: ['Tapered-Leg Armchair', 'Walnut Credenza', 'Atomic-Era Pendant Lamp'],
  rustic: ['Reclaimed Plank Table', 'Wrought-Iron Floor Lamp', 'Slipcovered Sofa'],
  minimalist: ['Bare Oak Bench', 'Concrete Stool', 'Unadorned White Cabinet'],
  traditional: ['Tufted Wingback Chair', 'Carved Mahogany Bookcase', 'Damask Ottoman'],
  maximalist: ['Velvet Jewel-Tone Sofa', 'Mixed-Pattern Armchair', 'Gallery Wall Console'],
};
function starterPieces(prefix, keys) {
  let pieces = [], n = 1;
  keys.forEach((k) => (STARTER[k] || []).forEach((name) => { pieces.push({ id: `${prefix}${String(n).padStart(2, '0')}`, name, imageUrl: '', tags: [k] }); n++; }));
  return pieces;
}
const LIVING_TAGS = ['scandinavian', 'industrial', 'bohemian', 'midcentury', 'rustic', 'minimalist', 'traditional', 'maximalist'];
// materials vocabulary for the master library — a managed list so pieces can be filtered by it
const DEFAULT_MATERIALS = [
  { key: 'wood', label: 'Wood' },
  { key: 'metal', label: 'Metal' },
  { key: 'leather', label: 'Leather' },
  { key: 'fabric', label: 'Fabric' },
  { key: 'velvet', label: 'Velvet' },
  { key: 'rattan', label: 'Rattan / Cane' },
  { key: 'glass', label: 'Glass' },
  { key: 'stone', label: 'Stone / Marble' },
];
/* ---------------- faceted tag system ----------------
   ONE vocabulary (`tags`), every entry stamped with its `facet`. Controlled-vocabulary
   facets (style / material / object / palette + any custom one) live here, and pieces
   reference them by id in `piece.tags` (a flat, mixed-facet array). The color facet is
   free-valued, so pieces carry hex directly in `colors` / `accentColors` — a palette is
   how you save & name a reusable group of swatches. Facets are data, so designers can add
   their own from the admin. Only facets with `scored:true` drive the quiz result. */
const CORE_FACETS = [
  { key: 'style',    label: 'Style',    kind: 'tag',     scored: true, builtin: true },
  { key: 'material', label: 'Material', kind: 'tag',     builtin: true },
  { key: 'object',   label: 'Object',   kind: 'tag',     builtin: true },
  { key: 'color',    label: 'Color',    kind: 'swatch',  builtin: true },
  { key: 'palette',  label: 'Palette',  kind: 'palette', builtin: true },
];
// seed the unified vocabulary from the legacy style + material lists
function buildDefaultTags() {
  return [
    ...DEFAULT_CATEGORIES.map((c) => ({ id: c.key, facet: 'style', label: c.label, color: c.color, desc: c.desc })),
    ...DEFAULT_MATERIALS.map((m) => ({ id: m.key, facet: 'material', label: m.label })),
  ];
}
const DEFAULT_STATE = {
  version: 4,
  // baked-in hosted source: every visitor auto-loads these rooms, no admin setup needed
  manifestUrl: 'https://nuninhosousa25.github.io/Furniture_style/manifest.json',
  destinationEmail: '',
  businessName: 'our team',
  facets: CORE_FACETS,
  tags: buildDefaultTags(),
  // the master library: the big pool of pieces you filter and assemble client rooms from
  library: [],
  quizzes: [{ id: 'q-living', name: 'Living Room', file: 'living-room.json', pieces: starterPieces('lr', LIVING_TAGS) }],
};
// key name frozen at "_v3" on purpose: renaming it would orphan every user's cached working copy.
// The real schema version lives in `version` inside the payload (now 4); withDefaults() upgrades it.
const STORAGE_KEY = 'furnitureStyleQuizState_v3';

/* ---------------- faceted tag helpers ---------------- */
function tagIndex(tags) { return Object.fromEntries((tags || []).map((t) => [t.id, t])); }
function facetTags(tags, facet) { return (tags || []).filter((t) => t.facet === facet); }
// the tags on a piece that belong to one facet, resolved to full tag objects
function pieceFacet(piece, byId, facet) { return (piece.tags || []).filter((id) => byId[id] && byId[id].facet === facet).map((id) => byId[id]); }
// a piece's first style tag — used for the card / swatch background color
function primaryStyle(piece, byId) { const id = (piece.tags || []).find((t) => byId[t] && byId[t].facet === 'style'); return id ? byId[id] : null; }

/* ---------------- rooms-as-references helpers ----------------
   The master library is the single source of truth for images. A room stores only
   `members: [{ libId }]` and we hydrate those references into runnable pieces at the
   point of use, so the runtime/scoring/admin keep reading `card.imageUrl/tags/...`. */
function libIndex(library) { return Object.fromEntries((library || []).map((p) => [p.id, p])); }
function roomPieces(room, libById) {
  const seen = new Set();
  return (room.members || []).map((m) => {
    if (!m || seen.has(m.libId)) return null; seen.add(m.libId);   // a room is a set: one ref per piece
    const lib = libById[m.libId];
    return lib ? { ...lib, id: `${room.id}-${m.libId}`, libId: m.libId } : null;  // skip dangling refs
  }).filter(Boolean);
}

/* migrate any older stored / remote state into the v4 faceted shape:
   - build `facets` + a unified `tags` vocabulary from legacy categories/materials
   - fold each piece's separate `materials` array into its mixed-facet `tags`
   - backfill color arrays; old style ids already live in `tags` as valid vocab ids */
function withDefaults(s) {
  if (!s) return s;
  // unify the vocabulary: keep any existing tags, then absorb legacy categories/materials
  let tags = Array.isArray(s.tags) ? s.tags.slice() : [];
  const have = new Set(tags.map((t) => t.id));
  if (Array.isArray(s.categories)) s.categories.forEach((c) => { if (!have.has(c.key)) { tags.push({ id: c.key, facet: 'style', label: c.label, color: c.color, desc: c.desc, custom: c.custom }); have.add(c.key); } });
  if (Array.isArray(s.materials)) s.materials.forEach((m) => { if (!have.has(m.key)) { tags.push({ id: m.key, facet: 'material', label: m.label, custom: true }); have.add(m.key); } });
  if (!tags.length) tags = buildDefaultTags();
  // facets: keep stored, guarantee the core set exists
  let facets = Array.isArray(s.facets) && s.facets.length ? s.facets.slice() : [];
  const fhave = new Set(facets.map((f) => f.key));
  CORE_FACETS.forEach((f) => { if (!fhave.has(f.key)) { facets.push(f); fhave.add(f.key); } });
  // fold legacy piece.materials into piece.tags; keep colors; drop the separate materials array
  const fixPiece = (p) => {
    const tagIds = Array.isArray(p.tags) ? p.tags.slice() : [];
    if (Array.isArray(p.materials)) p.materials.forEach((m) => { if (m && !tagIds.includes(m)) tagIds.push(m); });
    const { materials, ...rest } = p;
    return { ...rest, tags: tagIds, colors: p.colors || [], accentColors: p.accentColors || [] };
  };
  // the master library is the single source of truth for images; start from existing entries
  const library = (Array.isArray(s.library) ? s.library : []).map(fixPiece);
  const libById = {}, byImage = {};
  library.forEach((p) => { libById[p.id] = p; if (p.imageUrl) byImage[p.imageUrl] = p.id; });
  let migCount = 0;
  // ensure a piece has a library entry, returning its libId (dedupe one-offs by image url)
  const ensureLib = (p) => {
    if (p.libId && libById[p.libId]) return p.libId;
    if (p.imageUrl && byImage[p.imageUrl]) return byImage[p.imageUrl];
    // prefer a stable id (the piece's own id or libId) so re-exports don't churn ids
    const id = (p.libId && !libById[p.libId]) ? p.libId
             : (p.id && !libById[p.id]) ? p.id
             : `lib-mig-${Date.now().toString(36)}-${migCount++}`;
    const { libId, id: _omit, ...rest } = p;
    const entry = { id, ...rest };
    library.push(entry); libById[id] = entry; if (entry.imageUrl) byImage[entry.imageUrl] = id;
    return id;
  };
  // normalize each room to a list of references; migrate any embedded pieces into the library;
  // de-collide duplicate room ids (the live kitchen/Potato collision)
  const seenRoomIds = new Set();
  const quizzes = (s.quizzes || []).map((q) => {
    let id = q.id || `q-${slug(q.name)}`;
    while (seenRoomIds.has(id)) id = `${id}-2`;
    seenRoomIds.add(id);
    const raw = Array.isArray(q.members)
      ? q.members.filter((m) => m && m.libId)
      : (q.pieces || []).map((p) => ({ libId: ensureLib(fixPiece(p)) }));
    const seenLib = new Set();
    const members = raw.filter((m) => (seenLib.has(m.libId) ? false : seenLib.add(m.libId)));  // unique per piece
    const { pieces, ...rest } = q;
    return { ...rest, id, members };
  });
  // referential integrity: any tag id a piece references but the vocabulary lacks becomes a
  // style tag (old data stored only style keys in piece.tags), so nothing renders as an orphan
  const haveTag = new Set(tags.map((t) => t.id));
  // strip only the generated 4-char token suffix (slug + '-' + Date.now().toString(36).slice(-4)),
  // not real 2–5 char words, so "art-deco-wxyz" → "Art Deco" but "art-deco" stays intact
  const deSlug = (id) => (id.replace(/-[a-z0-9]{4}$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || id);
  library.forEach((p) => (p.tags || []).forEach((id) => {
    if (!haveTag.has(id)) { tags.push({ id, facet: 'style', label: deSlug(id), color: NEW_TAG_PALETTE[tags.length % NEW_TAG_PALETTE.length], desc: `${deSlug(id)} style.`, custom: true }); haveTag.add(id); }
  }));
  return { ...s, version: 4, facets, tags, library, quizzes, categories: undefined, materials: undefined };
}

/* ---------------- deep links ----------------
   ?room=<id|slug>  jumps a client straight into that room and hides the gear.
   ?dev=true        reveals the gear icon so you can open the admin area.
   nothing set      shows the normal room picker with no admin access.
   This hides admin from clients; it is not hard security (the admin area only
   edits a local browser copy and downloads files, it cannot change hosted content). */
const URL_PARAMS = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const ROOM_PARAM = URL_PARAMS.get('room');
const DEV_MODE = URL_PARAMS.get('dev') === 'true';
function findQuizByParam(quizzes, param) {
  if (!param) return null;
  const p = param.trim().toLowerCase();
  return quizzes.find((q) => (q.id || '').toLowerCase() === p)
    || quizzes.find((q) => slug(q.name) === p)
    || null;
}

/* Minimum number of pieces a client must react to before they can stop early.
   The quiz never asks for more than the total pieces in the room, and the
   order is randomised every run. */
const MIN_QUESTIONS = 20;

const ACTIONS = [
  { key: 'superDislike', label: 'Never', stamp: 'NEVER', delta: -2, color: 'var(--ink)', icon: 'no-entry', badge: true },
  { key: 'dislike', label: 'Dislike', stamp: 'DISLIKE', delta: -1, color: 'var(--rust)', icon: 'x', badge: false },
  { key: 'like', label: 'Like', stamp: 'LIKE', delta: 1, color: 'var(--sage)', icon: 'heart', badge: false },
  { key: 'superLike', label: 'Love it', stamp: 'LOVE IT', delta: 2, color: 'var(--brass)', icon: 'heart', badge: true },
];
const EXIT_CLASS = { superDislike: 'exit-left-strong', dislike: 'exit-left', like: 'exit-right', superLike: 'exit-right-strong' };
const sign = (v) => (v >= 0 ? '+' : '') + v;

/* ---------------- remote loading ---------------- */
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
async function loadFromManifest(manifestUrl) {
  const m = await fetchJson(manifestUrl);
  const rooms = Array.isArray(m.rooms) ? m.rooms : [];
  if (!rooms.length) throw new Error('Manifest has no "rooms" array.');
  const quizzes = [];
  for (const r of rooms) {
    const fileUrl = new URL(r.file, manifestUrl).href;
    const rd = await fetchJson(fileUrl);
    quizzes.push({ id: r.id || ('q-' + slug(r.name)), name: r.name || rd.name || 'Quiz', file: r.file, members: Array.isArray(rd.members) ? rd.members : undefined, pieces: Array.isArray(rd.pieces) ? rd.pieces : undefined });
  }
  return {
    // pass the raw vocabulary through; applyRemote + withDefaults unify old manifests
    // (categories/materials) and new ones (facets/tags) into the faceted shape
    facets: Array.isArray(m.facets) ? m.facets : undefined,
    tags: Array.isArray(m.tags) ? m.tags : undefined,
    categories: Array.isArray(m.categories) ? m.categories : undefined,
    materials: Array.isArray(m.materials) ? m.materials : undefined,
    library: Array.isArray(m.library) ? m.library : undefined,
    quizzes,
    businessName: m.businessName,
    destinationEmail: m.destinationEmail,
  };
}

