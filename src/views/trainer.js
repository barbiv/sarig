// Chord-change trainer with timers, records and per-exercise analytics.
import { parseChordSymbol, chordName, ROOTS, BASIC_SUFFIX, makeCid } from '../theory.js';
import { voicings } from '../chorddb.js';
import { diagramSVG } from '../diagram.js';
import { ensureAudio, audioCtx, click, strum, previewChord } from '../audio.js';
import { getState, update, logPractice } from '../store.js';
import { h, esc, icon, openScreen, openSheet, toast, fmtTime, fmtDate, relDay } from '../ui.js';
import { lineChart, heatmap, sparkline, dayKey, linReg } from '../charts.js';
import { startMic, stopMic, whichChord, resetChroma, micSupported } from '../mic.js';
import { SONGS, filterSongs, defaultFilters } from '../library.js';
import { basicOf, cidBase } from '../theory.js';
import { app } from '../app.js';

const P = (s) => s.split(' ').map(parseChordSymbol);
export const PRESETS = [
  ['beg', 'מתחילים', [['Em Am', 'המעבר הראשון'], ['E A', ''], ['A D', ''], ['D G', ''], ['G C', ''], ['C Am', ''], ['Em C', ''], ['D Em', ''], ['E Am', ''], ['A7 D', '']]],
  ['mid', 'ביניים', [['G D', ''], ['C D', ''], ['Am Dm', ''], ['C Fmaj7', ''], ['G Em', ''], ['Cadd9 G', ''], ['D A7', ''], ['C G7', ''], ['Dm E', '']]],
  ['barre', 'ברה', [['F C', 'הברה הראשונה'], ['Bm G', ''], ['F G', ''], ['Bm D', ''], ['F#m A', ''], ['B E', ''], ['Bb F', ''], ['Cm Gm', '']]],
  ['prog', 'מהלכים', [['G C D', 'שלושת האקורדים של הרוק'], ['G D Em C', 'המהלך הכי נפוץ בפופ'], ['C G Am F', 'אותו מהלך בסולם דו'], ['Am F C G', ''], ['D A Bm G', ''], ['Am G F E', 'אנדלוסי / מזרחי'], ['Am Dm E', 'מינור עם דומיננטה'], ['A7 D7 E7', 'בלוז ב־A'], ['Em G D A', '']]],
].map(([id, name, list]) => ({ id, name, list: list.map(([c, sub], i) => ({ id: `${id}${i}`, chords: P(c), sub, level: id })) }));
export function allExercises() {
  const mine = (getState().exercises || []).map((e) => ({ ...e, level: 'mine' }));
  return PRESETS.flatMap((g) => g.list).concat(mine);
}
export function exName(ex) { return ex.name || ex.chords.map((c) => chordName(c)).join(' ↔ '); }
function sessionsOf(id) { return getState().practice.filter((p) => p.ex === id); }
export function bestOf(id) { const s = sessionsOf(id).filter((p) => p.ok !== false); return s.length ? Math.max(...s.map((p) => p.score)) : 0; }

let el;
export function mount(root) { el = root; render(); el.addEventListener('click', onClick); }
export function onShow() { render(); }

