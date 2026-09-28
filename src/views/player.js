// Play-along player v2: lyric/chord sheet with a live sweep (JustinGuitar style), chord boxes, strum pattern,
// built-in backing or the original recording from YouTube (matched automatically), lane and grid views.
import { loadSong, buildSymbolic, SOURCES, GENRES } from '../library.js';
import { chordName, transposeCid, simplifyCid, keyName, cidBase } from '../theory.js';
import { voicings, isOpenShape, voicingMidi } from '../chorddb.js';
import { diagramSVG } from '../diagram.js';
import { ensureAudio, audioCtx, strum, pickString, click, muteAll, warmNotes, setMix, setVolume, previewChord } from '../audio.js';
import { getState, update, songPref, isFav, toggleFav, pushRecent, logPlay, save } from '../store.js';
import { h, esc, icon, openScreen, openSheet, toast, fmtTime } from '../ui.js';
import { loadYT, parseYouTubeId, ytSearchUrl, YTClock } from '../yt.js';
import { findVideos } from '../ytlookup.js';
import { fetchSyncedLyrics } from '../lyrics.js';
import { app } from '../app.js';
import { startMic, stopMic, matchChord, resetChroma, micSupported } from '../mic.js';

const PPS = 104; // lane pixels per song-second
const STYLES = { strum: 'סטרום', arp: 'פריטה', hit: 'אקורד לתיבה', off: 'ללא' };
const PATTERNS = { 4: ['D', '', 'D', 'U', '', 'U', 'D', 'U'], 3: ['D', '', 'D', 'U', 'D', 'U'], 2: ['D', '', 'D', 'U'] };
const isHeb = (s) => /[֐-׿]/.test(s || '');

