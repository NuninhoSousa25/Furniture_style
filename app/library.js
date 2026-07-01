/* ============================================================================
   FILE: app/library.js — the master library + room builder (one component, used
   only inside the admin).
   Depends on: helpers.js (Icon, slug, readableText, NEW_TAG_PALETTE), model.js
   (facetTags, pieceFacet), quiz.js (CroppedImage, CARD_RATIO_*, clamp), editors.js
   (Section, SwatchEditor, BlurInput, CropEditor).
   Used by: admin.js (renders <LibraryManager> with the active room + handlers).

   Index of this file — one component (LibraryManager) with three sections in its
   returned JSX, top to bottom:
     state + small helpers   form state for "add a piece", filter state, chip/
                             triChip/colorChip renderers, tagLine() summary
     "ADD A PIECE" section   one form: image + crop, styles/materials/objects/
                             colors/palettes (with inline "add new tag"), and a
                             toggle to also reference the new piece from the room
                             — submit() always creates a library entry (onAddPieceTo)
     "BUILD ... FROM         filter the library (tri-state include/exclude on
       LIBRARY" section      tags + colors, plus a name search), multi-select,
                             and addToRoom() pushes {libId} references
     "MASTER LIBRARY" list    every library piece, editable in place (name, image,
                             crop, tags, colors) via onUpdateLibraryPiece
   ============================================================================ */

/* ---------------- master library + quiz builder ----------------
   The "big database": add pieces with style tags, materials, main + accent colors,
   then filter the pool and drop a selected group into the active room. */