function render() {
  const st = getState();
  const today = dayKey(Date.now());
  const todaySec = st.practice.filter((p) => dayKey(p.t) === today).reduce((s, p) => s + (p.dur || 0), 0);
  const mine = (st.exercises || []);
  el.innerHTML = `
    <div class="vhead"><div><h1>אימון מעברים</h1><div class="sub">מודדים מעברים לדקה — ורואים את השיפור לאורך זמן</div></div>
      <button class="iconbtn" data-new aria-label="תרגיל חדש">${icon('plus')}</button></div>
    ${planHTML()}
    <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px">
      <div style="flex:1"><b style="font-size:17px">היום: ${todaySec < 60 && todaySec > 0 ? 'פחות מדקה' : Math.round(todaySec / 60) + ' דק׳'} של אימון מעברים</b><div class="note">טיפ: דקה על כל זוג אקורדים, כל יום — זה מה שמזיז את המספרים.</div></div>
      <button class="btn primary sm" data-random>${icon('dice')} תרגיל אקראי</button></div>
    ${mine.length ? group('mine', 'התרגילים שלי', mine.map((e) => ({ ...e, level: 'mine' }))) : ''}
    ${PRESETS.map((g) => group(g.id, g.name, g.list)).join('')}
    <p class="note" style="margin:18px 2px">שיטת ״דקת מעברים״: עוברים בין שני אקורדים כמה שיותר פעמים בדקה, בלי לפרוט — רק לנחות נקי. סופרים וכותבים את התוצאה, ומנסים לשבור את השיא.</p>`;
}
function group(id, name, list) {
  return `<div class="section-t">${esc(name)}</div><div class="rows exlist">${list.map(card).join('')}</div>`;
}
function card(ex) {
  const s = sessionsOf(ex.id);
  const best = bestOf(ex.id);
  const last = s.length ? s[s.length - 1] : null;
  const ys = s.filter((p) => p.ok !== false).slice(-12).map((p) => p.score);
  return `<button class="row excard" data-ex="${esc(ex.id)}">
    <span class="pair">${ex.chords.map((c) => esc(chordName(c))).join('<i>·</i>')}</span>
    <span class="info"><span class="t">${esc(ex.sub || (ex.chords.length > 2 ? 'מהלך' : 'זוג אקורדים'))}</span><br>
      <span class="d">${last ? `${relDay(last.t)} · ${s.length} אימונים` : 'עוד לא תורגל'}</span></span>
    ${ys.length > 1 ? sparkline(ys) : ''}
    <span class="best"><b>${best ? Math.round(best) : '—'}</b><span>שיא/דקה</span></span></button>`;
}
// ---------------------------------------------------------------- daily plan
function seedRand(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
export function dailyPlan() {
  const st = getState();
  const today = dayKey(Date.now());
  const rnd = seedRand(today);
  const all = allExercises();
  const known = new Set(st.known.map((c) => basicOf(c)));
  const lastOf = (id) => { const s2 = sessionsOf(id); return s2.length ? s2[s2.length - 1].t : 0; };
  const practiced = all.filter((x) => lastOf(x.id));
  const warm = practiced.length ? practiced.slice().sort((a, b) => lastOf(a.id) - lastOf(b.id))[0] : all[0];
  const newEx = all.find((x) => x.id !== warm.id && x.chords.some((c) => !known.has(basicOf(c))) && x.chords.filter((c) => known.has(basicOf(c))).length >= 1)
    || all.find((x) => x.id !== warm.id && !lastOf(x.id)) || all[1];
  const tempoSess = st.practice.filter((p) => p.mode === 'tempo' && p.ok);
  const tempoEx = tempoSess.length ? all.find((x) => x.id === tempoSess[tempoSess.length - 1].ex) || warm : warm;
  let pool;
  if (known.size >= 3) {
    const f = { ...defaultFilters(), chordMode: 'only', chords: [...known], capoMatch: true };
    pool = filterSongs(f).slice(0, 40).map((r) => r.s);
  }
  if (!pool || !pool.length) pool = SONGS.filter((x) => x.diff === 1 && (x.timed || x.curated)).slice(0, 40);
  const song = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
  const pToday = st.practice.filter((p) => dayKey(p.t) === today);
  const playedToday = (k) => st.plays.filter((p) => p.k === k && dayKey(p.t) === today).reduce((x, p) => x + p.d, 0);
  const items = [
    { id: 'tune', t: 'כוונון הגיטרה', d: 'דקה אחת בלשונית כוונון', done: st.tunedDay === today },
    { id: 'warm', t: `חימום: ${exName(warm)}`, d: 'דקת מעברים — נסו לשבור את השיא', ex: warm, mode: 'count', done: pToday.some((p) => p.ex === warm.id) },
    { id: 'new', t: `אקורד חדש: ${exName(newEx)}`, d: 'דקה על מעבר שעוד לא שולט בו', ex: newEx, mode: 'count', done: pToday.some((p) => p.ex === newEx.id) },
    { id: 'tempo', t: `אתגר קצב: ${exName(tempoEx)}`, d: 'דקה עם מטרונום, 4 BPM מהר יותר מהשיא', ex: tempoEx, mode: 'tempo', done: pToday.some((p) => p.ex === tempoEx.id && p.mode === 'tempo') },
  ];
  if (song) items.push({ id: 'song', t: `שיר היום: ${song.t}`, d: `${song.a ? song.a + ' · ' : ''}נגנו אותו לפחות פעם אחת`, song, done: playedToday(song.k) >= 60 });
  return items;
}
function planHTML() {
  const items = dailyPlan();
  const done = items.filter((x) => x.done).length;
  return `<div class="card plan"><div class="plan-h"><span>${icon('calendar')}<b>התוכנית של היום</b></span><span class="num">${done}/${items.length}</span></div>
    <div class="plan-bar"><i style="width:${(100 * done) / items.length}%"></i></div>
    ${done === items.length ? '<div class="celebrate" style="margin:8px 0 2px">סיימתם את התוכנית של היום 🎉</div>' : ''}
    ${items.map((x) => `<button class="plan-i${x.done ? ' done' : ''}" data-plan="${x.id}"><span class="ck">${x.done ? icon('check') : ''}</span><span class="grow"><span class="t">${esc(x.t)}</span><span class="d">${esc(x.d)}</span></span>${icon('chev').replace('<svg', '<svg class="chev"')}</button>`).join('')}</div>`;
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.plan) {
    const it = dailyPlan().find((x) => x.id === b.dataset.plan);
    if (!it) return;
    if (it.id === 'tune') app.go('tuner');
    else if (it.song) app.openPlayer(it.song);
    else if (it.ex) openExercise(it.ex, { mode: it.mode });
    return;
  }
  if (b.dataset.ex) { const ex = allExercises().find((x) => x.id === b.dataset.ex); if (ex) openExercise(ex); }
  else if (b.hasAttribute('data-new')) newExercise();
  else if (b.hasAttribute('data-random')) { const all = allExercises(); openExercise(all[Math.floor(Math.random() * all.length)]); }
}

