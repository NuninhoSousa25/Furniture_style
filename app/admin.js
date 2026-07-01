/* ============================================================================
   FILE: app/admin.js — AdminView, the ?dev=true panel.
   Depends on: helpers.js (Icon, slug, readableText, NEW_TAG_PALETTE, download),
   model.js (tagIndex, libIndex, roomPieces, facetTags), editors.js (Section,
   BlurInput), library.js (LibraryManager).
   Used by: main.js (renders <AdminView> for the 'admin' view, passing state +
   every onXxx handler defined in App).

   Index of this file's returned JSX, top to bottom (each is a <Section>, except
   "PIECES IN ..." which lists the active room's referenced library pieces):
     HOW THE QUIZ RUNS          static explanation text + this room's piece count
     HOSTED SOURCE               paste a manifest URL + "Load from URL" (onLoadRemote)
     PUBLISH                     download buttons: exportManifest() / exportRoom()
     WHERE RESULTS GO            business name + destination email (onSet)
     ROOMS / QUIZZES             switch/rename/delete rooms, add a new one
     TAGS                        the faceted vocabulary manager: one group per
                                 facet (submitTag/submitFacet), grouped via
                                 state.facets — see the per-facet rendering loop
     <LibraryManager .../>       the master library + room builder (own file)
     PIECES IN "<room>"          this room's pieces (hydrated via roomPieces);
                                 editing one here edits the master library piece
                                 (onUpdateLibraryPiece), removing drops the
                                 reference only (onRemoveMember)
     import / reset              full-config import (onImport), reset to defaults
   ============================================================================ */

