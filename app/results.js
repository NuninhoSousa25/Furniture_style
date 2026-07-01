/* ============================================================================
   FILE: app/results.js — the result screen, the full report, and the room picker.
   Depends on: helpers.js (Icon, readableText), model.js (primaryStyle, ACTIONS,
   sign, roomPieces).
   Used by: main.js (renders <ResultsView> for 'results' and <PickerView>/
   <InfoButton> for 'picker').

   Index of this file, top to bottom:
     DetailedResponses    full piece-by-piece reaction list (only used inside the
                          shared report text, not shown to the client on screen)
     ResultsView          the client-facing result: top style, "what you're drawn
                          to" (weighted materials/objects/palettes), color palette,
                          and the share row (email / native share / copy) that
                          builds the full text report via buildSummary()
     PickerView           the room-selection start screen (when >1 room exists)
     InfoButton           the "How it works" popover on the start screen
   ============================================================================ */

/* ---------------- detailed responses (for the technicians) ---------------- */
function DetailedResponses({ responses, catMap }) {
  if (!responses.length) return null;
  const noteCount = responses.filter((r) => r.note).length;
  // strongest reaction first (Love it, Like, Pass, Never), keeping show order within a tie
  const ordered = [...responses].sort((a, b) => b.delta - a.delta);
  return (
    <div className="w-full">
      <p className="font-mono text-xs tracking-widest mb-3" style={{ opacity: 0.6 }}>EVERY REACTION ({responses.length}{noteCount ? `, ${noteCount} with notes` : ''})</p>
      <div className="flex flex-col gap-2">
        {ordered.map((r, i) => {
          const a = ACTIONS.find((x) => x.key === r.actionKey) || { color: 'var(--ink)' };
          const sw = primaryStyle(r, catMap) || { color: '#E4DCC9' };
          const tagLabels = r.tags.map((t) => catMap[t]?.label || t).join(', ');
          return (
            <div key={i} className="rounded-xl p-3 flex items-start gap-3" style={{ background: 'var(--card)' }}>
              <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: safeColor(sw.color) }}>
                {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{i + 1}. {r.pieceName || 'Untitled piece'}</p>
                  <span className="font-mono flex-shrink-0" style={{ color: a.color, fontSize: '11px' }}>{r.actionLabel} ({sign(r.delta)})</span>
                </div>
                {tagLabels && <p className="text-xs truncate" style={{ opacity: 0.55 }}>{tagLabels}</p>}
                {r.note && <p className="text-sm mt-1 leading-snug" style={{ color: 'var(--ink)' }}>&ldquo;{r.note}&rdquo;</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- results + share ---------------- */
function ResultsView({ scores, counts, usedKeys, responses, catMap, quizName, destinationEmail, businessName, onRestart }) {
  const [clientName, setClientName] = useState('');
  const [copied, setCopied] = useState(false);
  // average affinity per category, range about -2..+2, so volume does not bias the result
  const cats = usedKeys.map((k) => catMap[k]).filter(Boolean).map((c) => {
    const cnt = counts[c.id] || 0;
    const avg = cnt ? (scores[c.id] || 0) / cnt : 0;
    return { ...c, avg, cnt };
  });
  const ranked = [...cats].sort((a, b) => b.avg - a.avg);
  const top = ranked[0];
  const second = ranked[1];
  const showSecond = second && second.avg > 0 && top.avg - second.avg <= 0.5;

  // color palette: drawn from the pieces the client reacted positively to (Like / Love it),
  // strongest reaction first, deduped. Only appears if those pieces carried colors.
  const liked = [...responses].filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta);
  const dedupe = (arr) => [...new Set(arr.map((c) => (c || '').toUpperCase()))].filter(Boolean);
  const mainPalette = dedupe(liked.flatMap((r) => r.colors || [])).slice(0, 8);
  const accentPalette = dedupe(liked.flatMap((r) => r.accentColors || [])).slice(0, 6);
  const hasPalette = mainPalette.length > 0 || accentPalette.length > 0;

  // weighted extras: what the client gravitated toward per non-style facet, ranked by reaction
  // strength (Like +1, Love it +2). The style still drives the profile; these are descriptive.
  const facetTally = (facet) => {
    const m = {};
    liked.forEach((r) => (r.tags || []).forEach((id) => { const t = catMap[id]; if (t && t.facet === facet) m[id] = (m[id] || 0) + r.delta; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([id]) => catMap[id]).filter(Boolean);
  };
  const likedMaterials = facetTally('material');
  const likedObjects = facetTally('object');
  const likedPalettes = facetTally('palette');
  const hasDrawn = likedMaterials.length > 0 || likedObjects.length > 0 || likedPalettes.length > 0;

  const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
  const buildSummary = () => {
    const lines = [`Style quiz result, ${quizName}`];
    if (clientName.trim()) lines.push(`From: ${clientName.trim()}`);
    lines.push(`Pieces reviewed: ${responses.length}`);
    if (top) lines.push(`Top style: ${top.label} (${fmt(top.avg)})`);
    if (showSecond) lines.push(`Also leans: ${second.label} (${fmt(second.avg)})`);
    if (mainPalette.length) lines.push(`Color palette (from liked pieces): ${mainPalette.join(', ')}`);
    if (accentPalette.length) lines.push(`Accent colors: ${accentPalette.join(', ')}`);
    if (likedMaterials.length) lines.push(`Materials they liked: ${likedMaterials.slice(0, 8).map((t) => t.label).join(', ')}`);
    if (likedObjects.length) lines.push(`Objects they liked: ${likedObjects.slice(0, 8).map((t) => t.label).join(', ')}`);
    if (likedPalettes.length) lines.push(`Palettes they liked: ${likedPalettes.map((t) => t.label).join(', ')}`);
    lines.push('', 'Affinity by style (average reaction, -2 to +2):');
    ranked.forEach((s) => lines.push(`- ${s.label}: ${fmt(s.avg)} (over ${s.cnt} piece${s.cnt === 1 ? '' : 's'})`));
    lines.push('', 'Detailed responses, strongest reaction first:');
    [...responses].sort((a, b) => b.delta - a.delta).forEach((r, i) => {
      const tagLabels = r.tags.map((t) => catMap[t]?.label || t).join(', ');
      lines.push(`${i + 1}. ${r.pieceName || 'Untitled piece'} — ${r.actionLabel} (${sign(r.delta)})${tagLabels ? ` [${tagLabels}]` : ''}`);
      if (r.note) lines.push(`   Note: ${r.note}`);
    });
    return lines.join('\n');
  };
  const sendEmail = () => {
    const subject = `Style quiz result${clientName.trim() ? ` from ${clientName.trim()}` : ''}, ${quizName}`;
    window.location.href = `mailto:${encodeURIComponent(destinationEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildSummary())}`;
  };
  const nativeShare = async () => { try { await navigator.share({ title: `Style quiz result, ${quizName}`, text: buildSummary() }); } catch (e) {} };
  const copy = async () => { try { await navigator.clipboard.writeText(buildSummary()); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {} };

  const shareRow = (
    <div className="w-full rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
      <p className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>SEND THIS TO {(businessName || 'US').toUpperCase()}</p>
      <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Your name (optional)" className="field" />
      <div className="flex flex-wrap gap-2">
        {destinationEmail && <button onClick={sendEmail} className="tag-button"><Icon name="send" size={15} color="var(--card)" /> Send to us</button>}
        {typeof navigator !== 'undefined' && navigator.share && <button onClick={nativeShare} className="ghost-button"><Icon name="upload" size={14} /> Share</button>}
        <button onClick={copy} className="ghost-button"><Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy result'}</button>
      </div>
      {!destinationEmail && <p className="text-xs" style={{ opacity: 0.55 }}>Tip: set your email under Manage so a "Send to us" button appears here.</p>}
      <p className="text-xs" style={{ opacity: 0.55 }}>The message includes every reaction and note so the team can read your taste piece by piece.</p>
    </div>
  );

  if (!top || top.avg <= 0) {
    return (
      <div className="w-full max-w-xs flex flex-col items-center text-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-2xl">Nothing quite landed</p>
          <p className="text-sm" style={{ opacity: 0.75 }}>That's useful too. Send this to {businessName} and we'll start from scratch with you, your notes still help.</p>
          <button onClick={onRestart} className="ghost-button mt-1"><Icon name="rotate" size={14} /> Try again</button>
        </div>
        {shareRow}
      </div>
    );
  }
  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="font-mono text-xs tracking-widest mb-2" style={{ opacity: 0.6 }}>YOUR STYLE PROFILE, {quizName.toUpperCase()}</p>
        <p className="font-display text-3xl">{top.label}</p>
      </div>
      <div className="w-full rounded-lg p-5 relative overflow-hidden shadow-lg" style={{ background: safeColor(top.color), color: top.text || readableText(top.color) }}>
        <div className="absolute left-1/2 -translate-x-1/2 top-4 w-4 h-4 rounded-full" style={{ background: '#FBF8F2', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)' }} />
        <p className="mt-6 text-sm leading-relaxed">{top.desc}</p>
      </div>
      {showSecond && <p className="text-sm text-center" style={{ opacity: 0.8 }}>You also lean toward <span className="font-semibold">{second.label}</span>.</p>}
      {hasDrawn && (
        <div className="w-full rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
          <p className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>WHAT YOU'RE DRAWN TO</p>
          {likedMaterials.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs" style={{ opacity: 0.55 }}>Materials</span>
              <div className="flex flex-wrap gap-1.5">{likedMaterials.slice(0, 6).map((t) => <span key={t.id} className="text-xs rounded-full px-2.5 py-1 border" style={{ borderColor: 'rgba(43,37,32,0.2)' }}>{t.label}</span>)}</div>
            </div>
          )}
          {likedObjects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs" style={{ opacity: 0.55 }}>Pieces &amp; objects</span>
              <div className="flex flex-wrap gap-1.5">{likedObjects.slice(0, 6).map((t) => <span key={t.id} className="text-xs rounded-full px-2.5 py-1 border" style={{ borderColor: 'rgba(43,37,32,0.2)' }}>{t.label}</span>)}</div>
            </div>
          )}
          {likedPalettes.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs" style={{ opacity: 0.55 }}>Palettes</span>
              {likedPalettes.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="text-xs flex-shrink-0">{t.label}</span>
                  <div className="flex gap-1 flex-wrap">{(t.swatches || []).slice(0, 6).map((c, i) => <span key={i} title={c} className="w-4 h-4 rounded-full" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />)}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs" style={{ opacity: 0.55 }}>Weighted by how strongly you reacted — Love it counts double.</p>
        </div>
      )}
      {hasPalette && (
        <div className="w-full rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
          <p className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>YOUR COLOR PALETTE</p>
          {mainPalette.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mainPalette.map((c, i) => (
                <div key={'m' + i} className="flex flex-col items-center gap-1">
                  <span className="w-9 h-9 rounded-lg" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />
                  <span className="font-mono" style={{ fontSize: '9px', opacity: 0.5 }}>{c}</span>
                </div>
              ))}
            </div>
          )}
          {accentPalette.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs" style={{ opacity: 0.55 }}>Accents</span>
              {accentPalette.map((c, i) => <span key={'a' + i} title={c} className="w-7 h-7 rounded-full" style={{ background: safeColor(c), boxShadow: '0 0 0 1px #fff, 0 0 0 2px rgba(43,37,32,0.3)' }} />)}
            </div>
          )}
          <p className="text-xs" style={{ opacity: 0.55 }}>Drawn from the colors of the pieces you liked.</p>
        </div>
      )}
      {shareRow}
      <button onClick={onRestart} className="ghost-button"><Icon name="rotate" size={14} /> Take it again</button>
    </div>
  );
}

/* ---------------- picker ---------------- */
function PickerView({ quizzes, onPick, libById }) {
  const count = (q) => roomPieces(q, libById).length;
  return (
    <div className="w-full max-w-xs flex flex-col items-center text-center gap-5 mt-4">
      <p className="font-display text-4xl leading-tight">What's your<br />style?</p>
      <p className="text-sm" style={{ opacity: 0.75 }}>Which space are we designing? Pick one to begin.</p>
      <div className="w-full flex flex-col gap-3">
        {quizzes.map((q) => (
          <button key={q.id} onClick={() => onPick(q)} disabled={count(q) === 0} className="w-full rounded-lg px-4 py-4 flex items-center justify-between disabled:opacity-40" style={{ background: 'var(--card)' }}>
            <span className="font-display text-lg">{q.name}</span>
            <span className="font-mono text-xs flex items-center gap-1" style={{ opacity: 0.5 }}>{count(q)} pieces <Icon name="chevron" size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- "how it works" info button (start menu, bottom-right) ---------------- */
function InfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="How it works"
        className="fixed bottom-4 right-4 z-30 w-11 h-11 rounded-full flex items-center justify-center"
        style={{ background: 'var(--card)', color: 'var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
        <Icon name="info" size={20} />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(43,37,32,0.45)' }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-lg p-6 relative" style={{ background: 'var(--card)', color: 'var(--ink)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 p-1" style={{ opacity: 0.55 }}><Icon name="x" size={18} /></button>
            <p className="font-display text-2xl mb-4">How it works</p>
            <ol className="flex flex-col gap-3 text-sm" style={{ opacity: 0.9 }}>
              <li><b>Swipe or tap.</b> Drag a card right if you like a piece, left to pass — or just tap the buttons.</li>
              <li><b>Feeling strongly?</b> Tap <i>Love it</i> or <i>Never</i> (they count double) when a piece really stands out.</li>
              <li><b>Add a note.</b> Say what you love or dislike about any piece. Totally optional.</li>
              <li><b>Change your mind.</b> Use <i>Undo</i> to step back through pieces and re-answer.</li>
              <li><b>Get your style.</b> Answer a handful of pieces, stop when you like, and we'll show your style profile to share with the studio.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

