/* ============================================================================
   FILE: app/quiz.js — the swipe screen (card rendering + drag-to-react interaction).
   Depends on: helpers.js (Icon, readableText), model.js (primaryStyle, ACTIONS,
   EXIT_CLASS).
   Used by: main.js (renders <QuizView> for the 'quiz' view).

   Index of this file, top to bottom:
     card sizing consts     CARD_RATIO_*, CARD_MAX_W_*, CARD_CONTROLS_RESERVE_*,
                             CARD_SLOT_MIN_H, clamp, cardRatio, validCrop
     CroppedImage            renders a stored crop (or plain cover) with pure CSS
     CardFace                one card's visuals: image/placeholder + name caption
     StampOverlay            the big LIKE/PASS/etc. stamp shown after a committed reaction
     QuizView                the whole screen: progress bar, card stack (current +
                             peeked next), pointer-driven drag-to-swipe, note field,
                             the 4 reaction buttons, and the "stop & see results" button
   ============================================================================ */

/* ---------------- card ----------------
   Cards lock to a fixed footprint. Each piece's display aspect is its crop ratio, clamped to a
   gentle vertical band (4:5 .. 2:3). The card slot always reserves the TALLEST allowed height and
   centres the card, so the reaction buttons sit at a fixed baseline regardless of the photo. */
const CARD_RATIO_MIN = 2 / 3;     // 0.667 — tallest allowed (width / height)
const CARD_RATIO_MAX = 4 / 5;     // 0.8   — least tall allowed
const CARD_RATIO_DEFAULT = 0.75;  // 3:4   — vertical-favouring default when a piece has no crop
// swipe-screen layout. The card width caps and the vertical space the controls below the card
// occupy (progress bar + note field + 4 reaction buttons + optional stop button). Keep RESERVE
// in sync if those controls change height, or the card slot will mis-size (see QuizView).
const CARD_MAX_W_DESKTOP = 460, CARD_MAX_W_MOBILE = 384;
const CARD_CONTROLS_RESERVE_DESKTOP = 300, CARD_CONTROLS_RESERVE_MOBILE = 268;
const CARD_SLOT_MIN_H = 220;      // floor the card slot so it shrinks (not clips controls) on short viewports
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cardRatio(piece) { const r = piece && piece.crop && piece.crop.ratio; return clamp(r || CARD_RATIO_DEFAULT, CARD_RATIO_MIN, CARD_RATIO_MAX); }
// a crop is usable only if it's a complete, in-bounds normalised rect; otherwise fall back to cover
function validCrop(crop) { return crop && [crop.x, crop.y, crop.w, crop.h].every((n) => typeof n === 'number' && n >= 0) && crop.w > 0 && crop.h > 0 ? crop : null; }

/* renders the stored crop rect of an image into its (already correctly-shaped) box.
   crop = { ratio, x, y, w, h } with x/y/w/h normalised 0..1; absent/malformed => plain centred cover.
   Pure CSS — never reads pixels, so remote (cross-origin) images are fine. */