/* ---------------- admin (the ?dev=true gear panel) ---------------- */
function AdminView(props) {
  const { state, activeQuizId, setActiveQuizId, remote, onLoadRemote,
    onRemoveMember, onAddQuiz, onRenameQuiz, onDeleteQuiz,
    onAddTag, onDeleteTag, onAddFacet, onDeleteFacet,
    onAddPieceTo, onUpdateLibraryPiece, onDeleteLibraryPiece, onAddPiecesToRoom,
    onSet, onImport, onReset, error } = props;

  const catMap = useMemo(() => tagIndex(state.tags), [state.tags]);
  const libById = useMemo(() => libIndex(state.library), [state.library]);
  const roomCount = (q) => (q.members || []).length;
  const activeQuiz = state.quizzes.find((q) => q.id === activeQuizId) || state.quizzes[0];
  const activePieces = roomPieces(activeQuiz, libById);
  const [editingId, setEditingId] = useState(null);
  const [newQuizName, setNewQuizName] = useState('');
  // tag manager: add a tag to a chosen facet; style tags also take a color + description, palettes take swatches
  const [tagFacet, setTagFacet] = useState('style');
  const [tagName, setTagName] = useState(''); const [tagColor, setTagColor] = useState(NEW_TAG_PALETTE[0]); const [tagDesc, setTagDesc] = useState('');
  const [tagSwatches, setTagSwatches] = useState([]); const [swatchDraft, setSwatchDraft] = useState('#C9A227');
  const [newFacet, setNewFacet] = useState('');
  const [manifestDraft, setManifestDraft] = useState(state.manifestUrl || '');
  const mkId = (label) => `${slug(label)}-${Date.now().toString(36).slice(-4)}`;
  const submitTag = () => {
    if (!tagName.trim()) return;
    const id = mkId(tagName), label = tagName.trim();
    if (tagFacet === 'style') onAddTag({ id, facet: 'style', label, color: tagColor, desc: tagDesc.trim() || `${label} style.`, custom: true });
    else if (tagFacet === 'palette') onAddTag({ id, facet: 'palette', label, swatches: tagSwatches, custom: true });
    else onAddTag({ id, facet: tagFacet, label, custom: true });
    setTagName(''); setTagDesc(''); setTagSwatches([]); setTagColor(NEW_TAG_PALETTE[Math.floor(Math.random() * NEW_TAG_PALETTE.length)]);
  };
  const submitFacet = () => { const l = newFacet.trim(); if (!l) return; onAddFacet({ key: mkId(l), label: l, kind: 'tag', custom: true }); setNewFacet(''); };

  const exportManifest = () => {
    const manifest = {
      version: 4,
      businessName: state.businessName, destinationEmail: state.destinationEmail,
      // the faceted vocabulary + master library travel with the manifest, so publishing it
      // shares the whole database with every browser that loads this source
      facets: state.facets,
      tags: state.tags,
      // derived legacy lists, so an older cached client still resolves styles / materials
      categories: facetTags(state.tags, 'style').map((t) => ({ key: t.id, label: t.label, color: t.color, desc: t.desc, custom: t.custom })),
      materials: facetTags(state.tags, 'material').map((t) => ({ key: t.id, label: t.label })),
      library: state.library,
      rooms: state.quizzes.map((q) => ({ id: q.id, name: q.name, file: q.file || `${slug(q.name)}.json` })),
    };
    download('manifest.json', JSON.stringify(manifest, null, 2));
  };
  const exportRoom = (q) => download(q.file || `${slug(q.name)}.json`, JSON.stringify({ name: q.name, members: q.members || [] }, null, 2));

  return (
    <div className="w-full max-w-md flex flex-col gap-5">
      <div>
        <p className="font-display text-2xl mb-1">Manage</p>
        <p className="text-sm" style={{ opacity: 0.7 }}>Build and preview here, then publish by hosting the JSON files. Point the app at your hosted manifest so every visitor loads the same rooms.</p>
      </div>
      {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: 'rgba(178,96,63,0.15)', color: 'var(--rust)' }}>{error}</div>}

      <Section label="HOW THE QUIZ RUNS">
        <p className="text-xs" style={{ opacity: 0.7 }}>Pieces are shown in a random order each time. A client answers at least {MIN_QUESTIONS} pieces (or all of them, if the room has fewer). Once past {MIN_QUESTIONS} a "Stop &amp; see my results" button appears, and the quiz always ends when every piece has been seen. For the richest result, give each room at least {MIN_QUESTIONS} pieces.</p>
        <p className="text-xs" style={{ opacity: 0.55 }}>This room currently has {activePieces.length} piece{activePieces.length === 1 ? '' : 's'}.</p>
      </Section>

      <Section label="HOSTED SOURCE">
        <input value={manifestDraft} onChange={(e) => setManifestDraft(e.target.value)} placeholder="https://your-site.com/quiz/manifest.json" className="field" />
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => onLoadRemote(manifestDraft.trim())} disabled={!manifestDraft.trim() || remote.loading} className="tag-button disabled:opacity-40"><Icon name="cloud" size={15} color="var(--card)" /> {remote.loading ? 'Loading...' : 'Load from URL'}</button>
          {state.manifestUrl && !remote.loading && <span className="font-mono text-xs" style={{ opacity: 0.55 }}>Active source set</span>}
        </div>
        {remote.error && <p className="text-xs" style={{ color: 'var(--rust)' }}>{remote.error}</p>}
        <p className="text-xs" style={{ opacity: 0.55 }}>The host must allow cross-origin reads (CORS), or serve the files from the same site as this page. Loading replaces the rooms, categories, materials, and master library below with the hosted copy.</p>
      </Section>

      <Section label="PUBLISH (DOWNLOAD FILES TO HOST)">
        <button onClick={exportManifest} className="ghost-button self-start"><Icon name="download" size={14} /> manifest.json</button>
        <div className="flex flex-col gap-1.5">
          {state.quizzes.map((q) => (
            <button key={q.id} onClick={() => exportRoom(q)} className="ghost-button self-start"><Icon name="download" size={14} /> {q.file || `${slug(q.name)}.json`}</button>
          ))}
        </div>
        <p className="text-xs" style={{ opacity: 0.55 }}>Upload these to the same folder on your host, then paste the manifest.json link above. <b>manifest.json</b> now carries the shared master library and materials, so publishing it shares the whole database with every browser that loads this source.</p>
      </Section>

      <Section label="WHERE RESULTS GO">
        <BlurInput value={state.businessName} onCommit={(v) => onSet({ businessName: v })} placeholder="Your business name (shown to clients)" />
        <BlurInput value={state.destinationEmail} onCommit={(v) => onSet({ destinationEmail: v })} placeholder="Your email, e.g. studio@example.com" />
        <p className="text-xs" style={{ opacity: 0.55 }}>The "Send to us" button on the results screen emails this address, with the full piece-by-piece breakdown and the client's notes.</p>
      </Section>

      <Section label="ROOMS / QUIZZES">
        <div className="flex flex-col gap-2">
          {state.quizzes.map((q) => (
            <div key={q.id} className="flex items-center gap-2">
              <button onClick={() => setActiveQuizId(q.id)} className="flex-1 text-left rounded-xl px-3 py-2 border" style={{ borderColor: q.id === activeQuiz.id ? 'var(--brass)' : 'rgba(43,37,32,0.2)', background: q.id === activeQuiz.id ? 'rgba(201,162,39,0.12)' : '#fff' }}>
                <span className="text-sm font-medium">{q.name}</span>
                <span className="font-mono text-xs ml-2" style={{ opacity: 0.5 }}>{roomCount(q)}</span>
              </button>
              <button onClick={() => { const n = prompt('Rename room', q.name); if (n && n.trim()) onRenameQuiz(q.id, n.trim()); }} className="p-2 rounded-lg" style={{ background: 'rgba(43,37,32,0.06)' }} aria-label="Rename"><Icon name="pencil" size={14} /></button>
              {state.quizzes.length > 1 && <button onClick={() => { if (confirm(`Delete "${q.name}" and its pieces?`)) onDeleteQuiz(q.id); }} className="p-2 rounded-lg" style={{ background: 'rgba(178,96,63,0.12)', color: 'var(--rust)' }} aria-label="Delete"><Icon name="trash" size={14} color="var(--rust)" /></button>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newQuizName} onChange={(e) => setNewQuizName(e.target.value)} placeholder="New room, e.g. Kitchen" className="field" />
          <button onClick={() => { if (newQuizName.trim()) { onAddQuiz(newQuizName.trim()); setNewQuizName(''); } }} className="tag-button" aria-label="Add room"><Icon name="plus" size={15} color="var(--card)" /></button>
        </div>
      </Section>

      <Section label="TAGS">
        <p className="text-xs" style={{ opacity: 0.6 }}>One vocabulary, organised by facet. Pieces reference these by tag. Colors are free swatches on each piece; a palette is a saved, named group of swatches. Only facets marked "scored" drive the quiz result.</p>
        {state.facets.filter((f) => f.kind !== 'swatch').map((f) => {
          const ft = facetTags(state.tags, f.key);
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>{(f.label || f.key).toUpperCase()}{f.scored ? ' · SCORED' : ''}</p>
                {f.custom && ft.length === 0 && <button onClick={() => { if (confirm(`Remove the "${f.label}" facet?`)) onDeleteFacet(f.key); }} aria-label="Remove facet" style={{ opacity: 0.5 }}><Icon name="trash" size={12} /></button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {ft.map((t) => {
                  const isStyle = f.key === 'style';
                  const removable = !isStyle || t.custom;
                  const fg = isStyle ? (t.text || readableText(t.color)) : 'var(--ink)';
                  return (
                    <span key={t.id} className="text-xs rounded-full pl-3 pr-1.5 py-1.5 flex items-center gap-1.5 border" style={{ borderColor: isStyle ? safeColor(t.color) : 'rgba(43,37,32,0.25)', background: isStyle ? safeColor(t.color) : '#fff', color: fg }}>
                      {f.key === 'palette' && (t.swatches || []).slice(0, 4).map((c, i) => <span key={i} className="w-3 h-3 rounded-full" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />)}
                      {t.label}
                      {removable && <button onClick={() => { if (confirm(`Remove "${t.label}"? It will also be removed from any pieces using it.`)) onDeleteTag(t.id); }} aria-label="Remove tag" style={{ lineHeight: 0 }}><Icon name="x" size={13} color={fg} /></button>}
                    </span>
                  );
                })}
                {ft.length === 0 && <span className="text-xs" style={{ opacity: 0.5 }}>No {(f.label || f.key).toLowerCase()} tags yet.</span>}
              </div>
            </div>
          );
        })}
        <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px dashed rgba(43,37,32,0.15)' }}>
          <p className="text-xs" style={{ opacity: 0.6 }}>Add a tag</p>
          <div className="flex flex-wrap gap-2">
            {state.facets.filter((f) => f.kind !== 'swatch').map((f) => (
              <button key={f.key} onClick={() => setTagFacet(f.key)} className="text-xs rounded-full px-3 py-1.5 border" style={{ borderColor: tagFacet === f.key ? 'var(--brass)' : 'rgba(43,37,32,0.2)', background: tagFacet === f.key ? 'var(--brass)' : '#fff', color: tagFacet === f.key ? 'var(--card)' : 'var(--ink)' }}>{f.label || f.key}</button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input value={tagName} onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTag(); }} placeholder="New tag name" className="field" />
            {tagFacet === 'style' && <input type="color" value={tagColor} onChange={(e) => setTagColor(e.target.value)} className="w-10 h-10 rounded-lg p-0 flex-shrink-0" style={{ border: '1px solid rgba(43,37,32,0.2)' }} aria-label="Tag color" />}
          </div>
          {tagFacet === 'style' && <input value={tagDesc} onChange={(e) => setTagDesc(e.target.value)} placeholder="Short description (shown on results)" className="field" />}
          {tagFacet === 'palette' && <SwatchEditor colors={tagSwatches} draft={swatchDraft} setDraft={setSwatchDraft} onAdd={() => setTagSwatches((c) => (c.includes(swatchDraft) ? c : [...c, swatchDraft]))} onRemove={(c) => setTagSwatches((cs) => cs.filter((x) => x !== c))} />}
          <button onClick={submitTag} disabled={!tagName.trim()} className="tag-button self-start disabled:opacity-40"><Icon name="plus" size={15} color="var(--card)" /> Add tag</button>
        </div>
        <div className="flex gap-2 items-center pt-2" style={{ borderTop: '1px dashed rgba(43,37,32,0.15)' }}>
          <input value={newFacet} onChange={(e) => setNewFacet(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitFacet(); }} placeholder="New facet, e.g. Finish, Era, Mood" className="field" />
          <button onClick={submitFacet} disabled={!newFacet.trim()} className="ghost-button disabled:opacity-40" aria-label="Add facet"><Icon name="plus" size={13} /> Facet</button>
        </div>
      </Section>

      <LibraryManager facets={state.facets} tags={state.tags} library={state.library} activeQuiz={activeQuiz} catMap={catMap}
        onAddPieceTo={onAddPieceTo} onUpdateLibraryPiece={onUpdateLibraryPiece} onDeleteLibraryPiece={onDeleteLibraryPiece} onAddPiecesToRoom={onAddPiecesToRoom}
        onAddTag={onAddTag} />

      <div>
        <p className="font-mono text-xs tracking-widest mb-3" style={{ opacity: 0.6 }}>PIECES IN "{activeQuiz.name.toUpperCase()}" ({activePieces.length})</p>
        <div className="flex flex-col gap-2">
          {activePieces.map((card) => {
            const sw = primaryStyle(card, catMap) || { color: '#E4DCC9' };
            const isEditing = editingId === card.id;
            const orphan = !primaryStyle(card, catMap);
            return (
              <div key={card.id} className="rounded-lg p-3" style={{ background: 'var(--card)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: safeColor(sw.color) }}>
                    {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={20} color={sw.text || readableText(sw.color)} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ fontStyle: card.name ? undefined : 'italic', opacity: card.name ? 1 : 0.5 }}>{card.name || 'Untitled piece'}</p>
                    <p className="text-xs truncate" style={{ opacity: 0.6, color: orphan ? 'var(--rust)' : undefined }}>{orphan ? 'no style, will not score' : card.tags.map((t) => catMap[t]?.label || '?').join(', ')}</p>
                  </div>
                  <button onClick={() => setEditingId(isEditing ? null : card.id)} className="p-2 rounded-lg" style={{ background: 'rgba(43,37,32,0.06)' }} aria-label="Edit piece"><Icon name="pencil" size={14} /></button>
                  <button onClick={() => onRemoveMember(activeQuiz.id, card.libId)} className="p-2 rounded-lg" style={{ background: 'rgba(178,96,63,0.12)', color: 'var(--rust)' }} aria-label="Remove from room" title="Remove from this room (keeps it in the master library)"><Icon name="trash" size={14} color="var(--rust)" /></button>
                </div>
                {isEditing && (
                  <div className="flex flex-col gap-3 mt-3 pt-3" style={{ borderTop: '1px dashed rgba(43,37,32,0.15)' }}>
                    <p className="text-xs" style={{ opacity: 0.55, fontStyle: 'italic' }}>Editing the master library piece — changes apply to every room that uses it.</p>
                    <BlurInput value={card.name} onCommit={(v) => onUpdateLibraryPiece(card.libId, { name: v.trim() })} placeholder="Name (optional)" />
                    <BlurInput value={card.imageUrl} onCommit={(v) => onUpdateLibraryPiece(card.libId, { imageUrl: v.trim() })} placeholder={card.imageUrl ? 'Replace image URL' : 'Add image URL'} />
                    <p className="text-xs" style={{ opacity: 0.6 }}>Styles</p>
                    <div className="flex flex-wrap gap-2">
                      {facetTags(state.tags, 'style').map((c) => {
                        const active = card.tags.includes(c.id);
                        return <button key={c.id} onClick={() => onUpdateLibraryPiece(card.libId, { tags: active ? card.tags.filter((t) => t !== c.id) : [...card.tags, c.id] })} className="text-xs rounded-full px-3 py-1.5 border" style={{ borderColor: active ? safeColor(c.color) : 'rgba(43,37,32,0.2)', background: active ? safeColor(c.color) : '#fff', color: active ? (c.text || readableText(c.color)) : 'var(--ink)' }}>{c.label}</button>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="ghost-button" style={{ cursor: 'pointer' }}><Icon name="upload" size={14} /> Import full config<input type="file" accept="application/json" onChange={onImport} className="hidden" /></label>
        <button onClick={onReset} className="ghost-button"><Icon name="rotate" size={14} /> Reset everything</button>
      </div>
    </div>
  );
}

