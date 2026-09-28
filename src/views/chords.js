import { QUALITIES, QUALITY_INFO, QUALITY_GROUPS, ROOTS, NQ, makeCid, chordName, chordTones, parseChordSymbol, noteName, basicOf, INTERVAL_NAMES, cidBase } from '../theory.js';
import { voicings, capoOptions } from '../chorddb.js';
import { diagramSVG } from '../diagram.js';
import { previewChord } from '../audio.js';
import { getState, update } from '../store.js';
import { h, esc, icon, openSheet, toast } from '../ui.js';
import { app } from '../app.js';

const BEGINNER = ['C', 'A', 'G', 'E', 'D', 'Am', 'Em', 'Dm', 'A7', 'E7', 'D7', 'G7', 'C7', 'B7', 'Fmaj7', 'Cadd9', 'Asus2', 'Dsus4', 'Em7', 'Am7', 'F', 'Bm']
  .map(parseChordSymbol);

let el, gridEl, filt = { root: 'beg', group: 'basic', q: '', knownOnly: false };

export function mount(root) {
  el = root;
  el.innerHTML = `
    <div class="vhead"><div><h1>אקורדים</h1><div class="sub">${12 * NQ} אקורדים · עד 4 צורות אחיזה לכל אחד</div></div>
      <button class="iconbtn" id="ch-capo" aria-label="מחשבון קאפו">${icon('info')}</button></div>
    <div class="search">${icon('search')}<input id="ch-q" type="search" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="חפשו אקורד, למשל F#m7 או Bb" dir="ltr" style="text-align:right"><button class="clear" id="ch-qx" hidden aria-label="נקה">${icon('close')}</button></div>
    <div class="chips" id="ch-roots" style="margin-top:12px"></div>
    <div class="chips" id="ch-groups"></div>
    <div class="resbar"><span id="ch-count"></span><label style="display:flex;align-items:center;gap:8px">רק אקורדים שאני מכיר <label class="toggle" style="transform:scale(.8)"><input type="checkbox" id="ch-known"><span></span></label></label></div>
    <div class="cgrid" id="ch-grid"></div>`;
  gridEl = el.querySelector('#ch-grid');
  const roots = el.querySelector('#ch-roots');
  roots.innerHTML = `<button class="chip" data-r="beg">למתחילים</button><button class="chip" data-r="all">כל הטוניקות</button>` +
    ROOTS.map((r, i) => `<button class="chip chord" data-r="${i}">${r}</button>`).join('');
  roots.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; filt.root = b.dataset.r; render(); });
  const groups = el.querySelector('#ch-groups');
  groups.innerHTML = QUALITY_GROUPS.map(([k, n]) => `<button class="chip outline" data-g="${k}">${n}</button>`).join('') + '<button class="chip outline" data-g="all">הכל</button>';
  groups.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; filt.group = b.dataset.g; if (filt.root === 'beg') filt.root = 'all'; render(); });
  const q = el.querySelector('#ch-q'), qx = el.querySelector('#ch-qx');
  q.addEventListener('input', () => { filt.q = q.value.trim(); qx.hidden = !filt.q; render(); });
  qx.addEventListener('click', () => { q.value = ''; filt.q = ''; qx.hidden = true; render(); });
  el.querySelector('#ch-known').addEventListener('change', (e) => { filt.knownOnly = e.target.checked; render(); });
  el.querySelector('#ch-capo').addEventListener('click', openCapoGuide);
  gridEl.addEventListener('click', (e) => { const c = e.target.closest('[data-cid]'); if (c) openChord(+c.dataset.cid); });
  render();
}
export function onShow() { render(); }