function newExercise(existing) {
  let sel = existing ? existing.chords.slice() : [];
  const body = h('<div></div>');
  const FAM = [0, 1, 2];
  const draw = () => {
    body.innerHTML = `<p class="note">בחרו 2–4 אקורדים לפי הסדר שבו תעברו ביניהם.</p>
      <div class="chips wrap" style="min-height:40px;margin-bottom:10px">${sel.map((c, i) => `<button class="chip chord" data-rm="${i}" aria-pressed="true">${esc(chordName(c))} <span class="x">×</span></button>`).join('') || '<span class="note">לא נבחרו אקורדים</span>'}</div>
      <div class="field"><label for="ne-in">הקלדת אקורד (למשל Cmaj7)</label><div style="display:flex;gap:8px"><input id="ne-in" dir="ltr" autocomplete="off"><button class="btn sm" data-add>הוספה</button></div></div>
      <div class="picker">${FAM.map((fi) => `<div class="rl">${['מז׳ור', 'מינור', '7'][fi]}</div>` + ROOTS.map((r, ri) => `<button data-pick="${makeCid(ri, [0, 1, 2][fi])}">${esc(r + BASIC_SUFFIX[fi])}</button>`).join('')).join('')}</div>`;
  };
  draw();
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pick && sel.length < 4) sel.push(+b.dataset.pick);
    else if (b.dataset.rm) sel.splice(+b.dataset.rm, 1);
    else if (b.hasAttribute('data-add')) { const c = parseChordSymbol(body.querySelector('#ne-in').value.trim()); if (c == null) { toast('לא זיהינו את האקורד'); return; } if (sel.length < 4) sel.push(c); }
    else return;
    draw();
  });
  const foot = h(`<button class="btn primary block">${existing ? 'שמירה' : 'יצירת תרגיל'}</button>`);
  foot.addEventListener('click', () => {
    if (sel.length < 2) { toast('בחרו לפחות שני אקורדים'); return; }
    update((s) => {
      if (existing) { const x = s.exercises.find((q) => q.id === existing.id); if (x) x.chords = sel; }
      else s.exercises.push({ id: 'my' + Date.now().toString(36), chords: sel, created: Date.now() });
    }, true);
    sh.close(); render();
    toast('התרגיל נשמר');
  });
  const sh = openSheet({ title: existing ? 'עריכת תרגיל' : 'תרגיל חדש', body, foot });
}

