import { SONGS, GENRES, LANGS, filterSongs, defaultFilters, activeFilterCount } from '../library.js';
import { chordName, keyName, ROOTS, BASIC_SUFFIX, cidBase, basicOf } from '../theory.js';
import { getState, update, isFav, toggleFav } from '../store.js';
import { h, esc, icon, openSheet, toast } from '../ui.js';
import { app } from '../app.js';

const ROW = 74;
let el, listEl, f, results = [], scroller;
const DIFF = ['', 'קל', 'בינוני', 'מתקדם'];
const DIFF_CLS = ['', 'easy', 'mid', 'hard'];

export function genreHue(g) { return [18, 200, 280, 95, 40, 220, 330, 10, 300, 150, 120, 60, 250, 25, 170, 190, 30, 5, 210][g % 19]; }

export function songRowHTML(s, extra = {}) {
  const fav = isFav(s.k);
  const chords = s.chords.slice(0, 4).map((c) => `<span>${esc(chordName(c, s.key))}</span>`).join('');
  const meta = [s.a || (s.mine ? 'השיר שלי' : ''), s.y ? s.y : ''].filter(Boolean).join(' · ');
  const hue = genreHue(s.g);
  const first = s.chords[0] != null ? chordName(s.chords[0], s.key) : '♪';
  return `<button class="song" data-k="${esc(s.k)}" style="top:${extra.top ?? 0}px;${extra.static ? 'position:relative' : ''}">
    <span class="art${first.length > 5 ? ' xs' : first.length > 3 ? ' s' : ''}" style="background:hsl(${hue} 42% 38%)">${esc(first)}</span>
    <span class="meta"><span class="t">${esc(s.t)}</span>
      <span class="a"><span class="ar">${esc(meta)}</span>${s.timed ? '<span class="pill sync">מסונכרן</span>' : ''}${s.mine ? '<span class="pill mine">שלי</span>' : ''}${s.curated ? '<span class="pill">בסיסי</span>' : ''}<span class="pill ${DIFF_CLS[s.diff]}">${DIFF[s.diff]}</span>${extra.capoFit ? ` <span class="pill">קאפו ${extra.capoFit}</span>` : ''}</span>
      <span class="cl">${chords}</span></span>
    <span class="fav" role="button" data-fav aria-label="מועדף" aria-pressed="${fav}">${icon('star', fav ? 'fill' : '')}</span></button>`;
}