function list() {
  const st = getState();
  const known = new Set(st.known);
  let cids = [];
  if (filt.q) {
    const c = parseChordSymbol(filt.q.replace(/\s+/g, ''));
    if (c != null) cids = [c];
    else {
      const qq = filt.q.toLowerCase();
      for (let r = 0; r < 12; r++) for (let q = 0; q < NQ; q++) { const cid = makeCid(r, q); if (chordName(cid).toLowerCase().startsWith(qq)) cids.push(cid); }
    }
  } else if (filt.root === 'beg') cids = BEGINNER.slice();
  else {
    const qs = QUALITIES.map((q, i) => i).filter((i) => filt.group === 'all' || QUALITY_INFO[QUALITIES[i]][1] === filt.group);
    const rs = filt.root === 'all' ? [...Array(12).keys()] : [+filt.root];
    for (const r of rs) for (const q of qs) cids.push(makeCid(r, q));
  }
  if (filt.knownOnly) cids = cids.filter((c) => known.has(cidBase(c)));
  return cids;
}
function render() {
  if (!el) return;
  el.querySelectorAll('#ch-roots [data-r]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === String(filt.root) && !filt.q)));
  el.querySelectorAll('#ch-groups [data-g]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === filt.group && filt.root !== 'beg' && !filt.q)));
  const st = getState();
  const known = new Set(st.known);
  const cids = list();
  el.querySelector('#ch-count').textContent = `${cids.length} אקורדים · ${known.size} מסומנים כ״מכיר״`;
  if (!cids.length) { gridEl.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>לא נמצא אקורד</b>נסו שם אחר, למשל Am7, Cmaj7 או F#m</div>`; return; }
  gridEl.innerHTML = cids.map((c) => {
    const v = voicings(c)[0];
    return `<button class="ccard" data-cid="${c}" aria-label="${esc(chordName(c))}">${known.has(cidBase(c)) ? '<span class="kn" title="מכיר"></span>' : ''}
      <span class="nm">${esc(chordName(c))}</span>${diagramSVG(v, { w: 88, lefty: st.settings.lefty, compact: true })}</button>`;
  }).join('');
}

export function openChord(cid, { capo = 0 } = {}) {
  const st = getState();
  const vs = voicings(cid);
  let vi = 0;
  const base = cidBase(cid);
  const body = h('<div class="cdetail"></div>');
  const q = QUALITIES[cid % NQ];
  const draw = () => {
    const v = vs[vi];
    const known = getState().known.includes(base);
    const tones = chordTones(cid);
    const caps = capoOptions(cid);
    body.innerHTML = `
      <div class="big"><span class="nm">${esc(chordName(cid))}</span></div>
      <div style="text-align:center;color:var(--muted);margin-top:-8px">${esc(noteName(Math.floor(base / NQ)))} ${esc(QUALITY_INFO[q][0])}</div>
      <div style="display:flex;justify-content:center">${diagramSVG(v, { w: 210, lefty: st.settings.lefty, showNotes: true, capo })}</div>
      ${v && v.bassNote != null ? `<p class="note" style="text-align:center">נגנו את הבס ${esc(noteName(v.bassNote))} על המיתר הנמוך.</p>` : ''}
      <div class="vpager"><button class="btn sm ghost" data-prev ${vi === 0 ? 'disabled' : ''}>הקודמת</button>
        <div class="dots">${vs.map((_, i) => `<i class="${i === vi ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn sm ghost" data-next ${vi >= vs.length - 1 ? 'disabled' : ''}>הבאה</button></div>
      <p class="note" style="text-align:center;margin:-4px 0 0">צורה ${vi + 1} מתוך ${vs.length}${v && v.r && v.r.length ? ' · ברה בסריג ' + v.r[0] : ''}${v && v.f.every((x) => x <= 3) && !(v.r && v.r.length) ? ' · עמדה פתוחה' : ''}</p>
      <div style="display:flex;gap:10px"><button class="btn primary block" data-strum>${icon('sound')} סטרום</button><button class="btn block" data-arp>פריטה איטית</button></div>
      <button class="btn block ${known ? 'sync' : 'ghost'}" data-known>${icon('check')} ${known ? 'אני מכיר את האקורד הזה' : 'סמנו כ״אני מכיר״'}</button>
      <div><div class="section-t" style="margin-top:4px">צלילי האקורד</div>
        <div class="tones">${tones.map((t) => `<div class="tone"><b>${esc(noteName(t.pc))}</b><span>${esc(INTERVAL_NAMES[t.iv] || t.iv)}</span></div>`).join('')}</div></div>
      <div><div class="section-t">איך לאחוז: 1 = אצבע מורה · 2 = אמה · 3 = קמיצה · 4 = זרת</div>
        <p class="note">עיגול כתום מסמן את צליל היסוד (הבס). O מעל מיתר = מיתר פתוח, X = לא מנגנים. פס רחב = ברה (אצבע אחת לוחצת כמה מיתרים).</p></div>
      ${caps.length ? `<div><div class="section-t">עם קאפו — אותו צליל, צורה קלה יותר</div><div class="capolist">
        ${caps.map((c) => `<div class="capoitem">קאפו ${c.capo} + <b>${esc(c.name)}</b>${diagramSVG(c.v, { w: 80, capo: c.capo, compact: true, lefty: st.settings.lefty })}</div>`).join('')}</div></div>` : ''}
      <button class="btn ghost block" data-songs>${icon('songs')} שירים עם האקורד הזה</button>`;
  };
  draw();
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-prev')) { vi = Math.max(0, vi - 1); draw(); previewChord(vs[vi]); }
    else if (b.hasAttribute('data-next')) { vi = Math.min(vs.length - 1, vi + 1); draw(); previewChord(vs[vi]); }
    else if (b.hasAttribute('data-strum')) previewChord(vs[vi], { capo });
    else if (b.hasAttribute('data-arp')) previewChord(vs[vi], { capo, arp: true });
    else if (b.hasAttribute('data-known')) {
      update((s) => { const i = s.known.indexOf(base); if (i >= 0) s.known.splice(i, 1); else s.known.push(base); });
      draw(); render();
      toast(getState().known.includes(base) ? 'נוסף לאקורדים שאתם מכירים' : 'הוסר מהרשימה');
    } else if (b.hasAttribute('data-songs')) { sh.close(); app.showSongsWithChords([basicOf(cid)], 'any'); }
  });
  // swipe between voicings
  let x0 = null;
  body.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 60) { vi = Math.max(0, Math.min(vs.length - 1, vi + (dx > 0 ? 1 : -1))); draw(); }
  });
  const sh = openSheet({ title: 'אקורד', body, tall: true });
  return sh;
}

function openCapoGuide() {
  const body = h(`<div>
    <p class="note">קאפו מקצר את כל המיתרים באותו סריג. מנגנים צורה מוכרת — והצליל יוצא גבוה יותר בכמה חצאי טונים שמספר הסריג.</p>
    <div class="field"><label for="cg-chord">האקורד שרוצים שיישמע</label><input id="cg-chord" dir="ltr" value="Bb" autocomplete="off"></div>
    <div id="cg-out"></div></div>`);
  const out = body.querySelector('#cg-out');
  const run = () => {
    const c = parseChordSymbol(body.querySelector('#cg-chord').value.trim());
    if (c == null) { out.innerHTML = '<p class="note">לא הצלחנו לזהות את האקורד.</p>'; return; }
    const caps = capoOptions(c);
    out.innerHTML = caps.length ? `<div class="capolist">${caps.map((x) => `<div class="capoitem">קאפו ${x.capo} + <b>${esc(x.name)}</b>${diagramSVG(x.v, { w: 80, capo: x.capo, compact: true, lefty: getState().settings.lefty })}</div>`).join('')}</div>`
      : '<p class="note">אין צורה פתוחה פשוטה לאקורד הזה עם קאפו עד סריג 7.</p>';
  };
  body.querySelector('#cg-chord').addEventListener('input', run);
  run();
  openSheet({ title: 'מחשבון קאפו', body });
}
