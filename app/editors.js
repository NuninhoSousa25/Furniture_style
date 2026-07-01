/* ============================================================================
   FILE: app/editors.js — small shared form inputs + the crop editor modal.
   Depends on: helpers.js (Icon), quiz.js (CARD_RATIO_*, clamp — for the crop's
   aspect band).
   Used by: library.js and admin.js (BlurInput, Section, SwatchEditor, CropEditor).

   Index of this file, top to bottom:
     BlurInput        a text input that only fires onCommit on blur (not every
                      keystroke) — used for name/URL fields that trigger a persist
     Section          the card-styled wrapper + label used around every admin block
     SwatchEditor      a row of color swatches + a native color picker to add more
     CropEditor       draw / move / resize a crop box over an image, locked to a
                      ratio in the card band (see its own header comment below)
   ============================================================================ */

/* ---------------- small inputs ---------------- */
function BlurInput({ value, onCommit, placeholder, type }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return <input type={type || 'text'} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} placeholder={placeholder} className="field" />;
}
function Section({ label, children }) {
  return (
    <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
      <p className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>{label}</p>
      {children}
    </div>
  );
}

/* a row of color swatches with a picker to add more — shared by main and accent colors */
function SwatchEditor({ colors, draft, setDraft, onAdd, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((c) => (
        <span key={c} className="flex items-center gap-1 rounded-full border pl-1 pr-1.5 py-1" style={{ borderColor: 'rgba(43,37,32,0.2)' }}>
          <span className="w-5 h-5 rounded-full" style={{ background: safeColor(c), border: '1px solid rgba(43,37,32,0.15)' }} />
          <button onClick={() => onRemove(c)} aria-label="Remove color" style={{ lineHeight: 0 }}><Icon name="x" size={12} /></button>
        </span>
      ))}
      <input type="color" value={draft} onChange={(e) => setDraft(e.target.value)} className="w-9 h-9 rounded-lg p-0 flex-shrink-0" style={{ border: '1px solid rgba(43,37,32,0.2)' }} aria-label="Pick color" />
      <button onClick={onAdd} className="ghost-button"><Icon name="plus" size={13} /> Add</button>
    </div>
  );
}

/* ---------------- crop editor ----------------
   A React port of the standalone IMG/EXPORT tool. Lets the designer draw / move / resize a
   crop box over the source image, locked to a chosen aspect within the card band (4:5 .. 2:3),
   so they see exactly what is kept vs trimmed. Stores a normalised crop { ratio, x, y, w, h }.
   The overlay canvas only paints the dim mask + handles — it never reads image pixels, so
   remote (cross-origin) images are fine (no canvas taint, nothing is re-hosted). */