export function mount(root) {
  el = root;
  const st = getState();
  f = { ...defaultFilters(), ...(st.settings.lastFilters || {}) };
  f.q = '';
  const timedCount = SONGS.filter((s) => s.timed).length;
  const heCount = SONGS.filter((s) => s.lang === 0).length;
  el.innerHTML = `
    <div class="vhead"><div><h1>שירים</h1><div class="sub">${SONGS.length.toLocaleString('he-IL')} שירים · ${timedCount.toLocaleString('he-IL')} מסונכרנים להקלטה · ${heCount} בעברית</div></div>
      <div style="display:flex;gap:8px"><button class="iconbtn" id="sg-add" aria-label="הוספת שיר">${icon('plus')}</button>
      <button class="iconbtn" id="sg-filter" aria-label="סינון">${icon('filter')}<span class="badge" id="sg-badge" hidden></span></button></div></div>
    <div id="sg-resume"></div>
    <div class="search">${icon('search')}<input id="sg-q" type="search" placeholder="שם שיר, אמן או אקורדים (Am F C G)" autocomplete="off"><button class="clear" id="sg-qx" hidden aria-label="נקה">${icon('close')}</button></div>
    <div class="seg" id="sg-lang" style="margin-top:10px"><button data-l="all">הכל</button><button data-l="0">עברית</button><button data-l="1">אנגלית</button><button data-l="2">אחר</button></div>
    <div class="chips" id="sg-quick" style="margin-top:10px">
      <button class="chip" data-q="canplay">${icon('hand')} מה אני יכול לנגן</button>
      <button class="chip" data-q="timed">מסונכרן להקלטה</button>
      <button class="chip" data-q="nobarre">בלי ברה</button>
      <button class="chip" data-q="easy">קל</button>
      <button class="chip" data-q="mine">השירים שלי</button>
      ${[0, 1, 2, 3, 7, 4, 5].map((g) => `<button class="chip outline" data-g="${g}">${esc(GENRES[g])}</button>`).join('')}
    </div>
    <div class="resbar"><span id="sg-count"></span>
      <select id="sg-sort" aria-label="מיון"><option value="pop">פופולריים</option><option value="az">א–ת</option><option value="easy">הכי קלים</option><option value="year">חדשים</option><option value="old">ישנים</option><option value="slow">איטיים</option><option value="fast">מהירים</option></select></div>
    <div class="songlist" id="sg-list"></div>`;
  listEl = el.querySelector('#sg-list');
  const q = el.querySelector('#sg-q'), qx = el.querySelector('#sg-qx');
  let qt;
  q.addEventListener('input', () => { qx.hidden = !q.value; clearTimeout(qt); qt = setTimeout(() => { f.q = q.value; refresh(true); }, 140); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
  qx.addEventListener('click', () => { q.value = ''; qx.hidden = true; f.q = ''; refresh(true); });
  el.querySelector('#sg-lang').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; f.lang = b.dataset.l === 'all' ? 'all' : +b.dataset.l; refresh(true); });
  el.querySelector('#sg-quick').addEventListener('click', onQuick);
  el.querySelector('#sg-sort').addEventListener('change', (e) => { f.sort = e.target.value; refresh(true); });
  el.querySelector('#sg-filter').addEventListener('click', openFilters);
  el.querySelector('#sg-add').addEventListener('click', () => app.openEditor(null));
  listEl.addEventListener('click', onListClick);
  window.addEventListener('scroll', () => { if (el.offsetParent !== null) requestAnimationFrame(paint); }, { passive: true });
  window.addEventListener('resize', paint);
  refresh(true);
  renderResume();
}
export function onShow() { refresh(false); renderResume(); }
function renderResume() {
  const box = el && el.querySelector('#sg-resume');
  if (!box) return;
  const ls = getState().lastSong;
  const s = ls && Date.now() - ls.at < 14 * 86400000 && SONGS.find((x) => x.k === ls.k);
  if (!s) { box.innerHTML = ''; return; }
  box.innerHTML = `<button class="resume-card" data-k="${esc(s.k)}"><span class="rc-ic">${icon('play')}</span><span class="grow"><span class="d">להמשיך לנגן</span><b>${esc(s.t)}</b></span><span class="num">${ls.t > 5 ? Math.floor(ls.t / 60) + ':' + String(ls.t % 60).padStart(2, '0') : ''}</span></button>`;
  box.firstChild.onclick = () => app.openPlayer(s);
}

export function onListClickFactory(getSong) {
  return (e) => {
    const b = e.target.closest('.song');
    if (!b) return;
    const k = b.dataset.k;
    if (e.target.closest('[data-fav]')) {
      const on = toggleFav(k);
      const fb = b.querySelector('[data-fav]');
      fb.setAttribute('aria-pressed', String(on));
      fb.innerHTML = icon('star', on ? 'fill' : '');
      toast(on ? 'נוסף למועדפים' : 'הוסר מהמועדפים');
      return;
    }
    const s = getSong(k);
    if (s) app.openPlayer(s);
  };
}
const onListClick = onListClickFactory((k) => SONGS.find((s) => s.k === k));

function onQuick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const st = getState();
  if (b.dataset.g != null) {
    const g = +b.dataset.g;
    f.genres = f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g];
  } else {
    const k = b.dataset.q;
    if (k === 'canplay') {
      const known = st.known.map(basicOf);
      const on = f.chordMode === 'only' && f.chords.length && f._canplay;
      if (on) { f.chords = []; f.chordMode = 'any'; f._canplay = false; }
      else {
        if (!known.length) { toast('סמנו קודם אקורדים שאתם מכירים בלשונית ״אקורדים״'); app.go('chords'); return; }
        f.chords = [...new Set(known)]; f.chordMode = 'only'; f.capoMatch = true; f._canplay = true;
      }
    } else if (k === 'easy') f.diff = f.diff.includes(1) && f.diff.length === 1 ? [] : [1];
    else f[k] = !f[k];
  }
  refresh(true);
}