function CroppedImage({ src, crop, alt, onError }) {
  const c = validCrop(crop);
  const common = { pointerEvents: 'none', WebkitUserDrag: 'none' };
  if (!c) return <img src={src} alt={alt || ''} draggable={false} onError={onError} className="w-full h-full select-none" style={{ objectFit: 'cover', ...common }} />;
  return <img src={src} alt={alt || ''} draggable={false} onError={onError} className="select-none" style={{ position: 'absolute', width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x * 100) / c.w}%`, top: `${(-c.y * 100) / c.h}%`, maxWidth: 'none', ...common }} />;
}

function CardFace({ card, catMap, plain }) {
  const cat = primaryStyle(card, catMap) || { color: '#E4DCC9' };
  const text = cat.text || readableText(cat.color);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [card.imageUrl]);
  const showImage = card.imageUrl && !imgFailed;
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden shadow-xl" style={{ background: cat.color }}>
      {showImage ? (
        <CroppedImage src={card.imageUrl} crop={plain ? null : card.crop} alt={card.name} onError={() => setImgFailed(true)} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
          <Icon name="image" size={56} strokeWidth={1.25} color={text} />
          <span className="font-mono" style={{ fontSize: '11px', color: text, opacity: 0.6 }}>NO PHOTO YET</span>
        </div>
      )}
      {card.name && (
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4" style={{ background: showImage ? 'linear-gradient(to top, rgba(20,16,12,0.78), rgba(20,16,12,0))' : 'rgba(0,0,0,0.06)' }}>
          <p className="font-display text-xl leading-snug" style={{ color: showImage ? '#FBF6EE' : text }}>{card.name}</p>
        </div>
      )}
    </div>
  );
}
function StampOverlay({ action }) {
  if (!action) return null;
  const a = ACTIONS.find((x) => x.key === action);
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <div className="stamp font-display text-3xl sm:text-4xl font-bold px-6 py-2 border-4 rounded-xl tracking-wide" style={{ color: a.color, borderColor: a.color, background: 'rgba(251,248,242,0.82)', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', transform: 'rotate(-10deg)' }}>{a.stamp}</div>
    </div>
  );
}
function QuizView({ pieces, index, onAction, onUndo, canUndo, undoCount, exiting, catMap, minRequired, note, setNote, onStop, isDesktop, vw, vh }) {
  const card = pieces[index], next = pieces[index + 1];
  const total = pieces.length;
  const progress = Math.round((index / total) * 100);
  // they have already reacted to `index` pieces; they may stop once that meets the minimum
  const canStop = total > minRequired && index >= minRequired;

  // drag-to-swipe, one code path for mouse (PC) and touch (mobile) via Pointer Events.
  // Kept simple: right = Like, left = Pass. The double reactions (Never / Love it) live on
  // the buttons only — swipe distance no longer changes the strength, just the direction.
  const frameRef = useRef(null);
  const dragSt = useRef(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  // clear any offset the instant a new card mounts, before paint, so it never flashes in
  useLayoutEffect(() => { setDrag({ x: 0, y: 0, active: false }); dragSt.current = null; }, [card && card.id]);
  // how far the card must travel before a swipe commits; capped so it stays reachable on wide desktop cards
  const commitDistance = () => { const w = frameRef.current ? frameRef.current.getBoundingClientRect().width : 320; return Math.min(110, Math.max(60, w * 0.18)); };
  const swipeKey = (dx) => (dx > 0 ? 'like' : 'dislike');
  const onPointerDown = (e) => { if (exiting) return; dragSt.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} setDrag({ x: 0, y: 0, active: true }); };
  const onPointerMove = (e) => { const d = dragSt.current; if (!d || d.id !== e.pointerId) return; setDrag({ x: e.clientX - d.sx, y: e.clientY - d.sy, active: true }); };
  const endDrag = (e) => {
    const d = dragSt.current; if (!d) return; dragSt.current = null;
    const dx = e.clientX != null ? e.clientX - d.sx : drag.x;
    const key = Math.abs(dx) >= commitDistance() ? swipeKey(dx) : null;
    setDrag({ x: 0, y: 0, active: false });
    if (key) onAction(ACTIONS.find((a) => a.key === key));
  };
  // live stamp while dragging (Like or Pass only), fading in with distance
  let preview = null, previewOpacity = 0;
  if (drag.active && Math.abs(drag.x) > 8) {
    preview = ACTIONS.find((a) => a.key === swipeKey(drag.x));
    previewOpacity = Math.min(1, Math.abs(drag.x) / (commitDistance() * 0.7));
  }
  // fixed footprint: card width is fixed for the screen; the slot reserves the TALLEST allowed
  // height (2:3) and centres each card, so the reaction buttons never move. Each card's height is
  // its crop ratio clamped to the vertical band.
  const maxW = isDesktop ? CARD_MAX_W_DESKTOP : Math.min(CARD_MAX_W_MOBILE, (vw || 384) - 32);
  const reserve = isDesktop ? CARD_CONTROLS_RESERVE_DESKTOP : CARD_CONTROLS_RESERVE_MOBILE;
  // let the slot shrink to what actually fits the viewport height, so the reaction buttons never clip
  const slotMaxH = Math.max(CARD_SLOT_MIN_H, Math.round(vh || 800) - reserve);
  const cardW = Math.min(maxW, Math.round(slotMaxH * CARD_RATIO_MIN));   // cap width so the tallest card still fits
  const slotH = Math.round(cardW / CARD_RATIO_MIN);
  const cardH = Math.round(cardW / cardRatio(card));
  const frame = { width: cardW + 'px', height: cardH + 'px', transition: 'width .25s ease, height .25s ease' };
  const slotStyle = { width: cardW + 'px', height: slotH + 'px' };
  const outerStyle = { width: cardW + 'px' };

  return (
    <div className={`w-full flex flex-col items-center ${isDesktop ? 'flex-1 justify-center' : ''}`}>
     <div className="flex flex-col items-center mx-auto" style={outerStyle}>
      <div className="w-full flex items-center justify-between mb-3 px-1">
        <span className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>PIECE {index + 1} / {total}</span>
        <button onClick={onUndo} disabled={!canUndo || !!exiting} className="font-mono text-xs flex items-center gap-1 disabled:opacity-30" aria-label={canUndo ? `Go back — ${undoCount} piece${undoCount === 1 ? '' : 's'} to undo` : 'Undo last'} title="Step back through previous pieces to change your answer">
          <Icon name="undo" size={13} /> UNDO{undoCount > 0 ? ` (${undoCount})` : ''}
        </button>
      </div>
      <div className="w-full h-1.5 rounded-full mb-5 overflow-hidden" style={{ background: 'rgba(43,37,32,0.12)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--brass)' }} />
      </div>
      <div className="relative flex items-center justify-center" style={slotStyle}>
       <div ref={frameRef} className="relative" style={frame}>
        {next && <div className="absolute inset-0 scale-95 translate-y-3 opacity-60"><CardFace card={next} catMap={catMap} plain /></div>}
        <div
          className={`absolute inset-0 select-none ${exiting ? EXIT_CLASS[exiting] : ''}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
          style={{ transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.05}deg)`, transition: drag.active ? 'none' : 'transform .2s ease', touchAction: 'none', cursor: drag.active ? 'grabbing' : 'grab' }}
        >
          <CardFace card={card} catMap={catMap} />
          <StampOverlay action={exiting} />
          {!exiting && preview && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="font-display text-3xl sm:text-4xl font-bold px-6 py-2 border-4 rounded-xl tracking-wide" style={{ color: preview.color, borderColor: preview.color, background: 'rgba(251,248,242,0.82)', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', transform: `rotate(${drag.x > 0 ? -10 : 10}deg)`, opacity: previewOpacity }}>{preview.stamp}</div>
            </div>
          )}
        </div>
       </div>
      </div>
      <div className="w-full mt-5 flex items-center gap-2">
        <span style={{ opacity: 0.4 }}><Icon name="message" size={15} /></span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional), e.g. love the colour" className="field" style={{ fontSize: '13px' }} />
      </div>
      <div className="grid grid-cols-4 gap-3 w-full mt-4">
        {ACTIONS.map((a) => (
          <button key={a.key} onClick={() => onAction(a)} disabled={!!exiting} aria-label={a.label} className="flex flex-col items-center justify-center gap-1 rounded-lg py-3 border transition-transform active:scale-95 disabled:opacity-50" style={{ borderColor: a.color, color: a.color, background: 'var(--card)', boxShadow: '0 2px 5px rgba(30,26,20,0.10)' }}>
            <span className="relative">
              <Icon name={a.icon} size={22} color={a.color} fill={a.key === 'superLike' || a.key === 'like' ? a.color : 'none'} />
              {a.badge && <span className="absolute -top-1 -right-2 font-mono font-bold" style={{ color: a.color, fontSize: '10px' }}>x2</span>}
            </span>
            <span className="font-mono tracking-wide" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.label}</span>
          </button>
        ))}
      </div>
      {canStop && (
        <button onClick={onStop} disabled={!!exiting} className="tag-button mt-6 disabled:opacity-50">
          <Icon name="flag" size={14} color="var(--card)" /> Stop &amp; see my results ({index} answered)
        </button>
      )}
     </div>
    </div>
  );
}