const CROP_RATIOS = [ { r: 4 / 5, label: '4:5' }, { r: 3 / 4, label: '3:4' }, { r: 2 / 3, label: '2:3' } ];
function fitRect(W, H, ratio) { let w = W, h = w / ratio; if (h > H) { h = H; w = h * ratio; } return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
function CropEditor({ src, initial, onApply, onCancel }) {
  const stageRef = useRef(null), imgRef = useRef(null), canvasRef = useRef(null);
  const interaction = useRef(null);
  const sel = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const disp = useRef({ w: 0, h: 0 });
  const [ratio, setRatio] = useState(clamp((initial && initial.ratio) || CARD_RATIO_DEFAULT, CARD_RATIO_MIN, CARD_RATIO_MAX));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const HANDLE = 14, MIN = 24;

  const draw = () => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height; const s = sel.current;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,16,12,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.clearRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#C5A23C'; ctx.lineWidth = 1.5; ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    ctx.strokeStyle = 'rgba(197,162,60,0.35)'; ctx.lineWidth = 0.75;
    for (let i = 1; i < 3; i++) { const x = s.x + (s.w / 3) * i, y = s.y + (s.h / 3) * i; ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x, s.y + s.h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y); ctx.stroke(); }
    ctx.fillStyle = '#C5A23C'; const hs = 7;
    [[s.x, s.y], [s.x + s.w - hs, s.y], [s.x, s.y + s.h - hs], [s.x + s.w - hs, s.y + s.h - hs],
     [s.x + s.w / 2 - hs / 2, s.y], [s.x + s.w / 2 - hs / 2, s.y + s.h - hs], [s.x, s.y + s.h / 2 - hs / 2], [s.x + s.w - hs, s.y + s.h / 2 - hs / 2]]
      .forEach(([cx, cy]) => ctx.fillRect(cx, cy, hs, hs));
  };

  const layout = () => {
    const img = imgRef.current, stage = stageRef.current;
    if (!img || !stage || !img.naturalWidth) return;
    const pad = 16, sw = stage.clientWidth - pad * 2, sh = stage.clientHeight - pad * 2;
    const scale = Math.min(sw / img.naturalWidth, sh / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    disp.current = { w, h };
    if (initial && initial.w) sel.current = { x: initial.x * w, y: initial.y * h, w: initial.w * w, h: initial.h * h };
    else sel.current = fitRect(w, h, ratio);
    setReady(true); requestAnimationFrame(draw);
  };
  useEffect(() => { const img = imgRef.current; if (img && img.complete && img.naturalWidth) layout(); }, []);
  // changing the target ratio re-fits the box around its current centre, clamped to the image
  const applyRatio = (nr) => {
    setRatio(nr); const d = disp.current; if (!d.w) return;
    const cx = sel.current.x + sel.current.w / 2, cy = sel.current.y + sel.current.h / 2;
    const f = fitRect(d.w, d.h, nr); let w = Math.min(sel.current.w, f.w), h = w / nr; if (h > d.h) { h = d.h; w = h * nr; }
    sel.current = clampSel({ x: cx - w / 2, y: cy - h / 2, w, h }, nr); draw();   // pass nr — `ratio` state is stale until re-render
  };
  // r defaults to the current ratio; callers mid-ratio-change pass the new ratio explicitly
  const clampSel = (s, r = ratio) => {
    const d = disp.current;
    if (s.w > d.w) { s.w = d.w; s.h = s.w / r; }
    if (s.h > d.h) { s.h = d.h; s.w = s.h * r; }
    s.x = clamp(s.x, 0, d.w - s.w); s.y = clamp(s.y, 0, d.h - s.h);
    return s;
  };
  // canvas CSS size can differ from its pixel size (responsive layout), so pointer coords are
  // rescaled by that ratio to land in the same pixel space as `sel` / disp.current
  const rel = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvasRef.current.width / r.width), y: (e.clientY - r.top) * (canvasRef.current.height / r.height) }; };
  // what a pointer-down at (x,y) means: on a handle (8 possible: 4 corners + 4 edges) -> resize
  // that edge; inside the box -> move it; outside it entirely -> start drawing a new box
  const zone = (x, y) => {
    const s = sel.current, H2 = HANDLE;
    const L = Math.abs(x - s.x) <= H2, R = Math.abs(x - (s.x + s.w)) <= H2, T = Math.abs(y - s.y) <= H2, B = Math.abs(y - (s.y + s.h)) <= H2;
    const inside = x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h;
    if (T && L) return 'tl'; if (T && R) return 'tr'; if (B && L) return 'bl'; if (B && R) return 'br';
    if (T) return 't'; if (B) return 'b'; if (L) return 'l'; if (R) return 'r';
    return inside ? 'move' : 'draw';
  };
  const onDown = (e) => {
    e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    const p = rel(e), z = zone(p.x, p.y);
    interaction.current = { type: z === 'draw' ? 'draw' : z === 'move' ? 'move' : 'resize', edge: z, sx: p.x, sy: p.y, start: { ...sel.current }, ax: p.x, ay: p.y };
    if (z === 'draw') sel.current = { x: p.x, y: p.y, w: 0, h: 0 };
  };
  const onMove = (e) => {
    const it = interaction.current; if (!it) return; e.preventDefault();
    const p = rel(e), dx = p.x - it.sx, dy = p.y - it.sy;
    if (it.type === 'move') { sel.current = clampSel({ ...it.start, x: it.start.x + dx, y: it.start.y + dy }); }
    else if (it.type === 'draw') {
      // grow the box from its anchor point (where the pointer went down) toward the cursor,
      // picking whichever dimension the drag is "more" in and deriving the other from `ratio`
      let aw = Math.abs(p.x - it.ax), ah = Math.abs(p.y - it.ay), w, h;
      if (aw / Math.max(1, ah) > ratio) { w = aw; h = w / ratio; } else { h = ah; w = h * ratio; }
      sel.current = clampSel({ x: p.x >= it.ax ? it.ax : it.ax - w, y: p.y >= it.ay ? it.ay : it.ay - h, w, h });
    } else {
      // resize from a handle: grow/shrink the dragged edge(s) freely, then re-derive the other
      // dimension from `ratio` so the box never leaves the locked aspect — which edge "anchors"
      // (stays put while the opposite one moves) depends on which handle is being dragged
      const e0 = it.edge; let ns = { ...it.start };
      if (e0.includes('r')) ns.w = Math.max(MIN, it.start.w + dx);
      if (e0.includes('l')) { ns.w = Math.max(MIN, it.start.w - dx); ns.x = it.start.x + it.start.w - ns.w; }
      if (e0.includes('b')) ns.h = Math.max(MIN, it.start.h + dy);
      if (e0.includes('t')) { ns.h = Math.max(MIN, it.start.h - dy); ns.y = it.start.y + it.start.h - ns.h; }
      if (e0 === 't' || e0 === 'b') { ns.w = ns.h * ratio; ns.x = it.start.x + it.start.w / 2 - ns.w / 2; }       // top/bottom edge: grow width from center
      else if (e0 === 'l' || e0 === 'r') { ns.h = ns.w / ratio; ns.y = it.start.y + it.start.h / 2 - ns.h / 2; }  // left/right edge: grow height from center
      else { ns.h = ns.w / ratio; if (e0 === 'tl' || e0 === 'tr') ns.y = it.start.y + it.start.h - ns.h; }        // corner: width drives height, anchor the opposite corner
      sel.current = clampSel(ns);
    }
    draw();
  };
  const onUp = () => { const it = interaction.current; if (it && it.type === 'draw' && sel.current.w < MIN) { sel.current = fitRect(disp.current.w, disp.current.h, ratio); draw(); } interaction.current = null; };
  const apply = () => { const d = disp.current; const s = sel.current; onApply({ ratio, x: clamp(s.x / d.w, 0, 1), y: clamp(s.y / d.h, 0, 1), w: clamp(s.w / d.w, 0, 1), h: clamp(s.h / d.h, 0, 1) }); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(20,16,12,0.92)' }}>
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ background: 'var(--card)', borderBottom: '1px solid rgba(43,37,32,0.15)' }}>
        <span className="font-mono text-xs tracking-widest" style={{ opacity: 0.6 }}>CROP</span>
        <span className="font-mono text-xs" style={{ opacity: 0.5 }}>Drag to draw · drag inside to move · handles to resize</span>
        <div className="flex gap-1.5 ml-auto items-center">
          <span className="font-mono text-xs mr-1" style={{ opacity: 0.6 }}>Shape</span>
          {CROP_RATIOS.map((o) => (
            <button key={o.label} onClick={() => applyRatio(o.r)} className="font-mono text-xs rounded-md px-2.5 py-1.5 border" style={{ borderColor: Math.abs(ratio - o.r) < 0.001 ? 'var(--brass)' : 'rgba(43,37,32,0.2)', background: Math.abs(ratio - o.r) < 0.001 ? 'var(--brass)' : '#fff', color: Math.abs(ratio - o.r) < 0.001 ? 'var(--card)' : 'var(--ink)' }}>{o.label}</button>
          ))}
          <button onClick={() => { sel.current = fitRect(disp.current.w, disp.current.h, ratio); draw(); }} className="ghost-button">Center</button>
          <button onClick={onCancel} className="ghost-button">Cancel</button>
          <button onClick={apply} disabled={!ready} className="tag-button disabled:opacity-40">Apply crop</button>
        </div>
      </div>
      <div ref={stageRef} className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ minHeight: 0 }}>
        {failed ? (
          <p className="font-mono text-sm" style={{ color: '#FBF6EE', opacity: 0.7 }}>Could not load the image (check the URL / CORS).</p>
        ) : (
          <div className="relative" style={{ width: disp.current.w || 'auto', height: disp.current.h || 'auto', lineHeight: 0 }}>
            <img ref={imgRef} src={src} alt="" draggable={false} onLoad={layout} onError={() => setFailed(true)} style={{ display: 'block', width: disp.current.w ? disp.current.w + 'px' : 'auto', height: disp.current.h ? disp.current.h + 'px' : 'auto', userSelect: 'none' }} />
            <canvas ref={canvasRef} width={disp.current.w} height={disp.current.h} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }} />
          </div>
        )}
      </div>
    </div>
  );
}