export async function openPlayer(song) {
  const st = getState();
  const pref = songPref(song.k);
  if (pref.tr == null) pref.tr = 0;
  if (pref.tempo == null) pref.tempo = 1;
  if (pref.simp == null) pref.simp = st.settings.simplify || 0;
  if (!pref.view || pref.view === 'lane' && !pref.viewSet) pref.view = 'sheet';
  pushRecent(song.k);

  const favOn = isFav(song.k);
  const sc = openScreen({
    fixed: true, cls: 'player', title: song.t, sub: song.a || '',
    actions: `<button class="iconbtn" data-fav aria-label="מועדף" aria-pressed="${favOn}" style="color:${favOn ? 'var(--accent)' : 'inherit'}">${icon('star', favOn ? 'fill' : '')}</button>
              <button class="iconbtn" data-more aria-label="פרטים והגדרות">${icon('info')}</button>`,
    onClose: () => teardown(),
  });
  sc.body.innerHTML = '<div class="empty"><b>טוען שיר…</b></div>';

  let model;
  try { model = await loadSong(song); } catch (e) {
    sc.body.innerHTML = `<div class="empty"><b>לא הצלחנו לטעון את השיר</b>בדקו חיבור לאינטרנט (שירים שכבר פתחתם זמינים גם בלי רשת).<br><br><button class="btn primary" data-retry>נסו שוב</button></div>`;
    sc.body.querySelector('[data-retry]').onclick = () => { sc.close(); setTimeout(() => openPlayer(song), 350); };
    return;
  }
  if (pref.capo == null) pref.capo = model.capoHint || 0;
  // default source: the original recording when the timing matches it
  if (!pref.mode) pref.mode = model.timed ? 'yt' : 'synth';
  save();

  // ------------------------------------------------------------ state
  const S = {
    playing: false, songT0: 0, ctxT0: 0, t: 0, rate: pref.tempo, schedIdx: 0, loop: null, raf: 0, timer: 0,
    ytc: null, ytReady: false, ytCands: [], ytIdx: 0, practiced: 0, lastTick: 0, curEv: -2, curBar: -1, curLine: -1,
    countUntil: -1, wake: null, taps: [], userScrollUntil: 0, lyricsState: 'none', closed: false,
    listen: { on: false, stats: new Map(), judged: new Map(), lastAt: 0, ema: 0, lastIdx: -1 },
  };
  let ev = model.events;
  let lines = [];
  const firstChordT = () => { const e = ev.find((x) => x.c >= 0); return e ? e.t : 0; };
  const disp = (c) => (c < 0 ? c : simplifyCid(transposeCid(c, pref.tr), pref.simp));
  const shape = (c) => (c < 0 ? c : transposeCid(disp(c), -pref.capo));
  const keyHint = () => (song.key >= 0 ? (((song.key >> 1) + pref.tr) % 12 + 12) % 12 * 2 + (song.key & 1) : -1);
  const nameOf = (c) => (c < 0 ? '—' : chordName(disp(c), keyHint()));
  const voiceOf = (c) => {
    const vs = voicings(shape(c));
    if (!vs.length) return null;
    if (pref.capo > 0) { const o = vs.find(isOpenShape); if (o) return o; }
    return vs[0];
  };

  // ------------------------------------------------------------ layout
  sc.body.innerHTML = `
    <div class="pl-src"><div class="seg" id="pl-mode"><button data-mode="synth">${icon('guitar')} ליווי מובנה</button><button data-mode="yt">${icon('yt')} השיר המקורי</button></div>
      <button class="iconbtn sm" id="pl-mic" aria-label="האזנה לנגינה" aria-pressed="false">${icon('mic')}</button>
      <button class="iconbtn sm" id="pl-view" aria-label="החלפת תצוגה"></button></div>
    <div id="pl-yt" hidden></div>
    <div class="pl-boxes" id="pl-boxes"></div>
    <div class="pl-stage" id="pl-stage"></div>
    <div class="pl-info"><span class="lis" id="pl-lis" hidden></span><div class="beatdots" id="pl-dots"></div><div class="next" id="pl-next"></div><div class="strum" id="pl-strum"></div></div>
    <div class="pl-controls">
      <div class="scrub"><span id="pl-t" class="num">0:00</span><input type="range" id="pl-seek" min="0" max="${Math.ceil(model.dur)}" step="0.1" value="0" aria-label="מיקום בשיר"><span id="pl-d" class="num">${fmtTime(model.dur)}</span></div>
      <div class="transport">
        <button class="tb" id="pl-loop" aria-label="לולאה על הקטע">${icon('loop')}<small>לולאה</small></button>
        <button class="tb" id="pl-back5" aria-label="5 שניות אחורה">${icon('restart')}<small>‎-5 שנ׳</small></button>
        <button class="play" id="pl-play" aria-label="נגן">${icon('play')}</button>
        <button class="tb" id="pl-metro" aria-label="מטרונום">${icon('metro')}<small>מטרונום</small></button>
        <button class="tb" id="pl-set" aria-label="טמפו, קאפו ועוד">${icon('settings')}<small id="pl-set-l">הגדרות</small></button>
      </div>
    </div>`;
  const $ = (s) => sc.body.querySelector(s);
  const stage = $('#pl-stage');

  // ------------------------------------------------------------ chord boxes (all chords in the song)
  let boxEls = new Map();
  function buildBoxes() {
    const seen = [];
    for (const e of ev) { if (e.c >= 0) { const k = cidBase(disp(e.c)) + (e.c >= 12 * 27 ? '/' + Math.floor(e.c / (12 * 27)) : ''); if (!seen.some((x) => x.k === k)) seen.push({ k, c: e.c }); } }
    const box = $('#pl-boxes');
    if (getState().settings.diagrams === false) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = seen.slice(0, 16).map((x) => `<button class="cbx" data-c="${x.c}" aria-label="${esc(nameOf(x.c))}"><b>${esc(nameOf(x.c))}</b>${diagramSVG(voiceOf(x.c), { w: 52, capo: pref.capo, compact: true, lefty: getState().settings.lefty })}</button>`).join('');
    boxEls = new Map([...box.querySelectorAll('.cbx')].map((b) => [nameOf(+b.dataset.c), b]));
    box.onclick = (e) => { const b = e.target.closest('.cbx'); if (b) { ensureAudio(); previewChord(voiceOf(+b.dataset.c), { capo: pref.capo }); } };
  }

  // ------------------------------------------------------------ helpers
  function eventAt(t) {
    let lo = 0, hi = ev.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m].t <= t + 1e-6) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function beatAt(t) {
    const b = model.beats;
    let lo = 0, hi = b.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] <= t + 1e-6) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function curTime() {
    if (pref.mode === 'yt' && S.ytc) return S.ytc.time() - (pref.off || 0);
    if (S.playing) { const ctx = audioCtx(); return S.songT0 + (ctx.currentTime - S.ctxT0) * S.rate; }
    return S.t;
  }
  const isPlaying = () => (pref.mode === 'yt' ? !!(S.ytc && S.ytc.playing) : S.playing);
  let bars = [];
  function buildBars() {
    bars = [];
    const downs = [...model.downs].sort((a, b) => a - b);
    let starts = downs.map((i) => model.beats[i]).filter((t) => t != null);
    if (!starts.length) starts = model.beats.filter((_, i) => i % 4 === 0);
    if (!starts.length || starts[0] > 0.3) starts.unshift(0);
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], b = i + 1 < starts.length ? starts[i + 1] : model.dur;
      if (b - a < 0.05) continue;
      const tol = model.timed ? 0.15 : 0.001;
      const cs = [];
      const i0 = eventAt(a + tol);
      if (i0 >= 0) cs.push(i0);
      for (let k = Math.max(0, i0 + 1); k < ev.length && ev[k].t < b - tol; k++) if (ev[k].t >= a) cs.push(k);
      const nb = Math.max(1, beatAt(b - 0.01) - beatAt(a + 0.01) + 1);
      bars.push({ a, b, cs, nb });
    }
  }

  // ------------------------------------------------------------ sheet lines (lyrics with chords, or bars)
  function buildLines() {
    buildBars();
    lines = [];
    const secs = model.sections.slice().sort((x, y) => x.t - y.t);
    const labelAt = (t0, t1) => { const s = secs.find((x) => x.t >= t0 - 0.2 && x.t < t1 - 0.2); return s ? s.label : null; };
    const barLines = (from, to, needChange = false) => {
      if (needChange && !ev.some((e) => e.c >= 0 && e.t >= from + 0.3 && e.t < to - 0.3)) return;
      const bs = bars.filter((b) => b.a >= from - 0.05 && b.a < to - 0.05);
      const per = bs.some((b) => b.cs.length > 2) ? 2 : 4;
      for (let i = 0; i < bs.length; i += per) {
        const g = bs.slice(i, i + per);
        lines.push({ kind: 'bars', t0: g[0].a, t1: g[g.length - 1].b, bars: g, label: labelAt(g[0].a, g[g.length - 1].b) });
      }
    };
    if (model.sheet && model.sheet.length) {
      const sh = model.sheet.filter((l) => l.t1 > l.t0 || l.text);
      let cursor = 0;
      sh.forEach((l, i) => {
        const t1 = Math.max(l.t1, l.t0 + 0.5);
        if (l.t0 - cursor > 3.5) barLines(cursor, l.t0, i > 0);
        const chords = [];
        for (let k = Math.max(0, eventAt(l.t0 - 0.05)); k < ev.length && ev[k].t < t1 - 0.05; k++) {
          const e = ev[k];
          if (e.c < 0) continue;
          let pos;
          if (model.pos && l.first != null && k >= l.first && k < l.first + (l.n || 0)) pos = model.pos[k];
          else pos = Math.max(0, Math.min(0.96, (Math.max(e.t, l.t0) - l.t0) / (t1 - l.t0)));
          if (e.t < l.t0 - 0.05 && chords.length) continue;
          chords.push({ k, pos: e.t < l.t0 ? 0 : pos, carried: e.t < l.t0 - 0.05 });
        }
        // drop a chord carried over from the previous line when a new one starts right at the line start
        if (chords.length > 1 && chords[0].carried && chords[1].pos < 0.12) chords.shift();
        // keep chord labels from overlapping
        for (let q = 1; q < chords.length; q++) {
          const gap = 0.05 + 0.028 * nameOf(ev[chords[q - 1].k].c).length;
          if (chords[q].pos < chords[q - 1].pos + gap) chords[q].pos = chords[q - 1].pos + gap;
        }
        const over = chords.length ? chords[chords.length - 1].pos - 0.9 : 0;
        if (over > 0) chords.forEach((c) => { c.pos = Math.max(0, c.pos - over); });
        lines.push({ kind: l.text ? 'lyric' : 'bars', t0: l.t0, t1, text: l.text, chords, label: l.label || labelAt(l.t0, t1), bars: l.text ? null : bars.filter((b) => b.a >= l.t0 - 0.05 && b.a < t1 - 0.05) });
        cursor = t1;
      });
      if (model.dur - cursor > 3.5) barLines(cursor, model.dur, true);
    } else barLines(0, model.dur + 1);
    lines = lines.filter((l) => l.kind === 'lyric' || (l.bars && l.bars.length));
  }
  function renderSheet() {
    buildLines();
    const html = lines.map((l, i) => {
      const lab = l.label ? `<div class="sl-label">${esc(l.label)}</div>` : '';
      if (l.kind === 'lyric') {
        const rtl = isHeb(l.text);
        const chips = l.chords.map((c) => `<span class="sl-ch" data-k="${c.k}" style="${rtl ? 'right' : 'left'}:${(Math.min(0.9, c.pos) * 100).toFixed(1)}%">${esc(nameOf(ev[c.k].c))}</span>`).join('');
        return `${lab}<div class="sl lyric${rtl ? ' rtl' : ' ltr'}" data-l="${i}"><div class="sl-chords">${chips}</div><div class="sl-text">${esc(l.text)}</div></div>`;
      }
      return `${lab}<div class="sl bars" data-l="${i}" style="grid-template-columns:repeat(${Math.max(2, l.bars.length)},1fr)">${l.bars.map((b) => `<div class="bar" data-a="${b.a}">
        ${b.cs.map((k) => `<b data-k="${k}">${esc(nameOf(ev[k].c))}</b>`).join('') || '<b class="rep">%</b>'}<span class="sl-sl">${'/ '.repeat(Math.max(0, Math.min(8, b.nb - b.cs.length))).trim()}</span><i class="bf"></i></div>`).join('')}</div>`;
    }).join('');
    stage.innerHTML = `<div class="sheetview" id="pl-sheet"><div class="sv-pad"></div>${html || '<div class="empty">אין נתונים לשיר הזה</div>'}<div class="sv-pad end"></div></div>`;
    const sv = stage.querySelector('#pl-sheet');
    const lineEls = [...sv.querySelectorAll('.sl')];
    S.lineEls = lineEls;
    S.chipEls = new Map([...sv.querySelectorAll('[data-k]')].map((x) => [+x.dataset.k, x]));
    const markUser = () => { S.userScrollUntil = performance.now() + 3500; };
    sv.addEventListener('touchstart', markUser, { passive: true });
    sv.addEventListener('wheel', markUser, { passive: true });
    sv.addEventListener('click', (e) => {
      const bar = e.target.closest('.bar');
      if (bar) { seek(+bar.dataset.a); return; }
      const ln = e.target.closest('.sl');
      if (ln) seek(lines[+ln.dataset.l].t0);
    });
    S.curLine = -1; S.curChip = null;
  }

  // ------------------------------------------------------------ lane view
  let laneStrip = null, laneBlocks = [], laneW = 0, loopBand = null, curMark = -1;
  function buildLane() {
    stage.innerHTML = '<div class="lane" id="pl-lane"><div class="strip"></div><div class="playhead"></div></div><div class="lane-ly" id="pl-lly"><div class="cur"></div><div class="nxt"></div></div>';
    const lane = stage.querySelector('.lane');
    laneStrip = lane.querySelector('.strip');
    laneW = lane.clientWidth || 360;
    lane.querySelector('.playhead').style.left = `${Math.round(laneW * 0.28)}px`;
    let html = '';
    const secAt = new Map(model.sections.map((s) => [Math.round(s.t * 100), s.label]));
    ev.forEach((e, i) => {
      const x = e.t * PPS, w = Math.max(18, e.d * PPS - 4);
      const sec = secAt.get(Math.round(e.t * 100));
      html += `<div class="blk${e.c < 0 ? ' nc' : ''}" style="left:${x.toFixed(1)}px;width:${w.toFixed(1)}px"><b class="ltr">${esc(nameOf(e.c))}</b></div>`;
      if (sec) html += `<div class="secl" style="left:${x.toFixed(1)}px">${esc(sec)}</div>`;
    });
    model.beats.forEach((b, i) => { html += `<i class="tick${model.downs.has(i) ? ' down' : ''}" style="left:${(b * PPS).toFixed(1)}px"></i>`; });
    laneStrip.innerHTML = html;
    laneStrip.style.width = `${Math.ceil(model.dur * PPS + laneW)}px`;
    laneBlocks = [...laneStrip.querySelectorAll('.blk')];
    loopBand = null; drawLoop(); curMark = -1;
    let x0 = null, t0 = 0, moved = false;
    lane.addEventListener('pointerdown', (e) => { x0 = e.clientX; t0 = curTime(); moved = false; lane.setPointerCapture(e.pointerId); });
    lane.addEventListener('pointermove', (e) => { if (x0 == null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 6) moved = true; if (moved && !isPlaying()) { S.t = Math.max(0, Math.min(model.dur, t0 - dx / PPS)); frame(true); } });
    lane.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      if (!moved) { const r = lane.getBoundingClientRect(); const t = curTime() + (e.clientX - r.left - laneW * 0.28) / PPS; const i = eventAt(t); seek(i >= 0 ? ev[i].t : t); }
      else if (!isPlaying()) seek(S.t);
      x0 = null;
    });
  }
  // ------------------------------------------------------------ grid view
  let gridCells = [];
  function buildGrid() {
    buildBars();
    const secAt = model.sections.slice();
    let html = '<div class="gridview" id="pl-grid">', row = [];
    const flush = () => { if (row.length) { html += `<div class="gv-row">${row.join('')}</div>`; row = []; } };
    bars.forEach((bar, bi) => {
      while (secAt.length && secAt[0].t <= bar.a + 0.05) { flush(); html += `<div class="gv-sec">${esc(secAt.shift().label)}</div>`; }
      const names = bar.cs.map((k) => nameOf(ev[k].c));
      const uniq = names.filter((n, i) => i === 0 || n !== names[i - 1]);
      row.push(`<div class="gv-cell${uniq.length > 2 ? ' n3' : uniq.length > 1 ? ' n2' : ''}" data-b="${bi}">${uniq.slice(0, 3).map((n) => `<b>${esc(n)}</b>`).join('') || '<b style="color:var(--dim)">%</b>'}<i class="fillbar" style="width:0"></i></div>`);
      if (row.length === 4) flush();
    });
    flush();
    stage.innerHTML = html + '</div>';
    gridCells = [...stage.querySelectorAll('.gv-cell')];
    stage.querySelector('#pl-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-b]'); if (c) seek(bars[+c.dataset.b].a); });
    S.curBar = -1;
  }
  function buildStage() {
    laneStrip = null; gridCells = []; S.lineEls = null;
    if (pref.view === 'grid') buildGrid(); else if (pref.view === 'lane') buildLane(); else renderSheet();
    const nextView = { sheet: 'lane', lane: 'grid', grid: 'sheet' }[pref.view] || 'lane';
    $('#pl-view').innerHTML = icon({ sheet: 'lane', lane: 'grid', grid: 'lines' }[pref.view] || 'grid');
    $('#pl-view').setAttribute('aria-label', 'תצוגה: ' + { sheet: 'טיימליין', lane: 'תיבות', grid: 'מילים ואקורדים' }[pref.view]);
    buildBoxes();
    S.curEv = -2;
    frame(true);
    void nextView;
  }

  // ------------------------------------------------------------ synth scheduler
  function scheduleTick() {
    if (!S.playing || pref.mode !== 'synth') return;
    const ctx = audioCtx();
    const now = S.songT0 + (ctx.currentTime - S.ctxT0) * S.rate;
    const horizon = now + 0.15 * S.rate;
    const sets = getState().settings;
    if (S.countBeats && S.countBeats.length) {
      while (S.countBeats.length && S.countBeats[0].t < horizon) {
        const cb = S.countBeats.shift();
        click(S.ctxT0 + (cb.t - S.songT0) / S.rate, cb.accent, sets.clickVol ?? 0.7);
      }
    }
    const beats = model.beats;
    const loopEnd = S.loop ? S.loop.b : Infinity;
    while (S.schedIdx < beats.length && beats[S.schedIdx] < horizon) {
      const bi = S.schedIdx++;
      const bt = beats[bi];
      if (bt < now - 0.05 || bt >= loopEnd - 0.01 || bt > model.dur) continue;
      const at = (t) => S.ctxT0 + (t - S.songT0) / S.rate;
      const next = bi + 1 < beats.length ? beats[bi + 1] : bt + (bi > 0 ? bt - beats[bi - 1] : 0.6);
      const half = bt + (next - bt) / 2;
      const isDown = model.downs.has(bi);
      if (sets.metronome) click(at(bt), isDown, sets.clickVol ?? 0.7);
      let posInBar = 0; { let j = bi; while (j > 0 && !model.downs.has(j)) { j--; posInBar++; } }
      const chordAtT = (t) => { const i = eventAt(t + 0.06); return i >= 0 ? ev[i].c : -1; };
      const c1 = chordAtT(bt), c2 = chordAtT(half);
      const v1 = c1 >= 0 ? voiceOf(c1) : null, v2 = c2 >= 0 ? voiceOf(c2) : null;
      const capo = pref.capo;
      const style = sets.sound;
      if (style === 'strum') {
        const pat = PATTERNS[model.bpb] || PATTERNS[4];
        const bpb = model.bpb || 4;
        const p = posInBar % bpb;
        const d1 = pat[p * 2], d2 = pat[p * 2 + 1];
        if (d1 && v1) strum(v1, at(bt), { dir: d1, vel: isDown ? 0.95 : 0.78, capo });
        if (d2 && v2 && half < loopEnd) strum(v2, at(half), { dir: d2, vel: 0.7, capo });
      } else if (style === 'arp') {
        if (v1) {
          const bass = v1.f.findIndex((x) => x >= 0);
          const top = [2, 3, 4, 5].filter((s) => v1.f[s] >= 0);
          const bn = posInBar % (model.bpb || 4);
          const seqs = [[bass, top[1] ?? top[0]], [top[2] ?? top[0], top[1] ?? top[0]], [top[0], top[1] ?? top[0]], [top[2] ?? top[0], top[1] ?? top[0]]];
          const pair = seqs[bn] || seqs[0];
          if (pair[0] != null && pair[0] >= 0) pickString(v1, pair[0], at(bt), { vel: bn === 0 ? 0.85 : 0.6, capo });
          if (pair[1] != null && pair[1] >= 0 && half < loopEnd) pickString(v2 || v1, pair[1], at(half), { vel: 0.55, capo });
        }
      } else if (style === 'hit') {
        const prevC = bi > 0 ? chordAtT(beats[bi - 1]) : -2;
        if (v1 && (isDown || c1 !== prevC)) strum(v1, at(bt), { dir: 'D', vel: 0.9, capo, spread: 0.02 });
      }
    }
  }

  // ------------------------------------------------------------ transport
  async function play() {
    if (pref.mode === 'yt') {
      if (!S.ytc || !S.ytReady) { toast('הסרטון עדיין נטען…'); return; }
      S.ytc.play();
      return;
    }
    ensureAudio();
    const ctx = audioCtx();
    setVolume(getState().settings.volume ?? 0.85);
    const mids = new Set();
    const i0 = Math.max(0, eventAt(S.t));
    ev.slice(i0, i0 + 14).forEach((e) => { if (e.c >= 0) { const v = voiceOf(e.c); if (v) voicingMidi(v, pref.capo).forEach((m) => mids.add(m)); } });
    warmNotes([...mids]);
    if (S.t >= model.dur - 0.2) S.t = S.loop ? S.loop.a : 0;
    const start = S.t;
    S.countBeats = [];
    const bi = Math.max(0, beatAt(start + 0.001));
    const per = ((model.beats[bi + 1] ?? (model.beats[bi] + 0.6)) - (model.beats[bi] ?? 0)) || 60 / (model.bpm || 100);
    const lead = getState().settings.countIn && !S.noCount ? (model.bpb || 4) : 0;
    S.noCount = false;
    for (let k = lead; k >= 1; k--) S.countBeats.push({ t: start - k * per, accent: k === lead });
    S.countUntil = lead ? start : -1;
    S.rate = pref.tempo;
    S.songT0 = start - lead * per;
    S.ctxT0 = ctx.currentTime + 0.08;
    const b0 = beatAt(start - 0.001);
    S.schedIdx = Math.max(0, b0 + (model.beats[b0] < start - 0.001 ? 1 : 0));
    S.playing = true;
    S.lastTick = performance.now();
    clearInterval(S.timer);
    S.timer = setInterval(scheduleTick, 25);
    scheduleTick();
    loop();
    setPlayIcon();
    try { if (navigator.wakeLock) S.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ }
  }
  function pause() {
    if (S.listen.on) { finalizeEvent(S.listen.lastIdx); const a = accuracy(); if (a != null && isPlaying()) toast(`דיוק עד עכשיו: ${a}% מהאקורדים`); }
    if (pref.mode === 'yt') { S.ytc && S.ytc.pause(); return; }
    if (!S.playing) return;
    S.t = Math.max(0, curTime());
    S.playing = false;
    clearInterval(S.timer);
    muteAll();
    cancelAnimationFrame(S.raf);
    setPlayIcon();
    frame(true);
    releaseWake();
  }
  function releaseWake() { try { S.wake && S.wake.release(); } catch (e) { /* */ } S.wake = null; }
  function seek(t) {
    t = Math.max(0, Math.min(model.dur, t));
    S.userScrollUntil = 0;
    if (pref.mode === 'yt') { if (S.ytc) S.ytc.seek(t + (pref.off || 0)); S.t = t; frame(true); return; }
    const was = S.playing;
    if (was) { S.playing = false; clearInterval(S.timer); muteAll(); }
    S.t = t;
    if (was) { S.noCount = true; play(); } else frame(true);
  }
  function retime() {
    if (pref.mode === 'yt') { if (S.ytc) { const r = S.ytc.setRate(pref.tempo); if (Math.abs(r - pref.tempo) > 0.01) pref.tempo = r; } return; }
    if (!S.playing) return;
    const t = curTime(), ctx = audioCtx();
    S.songT0 = t; S.ctxT0 = ctx.currentTime; S.rate = pref.tempo;
    S.schedIdx = Math.max(0, beatAt(t) + 1);
  }
  function setPlayIcon() {
    const p = isPlaying();
    $('#pl-play').innerHTML = icon(p ? 'pause' : 'play');
    $('#pl-play').setAttribute('aria-label', p ? 'השהה' : 'נגן');
  }

  // ------------------------------------------------------------ frame render
  let lastSeekUpd = 0;
  function loop() {
    cancelAnimationFrame(S.raf);
    const step = () => { if (S.closed) return; frame(false); if (isPlaying()) S.raf = requestAnimationFrame(step); };
    S.raf = requestAnimationFrame(step);
  }
  function frame(force) {
    const t = curTime();
    const playing = isPlaying();
    if (playing) {
      const now = performance.now();
      if (t >= 0) S.practiced += Math.min(0.25, (now - S.lastTick) / 1000);
      S.lastTick = now;
      if (S.loop && t >= S.loop.b) { seek(S.loop.a); return; }
      if (pref.mode === 'synth' && t >= model.dur + 0.3) { pause(); S.t = 0; frame(true); return; }
    }
    const counting = pref.mode === 'synth' && S.playing && S.countUntil >= 0 && t < S.countUntil;
    let ci = stage.querySelector('.countin');
    if (counting) {
      const per = (S.countUntil - S.songT0) / (model.bpb || 4);
      if (!ci) { ci = h('<div class="countin"></div>'); stage.append(ci); }
      ci.textContent = Math.ceil((S.countUntil - t) / per);
    } else if (ci) ci.remove();
    const tt = Math.max(0, t);
    if (!playing) S.t = tt;
    const i = eventAt(tt);

    // sheet
    if (S.lineEls && pref.view === 'sheet') {
      let li = S.curLine;
      if (li < 0 || !lines[li] || tt < lines[li].t0 || tt >= lines[li].t1) {
        li = -1;
        for (let k = 0; k < lines.length; k++) { if (tt >= lines[k].t0 - 0.02 && tt < lines[k].t1) { li = k; break; } if (lines[k].t0 > tt) { li = Math.max(0, k - 1); break; } }
        if (li < 0 && lines.length && tt >= lines[lines.length - 1].t0) li = lines.length - 1;
      }
      if (li !== S.curLine || force) {
        S.lineEls.forEach((el2, k) => { el2.classList.toggle('cur', k === li); el2.classList.toggle('past', k < li); if (k !== li) el2.style.removeProperty('--p'); });
        S.curLine = li;
        const el2 = S.lineEls[li];
        const sv = stage.querySelector('#pl-sheet');
        if (el2 && sv && performance.now() > S.userScrollUntil) {
          const target = el2.offsetTop - sv.clientHeight * 0.28;
          sv.scrollTo({ top: Math.max(0, target), behavior: force ? 'auto' : 'smooth' });
        }
      }
      const L = lines[li], el2 = S.lineEls[li];
      if (L && el2) {
        const p = Math.max(0, Math.min(1, (tt - L.t0) / (L.t1 - L.t0)));
        el2.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        if (L.kind === 'bars') {
          el2.querySelectorAll('.bar').forEach((b, bi) => {
            const B = L.bars[bi];
            const f = B ? Math.max(0, Math.min(1, (tt - B.a) / (B.b - B.a))) : 0;
            b.querySelector('.bf').style.width = (f * 100).toFixed(1) + '%';
            b.classList.toggle('now', f > 0 && f < 1);
          });
        }
      }
      const chip = S.chipEls && S.chipEls.get(i);
      if (chip !== S.curChip) { S.curChip && S.curChip.classList.remove('now'); chip && chip.classList.add('now'); S.curChip = chip; }
    }
    // lane
    if (laneStrip && pref.view === 'lane') {
      laneStrip.style.transform = `translate3d(${(laneW * 0.28 - tt * PPS).toFixed(1)}px,0,0)`;
      if (i !== curMark || force) {
        if (curMark >= 0 && laneBlocks[curMark]) laneBlocks[curMark].classList.remove('now');
        laneBlocks.forEach((b, k) => b.classList.toggle('past', k < i));
        if (i >= 0 && laneBlocks[i]) laneBlocks[i].classList.add('now');
        curMark = i;
        const lly = stage.querySelector('#pl-lly');
        if (lly && model.sheet) {
          const k = model.sheet.findIndex((l) => tt >= l.t0 && tt < l.t1);
          lly.querySelector('.cur').textContent = k >= 0 ? model.sheet[k].text : '';
          lly.querySelector('.nxt').textContent = k >= 0 && model.sheet[k + 1] ? model.sheet[k + 1].text : '';
        }
      }
    }
    // grid
    if (gridCells.length && pref.view === 'grid') {
      let bi = S.curBar;
      if (bi < 0 || !bars[bi] || tt < bars[bi].a || tt >= bars[bi].b) bi = bars.findIndex((b) => tt >= b.a && tt < b.b);
      if (bi !== S.curBar || force) {
        if (S.curBar >= 0 && gridCells[S.curBar]) { gridCells[S.curBar].classList.remove('now'); gridCells[S.curBar].querySelector('.fillbar').style.width = '0'; }
        if (bi >= 0 && gridCells[bi]) {
          gridCells[bi].classList.add('now');
          const g = stage.querySelector('#pl-grid'), c = gridCells[bi];
          const top = c.offsetTop - g.offsetTop;
          if (top < g.scrollTop + 40 || top > g.scrollTop + g.clientHeight - 90) g.scrollTo({ top: Math.max(0, top - 60), behavior: force ? 'auto' : 'smooth' });
        }
        S.curBar = bi;
      }
      if (bi >= 0 && gridCells[bi]) gridCells[bi].querySelector('.fillbar').style.width = `${(100 * (tt - bars[bi].a) / (bars[bi].b - bars[bi].a)).toFixed(1)}%`;
    }
    // listening feedback
    if (S.listen.on && playing) listenTick(tt, i);
    // chord boxes + next
    if (i !== S.curEv || force) {
      S.curEv = i;
      const e = ev[i];
      const curC = e && e.c >= 0 ? e.c : (i < 0 ? (ev.find((x) => x.c >= 0)?.c ?? -1) : -1);
      let n = i + 1; while (n < ev.length && (ev[n].c < 0 || (curC >= 0 && nameOf(ev[n].c) === nameOf(curC)))) n++;
      const nextC = n < ev.length ? ev[n].c : -1;
      boxEls.forEach((b, nm) => { b.classList.toggle('now', curC >= 0 && nm === nameOf(curC)); b.classList.toggle('up', nextC >= 0 && nm === nameOf(nextC)); });
      const nowB = curC >= 0 && boxEls.get(nameOf(curC));
      if (nowB) { const box = $('#pl-boxes'); const r = nowB.offsetLeft - box.clientWidth / 2 + nowB.clientWidth / 2; box.scrollTo({ left: r, behavior: 'smooth' }); }
      const shp = curC >= 0 && pref.capo > 0 ? ` · צורת <b class="ltr">${esc(chordName(shape(curC)))}</b>` : '';
      $('#pl-next').innerHTML = `<span class="nowc ltr">${esc(curC >= 0 ? nameOf(curC) : '—')}</span>${shp}${nextC >= 0 ? ` <span class="arrow">←</span> <span class="nx ltr">${esc(nameOf(nextC))}</span>` : ''}`;
    }
    // beat dots + strum pattern
    const bi = beatAt(tt);
    let pos = 0; { let j = bi; while (j > 0 && !model.downs.has(j)) { j--; pos++; } }
    const nb = model.bpb || 4;
    const dots = $('#pl-dots');
    if (dots.childElementCount !== nb) dots.innerHTML = Array.from({ length: nb }, (_, k) => `<i class="${k === 0 ? 'down' : ''}"></i>`).join('');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', (playing || force) && bi >= 0 && k === pos % nb));
    const sp = $('#pl-strum');
    const pat = PATTERNS[nb] || PATTERNS[4];
    if (sp.childElementCount !== pat.length) sp.innerHTML = pat.map((d) => `<i class="${d ? d.toLowerCase() : 'x'}">${d === 'D' ? '↓' : d === 'U' ? '↑' : '·'}</i>`).join('');
    if (bi >= 0) {
      const b0 = model.beats[bi], b1 = model.beats[bi + 1] ?? b0 + 0.5;
      const eighth = (pos % nb) * 2 + ((tt - b0) > (b1 - b0) / 2 ? 1 : 0);
      [...sp.children].forEach((x, k) => x.classList.toggle('on', playing && k === eighth));
    }
    const now = performance.now();
    if (force || now - lastSeekUpd > 250) {
      lastSeekUpd = now;
      $('#pl-t').textContent = fmtTime(tt);
      const sk = $('#pl-seek'); if (!sk.matches(':active')) sk.value = tt.toFixed(1);
      pref.lastT = tt;
    }
  }

  // ------------------------------------------------------------ listening (microphone)
  function listenTick(tt, i) {
    const L = S.listen, now = performance.now();
    if (i !== L.lastIdx) { finalizeEvent(L.lastIdx); L.lastIdx = i; L.ema = 0; }
    if (now - L.lastAt < 90) return;
    L.lastAt = now;
    const e = ev[i];
    const lis = $('#pl-lis');
    if (!e || e.c < 0 || tt - e.t < 0.3) return;
    const m = matchChord(disp(e.c));
    if (!m) return;
    const box = boxEls.get(nameOf(e.c));
    if (m.silent) { lis.className = 'lis idle'; lis.textContent = '🎤'; return; }
    const st = L.stats.get(i) || { a: 0, m: 0 };
    st.a++; if (m.ok) st.m++;
    L.stats.set(i, st);
    L.ema = L.ema * 0.6 + (m.ok ? 1 : 0) * 0.4;
    const good = L.ema >= 0.5;
    lis.className = 'lis ' + (good ? 'good' : 'bad');
    lis.textContent = good ? '✓' : `✗ ${chordName(m.best)}`;
    boxEls.forEach((b) => b.classList.remove('hit', 'miss'));
    if (box) box.classList.add(good ? 'hit' : 'miss');
  }
  function finalizeEvent(idx) {
    const st = S.listen.stats.get(idx);
    if (!st || st.a < 3) return;
    const ok = st.m / st.a >= 0.5;
    S.listen.judged.set(idx, ok);
    const chip = S.chipEls && S.chipEls.get(idx);
    if (chip) chip.classList.add(ok ? 'ok' : 'bad');
  }
  function accuracy() {
    const j = [...S.listen.judged.values()];
    return j.length >= 4 ? Math.round((100 * j.filter(Boolean).length) / j.length) : null;
  }
  async function toggleListen() {
    const L = S.listen;
    if (L.on) {
      L.on = false; stopMic(); $('#pl-mic').setAttribute('aria-pressed', 'false'); $('#pl-lis').hidden = true;
      boxEls.forEach((b) => b.classList.remove('hit', 'miss'));
      const a = accuracy(); if (a != null) toast(`דיוק: ${a}% מהאקורדים`);
      return;
    }
    if (!micSupported()) { toast('המכשיר לא מאפשר גישה למיקרופון'); return; }
    try { await startMic({ echo: true }); } catch (e) { toast('אין גישה למיקרופון. אפשרו גישה בהגדרות ספארי ← מיקרופון'); return; }
    resetChroma();
    L.on = true; L.stats = new Map(); L.judged = new Map(); L.lastIdx = -1;
    $('#pl-mic').setAttribute('aria-pressed', 'true');
    const lis = $('#pl-lis'); lis.hidden = false; lis.className = 'lis idle'; lis.textContent = '🎤';
    toast(pref.mode === 'yt' || getState().settings.sound !== 'off' ? 'מקשיב לנגינה שלך — עם אוזניות זה הכי מדויק' : 'מקשיב לנגינה שלך');
  }

  // ------------------------------------------------------------ loop
  function drawLoop() {
    if (!laneStrip) return;
    if (loopBand) { loopBand.remove(); loopBand = null; }
    if (S.loop) { loopBand = h(`<div class="loopband" style="left:${S.loop.a * PPS}px;width:${(S.loop.b - S.loop.a) * PPS}px"></div>`); laneStrip.prepend(loopBand); }
  }
  function toggleLoop() {
    if (S.loop) { S.loop = null; $('#pl-loop').setAttribute('aria-pressed', 'false'); drawLoop(); toast('הלולאה בוטלה'); return; }
    const t = curTime();
    let a = 0, b = model.dur;
    const L = pref.view === 'sheet' && lines[S.curLine];
    const secs = model.sections;
    const si = secs.findIndex((s, k) => s.t <= t + 0.01 && (k + 1 >= secs.length || secs[k + 1].t > t));
    if (si >= 0) { a = secs[si].t; b = si + 1 < secs.length ? secs[si + 1].t : model.dur; }
    else if (L) { a = L.t0; b = L.t1; const L2 = lines[S.curLine + 1]; if (L2 && b - a < 6) b = L2.t1; }
    else { buildBars(); const bi = Math.max(0, bars.findIndex((x) => t >= x.a && t < x.b)); a = bars[bi] ? bars[bi].a : 0; const e = bars[Math.min(bars.length - 1, bi + 3)]; b = e ? e.b : model.dur; }
    S.loop = { a, b };
    $('#pl-loop').setAttribute('aria-pressed', 'true');
    drawLoop();
    toast(`לולאה: ${fmtTime(a)}–${fmtTime(b)}`);
    if (t < a || t > b) seek(a);
  }

  // ------------------------------------------------------------ settings sheet (tempo, capo, transpose…)
  function bestCapo() {
    const uniq = [...new Set(ev.filter((e) => e.c >= 0).map((e) => cidBase(simplifyCid(transposeCid(e.c, pref.tr), pref.simp))))];
    let best = { capo: 0, score: Infinity };
    for (let c = 0; c <= 7; c++) {
      let s = 0;
      for (const cid of uniq) { const vs = voicings(transposeCid(cid, -c)); const v = vs.find(isOpenShape); s += v ? v.diff : (vs[0] ? vs[0].diff + 4 : 10); }
      s += c * 0.3;
      if (s < best.score) best = { capo: c, score: s };
    }
    return best.capo;
  }
  function setLabel() {
    const parts = [];
    if (Math.round(pref.tempo * 100) !== 100) parts.push(`${Math.round(pref.tempo * 100)}%`);
    if (pref.capo) parts.push(`קאפו ${pref.capo}`);
    if (pref.tr) parts.push(`${pref.tr > 0 ? '+' : ''}${pref.tr}`);
    $('#pl-set-l').textContent = parts.join(' · ') || 'הגדרות';
    $('#pl-metro').setAttribute('aria-pressed', String(!!getState().settings.metronome));
    sc.body.querySelectorAll('#pl-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === pref.mode)));
  }
  function relabel() { buildStage(); }
  function openSettings() {
    const body = h('<div class="plset"></div>');
    const draw = () => {
      const s = getState().settings;
      body.innerHTML = `
        <div class="setrow"><span>טמפו</span><span class="stepper"><button data-q="tempo:-0.05">−</button><output>${Math.round(pref.tempo * 100)}%</output><button data-q="tempo:0.05">+</button></span></div>
        <div class="chips" style="margin:-4px 0 6px">${[0.5, 0.6, 0.75, 0.9, 1].map((r) => `<button class="chip${Math.abs(pref.tempo - r) < 0.01 ? '' : ' outline'}" data-rate="${r}" aria-pressed="${Math.abs(pref.tempo - r) < 0.01}">${Math.round(r * 100)}%</button>`).join('')}</div>
        <div class="setrow"><span>קאפו</span><span class="stepper"><button data-q="capo:-1">−</button><output>${pref.capo}</output><button data-q="capo:1">+</button></span></div>
        <button class="btn sm ghost block" data-best style="margin-bottom:10px">קאפו מומלץ לשיר הזה</button>
        <div class="setrow"><span>טרנספוז (חצאי טונים)</span><span class="stepper"><button data-q="tr:-1">−</button><output>${pref.tr > 0 ? '+' + pref.tr : pref.tr}</output><button data-q="tr:1">+</button></span></div>
        <div class="setrow"><span>פישוט אקורדים</span><div class="seg" style="width:190px">${['מלא', 'בינוני', 'בסיסי'].map((n, k) => `<button data-simp="${k}" aria-pressed="${pref.simp === k}">${n}</button>`).join('')}</div></div>
        <div class="section-t">ליווי מובנה</div>
        <div class="seg" style="margin-bottom:10px">${Object.entries(STYLES).map(([k, n]) => `<button data-snd="${k}" aria-pressed="${s.sound === k}">${n}</button>`).join('')}</div>
        <div class="rows">
          <div class="row"><span class="grow">ספירה לפני התחלה</span><label class="toggle"><input type="checkbox" id="ps-count" ${s.countIn ? 'checked' : ''}><span></span></label></div>
          <div class="row"><span class="grow">תיבות אקורדים למעלה</span><label class="toggle"><input type="checkbox" id="ps-dg" ${s.diagrams !== false ? 'checked' : ''}><span></span></label></div>
          <div class="row" style="display:grid;gap:4px"><span>עוצמת גיטרה</span><input type="range" id="ps-vol" min="0" max="1" step="0.05" value="${s.volume ?? 0.85}"></div>
          <div class="row" style="display:grid;gap:4px"><span>עוצמת מטרונום</span><input type="range" id="ps-cvol" min="0" max="1" step="0.05" value="${s.clickVol ?? 0.7}"></div>
        </div>
        ${!model.timed ? `<div class="section-t">קצב בסיס של השיר</div><div class="setrow"><span>BPM</span><span class="stepper"><button data-bpm="-5">−</button><output>${Math.round(model.bpm)}</output><button data-bpm="5">+</button></span></div>` : ''}
        <button class="btn ghost block" data-reset style="margin-top:12px">איפוס טמפו, קאפו וטרנספוז</button>`;
    };
    draw();
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.q) {
        const [k, dv] = d.q.split(':');
        if (k === 'tempo') { pref.tempo = Math.round(Math.max(0.4, Math.min(1.6, pref.tempo + +dv)) * 100) / 100; retime(); }
        else if (k === 'capo') pref.capo = Math.max(0, Math.min(9, pref.capo + +dv));
        else if (k === 'tr') pref.tr = Math.max(-11, Math.min(11, pref.tr + +dv));
        if (k !== 'tempo') relabel();
      } else if (d.rate) { pref.tempo = +d.rate; retime(); }
      else if (b.hasAttribute('data-best')) { pref.capo = bestCapo(); relabel(); toast(pref.capo ? `קאפו ${pref.capo} — הכי הרבה אקורדים פתוחים` : 'בלי קאפו זה כבר הכי נוח'); }
      else if (d.simp) { pref.simp = +d.simp; relabel(); }
      else if (d.snd) { update((s) => { s.settings.sound = d.snd; }); muteAll(); }
      else if (d.bpm) { const nb = Math.max(40, Math.min(260, Math.round(model.bpm) + +d.bpm)); pref.bpm = nb; pause(); rebuildSymbolic(nb); }
      else if (b.hasAttribute('data-reset')) { pref.tr = 0; pref.capo = 0; pref.tempo = 1; pref.simp = 0; retime(); relabel(); }
      else return;
      save(); setLabel(); draw();
    });
    body.addEventListener('change', (e) => {
      if (e.target.id === 'ps-count') update((s) => { s.settings.countIn = e.target.checked; });
      if (e.target.id === 'ps-dg') { update((s) => { s.settings.diagrams = e.target.checked; }); buildBoxes(); }
    });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'ps-vol') { update((s) => { s.settings.volume = +e.target.value; }); setVolume(+e.target.value); }
      if (e.target.id === 'ps-cvol') update((s) => { s.settings.clickVol = +e.target.value; });
    });
    openSheet({ title: 'הגדרות נגינה', body });
  }

  // ------------------------------------------------------------ controls
  $('#pl-play').addEventListener('click', () => { if (isPlaying()) pause(); else play(); });
  $('#pl-back5').addEventListener('click', () => seek(curTime() - 5));
  $('#pl-loop').addEventListener('click', toggleLoop);
  $('#pl-metro').addEventListener('click', () => { update((s) => { s.settings.metronome = !s.settings.metronome; }); setLabel(); toast(getState().settings.metronome ? 'מטרונום פועל' : 'מטרונום כבוי'); });
  $('#pl-set').addEventListener('click', openSettings);
  $('#pl-mic').addEventListener('click', toggleListen);
  $('#pl-seek').addEventListener('input', (e) => { S.t = +e.target.value; if (!isPlaying()) frame(true); });
  $('#pl-seek').addEventListener('change', (e) => seek(+e.target.value));
  $('#pl-view').addEventListener('click', () => {
    pref.view = { sheet: 'lane', lane: 'grid', grid: 'sheet' }[pref.view] || 'sheet'; pref.viewSet = true; save();
    buildStage();
    toast({ sheet: 'תצוגה: מילים ואקורדים', lane: 'תצוגה: טיימליין', grid: 'תצוגה: תיבות' }[pref.view]);
  });
  $('#pl-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b || b.dataset.mode === pref.mode) return; setMode(b.dataset.mode); });
  sc.el.querySelector('[data-fav]').addEventListener('click', (e) => {
    const on = toggleFav(song.k); const b = e.currentTarget; b.innerHTML = icon('star', on ? 'fill' : ''); b.style.color = on ? 'var(--accent)' : 'inherit';
    toast(on ? 'נשמר במועדפים' : 'הוסר מהמועדפים');
  });
  sc.el.querySelector('[data-more]').addEventListener('click', openMore);
  const onKey = (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('#pl-play').click(); }
    if (e.code === 'ArrowLeft') seek(curTime() + 5);
    if (e.code === 'ArrowRight') seek(curTime() - 5);
  };
  document.addEventListener('keydown', onKey);
  const onVis = () => { if (document.visibilityState === 'hidden' && pref.mode === 'synth') pause(); };
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------ YouTube (original recording)
  function setMode(m) {
    pause();
    if (S.ytc && S.ytc.playing) S.ytc.pause();
    pref.mode = m; save();
    setLabel();
    if (m === 'yt') showYT(); else { $('#pl-yt').hidden = true; if (S.ytc) S.ytc.pause(); }
    setPlayIcon(); frame(true);
    if (m === 'yt' && !S.lyricsTried) loadLyrics();
  }
  async function showYT() {
    const box = $('#pl-yt');
    box.hidden = false;
    if (window.self !== window.top) { box.innerHTML = `<div class="banner warn">${icon('info')}<span>ניגון השיר המקורי זמין באפליקציה המותקנת.</span></div>`; return; }
    if (!pref.yt) {
      box.innerHTML = `<div class="banner">${icon('search')}<span>מחפש את השיר ביוטיוב…</span></div>`;
      const r = await findVideos(song, { duration: model.timed ? model.dur : 0 });
      if (S.closed) return;
      if (r.list.length) { S.ytCands = r.list; S.ytIdx = 0; pref.yt = r.list[0][0]; pref.ytAuto = true; if (pref.off == null) pref.off = 0; save(); }
      else { manualYT(box, r.src); return; }
    }
    if (!S.ytCands.length) { const r = await findVideos(song, { duration: model.timed ? model.dur : 0 }).catch(() => ({ list: [] })); S.ytCands = r.list || []; S.ytIdx = Math.max(0, S.ytCands.findIndex((x) => x[0] === pref.yt)); }
    const auto = pref.ytAuto && model.timed;
    box.innerHTML = `<div class="yt-wrap${pref.ytMini ? ' mini' : ''}"><div id="yt-el"></div></div>
      <div class="ytbar"><span class="pill ${model.timed ? 'sync' : ''}">${model.timed ? (auto && !pref.offSet ? 'סנכרון אוטומטי' : 'מסונכרן') : 'סנכרון ידני'}</span>
        <button class="lnk" data-sync>${icon('sync')} כוונון</button><button class="lnk" data-other>סרטון אחר</button><button class="lnk" data-mini>${pref.ytMini ? 'הגדלה' : 'הקטנה'}</button></div>
      <div class="syncbar" hidden><div class="r"><span>היסט: <span class="off" id="yt-off">${(pref.off || 0).toFixed(2)}s</span></span>
        <span style="display:flex;gap:4px"><button class="s" data-off="-0.5">−0.5</button><button class="s" data-off="-0.1">−0.1</button><button class="s" data-off="0.1">+0.1</button><button class="s" data-off="0.5">+0.5</button></span></div>
        <div class="r"><button class="s tap" data-tapfirst>האקורד הראשון מתחיל עכשיו</button>${model.timed ? '' : '<button class="s" data-taptempo>טאפ לקצב</button>'}</div>
        <p class="note" style="margin:0">הקשיבו לשיר: אם האקורדים מקדימים — ‎+, אם מאחרים — ‎−.</p></div>`;
    box.onclick = onYtClick;
    try {
      await loadYT();
      if (S.closed) return;
      if (S.ytc) S.ytc.destroy();
      S.ytReady = false;
      S.ytc = new YTClock(box.querySelector('#yt-el'), pref.yt, {
        onReady: () => { S.ytReady = true; if (pref.tempo !== 1) pref.tempo = S.ytc.setRate(pref.tempo); setLabel(); if (pref.lastT > 5 && pref.lastT < model.dur - 5) S.ytc.seek(pref.lastT + (pref.off || 0)); },
        onState: (s) => { setPlayIcon(); if (s === 1) { S.lastTick = performance.now(); loop(); } else frame(true); },
        onError: () => {
          if (S.ytIdx + 1 < S.ytCands.length) { S.ytIdx++; pref.yt = S.ytCands[S.ytIdx][0]; save(); showYT(); toast('הסרטון לא זמין — מנסה סרטון אחר'); }
          else { const w = box.querySelector('.yt-wrap'); if (w) w.innerHTML = '<div class="empty" style="color:#ddd;padding:16px">הסרטון לא מאפשר ניגון מחוץ ליוטיוב. בחרו ״סרטון אחר״.</div>'; }
        },
      });
    } catch (e) { const w = box.querySelector('.yt-wrap'); if (w) w.innerHTML = '<div class="empty" style="color:#ddd">אין חיבור ליוטיוב כרגע.</div>'; }
  }
  function manualYT(box, src) {
    const q = `${song.t} ${song.a || ''}`.trim();
    box.innerHTML = `<div class="syncbar" style="margin-top:0">
      <b>${src === 'offline' ? 'אין חיבור לאינטרנט' : 'לא מצאנו את השיר אוטומטית'}</b>
      <span class="note">חפשו ביוטיוב, העתיקו את הקישור וחזרו להדביק.</span>
      <div class="r"><a class="btn sm" href="${ytSearchUrl(q)}" target="_blank" rel="noopener">${icon('search')} חיפוש ביוטיוב</a>
      <button class="btn sm primary" data-paste>${icon('paste')} הדבקת קישור</button></div>
      <input id="yt-in" placeholder="או הדביקו כאן קישור" dir="ltr" style="height:40px;border-radius:10px;border:1px solid var(--line);background:var(--surface);padding:0 10px"></div>`;
    const inp = box.querySelector('#yt-in');
    const apply = (txt) => { const id = parseYouTubeId(txt); if (!id) { toast('לא זיהינו קישור יוטיוב'); return; } pref.yt = id; pref.ytAuto = false; if (pref.off == null) pref.off = 0; save(); showYT(); };
    inp.addEventListener('change', () => apply(inp.value));
    inp.addEventListener('paste', () => setTimeout(() => apply(inp.value), 30));
    box.querySelector('[data-paste]').addEventListener('click', async () => { try { apply(await navigator.clipboard.readText()); } catch (e) { inp.focus(); toast('הדביקו את הקישור בשדה'); } });
  }
  function onYtClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const box = $('#pl-yt');
    if (b.hasAttribute('data-sync')) { const sb = box.querySelector('.syncbar'); sb.hidden = !sb.hidden; return; }
    if (b.hasAttribute('data-mini')) { pref.ytMini = !pref.ytMini; save(); box.querySelector('.yt-wrap').classList.toggle('mini', pref.ytMini); b.textContent = pref.ytMini ? 'הגדלה' : 'הקטנה'; return; }
    if (b.hasAttribute('data-other')) {
      if (S.ytCands.length > 1) { S.ytIdx = (S.ytIdx + 1) % S.ytCands.length; pref.yt = S.ytCands[S.ytIdx][0]; save(); showYT(); toast(`סרטון ${S.ytIdx + 1} מתוך ${S.ytCands.length}`); }
      else { if (S.ytc) { S.ytc.destroy(); S.ytc = null; } manualYT(box, 'fail'); }
      return;
    }
    if (b.dataset.off) { pref.off = Math.round(((pref.off || 0) + +b.dataset.off) * 100) / 100; pref.offSet = true; }
    else if (b.hasAttribute('data-tapfirst')) {
      if (!S.ytc) return;
      pref.off = Math.round((S.ytc.time() - firstChordT()) * 100) / 100; pref.offSet = true;
      toast('מסונכרן! אפשר לכוונן עוד ב־±0.1');
    } else if (b.hasAttribute('data-taptempo')) {
      const now = performance.now();
      S.taps = S.taps.filter((x) => now - x < 3000); S.taps.push(now);
      if (S.taps.length >= 4) {
        const d = []; for (let k = 1; k < S.taps.length; k++) d.push(S.taps[k] - S.taps[k - 1]);
        d.sort((x, y) => x - y);
        const bpm = Math.round(60000 / d[Math.floor(d.length / 2)] / ((S.ytc && S.ytc.rate) || 1));
        if (bpm > 40 && bpm < 260) { pref.bpm = bpm; save(); rebuildSymbolic(bpm); toast(`קצב: ${bpm} BPM`); }
      } else toast(`המשיכו להקיש בקצב (${S.taps.length}/4)`, 900);
    } else return;
    save();
    const o = box.querySelector('#yt-off'); if (o) o.textContent = `${(pref.off || 0).toFixed(2)}s`;
    frame(true);
  }
  function rebuildSymbolic(bpm) {
    if (model.timed) return;
    const src = { e: ev.map((x) => [x.c, x.beats]), s: model.sections.map((s) => [ev.findIndex((x) => Math.abs(x.t - s.t) < 0.001), s.label]).filter((x) => x[0] >= 0), ly: null };
    const oldSheet = model.sheet && model.sheet.map((l) => ({ ...l, i0: eventAt(l.t0 + 0.001) }));
    const m2 = buildSymbolic(song, src, bpm);
    Object.assign(model, { events: m2.events, beats: m2.beats, downs: m2.downs, sections: m2.sections, dur: m2.dur, bpm: m2.bpm });
    ev = model.events;
    if (oldSheet) model.sheet = oldSheet.map((l) => { const a = ev[l.first ?? l.i0]; const b = ev[(l.first ?? l.i0) + (l.n || 0)]; return { ...l, t0: a ? a.t : 0, t1: b ? b.t : model.dur }; });
    $('#pl-seek').max = Math.ceil(model.dur); $('#pl-d').textContent = fmtTime(model.dur);
    buildStage();
  }

  // ------------------------------------------------------------ synced lyrics for recordings
  async function loadLyrics() {
    S.lyricsTried = true;
    if (!model.timed || song.mine || model.sheet) return;
    const r = await fetchSyncedLyrics({ key: song.k, title: song.t, artist: ['Traditional', 'מסורתי', 'עממי'].includes(song.a) ? '' : song.a, duration: model.dur });
    if (!r || S.closed) return;
    const L = r.lines;
    model.sheet = L.map((l, k) => ({ text: l.text, t0: l.t, t1: k + 1 < L.length ? L[k + 1].t : Math.min(model.dur, l.t + 6) })).filter((l) => l.text || l.t1 - l.t0 > 0);
    model.lyricsSrc = r.src;
    if (pref.view === 'sheet') buildStage();
    toast('נמצאו מילים מסונכרנות');
  }

  // ------------------------------------------------------------ info sheet
  function openMore() {
    const src = SOURCES[song.src] || '';
    const body = h(`<div>
      <div class="rows">
        <div class="row"><span class="grow"><span class="t">מקור האקורדים</span><br><span class="d">${esc(src)}${model.release ? ' · ' + esc(model.release) : ''}</span></span></div>
        ${model.lyricsSrc ? `<div class="row"><span class="grow"><span class="t">מילים</span><br><span class="d">LRCLIB · ${esc(model.lyricsSrc)}</span></span></div>` : ''}
        <div class="row"><span class="grow"><span class="t">סולם · קצב · משקל</span><br><span class="d ltr">${esc(keyName(song.key) || '—')} · ${Math.round(model.bpm)} BPM · ${model.bpb}/4</span></span></div>
        <div class="row"><span class="grow"><span class="t">סגנון</span><br><span class="d">${esc(GENRES[song.g] || '')}${model.style ? ' · ' + esc(model.style) : ''}</span></span></div>
        ${pref.yt ? `<a class="row" href="https://www.youtube.com/watch?v=${esc(pref.yt)}" target="_blank" rel="noopener"><span class="grow"><span class="t">פתיחה ביוטיוב</span></span>${icon('yt').replace('<svg', '<svg style="width:22px;height:22px"')}</a>` : ''}
      </div>
      <div style="display:grid;gap:10px;margin-top:16px">
        <button class="btn block" data-edit>${icon('edit')} ${song.mine ? 'עריכת השיר' : 'שכפול ועריכה כשיר שלי'}</button>
        ${!song.mine ? `<a class="btn ghost block" href="https://www.tab4u.com/resultsSimple?tab=songs&q=${encodeURIComponent(song.t)}" target="_blank" rel="noopener">${icon('search')} חיפוש השיר בטאב4יו (לייבוא עם מילים)</a>` : ''}
      </div>
      <p class="note" style="margin-top:14px">אקורדים ממאגרים פתוחים (CC0 / CC BY 4.0). מילים מסונכרנות נטענות מ־LRCLIB ונשמרות רק במכשיר.</p></div>`);
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-edit')) { shx.close(); sc.close(); setTimeout(() => app.openEditor(song, { model, importMode: !song.mine }), 350); }
    });
    const shx = openSheet({ title: 'פרטי השיר', body });
  }

  // ------------------------------------------------------------ teardown
  function teardown() {
    S.closed = true;
    pause();
    if (S.ytc) { try { S.ytc.pause(); } catch (e) { /* */ } S.ytc.destroy(); }
    clearInterval(S.timer); cancelAnimationFrame(S.raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    releaseWake();
    update((s) => { s.lastSong = { k: song.k, t: Math.round(pref.lastT || 0), at: Date.now() }; });
    const acc = S.listen.on ? accuracy() : null;
    if (S.listen.on) stopMic();
    logPlay(song.k, S.practiced, pref.mode, acc);
    app.refresh();
  }

  setLabel();
  buildStage();
  if (song.curated) toast('מהלך בסיסי שנכתב לתרגול — אפשר לייבא גרסה מלאה מטאב4יו', 3500);
  if (pref.mode === 'yt') { showYT(); loadLyrics(); } else if (model.timed) loadLyrics();
  if (pref.lastT > 8 && pref.lastT < model.dur - 8 && pref.mode === 'synth') {
    const chip = h(`<button class="resume">${icon('play')} להמשיך מ־${fmtTime(pref.lastT)}</button>`);
    stage.append(chip);
    chip.onclick = () => { chip.remove(); seek(pref.lastT); };
    setTimeout(() => chip.remove(), 7000);
  }
  setMix({ guitar: 1, click: 1 });
}
