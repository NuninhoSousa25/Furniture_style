/* ============================================================================
   FILE: app/main.js — App: state, persistence, routing, and all handlers. Loads
   LAST (everything above is a dependency of this file). Renders the page.
   Depends on: every other app/*.js file (uses their components + model helpers).
   Used by: nothing — this is the root; ReactDOM.render below mounts it.

   Index of this file, top to bottom:
     state                  one `state` object (the persisted shape from model.js)
                            + view/quiz-run state (view, runQuiz, index, scores,
                            history, exiting) + viewport tracking (vp)
     persist / applyRemote   persist() writes state + localStorage; applyRemote()
                            merges a loaded manifest's vocabulary/library/rooms
                            on top of local state (see its own comment)
     init effect             on mount: load cached state, then refresh from
                            manifestUrl if set, then auto-jump via ?room=
     quiz run handlers       beginQuiz, handleAction (score + record a reaction),
                            handleUndo, handleStop
     room / piece handlers   onRemoveMember, onAddQuiz, onRenameQuiz, onDeleteQuiz
     vocabulary handlers     onAddTag, onDeleteTag, onAddFacet, onDeleteFacet
     library handlers        onUpdateLibraryPiece, onDeleteLibraryPiece,
                            onAddPiecesToRoom, onAddPieceTo (always creates a
                            library entry, optionally also references a room)
     import / reset          onImport (full config), onResetAll
     render                  derives catMap/libById (memoized) + responses/counts
                            for scoring, then routes between picker/quiz/results/
                            admin based on `view`
   ============================================================================ */

