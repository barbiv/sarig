import { getState, update, exportJSON, importJSON, persistStatus, requestPersist, resetAll } from '../store.js';
import { byKey, SONGS, INDEX } from '../library.js';
import { setSpelling } from '../theory.js';
import { esc, icon, toast, fmtMin, relDay } from '../ui.js';
import { barChart, heatmap, dayKey, ring } from '../charts.js';
import { allExercises, exName, openExercise } from './trainer.js';
import { app } from '../app.js';

let el;
export function mount(root) { el = root; el.addEventListener('click', onClick); el.addEventListener('change', onChange); render(); }
export function onShow() { render(); }

function dayMinutes() {
  const st = getState();
  const m = {};
  const add = (ts, sec, kind) => { const k = dayKey(ts); m[k] = m[k] || { a: 0, b: 0 }; m[k][kind] += sec / 60; };
  st.practice.forEach((p) => add(p.t, p.dur || 0, 'a'));
  st.plays.forEach((p) => add(p.t, p.d || 0, 'b'));
  return m;
}
function streak(m) {
  let n = 0; const d = new Date(); d.setHours(12);
  if (!m[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (m[dayKey(d)] && (m[dayKey(d)].a + m[dayKey(d)].b) >= 1) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

async function render() {
  if (!el) return;
  const st = getState();
  const m = dayMinutes();
  const today = m[dayKey(Date.now())] || { a: 0, b: 0 };
  const todayMin = today.a + today.b;
  const goal = st.dayGoal || 15;
  let week = 0; const bars = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const v = m[dayKey(d)] || { a: 0, b: 0 };
    if (i < 7) week += v.a + v.b;
    bars.push({ label: i % 2 === 0 ? `${d.getDate()}` : '', a: v.a, b: v.b });
  }
  const heatVals = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.a + v.b]));
  // exercise progress
  const exs = allExercises().map((ex) => {
    const s = st.practice.filter((p) => p.ex === ex.id && p.ok !== false);
    if (!s.length) return null;
    const ys = s.map((p) => p.score);
    const f = ys.slice(0, 3), l = ys.slice(-3);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return { ex, best: Math.max(...ys), n: s.length, imp: ys.length >= 2 ? Math.round(((avg(l) - avg(f)) / (avg(f) || 1)) * 100) : 0, last: s[s.length - 1].t };
  }).filter(Boolean).sort((a, b) => b.last - a.last);
  const songMin = {};
  st.plays.forEach((p) => { songMin[p.k] = (songMin[p.k] || 0) + p.d; });
  const topSongs = Object.entries(songMin).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, sec]) => ({ s: byKey(k), sec })).filter((x) => x.s);
  const persisted = await persistStatus();
  const sts = st.settings;
  el.innerHTML = `
    <div class="vhead"><div><h1>התקדמות</h1><div class="sub">כל האימונים והשירים שניגנתם, נשמרים במכשיר</div></div></div>
    <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px">
      <div style="position:relative">${ring(todayMin / goal, 'יעד יומי')}<b class="num" style="position:absolute;inset:0;display:grid;place-items:center;font-size:19px">${Math.round(todayMin)}</b></div>
      <div style="flex:1"><b style="font-size:17px">${todayMin >= goal ? 'עמדתם ביעד היומי!' : `עוד ${Math.max(0, Math.ceil(goal - todayMin))} דק׳ ליעד היומי`}</b>
        <div class="note">יעד: ${goal} דק׳ ביום · <button style="color:var(--accent);font-weight:600" data-goal="-5">−5</button> <button style="color:var(--accent);font-weight:600" data-goal="5">+5</button></div></div></div>
    <div class="hero-stat" style="margin-top:10px">
      <div class="card"><b>${streak(m)}</b><span>ימים ברצף ${icon('fire').replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-2px;color:var(--accent)"')}</span></div>
      <div class="card"><b>${Math.round(week)}</b><span>דקות השבוע</span></div>
      <div class="card"><b>${st.practice.length}</b><span>אימוני מעברים</span></div>
      <div class="card"><b>${Object.keys(songMin).length}</b><span>שירים שניגנתם</span></div>
    </div>
    <div class="section-t">דקות תרגול — 14 ימים</div>
    <div class="card chartbox">${barChart(bars)}<div class="legend"><span><i style="background:var(--accent)"></i>אימון מעברים</span><span><i style="background:var(--sync)"></i>נגינת שירים</span></div></div>
    <div class="section-t">לוח אימונים</div>
    <div class="card" style="padding:12px">${heatmap(heatVals, 20, [1, 10, 25])}<div class="legend" style="margin-top:8px"><span>כהה יותר = יותר דקות באותו יום</span></div></div>
    <div class="section-t">תרגילים <button data-go="trainer">לכל התרגילים</button></div>
    <div class="rows">${exs.length ? exs.slice(0, 8).map((x) => `<button class="row" data-ex="${esc(x.ex.id)}"><span class="grow"><span class="t ltr">${esc(exName(x.ex))}</span><br><span class="d">${x.n} אימונים · ${relDay(x.last)}</span></span>
      <span style="text-align:center"><b class="num" style="font-size:22px">${Math.round(x.best)}</b><br><span class="d" style="color:${x.imp > 0 ? 'var(--good)' : x.imp < 0 ? 'var(--bad)' : 'var(--muted)'}">${x.imp > 0 ? '+' : ''}${x.imp}%</span></span></button>`).join('')
      : '<div class="row"><span class="note">עוד לא התאמנתם — התחילו תרגיל בלשונית ״אימון״.</span></div>'}</div>
    ${topSongs.length ? `<div class="section-t">השירים שניגנתם הכי הרבה</div><div class="rows">${topSongs.map((x) => `<button class="row" data-song="${esc(x.s.k)}"><span class="grow"><span class="t">${esc(x.s.t)}</span><br><span class="d">${esc(x.s.a)}</span></span><span class="num" style="font-size:18px">${fmtMin(x.sec)}</span></button>`).join('')}</div>` : ''}

    <div class="section-t">הגדרות</div>
    <div class="rows">
      <div class="row"><span class="grow"><span class="t">נגן/ית שמאלי/ת</span><br><span class="d">הופך את דיאגרמות האקורדים</span></span><label class="toggle"><input type="checkbox" id="set-lefty" ${sts.lefty ? 'checked' : ''}><span></span></label></div>
      <div class="row"><span class="grow"><span class="t">ספירה לפני נגינה</span></span><label class="toggle"><input type="checkbox" id="set-count" ${sts.countIn ? 'checked' : ''}><span></span></label></div>
      <div class="row"><span class="grow"><span class="t">כתיב אקורדים</span></span><select id="set-spell" style="background:transparent;border:0;color:var(--accent);font-weight:600"><option value="auto">אוטומטי</option><option value="sharp">דיאזים (C#)</option><option value="flat">במולים (Db)</option></select></div>
      <div class="row"><span class="grow"><span class="t">ערכת צבעים</span></span><select id="set-theme" style="background:transparent;border:0;color:var(--accent);font-weight:600"><option value="auto">לפי המכשיר</option><option value="dark">כהה</option><option value="light">בהיר</option></select></div>
    </div>

    <div class="section-t">הנתונים שלכם</div>
    <div class="rows">
      <div class="row"><span class="grow"><span class="t">שמירה במכשיר</span><br><span class="d">${persisted ? 'שמירה קבועה פעילה — הדפדפן לא ימחק את הנתונים' : 'נשמר במכשיר. הוסיפו את האפליקציה למסך הבית לשמירה הכי יציבה'}</span></span>${persisted ? `<span style="color:var(--good)">${icon('check').replace('<svg', '<svg style="width:22px;height:22px"')}</span>` : '<button class="btn sm" data-persist>הפעלה</button>'}</div>
      <button class="row" data-offline>${icon('download').replace('<svg', '<svg style="width:22px;height:22px;color:var(--sync)"')}<span class="grow"><span class="t">הורדת כל השירים לשימוש בלי אינטרנט</span><br><span class="d" id="off-st">כ־2.5MB · שירים שכבר פתחתם זמינים גם כך</span></span></button>
      <button class="row" data-export>${icon('download').replace('<svg', '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow"><span class="t">גיבוי לקובץ</span><br><span class="d">מועדפים, אימונים, שירים שלכם והגדרות</span></span></button>
      <label class="row" style="cursor:pointer">${icon('upload').replace('<svg', '<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="grow"><span class="t">שחזור מגיבוי</span><br><span class="d">בחירת קובץ גיבוי ‎.json</span></span><input type="file" id="set-import" accept="application/json,.json" hidden></label>
      <button class="row" data-reset style="color:var(--bad)">${icon('trash').replace('<svg', '<svg style="width:22px;height:22px"')}<span class="grow"><span class="t">מחיקת כל הנתונים</span></span></button>
    </div>
    <div class="section-t">מקורות</div>
    <p class="note">שירים ואקורדים: McGill Billboard Project (CC0); ChoCo — Chord Corpus (CC BY 4.0) הכולל את Isophonics, USPOP2002, Robbie Williams, Rock Corpus, iReal Pro, Wikifonia ו־Band-in-a-Box corpus. צורות אחיזה: chords-db מאת David Rubert (MIT). שירים בעברית: מהלכים בסיסיים שנכתבו לתרגול. ${SONGS.length.toLocaleString('he-IL')} שירים במאגר.</p>`;
  el.querySelector('#set-spell').value = sts.spelling || 'auto';
  el.querySelector('#set-theme').value = sts.theme || 'auto';
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.goal) { update((s) => { s.dayGoal = Math.max(5, Math.min(120, (s.dayGoal || 15) + +b.dataset.goal)); }); render(); }
  else if (b.dataset.go) app.go(b.dataset.go);
  else if (b.dataset.ex) { const ex = allExercises().find((x) => x.id === b.dataset.ex); if (ex) openExercise(ex); }
  else if (b.dataset.song) { const s = byKey(b.dataset.song); if (s) app.openPlayer(s); }
  else if (b.hasAttribute('data-persist')) requestPersist().then((ok) => { toast(ok ? 'שמירה קבועה הופעלה' : 'הדפדפן לא אישר — הוסיפו את האפליקציה למסך הבית'); render(); });
  else if (b.hasAttribute('data-export')) doExport();
  else if (b.hasAttribute('data-offline')) {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) { toast('זמין אחרי התקנת האפליקציה (פתיחה מחדש)'); return; }
    const n = Math.ceil(INDEX.songs.length / INDEX.chunk);
    sw.postMessage({ type: 'cache-all', chunks: n });
    toast('מוריד את המאגר…');
  }
  else if (b.hasAttribute('data-reset')) {
    if (b.dataset.armed) { resetAll(); toast('כל הנתונים נמחקו'); app.refresh(); render(); return; }
    b.dataset.armed = '1'; b.querySelector('.t').textContent = 'לחצו שוב לאישור מחיקה'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.querySelector('.t').textContent = 'מחיקת כל הנתונים'; } }, 3000);
  }
}
function onChange(e) {
  const id = e.target.id;
  if (id === 'set-lefty') update((s) => { s.settings.lefty = e.target.checked; });
  else if (id === 'set-count') update((s) => { s.settings.countIn = e.target.checked; });
  else if (id === 'set-spell') { update((s) => { s.settings.spelling = e.target.value; }); setSpelling(e.target.value); app.refresh(); }
  else if (id === 'set-theme') { update((s) => { s.settings.theme = e.target.value; }); applyTheme(); }
  else if (id === 'set-import') {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { importJSON(t); toast('הנתונים שוחזרו'); location.reload(); }).catch(() => toast('הקובץ לא תקין'));
  }
}
if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache-progress') {
    const st = document.getElementById('off-st');
    if (st) st.textContent = e.data.done >= e.data.n ? 'כל השירים זמינים בלי אינטרנט ✓' : `הורדה… ${Math.round((100 * e.data.done) / e.data.n)}%`;
    if (e.data.done >= e.data.n) toast('כל השירים זמינים עכשיו גם בלי אינטרנט');
  }
});
export function applyTheme() {
  const t = getState().settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#14100E' : '#F5EFE6');
}
async function doExport() {
  const json = exportJSON();
  const name = `sarig-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'גיבוי סריג' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('קובץ הגיבוי נשמר');
}