// ---------------------------------------------------------------- exercise screen
export function openExercise(ex, opts = {}) {
  const st = getState();
  const sc = openScreen({ title: exName(ex), sub: ex.sub || 'אימון מעברים', onClose: () => { stop(false); render(); } });
  let mode = opts.mode || 'count', dur = 60, bpm = 0, per = 4, tab = 'train';
  const lastTempo = sessionsOf(ex.id).filter((p) => p.mode === 'tempo' && p.ok).map((p) => p.bpm);
  bpm = lastTempo.length ? Math.max(...lastTempo) + 4 : 60;
  const R = { running: false, count: 0, t0: 0, timer: 0, target: 1, pre: 0, beat: 0, ended: false, next: 0, lis: null };
  const listenOn = () => micSupported() && getState().settings.exListen !== false;

  const chordsHTML = (target) => `<div class="ex-chords" style="--n:${Math.min(ex.chords.length, 4)}">${ex.chords.map((c, i) => `<div class="ex-chord${i === target ? ' target' : ''}"><div class="nm">${esc(chordName(c))}</div>${diagramSVG(voicings(c)[0], { w: ex.chords.length > 2 ? 78 : 110, lefty: st.settings.lefty, compact: true })}</div>`).join('')}</div>`;

  const draw = () => {
    if (tab === 'stats') { drawStats(); return; }
    const best = bestOf(ex.id);
    sc.body.innerHTML = `
      <div class="seg" style="margin-bottom:12px" id="ex-tab"><button data-tab="train" aria-pressed="true">אימון</button><button data-tab="stats">נתונים והתקדמות</button></div>
      <div class="ex-stage">
        ${chordsHTML(-1)}
        <div class="seg" id="ex-mode"><button data-mode="count">ספירת מעברים</button><button data-mode="tempo">בקצב מטרונום</button></div>
        ${mode === 'count' ? `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span class="note">משך</span>
            <div class="seg" id="ex-dur" style="flex:1"><button data-dur="30">30 שנ׳</button><button data-dur="60">דקה</button><button data-dur="120">2 דק׳</button></div></div>
          <p class="note">הקישו על המסך הגדול בכל פעם שנחתם על האקורד הבא. ${best ? `השיא שלכם: <b>${Math.round(best)}</b> מעברים לדקה.` : ''}</p>`
        : `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span>קצב <span class="stepper"><button data-bpm="-4">−</button><output id="ex-bpm">${bpm}</output><button data-bpm="4">+</button></span></span>
            <span>מעבר כל <span class="stepper"><button data-per="-1">−</button><output id="ex-per">${per}</output><button data-per="1">+</button></span> פעימות</span></div>
          <p class="note">דקה של מעברים עם מטרונום. אם עמדתם בקצב — הוא נשמר כשיא, ובפעם הבאה נתחיל 4 BPM מהר יותר. = ${Math.round(bpm / per)} מעברים לדקה.</p>`}
        <div class="row" style="padding:4px 2px;border:0"><span class="grow"><span class="t">${icon('mic').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} האזנה במיקרופון</span><br><span class="d">${mode === 'count' ? 'סופר את המעברים לבד — בלי להקיש' : 'בודק כל מעבר ונותן ציון בסוף'}</span></span><label class="toggle"><input type="checkbox" id="ex-lis" ${listenOn() ? 'checked' : ''}><span></span></label></div>
        <button class="btn primary block" id="ex-start">${icon('play')} התחלה</button>
      </div>`;
    sc.body.querySelectorAll('#ex-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    sc.body.querySelectorAll('#ex-dur [data-dur]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.dur === dur)));
  };
  sc.body.addEventListener('click', (e) => {
    const b = e.target.closest('button,[data-tap]'); if (!b) return;
    const d = b.dataset;
    if (d.tab) { tab = d.tab; stop(false); draw(); return; }
    if (R.running) { if (d.tap != null) tap(); else if (b.id === 'ex-stop') stop(true); return; }
    if (d.mode) { mode = d.mode; draw(); }
    else if (d.dur) { dur = +d.dur; draw(); }
    else if (d.bpm) { bpm = Math.max(30, Math.min(220, bpm + +d.bpm)); draw(); }
    else if (d.per) { per = Math.max(1, Math.min(8, per + +d.per)); draw(); }
    else if (b.id === 'ex-start') start();
    else if (d.result) finishTempo(d.result);
    else if (b.id === 'ex-again') draw();
    else if (b.id === 'ex-edit') { sc.close(); newExercise(ex); }
    else if (b.id === 'ex-del') { update((s) => { s.exercises = s.exercises.filter((q) => q.id !== ex.id); }, true); sc.close(); toast('התרגיל נמחק'); }
  });
  sc.body.addEventListener('change', (e) => { if (e.target.id === 'ex-lis') update((s2) => { s2.settings.exListen = e.target.checked; }); });
  // big tap zone should react on touchstart for speed
  sc.body.addEventListener('touchstart', (e) => { if (R.running && e.target.closest('[data-tap]')) { e.preventDefault(); tap(); } }, { passive: false });

  function stageRunning() {
    sc.body.innerHTML = `<div class="ex-stage">
      <div id="ex-ch">${chordsHTML(R.target)}</div>
      <div class="bigtimer" id="ex-time">${mode === 'count' ? fmtTime(dur) : fmtTime(60)}<small id="ex-sub">${mode === 'count' ? 'מתכוננים…' : `${bpm} BPM · מעבר כל ${per}`}</small></div>
      <div class="heardline" id="ex-heard">${R.lis ? '🎤 מקשיב…' : ''}</div>
      ${mode === 'count' ? `<div class="tapzone" data-tap role="button" aria-label="מעבר"><div><span class="cnt" id="ex-cnt">0</span>${R.lis ? 'סופר אוטומטית · אפשר גם להקיש' : 'הקישו בכל מעבר'}</div></div>` : '<div class="beatdots" id="ex-dots" style="justify-content:center;gap:12px"></div><div class="chgdots" id="ex-chg"></div>'}
      <button class="btn stopbig block" id="ex-stop">${icon('pause')} עצירה</button></div>`;
  }
  async function start() {
    ensureAudio();
    R.lis = null;
    if (listenOn()) {
      try {
        await startMic({ echo: mode === 'tempo' });
        resetChroma();
        R.lis = { stable: -1, cand: -1, candN: 0, win: new Map(), results: [] };
      } catch (e) { toast('אין גישה למיקרופון — ממשיכים בלי האזנה'); }
    }
    R.running = true; R.count = 0; R.target = 1; R.ended = false;
    stageRunning();
    if (R.lis) R.lisTimer = setInterval(listenTick, 70);
    if (mode === 'count') {
      // 3-2-1 countdown with clicks
      const ctx = audioCtx(); const t = ctx.currentTime + 0.05;
      for (let k = 0; k < 3; k++) click(t + k * 0.6, k === 0);
      const sub = sc.body.querySelector('#ex-sub');
      let n = 3; sub.textContent = n;
      const cd = setInterval(() => { n--; if (n > 0) sub.textContent = n; else { clearInterval(cd); if (!R.running) return; R.t0 = performance.now(); sub.textContent = 'קדימה!'; click(audioCtx().currentTime, true); tick(); } }, 600);
      R.cd = cd;
    } else {
      const ctx = audioCtx();
      const spb = 60 / bpm;
      R.t0 = ctx.currentTime + 0.1 + (per >= 4 ? per : 4) * spb; // one bar count-in
      R.ctxStart = ctx.currentTime + 0.1;
      R.beat = 0; R.next = 0;
      const dots = sc.body.querySelector('#ex-dots');
      dots.innerHTML = Array.from({ length: per }, () => '<i></i>').join('');
      R.timer = setInterval(() => schedTempo(spb), 25);
      R.raf = requestAnimationFrame(function f() { if (!R.running) return; drawTempo(spb); R.raf = requestAnimationFrame(f); });
    }
  }
  function tick() {
    if (!R.running) return;
    const el2 = sc.body.querySelector('#ex-time');
    const left = dur - (performance.now() - R.t0) / 1000;
    if (el2) el2.firstChild.nodeValue = fmtTime(Math.max(0, left));
    if (left <= 0) { finishCount(); return; }
    R.timer = requestAnimationFrame(tick);
  }
  function tap() {
    if (mode !== 'count' || !R.t0 || R.ended) return;
    R.count++;
    const c = sc.body.querySelector('#ex-cnt'); if (c) c.textContent = R.count;
    R.target = (R.target + 1) % ex.chords.length;
    const ch = sc.body.querySelector('#ex-ch'); if (ch) ch.innerHTML = chordsHTML(R.target);
  }
  function schedTempo(spb) {
    const ctx = audioCtx();
    const lead = (per >= 4 ? per : 4);
    while (true) {
      const k = R.next; // beat index from ctxStart, includes count-in beats
      const t = R.ctxStart + k * spb;
      if (t > ctx.currentTime + 0.15) break;
      const inLead = k < lead;
      const bi = k - lead;
      if (!inLead && bi * spb >= 60) { R.next++; continue; }
      click(t, inLead ? k === 0 : bi % per === 0, 0.9);
      if (!inLead && bi % per === 0) {
        const ci = Math.floor(bi / per) % ex.chords.length;
        const v = voicings(ex.chords[ci])[0];
        if (v) strum(v, t, { dir: 'D', vel: 0.55 });
      }
      R.next++;
    }
  }
  function drawTempo(spb) {
    const ctx = audioCtx();
    const lead = (per >= 4 ? per : 4);
    const el2 = sc.body.querySelector('#ex-time');
    const now = ctx.currentTime;
    const since = now - R.ctxStart;
    const k = Math.floor(since / spb);
    if (k < lead) { if (el2) { el2.firstChild.nodeValue = String(lead - Math.max(0, k)); } return; }
    const bi = k - lead;
    const elapsed = (k - lead) * spb + (since - k * spb);
    if (el2) el2.firstChild.nodeValue = fmtTime(Math.max(0, 60 - elapsed));
    const ci = Math.floor(bi / per) % ex.chords.length;
    const nextCi = (ci + 1) % ex.chords.length;
    if (R.shown !== ci) { R.shown = ci; const ch = sc.body.querySelector('#ex-ch'); if (ch) ch.innerHTML = chordsHTML(ci); }
    const dots = sc.body.querySelector('#ex-dots');
    if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('on', i === bi % per));
    const sub = sc.body.querySelector('#ex-sub'); if (sub) sub.textContent = `הבא: ${chordName(ex.chords[nextCi])}`;
    if (elapsed >= 60) endTempo();
  }
  function endTempo() {
    const L = R.lis;
    stop(false);
    R.ended = true;
    let auto = null, pct = null;
    if (L && L.results.length >= 4) {
      pct = Math.round((100 * L.results.filter(Boolean).length) / L.results.length);
      auto = pct >= 85 ? 'clean' : pct >= 60 ? 'partial' : 'no';
    }
    const cls = (r) => (auto ? (r === auto ? 'btn primary block' : 'btn ghost block') : r === 'clean' ? 'btn primary block' : r === 'partial' ? 'btn block' : 'btn ghost block');
    sc.body.innerHTML = `<div class="ex-stage">${chordsHTML(-1)}
      <div class="bigtimer">${bpm}<small>BPM · ${Math.round(bpm / per)} מעברים לדקה</small></div>
      ${pct != null ? `<div class="celebrate" style="${pct >= 85 ? '' : 'background:var(--surface-2);color:var(--text)'}">🎤 ${pct}% מהמעברים נשמעו נקיים</div><div class="chgdots">${L.results.map((r) => `<i class="${r ? 'ok' : 'bad'}"></i>`).join('')}</div>` : ''}
      <b style="text-align:center;font-size:18px">${auto ? 'אשרו את התוצאה' : 'הצלחתם לעמוד בקצב?'}</b>
      <div style="display:grid;gap:10px"><button class="${cls('clean')}" data-result="clean">כן, נקי</button><button class="${cls('partial')}" data-result="partial">רוב הזמן</button><button class="${cls('no')}" data-result="no">עוד לא</button></div></div>`;
  }
  function finishTempo(res) {
    const ok = res === 'clean';
    const prevBest = bestOf(ex.id);
    const score = bpm / per;
    logPractice({ ex: ex.id, t: Date.now(), mode: 'tempo', bpm, per, score, ok: ok || res === 'partial' ? ok : false, res, dur: 60 });
    const rec = ok && score > prevBest;
    const nextBpm = ok ? bpm + 4 : res === 'partial' ? bpm : Math.max(30, bpm - 6);
    sc.body.innerHTML = `<div class="ex-stage">${rec ? '<div class="celebrate">שיא חדש! 🎉</div>' : ''}
      <div class="bigtimer">${Math.round(score)}<small>מעברים לדקה${ok ? '' : ' · לא נחשב לשיא'}</small></div>
      <p class="note" style="text-align:center">${ok ? `מעולה. בפעם הבאה ננסה ${nextBpm} BPM.` : res === 'partial' ? 'כמעט. כדאי לחזור על אותו קצב עד שזה נקי.' : `נוריד קצת: ננסה ${nextBpm} BPM.`}</p>
      <button class="btn primary block" id="ex-again">עוד סיבוב</button><button class="btn ghost block" data-tab="stats">לנתונים</button></div>`;
    bpm = nextBpm;
  }
  function finishCount() {
    stop(false);
    R.ended = true;
    const prevBest = bestOf(ex.id);
    const score = Math.round((R.count * 60 / dur) * 10) / 10;
    if (R.count === 0) { toast('לא נספרו מעברים'); draw(); return; }
    logPractice({ ex: ex.id, t: Date.now(), mode: 'count', count: R.count, dur, score, ok: true });
    const rec = score > prevBest;
    const s = sessionsOf(ex.id);
    sc.body.innerHTML = `<div class="ex-stage">${rec && prevBest ? `<div class="celebrate">שיא חדש! שיפור של ${Math.round(((score - prevBest) / prevBest) * 100)}%</div>` : rec ? '<div class="celebrate">השיא הראשון נקבע</div>' : ''}
      <div class="bigtimer">${R.count}<small>מעברים ב־${dur} שניות · ${score} לדקה</small></div>
      <div class="statgrid"><div class="stat"><b>${Math.round(Math.max(score, prevBest))}</b><span>שיא</span></div><div class="stat"><b>${s.length}</b><span>אימונים</span></div>
        <div class="stat"><b>${prevBest ? Math.round(score - prevBest) : '—'}</b><span>מול השיא הקודם</span></div></div>
      <button class="btn primary block" id="ex-again">עוד סיבוב</button><button class="btn ghost block" data-tab="stats">לנתונים</button></div>`;
  }
  function listenTick() {
    if (!R.running || !R.lis) return;
    const L = R.lis;
    const w = whichChord(ex.chords);
    const hd = sc.body.querySelector('#ex-heard');
    if (w.idx === L.cand) L.candN++; else { L.cand = w.idx; L.candN = 1; }
    if (hd) { hd.textContent = w.silent ? '🎤 מקשיב…' : w.idx >= 0 ? `🎤 שומע: ${chordName(ex.chords[w.idx])}` : '🎤 …'; hd.classList.toggle('on', w.idx >= 0); }
    sc.body.querySelectorAll('.ex-chord').forEach((c, i) => c.classList.toggle('heard', i === L.stable && !w.silent));
    if (mode === 'count') {
      if (L.candN >= 3 && L.cand >= 0 && L.cand !== L.stable) {
        const prev = L.stable; L.stable = L.cand;
        if (prev >= 0 && R.t0 && L.stable === R.target) tap();
        else if (prev < 0 && R.t0 && L.stable === R.target) tap();
      }
    } else if (R.ctxStart != null) {
      const spb = 60 / bpm, lead = per >= 4 ? per : 4;
      const since = audioCtx().currentTime - R.ctxStart - lead * spb;
      if (since < 0) return;
      const n = Math.floor(since / (per * spb)); // change window index
      const into = since - n * per * spb;
      if (into < 0.3 * per * spb && n > 0) return; // give time to land the chord
      const exp = n % ex.chords.length;
      const rec = L.win.get(n) || { a: 0, ok: 0 };
      if (!w.silent) { rec.a++; if (w.idx === exp) rec.ok++; }
      L.win.set(n, rec);
      // close previous windows
      for (const [k, r] of L.win) {
        if (k < n && r.done == null) {
          r.done = r.a >= 3 && r.ok / r.a >= 0.5;
          L.results.push(r.done);
          const dots = sc.body.querySelector('#ex-chg');
          if (dots) dots.insertAdjacentHTML('beforeend', `<i class="${r.done ? 'ok' : 'bad'}"></i>`);
        }
      }
    }
  }
  function stop(redraw) {
    if (R.lisTimer) { clearInterval(R.lisTimer); R.lisTimer = null; }
    if (R.lis) { stopMic(); }
    R.running = false;
    clearInterval(R.timer); cancelAnimationFrame(R.timer); cancelAnimationFrame(R.raf); clearInterval(R.cd);
    R.t0 = 0; R.shown = -1;
    if (redraw) draw();
  }

  function drawStats() {
    const s = sessionsOf(ex.id);
    const good = s.filter((p) => p.ok !== false);
    const ys = good.map((p) => p.score);
    const best = ys.length ? Math.max(...ys) : 0;
    const last5 = ys.slice(-5), first5 = ys.slice(0, 5);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const imp = ys.length >= 4 ? Math.round(((avg(last5) - avg(first5)) / (avg(first5) || 1)) * 100) : null;
    const totalSec = s.reduce((x, p) => x + (p.dur || 0), 0);
    const days = {}; s.forEach((p) => { const k = dayKey(p.t); days[k] = (days[k] || 0) + 1; });
    const trend = ys.length > 2 ? linReg(ys).b : 0;
    sc.body.innerHTML = `
      <div class="seg" style="margin-bottom:12px"><button data-tab="train">אימון</button><button data-tab="stats" aria-pressed="true">נתונים והתקדמות</button></div>
      <div class="statgrid">
        <div class="stat"><b>${best ? Math.round(best) : '—'}</b><span>שיא (מעברים/דקה)</span></div>
        <div class="stat"><b>${last5.length ? Math.round(avg(last5)) : '—'}</b><span>ממוצע 5 אחרונים</span></div>
        <div class="stat"><b class="${imp > 0 ? 'up' : imp < 0 ? 'down' : ''}">${imp == null ? '—' : (imp > 0 ? '+' : '') + imp + '%'}</b><span>שיפור מההתחלה</span></div>
        <div class="stat"><b>${s.length}</b><span>אימונים</span></div>
        <div class="stat"><b>${Object.keys(days).length}</b><span>ימי אימון</span></div>
        <div class="stat"><b>${Math.round(totalSec / 60)}</b><span>דקות בסך הכל</span></div>
      </div>
      <div class="section-t">מגמה לאורך האימונים</div>
      <div class="card chartbox">${lineChart(good.map((p) => ({ t: p.t, y: Math.round(p.score) })), { unit: '' })}
        <div class="legend"><span><i style="background:var(--accent)"></i>מעברים לדקה בכל אימון</span>${ys.length > 2 ? `<span><i style="background:var(--sync)"></i>קו מגמה (${trend >= 0 ? '+' : ''}${trend.toFixed(1)} לאימון)</span>` : ''}</div></div>
      <div class="section-t">מתי התאמנתם</div>
      <div class="card" style="padding:12px">${heatmap(days, 16, [1, 2, 3])}<div class="legend" style="margin-top:8px"><span>16 שבועות אחרונים · ריבוע = יום · כהה יותר = יותר אימונים</span></div></div>
      <div class="section-t">היסטוריה</div>
      <div class="rows sessions">${s.length ? s.slice().reverse().slice(0, 60).map((p) => `<div class="row"><span class="grow"><span class="t">${fmtDate(p.t, true)}</span><br><span class="d">${p.mode === 'tempo' ? `מטרונום ${p.bpm} BPM · ${{ clean: 'נקי', partial: 'חלקי', no: 'לא עמד בקצב' }[p.res] || ''}` : `${p.count} מעברים ב־${p.dur} שנ׳`}</span></span><b class="num">${Math.round(p.score)}</b></div>`).join('') : '<div class="row"><span class="note">עוד אין אימונים.</span></div>'}</div>
      ${ex.level === 'mine' ? `<div style="display:grid;gap:10px;margin-top:16px"><button class="btn ghost block" id="ex-edit">${icon('edit')} עריכת התרגיל</button><button class="btn ghost block" id="ex-del" style="color:var(--bad)">${icon('trash')} מחיקת התרגיל</button></div>` : ''}`;
  }
  draw();
  // preview both chords on long-press of chord cards
  sc.body.addEventListener('dblclick', (e) => { const c = e.target.closest('.ex-chord'); if (c) { const i = [...c.parentNode.children].indexOf(c); previewChord(voicings(ex.chords[i])[0]); } });
}