function syncUI() {
  el.querySelectorAll('#sg-lang [data-l]').forEach((b) => b.setAttribute('aria-pressed', String(String(f.lang) === b.dataset.l)));
  el.querySelectorAll('#sg-quick [data-q]').forEach((b) => {
    const k = b.dataset.q;
    const on = k === 'canplay' ? !!(f._canplay && f.chordMode === 'only' && f.chords.length) : k === 'easy' ? (f.diff.length === 1 && f.diff[0] === 1) : !!f[k];
    b.setAttribute('aria-pressed', String(on));
  });
  el.querySelectorAll('#sg-quick [data-g]').forEach((b) => b.setAttribute('aria-pressed', String(f.genres.includes(+b.dataset.g))));
  el.querySelector('#sg-sort').value = f.sort;
  const n = activeFilterCount(f);
  const bd = el.querySelector('#sg-badge'); bd.hidden = !n; bd.textContent = n;
}
export function refresh(resetScroll) {
  if (!el) return;
  results = filterSongs(f);
  syncUI();
  el.querySelector('#sg-count').textContent = `${results.length.toLocaleString('he-IL')} שירים`;
  listEl.style.height = `${Math.max(1, results.length) * ROW}px`;
  if (resetScroll) {
    const top = listEl.getBoundingClientRect().top + window.scrollY - 150;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  }
  lastRange = '';
  paint();
  update((s) => { const { q, ...rest } = f; s.settings.lastFilters = rest; });
}
let lastRange = '';
function paint() {
  if (!listEl) return;
  if (!results.length) {
    listEl.innerHTML = `<div class="empty"><b>לא נמצאו שירים</b>נסו להסיר חלק מהמסננים${f.chordMode === 'only' ? ', או להוסיף עוד אקורדים לבחירה' : ''}.</div>`;
    listEl.style.height = 'auto';
    return;
  }
  if (el.offsetParent === null) return;
  const top = -listEl.getBoundingClientRect().top;
  const vh = window.innerHeight;
  const a = Math.max(0, Math.floor(top / ROW) - 8), b = Math.min(results.length, Math.ceil((top + vh) / ROW) + 8);
  const key = a + ':' + b;
  if (key === lastRange) return;
  lastRange = key;
  let html = '';
  for (let i = a; i < b; i++) html += songRowHTML(results[i].s, { top: i * ROW, capoFit: results[i].capoFit });
  listEl.innerHTML = html;
}

export function setChordFilter(basics, mode) {
  f.chords = basics; f.chordMode = mode; f._canplay = false; f.lang = 'all'; f.q = '';
  if (el) { el.querySelector('#sg-q').value = ''; refresh(true); }
}