/* ---------------- app ---------------- */
function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState('picker');
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [runQuiz, setRunQuiz] = useState(null);
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState({});
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState('');
  const [exiting, setExiting] = useState(null);
  const [error, setError] = useState(null);
  const [remote, setRemote] = useState({ loading: false, error: null });
  const [vp, setVp] = useState(() => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1024, h: typeof window !== 'undefined' ? window.innerHeight : 768 }));
  const didInit = useRef(false);

  const persist = (next) => {
    setState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setError(null); }
    catch (e) { setError('Could not cache locally. Edits may be lost on reload.'); }
  };

  const applyRemote = (base, data) => {
    // loading replaces the vocabulary: prefer a new manifest's facets/tags; otherwise rebuild
    // from an old manifest's categories/materials; otherwise keep the local vocabulary
    let tags = base.tags, facets = data.facets != null ? data.facets : base.facets;
    if (data.tags != null) tags = data.tags;
    else if (data.categories != null) tags = [
      ...data.categories.map((c) => ({ id: c.key, facet: 'style', label: c.label, color: c.color, desc: c.desc, custom: c.custom })),
      ...((data.materials || []).map((m) => ({ id: m.key, facet: 'material', label: m.label, custom: true }))),
    ];
    const next = withDefaults({
      ...base,
      quizzes: data.quizzes,
      facets,
      tags,
      // the master library comes from the manifest when present; otherwise keep local
      library: data.library != null ? data.library : base.library,
      businessName: data.businessName != null ? data.businessName : base.businessName,
      destinationEmail: data.destinationEmail != null ? data.destinationEmail : base.destinationEmail,
      categories: undefined, materials: undefined,
    });
    persist(next);
    setActiveQuizId(next.quizzes[0] ? next.quizzes[0].id : null);
    return next;
  };

  const doLoadRemote = async (url) => {
    setRemote({ loading: true, error: null });
    try {
      const data = await loadFromManifest(url);
      const base = (state || DEFAULT_STATE);
      applyRemote({ ...base, manifestUrl: url }, data);
      setRemote({ loading: false, error: null });
      setView('picker');
    } catch (e) {
      setRemote({ loading: false, error: `Could not load: ${e.message}. Check the URL and CORS settings.` });
    }
  };

  useEffect(() => {
    if (didInit.current) return; didInit.current = true;
    let s = DEFAULT_STATE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { const p = JSON.parse(stored); if (p && (p.version === 3 || p.version === 4) && Array.isArray(p.quizzes) && p.quizzes.length) s = p; }
    } catch (e) {}
    s = withDefaults(s);
    setState(s);
    setActiveQuizId(s.quizzes[0].id);
    // a ?room= link jumps straight into that room once its pieces are ready
    const autoStart = (quizzes) => { const q = findQuizByParam(quizzes, ROOM_PARAM); if (q) beginQuiz(q); };
    if (s.manifestUrl) {
      // refresh from hosted source on load, fall back to cached copy on failure
      (async () => {
        setRemote({ loading: true, error: null });
        try { const data = await loadFromManifest(s.manifestUrl); const next = applyRemote(s, data); setRemote({ loading: false, error: null }); autoStart(next.quizzes); }
        catch (e) { setRemote({ loading: false, error: `Using cached copy. Live load failed: ${e.message}` }); autoStart(s.quizzes); }
      })();
    } else {
      autoStart(s.quizzes);
    }
  }, []);

  // track viewport so the desktop card can size itself to each photo
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // memoized so they only rebuild when the vocabulary / library actually change, not on every render
  const catMap = useMemo(() => tagIndex(state && state.tags), [state && state.tags]);
  const libById = useMemo(() => libIndex(state && state.library), [state && state.library]);
  // hydrate a room's references into runnable pieces, then shuffle for the run
  const beginQuiz = (q) => { const pieces = roomPieces(q, libById); if (!pieces.length) return; setRunQuiz({ ...q, pieces: shuffle(pieces) }); setIndex(0); setScores({}); setHistory([]); setNote(''); setExiting(null); setView('quiz'); };

  const handleAction = (action) => {
    if (exiting || !runQuiz) return;
    setExiting(action.key);
    const currentNote = note.trim();
    setTimeout(() => {
      const card = runQuiz.pieces[index];
      const applied = {};
      // only style tags drive the scored result; other facets ride along in the response record
      const scored = card.tags.filter((t) => catMap[t] && catMap[t].facet === 'style');
      setScores((prev) => { const n = { ...prev }; scored.forEach((t) => { n[t] = (n[t] || 0) + action.delta; applied[t] = (applied[t] || 0) + action.delta; }); return n; });
      // a full record of this reaction, so the team can read the run piece by piece
      const response = { pieceId: card.id, pieceName: card.name, imageUrl: card.imageUrl, tags: [...card.tags], colors: [...(card.colors || [])], accentColors: [...(card.accentColors || [])], actionKey: action.key, actionLabel: action.label, delta: action.delta, note: currentNote };
      setHistory((h) => [...h, { index, applied, response }]);
      setNote('');
      if (index + 1 >= runQuiz.pieces.length) setView('results');
      else setIndex((i) => i + 1);
      setExiting(null);
    }, 300);
  };
  const handleUndo = () => {
    if (exiting || history.length === 0) return;
    const last = history[history.length - 1];
    setScores((prev) => { const n = { ...prev }; Object.entries(last.applied).forEach(([k, v]) => { n[k] = (n[k] || 0) - v; }); return n; });
    setHistory((h) => h.slice(0, -1));
    setIndex(last.index);
    setNote(last.response ? last.response.note : '');
  };
  const handleStop = () => { if (exiting) return; setView('results'); };

  const updateQuiz = (qid, fn) => persist({ ...state, quizzes: state.quizzes.map((q) => q.id === qid ? fn(q) : q) });
  // rooms only hold references now: removing a piece drops the member (the library entry stays)
  const onRemoveMember = (qid, libId) => updateQuiz(qid, (q) => ({ ...q, members: (q.members || []).filter((m) => m.libId !== libId) }));
  const onAddQuiz = (name) => { const id = `q-${Date.now()}`; persist({ ...state, quizzes: [...state.quizzes, { id, name, file: `${slug(name)}.json`, members: [] }] }); setActiveQuizId(id); };
  const onRenameQuiz = (qid, name) => updateQuiz(qid, (q) => ({ ...q, name, file: q.file || `${slug(name)}.json` }));
  const onDeleteQuiz = (qid) => { const rest = state.quizzes.filter((q) => q.id !== qid); persist({ ...state, quizzes: rest }); if (activeQuizId === qid) setActiveQuizId(rest[0].id); };
  const onSet = (patch) => persist({ ...state, ...patch });

  // unified faceted vocabulary + master library (the "big database" admin tooling).
  // Tags live on library pieces; rooms only reference them, so stripping a deleted tag
  // touches the library only.
  const onAddTag = (tag) => persist({ ...state, tags: [...state.tags, tag] });
  const onDeleteTag = (id) => persist({ ...state, tags: state.tags.filter((t) => t.id !== id), library: (state.library || []).map((p) => ({ ...p, tags: (p.tags || []).filter((t) => t !== id) })) });
  const onAddFacet = (facet) => persist({ ...state, facets: [...state.facets, facet] });
  const onDeleteFacet = (key) => persist({ ...state, facets: state.facets.filter((f) => f.key !== key), tags: state.tags.filter((t) => t.facet !== key) });
  const onUpdateLibraryPiece = (pid, patch) => persist({ ...state, library: (state.library || []).map((p) => p.id === pid ? { ...p, ...patch } : p) });
  // deleting a library piece also drops every room reference to it (no dangling members)
  const onDeleteLibraryPiece = (pid) => persist({ ...state, library: (state.library || []).filter((p) => p.id !== pid), quizzes: state.quizzes.map((q) => ({ ...q, members: (q.members || []).filter((m) => m.libId !== pid) })) });
  // adding to a room is idempotent: skip pieces already referenced (a room is a set, no duplicates)
  const onAddPiecesToRoom = (qid, libIds) => updateQuiz(qid, (q) => { const have = new Set((q.members || []).map((m) => m.libId)); const add = libIds.filter((id) => !have.has(id)).map((id) => ({ libId: id })); return { ...q, members: [...(q.members || []), ...add] }; });
  // unified "add a piece": ALWAYS creates the master library entry (single source of truth),
  // then optionally references it from a room — in ONE persist (avoids stale-state clobber)
  const onAddPieceTo = ({ base, roomId }) => {
    const libId = `lib${Date.now()}`;
    let next = { ...state, library: [...(state.library || []), { id: libId, ...base }] };
    if (roomId) next = { ...next, quizzes: next.quizzes.map((q) => q.id === roomId ? { ...q, members: [...(q.members || []), { libId }] } : q) };
    persist(next);
  };

  const onImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const p = JSON.parse(ev.target.result);
        if (p && (p.version === 3 || p.version === 4) && Array.isArray(p.quizzes) && p.quizzes.length) { const np = withDefaults(p); persist(np); setActiveQuizId(np.quizzes[0].id); }
        else setError('That file does not look like a full config export.');
      } catch (err) { setError('Could not read that file.'); }
    };
    reader.readAsText(file); e.target.value = '';
  };
  const onResetAll = () => { if (confirm('Reset everything to the starter setup? This clears the hosted source link too.')) { persist(DEFAULT_STATE); setActiveQuizId(DEFAULT_STATE.quizzes[0].id); setRemote({ loading: false, error: null }); } };

  if (!state) return <div style={{ minHeight: '100vh', background: '#EAE2D3' }} />;
  // scoring is built from the pieces actually answered, so an early stop is fair
  const responses = history.map((h) => h.response).filter(Boolean);
  const counts = {};
  const styleOf = (r) => r.tags.filter((t) => catMap[t] && catMap[t].facet === 'style');
  responses.forEach((r) => styleOf(r).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const usedKeys = [...new Set(responses.flatMap(styleOf))];
  const minRequired = runQuiz ? Math.min(MIN_QUESTIONS, runQuiz.pieces.length) : 0;
  const isDesktop = vp.w >= 768;

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-6 relative" style={{ '--canvas': '#F4F1EA', '--ink': '#2B2A26', '--card': '#FFFFFF', '--sage': '#7C9A6E', '--rust': '#BE4A3A', '--brass': '#C5A23C', background: 'var(--canvas)', color: 'var(--ink)', fontFamily: "'Montserrat', sans-serif" }}>
      {(!isDesktop || view === 'admin') ? (
        <div className="w-full max-w-md flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ background: 'var(--brass)' }} />
            <span className="font-display text-lg">Find Your Style</span>
          </div>
          {view === 'admin'
            ? <button onClick={() => setView('picker')} className="p-2 rounded-lg" style={{ background: 'var(--card)' }} aria-label="Back"><Icon name="arrow-left" size={16} /></button>
            : DEV_MODE
              ? <button onClick={() => setView('admin')} className="p-2 rounded-lg" style={{ background: 'var(--card)' }} aria-label="Manage"><Icon name="settings" size={16} /></button>
              : null}
        </div>
      ) : (
        // desktop client view: hide the header for more vertical room; float the gear for dev only
        DEV_MODE
          ? <button onClick={() => setView('admin')} className="absolute top-4 right-4 p-2 rounded-lg z-10" style={{ background: 'var(--card)' }} aria-label="Manage"><Icon name="settings" size={16} /></button>
          : null
      )}

      {view === 'picker' ? (
        remote.loading ? (
          <p className="font-mono text-sm mt-10" style={{ opacity: 0.6 }}>Loading rooms from your hosted source...</p>
        ) : state.quizzes.length === 1 ? (
          (() => {
            const total = roomPieces(state.quizzes[0], libById).length;
            const minN = Math.min(MIN_QUESTIONS, total);
            return (
              <div className="w-full max-w-xs flex flex-col items-center text-center gap-5 mt-6">
                <p className="font-display text-4xl leading-tight">What's your<br />style?</p>
                <p className="text-sm" style={{ opacity: 0.75 }}>{total > MIN_QUESTIONS
                  ? `Swipe through at least ${minN} of ${total} pieces in random order, then stop whenever you like. Tap how you feel about each one and add a note if you want.`
                  : `Swipe through ${total} piece${total === 1 ? '' : 's'} in random order. Tap how you feel about each one, add a note if you want, no rush, no right answers.`}</p>
                <div className="w-full grid grid-cols-2 gap-3 text-xs font-mono" style={{ opacity: 0.7 }}>
                  <div className="flex items-center gap-2 justify-center"><Icon name="x" size={14} /> Pass / Never</div>
                  <div className="flex items-center gap-2 justify-center"><Icon name="heart" size={14} /> Like / Love it</div>
                </div>
                <button onClick={() => beginQuiz(state.quizzes[0])} className="tag-button mt-2">Begin</button>
              </div>
            );
          })()
        ) : <PickerView quizzes={state.quizzes} onPick={beginQuiz} libById={libById} />
      ) : view === 'quiz' ? (
        <QuizView pieces={runQuiz.pieces} index={index} onAction={handleAction} onUndo={handleUndo} canUndo={history.length > 0} undoCount={history.length} exiting={exiting} catMap={catMap} minRequired={minRequired} note={note} setNote={setNote} onStop={handleStop} isDesktop={isDesktop} vw={vp.w} vh={vp.h} />
      ) : view === 'results' ? (
        <ResultsView scores={scores} counts={counts} usedKeys={usedKeys} responses={responses} catMap={catMap} quizName={runQuiz.name} destinationEmail={state.destinationEmail} businessName={state.businessName || 'our team'} onRestart={() => setView('picker')} />
      ) : (
        <AdminView state={state} activeQuizId={activeQuizId} setActiveQuizId={setActiveQuizId} remote={remote} onLoadRemote={doLoadRemote}
          onRemoveMember={onRemoveMember}
          onAddQuiz={onAddQuiz} onRenameQuiz={onRenameQuiz} onDeleteQuiz={onDeleteQuiz}
          onAddTag={onAddTag} onDeleteTag={onDeleteTag} onAddFacet={onAddFacet} onDeleteFacet={onDeleteFacet}
          onAddPieceTo={onAddPieceTo} onUpdateLibraryPiece={onUpdateLibraryPiece} onDeleteLibraryPiece={onDeleteLibraryPiece} onAddPiecesToRoom={onAddPiecesToRoom}
          onSet={onSet} onImport={onImport} onReset={onResetAll} error={error} />
      )}
      {view === 'picker' && !remote.loading && <InfoButton />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
