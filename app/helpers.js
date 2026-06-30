const { useState, useEffect, useRef, useLayoutEffect, useMemo } = React;

/* ============================================================================
   Find Your Style — the app as JSX, split into focused files under app/. index.html (repo
   root) fetches them in order, concatenates, and compiles in-browser with Babel (classic
   runtime) into one shared global scope; styles live in app/index.css.

   Files, in load / dependency order (see the FILES list in index.html):
     helpers.js  · React hooks, Icon, generic utils            ← this file
     model.js    · data model: facets/tags, library, roomPieces, withDefaults, remote loading
     quiz.js     · swipe screen: CroppedImage, CardFace, QuizView
     results.js  · ResultsView, DetailedResponses, PickerView, InfoButton
     editors.js  · shared inputs (BlurInput, Section, SwatchEditor) + CropEditor
     library.js  · LibraryManager (master library + builder)
     admin.js    · AdminView (the ?dev=true panel)
     main.js     · App (state, routing) + ReactDOM render
   ============================================================================ */

/* ---------------- icons ---------------- */
function Icon({ name, size = 18, color = 'currentColor', fill = 'none', strokeWidth = 2 }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill, stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'x': return <svg {...c}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    case 'heart': return <svg {...c}><path d="M12 21s-1-.6-2.6-1.9C5.4 15.7 2 12.6 2 8.9 2 6.2 4.2 4 6.9 4c1.6 0 3.1.8 4.1 2.1C12 4.8 13.5 4 15.1 4 17.8 4 20 6.2 20 8.9c0 3.7-3.4 6.8-7.4 10.2C12 21 12 21 12 21z" /></svg>;
    case 'settings': return <svg {...c}><line x1="4" y1="6" x2="20" y2="6" /><circle cx="14" cy="6" r="2" fill={color} /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="8" cy="12" r="2" fill={color} /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="16" cy="18" r="2" fill={color} /></svg>;
    case 'arrow-left': return <svg {...c}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;
    case 'plus': return <svg {...c}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case 'trash': return <svg {...c}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1.2 14a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;
    case 'pencil': return <svg {...c}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case 'rotate': return <svg {...c}><path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" /><polyline points="3 3 3 8 8 8" /></svg>;
    case 'image': return <svg {...c}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" fill={color} /><path d="M21 15l-5-5-9 9" /></svg>;
    case 'download': return <svg {...c}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
    case 'upload': return <svg {...c}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
    case 'send': return <svg {...c}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
    case 'copy': return <svg {...c}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
    case 'chevron': return <svg {...c}><polyline points="9 18 15 12 9 6" /></svg>;
    case 'undo': return <svg {...c}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>;
    case 'cloud': return <svg {...c}><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19Z" /></svg>;
    case 'message': return <svg {...c}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>;
    case 'flag': return <svg {...c}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>;
    case 'info': return <svg {...c}><circle cx="12" cy="12" r="10" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="7.5" x2="12" y2="7.5" /></svg>;
    case 'no-entry': return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill={color} /><rect x="6" y="10.3" width="12" height="3.4" rx="0.6" fill="var(--card)" /></svg>;
    default: return null;
  }
}

/* ---------------- helpers ---------------- */
function readableText(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '#2B2520';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#2B2520' : '#FBF6EE';
}
function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'item'; }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const NEW_TAG_PALETTE = ['#8C9A6B', '#7C6A8A', '#3F6B6B', '#A85751', '#C9A227', '#5E7A6C', '#9C7B52', '#46423C'];
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