function LibraryManager({ facets, tags, library, activeQuiz, catMap, onAddPieceTo, onUpdateLibraryPiece, onDeleteLibraryPiece, onAddPiecesToRoom, onAddTag }) {
  const styleTags = facetTags(tags, 'style'), materialTags = facetTags(tags, 'material'), objectTags = facetTags(tags, 'object'), paletteTags = facetTags(tags, 'palette');
  const toggle = (arr, k) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  // one-line facet summary (style · materials · objects) for a piece, used in both lists
  const tagLine = (p) => {
    const st = pieceFacet(p, catMap, 'style').map((t) => t.label);
    const mt = pieceFacet(p, catMap, 'material').map((t) => t.label);
    const ot = pieceFacet(p, catMap, 'object').map((t) => t.label);
    return [st.join(', ') || 'no style', mt.join(', '), ot.join(', ')].filter(Boolean).join(' · ');
  };

  // one unified add-a-piece form, with a destination toggle for the library and/or the active room
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  const [styles, setStyles] = useState([]); const [mats, setMats] = useState([]); const [objs, setObjs] = useState([]); const [palettes, setPalettes] = useState([]);
  const [colors, setColors] = useState([]); const [accentColors, setAccentColors] = useState([]);
  const [colorDraft, setColorDraft] = useState('#C9A227'); const [accentDraft, setAccentDraft] = useState('#46423C');
  const [newStyle, setNewStyle] = useState(''); const [newMat, setNewMat] = useState(''); const [newObj, setNewObj] = useState('');
  const [toRoom, setToRoom] = useState(false);   // also reference it from the active room?
  const [crop, setCrop] = useState(null);        // crop for the piece being added
  const [cropState, setCropState] = useState(null);   // open crop editor: { src, initial, apply }
  const valid = url.trim() && styles.length > 0;   // image + ≥1 style (every piece goes to the library)
  // a small fixed-ratio thumbnail that previews how a piece's crop will frame on the card
  const cropThumb = (src, c, w) => (
    <div className="relative overflow-hidden rounded-md flex-shrink-0" style={{ width: w + 'px', height: Math.round(w / clamp((c && c.ratio) || CARD_RATIO_DEFAULT, CARD_RATIO_MIN, CARD_RATIO_MAX)) + 'px', background: 'rgba(43,37,32,0.08)' }}>
      {src ? <CroppedImage src={src} crop={c} /> : <div className="w-full h-full flex items-center justify-center"><Icon name="image" size={16} color="rgba(43,37,32,0.4)" /></div>}
    </div>
  );
  // inline "add more tags": create a new vocabulary entry in the right facet and select it right away
  const mkId = (label) => `${slug(label)}-${Date.now().toString(36).slice(-4)}`;
  const addTagInline = (facet, label, setSel, reset) => {
    const l = label.trim(); if (!l) return; const id = mkId(l);
    onAddTag(facet === 'style'
      ? { id, facet, label: l, color: NEW_TAG_PALETTE[Math.floor(Math.random() * NEW_TAG_PALETTE.length)], desc: `${l} style.`, custom: true }
      : { id, facet, label: l, custom: true });
    setSel((s) => [...s, id]); reset('');
  };
  const submit = () => {
    if (!valid) return;
    onAddPieceTo({ base: { name: name.trim(), imageUrl: url.trim(), tags: [...styles, ...mats, ...objs, ...palettes], colors, accentColors, crop }, roomId: toRoom ? activeQuiz.id : null });
    setName(''); setUrl(''); setStyles([]); setMats([]); setObjs([]); setPalettes([]); setColors([]); setAccentColors([]); setCrop(null);
  };

  // filter + select for building a room. style/material filters are tri-state:
  // off -> include -> exclude. The mode maps a key to 'in' | 'ex'.
  const [fTagMode, setFTagMode] = useState({}); const [fColorMode, setFColorMode] = useState({}); const [fText, setFText] = useState('');
  const [sel, setSel] = useState([]);
  // editing a library piece in place
  const [editingId, setEditingId] = useState(null);
  const [editColorDraft, setEditColorDraft] = useState('#C9A227'); const [editAccentDraft, setEditAccentDraft] = useState('#46423C');
  const cycleMode = (setMap, key) => setMap((m) => { const nx = m[key] === 'in' ? 'ex' : m[key] === 'ex' ? undefined : 'in'; const n = { ...m }; if (nx) n[key] = nx; else delete n[key]; return n; });
  const keysWith = (map, v) => Object.keys(map).filter((k) => map[k] === v);
  // one unified tag filter across style / material / object (all live in piece.tags now)
  const tIn = keysWith(fTagMode, 'in'), tEx = keysWith(fTagMode, 'ex');
  const cIn = keysWith(fColorMode, 'in'), cEx = keysWith(fColorMode, 'ex');
  // distinct colors across the library (main + accent), normalised to upper-case hex, for the color filter
  const libColors = [...new Set(library.flatMap((p) => [...(p.colors || []), ...(p.accentColors || [])].map((c) => (c || '').toUpperCase())))].filter(Boolean).sort();
  const filtersActive = !!(fText || tIn.length || tEx.length || cIn.length || cEx.length);
  const filtered = library.filter((p) => {
    const ptags = p.tags || [];
    const cols = [...(p.colors || []), ...(p.accentColors || [])].map((c) => (c || '').toUpperCase());
    if (fText && !((p.name || '').toLowerCase().includes(fText.toLowerCase()))) return false;
    if (tIn.length && !tIn.some((k) => ptags.includes(k))) return false;   // must have one included tag
    if (tEx.some((k) => ptags.includes(k))) return false;                  // must have none excluded
    if (cIn.length && !cIn.some((k) => cols.includes(k))) return false;
    if (cEx.some((k) => cols.includes(k))) return false;
    return true;
  });
  const clearFilters = () => { setFText(''); setFTagMode({}); setFColorMode({}); };
  const toggleSel = (id) => setSel((s) => toggle(s, id));
  // building a room just adds references to the selected library pieces
  const addToRoom = () => { onAddPiecesToRoom(activeQuiz.id, sel); setSel([]); };

  // color may be a tag's stored hex (untrusted manifest/library data) or absent (material/
  // object chips have none) — safeColor(color, null) keeps the `|| 'var(--brass)'` fallback
  // working for both "no color" and "invalid color" the same way
  const chip = (active, color, onClick, label, key) => (
    <button key={key} onClick={onClick} className="text-xs rounded-full px-3 py-1.5 border" style={{ borderColor: active ? (safeColor(color, null) || 'var(--brass)') : 'rgba(43,37,32,0.2)', background: active ? (safeColor(color, null) || 'var(--brass)') : '#fff', color: active ? (color ? readableText(color) : 'var(--card)') : 'var(--ink)' }}>{label}</button>
  );
  // tri-state filter chip: off (neutral) -> include (filled) -> exclude (rust, struck through)
  const triChip = (mode, color, onClick, label, key) => {
    const isIn = mode === 'in', isEx = mode === 'ex';
    return (
      <button key={key} onClick={onClick} title={isIn ? 'included — tap to exclude' : isEx ? 'excluded — tap to clear' : 'tap to include'} className="text-xs rounded-full px-3 py-1.5 border" style={{ borderColor: isIn ? (safeColor(color, null) || 'var(--brass)') : isEx ? 'var(--rust)' : 'rgba(43,37,32,0.2)', background: isIn ? (safeColor(color, null) || 'var(--brass)') : '#fff', color: isIn ? (color ? readableText(color) : 'var(--card)') : isEx ? 'var(--rust)' : 'var(--ink)', textDecoration: isEx ? 'line-through' : 'none' }}>{label}</button>
    );
  };
  // tri-state color swatch: off (thin border) -> include (ink ring) -> exclude (rust ring + x, dimmed)
  const colorChip = (mode, hex) => {
    const isIn = mode === 'in', isEx = mode === 'ex';
    return (
      <button key={hex} onClick={() => cycleMode(setFColorMode, hex)} title={`${hex}${isIn ? ' — included' : isEx ? ' — excluded' : ' — tap to include'}`} className="relative rounded-full flex-shrink-0" style={{ width: '26px', height: '26px', background: safeColor(hex), border: isIn ? '2px solid var(--ink)' : isEx ? '2px solid var(--rust)' : '1px solid rgba(43,37,32,0.25)', opacity: isEx ? 0.5 : 1 }}>
        {isEx && <span className="absolute inset-0 flex items-center justify-center"><Icon name="x" size={14} color="var(--rust)" /></span>}
      </button>
    );
  };

  return (
    <>
      <Section label="ADD A PIECE">
        <p className="text-xs" style={{ opacity: 0.6 }}>One form for everything. Every piece needs an image and at least one style; materials, objects, colors and palettes are optional. Each piece is saved to the master library (the single source of truth for images); you can also reference it from the current room below.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional), e.g. Walnut Bench" className="field" />
        <div>
          <input value={url} onChange={(e) => { setUrl(e.target.value); setCrop(null); }} placeholder="Image URL (required)" className="field" style={{ borderColor: url.trim() ? undefined : 'var(--rust)' }} />
          {!url.trim() && <p className="text-xs mt-1" style={{ color: 'var(--rust)', opacity: 0.8 }}>An image URL is required so the piece shows a photo in the quiz.</p>}
        </div>
        {url.trim() && (
          <div className="flex items-center gap-3">
            {cropThumb(url.trim(), crop, 56)}
            <div className="flex flex-col gap-1">
              <button onClick={() => setCropState({ src: url.trim(), initial: crop, apply: setCrop })} className="ghost-button self-start"><Icon name="image" size={13} /> {crop ? 'Adjust crop' : 'Set crop'}</button>
              <span className="text-xs" style={{ opacity: 0.55 }}>{crop ? 'Custom crop set — preview at left.' : 'Cards are vertical (4:5–2:3); set a crop or it centre-fills.'}</span>
            </div>
          </div>
        )}
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Styles (pick at least one)</p>
          <div className="flex flex-wrap gap-2">{styleTags.map((c) => chip(styles.includes(c.id), c.color, () => setStyles((s) => toggle(s, c.id)), c.label, c.id))}</div>
          <div className="flex gap-2 items-center mt-2">
            <input value={newStyle} onChange={(e) => setNewStyle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTagInline('style', newStyle, setStyles, setNewStyle); }} placeholder="New style tag" className="field" style={{ fontSize: '12px' }} />
            <button onClick={() => addTagInline('style', newStyle, setStyles, setNewStyle)} disabled={!newStyle.trim()} className="ghost-button disabled:opacity-40"><Icon name="plus" size={13} /> Add</button>
          </div>
        </div>
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Materials (optional)</p>
          <div className="flex flex-wrap gap-2">{materialTags.map((m) => chip(mats.includes(m.id), null, () => setMats((s) => toggle(s, m.id)), m.label, m.id))}</div>
          <div className="flex gap-2 items-center mt-2">
            <input value={newMat} onChange={(e) => setNewMat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTagInline('material', newMat, setMats, setNewMat); }} placeholder="New material" className="field" style={{ fontSize: '12px' }} />
            <button onClick={() => addTagInline('material', newMat, setMats, setNewMat)} disabled={!newMat.trim()} className="ghost-button disabled:opacity-40"><Icon name="plus" size={13} /> Add</button>
          </div>
        </div>
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Objects (optional)</p>
          <div className="flex flex-wrap gap-2">{objectTags.map((o) => chip(objs.includes(o.id), null, () => setObjs((s) => toggle(s, o.id)), o.label, o.id))}{objectTags.length === 0 && <span className="text-xs" style={{ opacity: 0.45 }}>No object tags yet — add one below.</span>}</div>
          <div className="flex gap-2 items-center mt-2">
            <input value={newObj} onChange={(e) => setNewObj(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTagInline('object', newObj, setObjs, setNewObj); }} placeholder="New object, e.g. Sofa" className="field" style={{ fontSize: '12px' }} />
            <button onClick={() => addTagInline('object', newObj, setObjs, setNewObj)} disabled={!newObj.trim()} className="ghost-button disabled:opacity-40"><Icon name="plus" size={13} /> Add</button>
          </div>
        </div>
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Main colors (optional)</p>
          <SwatchEditor colors={colors} draft={colorDraft} setDraft={setColorDraft} onAdd={() => setColors((c) => (c.includes(colorDraft) ? c : [...c, colorDraft]))} onRemove={(c) => setColors((cs) => cs.filter((x) => x !== c))} />
        </div>
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Accent colors (optional)</p>
          <SwatchEditor colors={accentColors} draft={accentDraft} setDraft={setAccentDraft} onAdd={() => setAccentColors((c) => (c.includes(accentDraft) ? c : [...c, accentDraft]))} onRemove={(c) => setAccentColors((cs) => cs.filter((x) => x !== c))} />
        </div>
        {paletteTags.length > 0 && (
          <div>
            <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Palettes (optional)</p>
            <div className="flex flex-wrap gap-2">{paletteTags.map((pl) => chip(palettes.includes(pl.id), null, () => setPalettes((s) => toggle(s, pl.id)), pl.label, pl.id))}</div>
          </div>
        )}
        <div>
          <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Every piece is added to the master library. Optionally also reference it from the current room:</p>
          <div className="flex flex-wrap gap-2">
            {chip(toRoom, null, () => setToRoom((v) => !v), `Also add to "${activeQuiz.name}"`, 'dest-room')}
          </div>
        </div>
        <button onClick={submit} disabled={!valid} className="tag-button self-start disabled:opacity-40"><Icon name="plus" size={15} color="var(--card)" /> Add to library{toRoom ? ` + "${activeQuiz.name}"` : ''}</button>
      </Section>

      <Section label={`BUILD "${activeQuiz.name.toUpperCase()}" FROM LIBRARY`}>
        <p className="text-xs" style={{ opacity: 0.6 }}>The library has {library.length} piece{library.length === 1 ? '' : 's'}. Filter, select a group, and add them to this room.</p>
        {library.length === 0 ? (
          <p className="text-xs" style={{ opacity: 0.5 }}>Add some pieces to the library first.</p>
        ) : (
          <>
            <input value={fText} onChange={(e) => setFText(e.target.value)} placeholder="Search by name" className="field" />
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ opacity: 0.55 }}>Tap a tag to include, tap again to exclude (struck through).</p>
              {filtersActive && <button onClick={clearFilters} className="ghost-button">Clear filters</button>}
            </div>
            <div className="flex flex-wrap gap-2">{styleTags.map((c) => triChip(fTagMode[c.id], c.color, () => cycleMode(setFTagMode, c.id), c.label, c.id))}</div>
            <div className="flex flex-wrap gap-2">{materialTags.map((m) => triChip(fTagMode[m.id], null, () => cycleMode(setFTagMode, m.id), m.label, m.id))}</div>
            {objectTags.length > 0 && <div className="flex flex-wrap gap-2">{objectTags.map((o) => triChip(fTagMode[o.id], null, () => cycleMode(setFTagMode, o.id), o.label, o.id))}</div>}
            {libColors.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ opacity: 0.55 }}>Colors</span>
                {libColors.map((hex) => colorChip(fColorMode[hex], hex))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs" style={{ opacity: 0.6 }}>{filtered.length} match{filtered.length === 1 ? '' : 'es'} · {sel.length} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setSel(filtered.map((p) => p.id))} className="ghost-button">Select all</button>
                <button onClick={() => setSel([])} className="ghost-button">Clear</button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 max-h-72 overflow-auto">
              {filtered.map((p) => {
                const sw = primaryStyle(p, catMap) || { color: '#E4DCC9' };
                const checked = sel.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggleSel(p.id)} className="flex items-center gap-3 rounded-xl p-2 border text-left" style={{ borderColor: checked ? 'var(--brass)' : 'rgba(43,37,32,0.15)', background: checked ? 'rgba(201,162,39,0.12)' : '#fff' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: safeColor(sw.color) }}>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={16} color={readableText(sw.color)} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ fontStyle: p.name ? undefined : 'italic', opacity: p.name ? 1 : 0.5 }}>{p.name || 'Untitled piece'}</p>
                      <p className="text-xs truncate" style={{ opacity: 0.55 }}>{tagLine(p)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(p.colors || []).slice(0, 3).map((c, i) => <span key={'m' + i} className="w-3.5 h-3.5 rounded-full" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />)}
                      {(p.accentColors || []).slice(0, 2).map((c, i) => <span key={'a' + i} title="accent" className="w-3.5 h-3.5 rounded-full" style={{ background: safeColor(c), boxShadow: '0 0 0 1px #fff, 0 0 0 2px rgba(43,37,32,0.4)' }} />)}
                      <span className="ml-1 w-4 h-4 rounded flex items-center justify-center" style={{ border: checked ? 'none' : '1px solid rgba(43,37,32,0.3)', background: checked ? 'var(--brass)' : 'transparent', color: 'var(--card)' }}>{checked ? '✓' : ''}</span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-xs py-2" style={{ opacity: 0.5 }}>Nothing matches those filters.</p>}
            </div>
            <button onClick={addToRoom} disabled={sel.length === 0} className="tag-button self-start disabled:opacity-40"><Icon name="plus" size={15} color="var(--card)" /> Add {sel.length || ''} selected to "{activeQuiz.name}"</button>
          </>
        )}
      </Section>

      <div>
        <p className="font-mono text-xs tracking-widest mb-3" style={{ opacity: 0.6 }}>MASTER LIBRARY ({library.length})</p>
        <div className="flex flex-col gap-2">
          {library.map((p) => {
            const sw = primaryStyle(p, catMap) || { color: '#E4DCC9' };
            return (
              <div key={p.id} className="rounded-lg p-3" style={{ background: 'var(--card)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: safeColor(sw.color) }}>
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={20} color={readableText(sw.color)} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ fontStyle: p.name ? undefined : 'italic', opacity: p.name ? 1 : 0.5 }}>{p.name || 'Untitled piece'}</p>
                    <p className="text-xs truncate" style={{ opacity: 0.6 }}>{tagLine(p)}</p>
                  </div>
                  {(p.colors || []).slice(0, 3).map((c, i) => <span key={'m' + i} className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />)}
                  {(p.accentColors || []).slice(0, 2).map((c, i) => <span key={'a' + i} title="accent" className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: safeColor(c), boxShadow: '0 0 0 1px #fff, 0 0 0 2px rgba(43,37,32,0.4)' }} />)}
                  <button onClick={() => setEditingId(editingId === p.id ? null : p.id)} className="p-2 rounded-lg flex-shrink-0" style={{ background: 'rgba(43,37,32,0.06)' }} aria-label="Edit piece"><Icon name="pencil" size={14} /></button>
                  <button onClick={() => { if (confirm('Delete this piece from the master library? It will also be removed from every room that uses it.')) onDeleteLibraryPiece(p.id); }} className="p-2 rounded-lg flex-shrink-0" style={{ background: 'rgba(178,96,63,0.12)', color: 'var(--rust)' }} aria-label="Delete from library"><Icon name="trash" size={14} color="var(--rust)" /></button>
                </div>
                {editingId === p.id && (
                  <div className="flex flex-col gap-3 mt-3 pt-3" style={{ borderTop: '1px dashed rgba(43,37,32,0.15)' }}>
                    <BlurInput value={p.name} onCommit={(v) => onUpdateLibraryPiece(p.id, { name: v.trim() })} placeholder="Name (optional)" />
                    <BlurInput value={p.imageUrl} onCommit={(v) => onUpdateLibraryPiece(p.id, { imageUrl: v.trim() })} placeholder="Image URL (required)" />
                    {p.imageUrl && (
                      <div className="flex items-center gap-3">
                        {cropThumb(p.imageUrl, p.crop, 48)}
                        <button onClick={() => setCropState({ src: p.imageUrl, initial: p.crop, apply: (c) => onUpdateLibraryPiece(p.id, { crop: c }) })} className="ghost-button"><Icon name="image" size={13} /> {p.crop ? 'Adjust crop' : 'Set crop'}</button>
                        {p.crop && <button onClick={() => onUpdateLibraryPiece(p.id, { crop: null })} className="ghost-button">Reset</button>}
                      </div>
                    )}
                    <div>
                      <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Styles</p>
                      <div className="flex flex-wrap gap-2">{styleTags.map((c) => chip((p.tags || []).includes(c.id), c.color, () => onUpdateLibraryPiece(p.id, { tags: toggle(p.tags || [], c.id) }), c.label, c.id))}</div>
                    </div>
                    <div>
                      <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Materials</p>
                      <div className="flex flex-wrap gap-2">{materialTags.map((m) => chip((p.tags || []).includes(m.id), null, () => onUpdateLibraryPiece(p.id, { tags: toggle(p.tags || [], m.id) }), m.label, m.id))}</div>
                    </div>
                    {objectTags.length > 0 && (
                      <div>
                        <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Objects</p>
                        <div className="flex flex-wrap gap-2">{objectTags.map((o) => chip((p.tags || []).includes(o.id), null, () => onUpdateLibraryPiece(p.id, { tags: toggle(p.tags || [], o.id) }), o.label, o.id))}</div>
                      </div>
                    )}
                    {paletteTags.length > 0 && (
                      <div>
                        <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Palettes</p>
                        <div className="flex flex-wrap gap-2">{paletteTags.map((pl) => chip((p.tags || []).includes(pl.id), null, () => onUpdateLibraryPiece(p.id, { tags: toggle(p.tags || [], pl.id) }), pl.label, pl.id))}</div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Main colors</p>
                      <SwatchEditor colors={p.colors || []} draft={editColorDraft} setDraft={setEditColorDraft} onAdd={() => onUpdateLibraryPiece(p.id, { colors: (p.colors || []).includes(editColorDraft) ? (p.colors || []) : [...(p.colors || []), editColorDraft] })} onRemove={(c) => onUpdateLibraryPiece(p.id, { colors: (p.colors || []).filter((x) => x !== c) })} />
                    </div>
                    <div>
                      <p className="text-xs mb-2" style={{ opacity: 0.6 }}>Accent colors</p>
                      <SwatchEditor colors={p.accentColors || []} draft={editAccentDraft} setDraft={setEditAccentDraft} onAdd={() => onUpdateLibraryPiece(p.id, { accentColors: (p.accentColors || []).includes(editAccentDraft) ? (p.accentColors || []) : [...(p.accentColors || []), editAccentDraft] })} onRemove={(c) => onUpdateLibraryPiece(p.id, { accentColors: (p.accentColors || []).filter((x) => x !== c) })} />
                    </div>
                    <button onClick={() => setEditingId(null)} className="tag-button self-start">Done</button>
                  </div>
                )}
              </div>
            );
          })}
          {library.length === 0 && <p className="text-xs" style={{ opacity: 0.5 }}>The library is empty. Add pieces above.</p>}
        </div>
      </div>
      {cropState && <CropEditor src={cropState.src} initial={cropState.initial} onApply={(c) => { cropState.apply(c); setCropState(null); }} onCancel={() => setCropState(null)} />}
    </>
  );
}