// --------------------------------------------------------------- filters sheet
function openFilters() {
  const g = { ...f, genres: [...f.genres], diff: [...f.diff], chords: [...f.chords], decades: [...f.decades], ts: [...f.ts] };
  const body = h('<div></div>');
  const FAM = ['מז׳ור', 'מינור', '7', 'מוקטן', 'מוגדל'];
  const draw = () => {
    body.innerHTML = `
      <div class="section-t" style="margin-top:4px">אקורדים בשיר</div>
      <div class="seg" id="fm-mode"><button data-m="any">לפחות אחד</button><button data-m="all">את כולם</button><button data-m="only">רק מהאקורדים האלה</button></div>
      <p class="note" style="margin:6px 2px">${g.chordMode === 'only' ? 'יוצגו רק שירים שכל האקורדים שלהם נמצאים בבחירה (אקורדי 7/maj7 וכו׳ נחשבים למשפחה הבסיסית שלהם).' : g.chordMode === 'all' ? 'שירים שמכילים את כל האקורדים שבחרתם.' : 'שירים שמכילים לפחות אחד מהאקורדים שבחרתם.'}</p>
      <div class="picker" id="fm-picker">${FAM.map((fn, fi) => `<div class="rl">${fn}</div>` + ROOTS.map((r, ri) => {
        const id = ri * 5 + fi; return `<button data-b="${id}" aria-pressed="${g.chords.includes(id)}">${esc(r + BASIC_SUFFIX[fi])}</button>`;
      }).join('')).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm ghost" id="fm-known">${icon('hand')} האקורדים שאני מכיר</button><button class="btn sm ghost" id="fm-clearc">נקה בחירה</button></div>
      ${g.chordMode === 'only' ? `<div class="row" style="padding:12px 2px;border:0"><span class="grow"><span class="t">לאפשר קאפו</span><br><span class="d">מציג גם שירים שאפשר לנגן עם הצורות שבחרתם בעזרת קאפו</span></span>${'<label class="toggle"><input type="checkbox" id="fm-capo" ' + (g.capoMatch ? 'checked' : '') + '><span></span></label>'}</div>` : ''}
      <div class="section-t">סגנון</div>
      <div class="chips wrap" id="fm-genres">${GENRES.map((n, i) => `<button class="chip" data-g="${i}" aria-pressed="${g.genres.includes(i)}">${esc(n)}</button>`).join('')}</div>
      <div class="section-t">רמת קושי</div>
      <div class="chips wrap" id="fm-diff">${[1, 2, 3].map((d) => `<button class="chip" data-d="${d}" aria-pressed="${g.diff.includes(d)}">${DIFF[d]}</button>`).join('')}</div>
      <div class="section-t">מספר אקורדים שונים</div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">מ־<span class="stepper"><button data-st="nMin:-1">−</button><output>${g.nMin}</output><button data-st="nMin:1">+</button></span>
        עד <span class="stepper"><button data-st="nMax:-1">−</button><output>${g.nMax >= 99 ? '∞' : g.nMax}</output><button data-st="nMax:1">+</button></span></div>
      <div class="section-t">נגינה נוחה</div>
      <div class="rows">
        ${rowT('fm-nobarre', 'בלי אקורדי ברה', 'רק אקורדים בעמדה פתוחה', g.nobarre)}
        ${rowT('fm-capoEasy', 'קל עם קאפו', 'שירים שנהיים בלי ברה כשמשתמשים בקאפו', g.capoEasy)}
        ${rowT('fm-timed', 'מסונכרן להקלטה המקורית', 'תזמון מדויק של האקורדים מול השיר', g.timed)}
        ${rowT('fm-hasYT', 'יש לי קישור יוטיוב', 'שירים שכבר חיברתם אליהם סרטון', g.hasYT)}
        ${rowT('fm-mine', 'השירים שלי', 'שירים שהוספתם בעצמכם', g.mine)}
      </div>
      <div class="section-t">קצב (BPM)</div>
      <div class="chips wrap" id="fm-bpm">${[['0-400', 'הכל'], ['0-80', 'איטי · עד 80'], ['80-120', 'בינוני · 80–120'], ['120-400', 'מהיר · 120+']].map(([v, n]) => `<button class="chip" data-bpm="${v}" aria-pressed="${`${g.bpmMin}-${g.bpmMax}` === v}">${n}</button>`).join('')}</div>
      <div class="section-t">משקל</div>
      <div class="chips wrap" id="fm-ts">${[[4, '4/4'], [3, '3/4'], [2, '6/8 · 2/4']].map(([v, n]) => `<button class="chip" data-ts="${v}" aria-pressed="${g.ts.includes(v)}">${n}</button>`).join('')}</div>
      <div class="section-t">סולם</div>
      <div class="picker" id="fm-key" style="grid-template-columns:repeat(6,1fr)">${ROOTS.map((r, i) => `<button data-key="${i}" aria-pressed="${g.key === i}">${esc(r)}</button>`).join('')}</div>
      <div class="seg" id="fm-km" style="margin-top:8px"><button data-km="any">הכל</button><button data-km="major">מז׳ור</button><button data-km="minor">מינור</button></div>
      <div class="section-t">עשור</div>
      <div class="chips wrap" id="fm-dec">${[1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((d) => `<button class="chip" data-dec="${d}" aria-pressed="${g.decades.includes(d)}">שנות ה־${String(d).slice(2)}${d >= 2000 ? ` (${d})` : ''}</button>`).join('')}</div>
      <p class="note" style="margin-top:14px">שנה, סולם וקצב ידועים רק לחלק מהשירים; סינון לפיהם מסתיר שירים בלי המידע הזה.</p>`;
    body.querySelectorAll('#fm-mode [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === g.chordMode)));
    body.querySelectorAll('#fm-km [data-km]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.km === g.keyMode)));
    updateCount();
  };
  const rowT = (id, t, d, on) => `<div class="row"><span class="grow"><span class="t">${t}</span><br><span class="d">${d}</span></span><label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label></div>`;
  const foot = h('<div style="display:flex;gap:10px;width:100%"><button class="btn ghost" data-reset>איפוס</button><button class="btn primary" style="flex:1" data-apply>הצגת שירים</button></div>');
  const updateCount = () => { const n = filterSongs(g).length; foot.querySelector('[data-apply]').textContent = `הצגת ${n.toLocaleString('he-IL')} שירים`; };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.m) g.chordMode = d.m;
    else if (d.b != null) { const id = +d.b; g.chords = g.chords.includes(id) ? g.chords.filter((x) => x !== id) : [...g.chords, id]; g._canplay = false; }
    else if (b.id === 'fm-known') {
      const known = getState().known.map(basicOf);
      if (!known.length) { toast('עדיין לא סימנתם אקורדים בלשונית ״אקורדים״'); return; }
      g.chords = [...new Set(known)]; g.chordMode = 'only';
    } else if (b.id === 'fm-clearc') g.chords = [];
    else if (d.g != null) { const x = +d.g; g.genres = g.genres.includes(x) ? g.genres.filter((y) => y !== x) : [...g.genres, x]; }
    else if (d.d != null) { const x = +d.d; g.diff = g.diff.includes(x) ? g.diff.filter((y) => y !== x) : [...g.diff, x]; }
    else if (d.st) { const [k, dv] = d.st.split(':'); let v = g[k] + +dv; if (k === 'nMax' && g.nMax >= 99 && +dv < 0) v = 12; if (k === 'nMax' && v > 12) v = 99; g[k] = Math.max(1, Math.min(99, v)); if (g.nMin > g.nMax) g.nMax = g.nMin; }
    else if (d.bpm) { const [a, c] = d.bpm.split('-').map(Number); g.bpmMin = a; g.bpmMax = c; }
    else if (d.ts) { const x = +d.ts; g.ts = g.ts.includes(x) ? g.ts.filter((y) => y !== x) : [...g.ts, x]; }
    else if (d.key != null) { const x = +d.key; g.key = g.key === x ? -1 : x; }
    else if (d.km) g.keyMode = d.km;
    else if (d.dec) { const x = +d.dec; g.decades = g.decades.includes(x) ? g.decades.filter((y) => y !== x) : [...g.decades, x]; }
    else return;
    const sc = sh.body.scrollTop; draw(); sh.body.scrollTop = sc;
  });
  body.addEventListener('change', (e) => {
    const id = e.target.id;
    const map = { 'fm-nobarre': 'nobarre', 'fm-capoEasy': 'capoEasy', 'fm-timed': 'timed', 'fm-hasYT': 'hasYT', 'fm-mine': 'mine', 'fm-capo': 'capoMatch' };
    if (map[id]) { g[map[id]] = e.target.checked; updateCount(); }
  });
  foot.addEventListener('click', (e) => {
    if (e.target.closest('[data-reset]')) { const q = g.q, lang = g.lang, sort = g.sort; Object.assign(g, defaultFilters(), { q, lang, sort }); draw(); }
    if (e.target.closest('[data-apply]')) { f = { ...g }; sh.close(); refresh(true); }
  });
  const sh = openSheet({ title: 'סינון שירים', body, foot, tall: true });
  draw();
}
export { cidBase, keyName };
