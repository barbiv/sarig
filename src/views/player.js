// Play-along player: synced chord timeline + built-in backing or original recording (YouTube).
import { loadSong, buildSymbolic, SOURCES, GENRES, defaultBpm } from '../library.js';
import { chordName, transposeCid, simplifyCid, keyName, cidBase } from '../theory.js';
import { voicings, isOpenShape, voicingMidi } from '../chorddb.js';
import { diagramSVG } from '../diagram.js';
import { ensureAudio, audioCtx, strum, pickString, click, muteAll, warmNotes, setMix, setVolume } from '../audio.js';
import { getState, update, songPref, isFav, toggleFav, pushRecent, logPlay, save } from '../store.js';
import { h, esc, icon, openScreen, openSheet, toast, fmtTime } from '../ui.js';
import { loadYT, parseYouTubeId, ytSearchUrl, YTClock } from '../yt.js';
import { app } from '../app.js';

const PPS = 104; // lane pixels per song-second

export async function openPlayer(song) {
  const st = getState();
  const pref = songPref(song.k);
  if (pref.tr == null) pref.tr = 0;
  if (pref.tempo == null) pref.tempo = 1;
  if (pref.simp == null) pref.simp = st.settings.simplify || 0;
  if (!pref.mode) pref.mode = 'synth';
  if (!pref.view) pref.view = st.settings.view || 'lane';
  pushRecent(song.k);

  const favOn = isFav(song.k);
  const sc = openScreen({
    cls: 'player', title: song.t, sub: song.a || '',
    actions: `<button class="iconbtn" data-fav aria-label="מועדף" aria-pressed="${favOn}" style="color:${favOn ? 'var(--accent)' : 'inherit'}">${icon('star', favOn ? 'fill' : '')}</button>
              <button class="iconbtn" data-more aria-label="אפשרויות">${icon('settings')}</button>`,
    onClose: () => teardown(),
  });
  sc.body.innerHTML = '<div class="empty"><b>טוען שיר…</b></div>';

  let model;
  try { model = await loadSong(song); } catch (e) {
    sc.body.innerHTML = `<div class="empty"><b>לא הצלחנו לטעון את השיר</b>בדקו חיבור לאינטרנט (שירים שכבר פתחתם זמינים גם בלי רשת).<br><br><button class="btn primary" data-retry>נסו שוב</button></div>`;
    sc.body.querySelector('[data-retry]').onclick = () => { sc.close(); openPlayer(song); };
    return;
  }
  if (pref.capo == null) pref.capo = model.capoHint || 0;
  save();

  // ------------------------------------------------------------ state
  const S = {
    playing: false, songT0: 0, ctxT0: 0, t: 0, rate: pref.tempo, schedIdx: 0, lastSched: -1, loop: null, raf: 0, timer: 0,
    ytc: null, ytReady: false, practiced: 0, lastTick: 0, curEv: -1, curBar: -1, countUntil: -1, wake: null, taps: [],
  };
  let ev = model.events;
  const firstChordT = () => { const e = ev.find((x) => x.c >= 0); return e ? e.t : 0; };

  const disp = (c) => (c < 0 ? c : simplifyCid(transposeCid(c, pref.tr), pref.simp));
  const shape = (c) => (c < 0 ? c : transposeCid(disp(c), -pref.capo));
  const keyHint = () => (song.key >= 0 ? (((song.key >> 1) + pref.tr) % 12 + 12) % 12 * 2 + (song.key & 1) : -1);
  const nameOf = (c) => chordName(disp(c), keyHint());
  const voiceOf = (c) => {
    const vs = voicings(shape(c));
    if (!vs.length) return null;
    if (pref.capo > 0) { const o = vs.find(isOpenShape); if (o) return o; }
    return vs[0];
  };

  // ------------------------------------------------------------ layout
  sc.body.innerHTML = `
    <div class="modebar"><div class="seg" id="pl-mode"><button data-mode="synth">ליווי מובנה</button><button data-mode="yt">${icon('yt')} השיר המקורי</button></div>
      <button class="iconbtn" id="pl-view" aria-label="החלפת תצוגה">${icon(pref.view === 'grid' ? 'lane' : 'grid')}</button></div>
    <div id="pl-yt" hidden></div>
    <div id="pl-banner"></div>
    <div class="nowbox"><div><div class="now-name" id="pl-now">—</div>
        <div class="now-sub"><div class="beatdots" id="pl-dots"></div><div class="next" id="pl-next"></div></div>
        <div class="now-sub" id="pl-shape"></div></div>
      <div class="now-dg" id="pl-dg"></div></div>
    <div id="pl-stage" style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0"></div>
    <div class="lyricbox" id="pl-ly" hidden><div class="cur"></div><div class="nxt"></div></div>
    <div class="pl-controls">
      <div class="scrub"><span id="pl-t">0:00</span><input type="range" id="pl-seek" min="0" max="${Math.ceil(model.dur)}" step="0.1" value="0" aria-label="מיקום בשיר"><span id="pl-d">${fmtTime(model.dur)}</span></div>
      <div class="transport">
        <button class="tb" id="pl-loop" aria-label="לולאה על הקטע">${icon('loop')}<small>לולאה</small></button>
        <button class="tb" id="pl-restart" aria-label="מההתחלה">${icon('restart')}<small>התחלה</small></button>
        <button class="play" id="pl-play" aria-label="נגן">${icon('play')}</button>
        <button class="tb" id="pl-metro" aria-label="מטרונום" aria-pressed="${!!st.settings.metronome}">${icon('metro')}<small>מטרונום</small></button>
        <button class="tb" id="pl-sound" aria-label="סוג ליווי">${icon('sound')}<small id="pl-sound-l"></small></button>
      </div>
      <div class="qctl" style="margin-top:8px">
        <div class="qc">טמפו <span class="stepper"><button data-q="tempo:-0.05">−</button><output id="q-tempo"></output><button data-q="tempo:0.05">+</button></span></div>
        <div class="qc">קאפו <span class="stepper"><button data-q="capo:-1">−</button><output id="q-capo"></output><button data-q="capo:1">+</button></span></div>
        <div class="qc">טרנספוז <span class="stepper"><button data-q="tr:-1">−</button><output id="q-tr"></output><button data-q="tr:1">+</button></span></div>
        <div class="qc">פישוט <span class="stepper"><button data-q="simp:-1">−</button><output id="q-simp"></output><button data-q="simp:1">+</button></span></div>
        <button class="qc" id="q-bestcapo" style="color:var(--accent);font-weight:600;padding-inline:12px">קאפו מומלץ</button>
      </div>
    </div>`;
  const $ = (s) => sc.body.querySelector(s);
  const stage = $('#pl-stage');

  // ------------------------------------------------------------ banner / info
  function renderBanner() {
    const b = $('#pl-banner');
    const msgs = [];
    if (song.curated) msgs.push(`<div class="banner warn">${icon('info')}<span>מהלך אקורדים בסיסי שנכתב לתרגול, ועשוי להיות שונה מהגרסה המקורית. אפשר לייבא גרסה מדויקת מאתר אקורדים.</span><button data-edit>ייבוא</button></div>`);
    else if (!model.timed && pref.mode === 'yt') msgs.push(`<div class="banner">${icon('info')}<span>לשיר הזה יש תווים בלי תזמון מול ההקלטה. הקישו ״טאפ לקצב״ ו״האקורד הראשון עכשיו״ כדי ליישר את הטיימליין לסרטון.</span></div>`);
    b.innerHTML = msgs.join('');
  }
  $('#pl-banner').addEventListener('click', (e) => { if (e.target.closest('[data-edit]')) { sc.close(); app.openEditor(song, { importMode: true }); } });

  // ------------------------------------------------------------ timeline (lane)
  let laneStrip = null, laneBlocks = [], laneW = 0, loopBand = null;
  function buildLane() {
    stage.innerHTML = '<div class="lane" id="pl-lane"><div class="strip"></div><div class="playhead"></div></div><div class="uc-lbl">האקורדים הבאים</div><div class="upcoming" id="pl-up"></div><div style="flex:1"></div>';
    const lane = stage.querySelector('.lane');
    laneStrip = lane.querySelector('.strip');
    laneW = lane.clientWidth || 360;
    lane.querySelector('.playhead').style.left = `${Math.round(laneW * 0.28)}px`;
    let html = '';
    const secAt = new Map(model.sections.map((s) => [Math.round(s.t * 100), s.label]));
    ev.forEach((e, i) => {
      const x = e.t * PPS, w = Math.max(18, e.d * PPS - 4);
      const sec = secAt.get(Math.round(e.t * 100));
      const small = e.ly ? esc(e.ly) : '';
      html += `<div class="blk${e.c < 0 ? ' nc' : ''}" data-i="${i}" style="left:${x.toFixed(1)}px;width:${w.toFixed(1)}px"><b class="ltr">${e.c < 0 ? '—' : esc(nameOf(e.c))}</b>${small ? `<small>${small}</small>` : ''}</div>`;
      if (sec) html += `<div class="secl" style="left:${x.toFixed(1)}px">${esc(sec)}</div>`;
    });
    for (const s of model.sections) if (!ev.some((e) => Math.abs(e.t - s.t) < 0.01)) html += `<div class="secl" style="left:${(s.t * PPS).toFixed(1)}px">${esc(s.label)}</div>`;
    model.beats.forEach((b, i) => { html += `<i class="tick${model.downs.has(i) ? ' down' : ''}" style="left:${(b * PPS).toFixed(1)}px"></i>`; });
    laneStrip.innerHTML = html;
    laneStrip.style.width = `${Math.ceil(model.dur * PPS + laneW)}px`;
    laneBlocks = [...laneStrip.querySelectorAll('.blk')];
    loopBand = null;
    drawLoop();
    // tap to seek, drag to scrub
    let x0 = null, t0 = 0, moved = false;
    lane.addEventListener('pointerdown', (e) => { x0 = e.clientX; t0 = curTime(); moved = false; lane.setPointerCapture(e.pointerId); });
    lane.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 6) moved = true;
      if (moved && !S.playing) { S.t = Math.max(0, Math.min(model.dur, t0 - dx / PPS)); frame(true); }
    });
    lane.addEventListener('pointerup', (e) => {
      if (x0 == null) return;
      if (!moved) {
        const rect = lane.getBoundingClientRect();
        const t = curTime() + (e.clientX - rect.left - laneW * 0.28) / PPS;
        const i = eventAt(t);
        seek(i >= 0 ? ev[i].t : t);
      } else if (!S.playing) seek(S.t);
      x0 = null;
    });
    curMark = -1;
  }
  // ------------------------------------------------------------ grid view
  let gridCells = [], bars = [];
  function buildBars() {
    bars = [];
    const downs = [...model.downs].sort((a, b) => a - b);
    let starts = downs.map((i) => model.beats[i]).filter((t) => t != null);
    if (!starts.length) { const per = 4; starts = model.beats.filter((_, i) => i % per === 0); }
    if (!starts.length || starts[0] > 0.3) starts.unshift(0);
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i], b = i + 1 < starts.length ? starts[i + 1] : model.dur;
      if (b - a < 0.05) continue;
      const cs = [];
      const tol = model.timed ? 0.15 : 0.001;
      const i0 = eventAt(a + tol);
      if (i0 >= 0) cs.push(i0);
      for (let k = Math.max(0, i0 + 1); k < ev.length && ev[k].t < b - tol; k++) if (ev[k].t >= a) cs.push(k);
      bars.push({ a, b, cs });
    }
  }
  function buildGrid() {
    buildBars();
    const secAt = model.sections.slice();
    let html = '<div class="gridview" id="pl-grid">';
    let row = [];
    const flush = () => { if (row.length) { html += `<div class="gv-row">${row.join('')}</div>`; row = []; } };
    bars.forEach((bar, bi) => {
      while (secAt.length && secAt[0].t <= bar.a + 0.05) { flush(); html += `<div class="gv-sec">${esc(secAt.shift().label)}</div>`; }
      const names = bar.cs.map((k) => (ev[k].c < 0 ? '—' : nameOf(ev[k].c)));
      const uniq = names.filter((n, i) => i === 0 || n !== names[i - 1]);
      const ly = bar.cs.map((k) => ev[k].ly).filter(Boolean)[0] || '';
      row.push(`<div class="gv-cell${uniq.length > 2 ? ' n3' : uniq.length > 1 ? ' n2' : ''}" data-b="${bi}">${uniq.slice(0, 3).map((n) => `<b>${esc(n)}</b>`).join('') || '<b style="color:var(--dim)">%</b>'}${ly ? `<span class="ly">${esc(ly)}</span>` : ''}<i class="fillbar" style="width:0"></i></div>`);
      if (row.length === 4) flush();
    });
    flush();
    html += '</div>';
    stage.innerHTML = html;
    gridCells = [...stage.querySelectorAll('.gv-cell')];
    stage.querySelector('#pl-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-b]'); if (c) seek(bars[+c.dataset.b].a); });
    S.curBar = -1;
  }
  function buildStage() {
    if (pref.view === 'grid') buildGrid(); else buildLane();
    $('#pl-view').innerHTML = icon(pref.view === 'grid' ? 'lane' : 'grid');
    frame(true);
  }

  // ------------------------------------------------------------ time helpers
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

  // ------------------------------------------------------------ synth scheduler
  const STYLES = { strum: 'סטרום', arp: 'פריטה', hit: 'אקורד לתיבה', off: 'ללא' };
  function scheduleTick() {
    if (!S.playing || pref.mode !== 'synth') return;
    const ctx = audioCtx();
    const now = S.songT0 + (ctx.currentTime - S.ctxT0) * S.rate;
    const horizon = now + 0.15 * S.rate;
    const style = getState().settings.sound;
    const metro = getState().settings.metronome;
    // count-in clicks
    if (S.countBeats && S.countBeats.length) {
      while (S.countBeats.length && S.countBeats[0].t < horizon) {
        const cb = S.countBeats.shift();
        click(S.ctxT0 + (cb.t - S.songT0) / S.rate, cb.accent, getState().settings.clickVol ?? 0.7);
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
      if (metro) click(at(bt), isDown, getState().settings.clickVol ?? 0.7);
      const posInBar = (() => { let k = 0, j = bi; while (j > 0 && !model.downs.has(j)) { j--; k++; } return k; })();
      const chordAtT = (t) => { const i = eventAt(t + 0.06); return i >= 0 ? ev[i].c : -1; };
      const c1 = chordAtT(bt), c2 = chordAtT(half);
      const v1 = c1 >= 0 ? voiceOf(c1) : null, v2 = c2 >= 0 ? voiceOf(c2) : null;
      const capo = pref.capo;
      if (style === 'strum') {
        // D - D U - U D U  (4/4)  |  D - D U D U (3/4)
        const pat = model.bpb === 3 ? [['D', 0], ['D', 1], ['U', 1.5], ['D', 2], ['U', 2.5]] : [['D', 0], ['D', 1], ['U', 1.5], ['U', 2.5], ['D', 3], ['U', 3.5]];
        for (const [dir, pos] of pat) {
          if (Math.floor(pos) !== posInBar % (model.bpb || 4)) continue;
          const tt = pos % 1 ? half : bt;
          const v = pos % 1 ? v2 : v1;
          if (v && tt < loopEnd) strum(v, at(tt), { dir, vel: isDown && dir === 'D' ? 0.95 : 0.78, capo });
        }
      } else if (style === 'arp') {
        if (v1) {
          const bass = v1.f.findIndex((x) => x >= 0);
          const top = [2, 3, 4, 5].filter((s) => v1.f[s] >= 0);
          const seq = [[bass, 0], [top[0], 0.5]];
          const beatN = posInBar % (model.bpb || 4);
          const seqs = [[bass, top[1] ?? top[0]], [top[2] ?? top[0], top[1] ?? top[0]], [top[0], top[1] ?? top[0]], [top[2] ?? top[0], top[1] ?? top[0]]];
          const pair = seqs[beatN] || seq.map((x) => x[0]);
          if (pair[0] != null && pair[0] >= 0) pickString(v1, pair[0], at(bt), { vel: beatN === 0 ? 0.85 : 0.6, capo });
          const vv = v2 || v1;
          if (pair[1] != null && pair[1] >= 0 && half < loopEnd) pickString(vv, pair[1], at(half), { vel: 0.55, capo });
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
    // warm the buffers for upcoming chords
    const mids = new Set();
    ev.slice(Math.max(0, eventAt(S.t)), eventAt(S.t) + 12).forEach((e) => { if (e.c >= 0) { const v = voiceOf(e.c); if (v) voicingMidi(v, pref.capo).forEach((m) => mids.add(m)); } });
    warmNotes([...mids]);
    if (S.t >= model.dur - 0.2) S.t = S.loop ? S.loop.a : 0;
    let start = S.t;
    S.countBeats = [];
    const bi = Math.max(0, beatAt(start + 0.001));
    const per = (model.beats[bi + 1] ?? (model.beats[bi] + 0.6)) - (model.beats[bi] ?? 0) || 60 / (model.bpm || 100);
    const lead = getState().settings.countIn ? (model.bpb || 4) : 0;
    if (lead) {
      for (let k = lead; k >= 1; k--) S.countBeats.push({ t: start - k * per, accent: k === lead });
      S.countUntil = start;
    } else S.countUntil = -1;
    S.rate = pref.tempo;
    S.songT0 = start - lead * per;
    S.ctxT0 = ctx.currentTime + 0.08;
    S.schedIdx = Math.max(0, beatAt(start - 0.001) + (model.beats[beatAt(start - 0.001)] < start - 0.001 ? 1 : 0));
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
    if (pref.mode === 'yt') { S.ytc && S.ytc.seek(t + (pref.off || 0)); S.t = t; frame(true); return; }
    const was = S.playing;
    if (was) { S.playing = false; clearInterval(S.timer); muteAll(); }
    S.t = t;
    if (was) { const ci = getState().settings.countIn; getState().settings.countIn = false; play(); getState().settings.countIn = ci; }
    else frame(true);
  }
  function retime() { // tempo change while playing
    if (pref.mode === 'yt') { if (S.ytc) { const r = S.ytc.setRate(pref.tempo); if (Math.abs(r - pref.tempo) > 0.01) { pref.tempo = r; } } return; }
    if (!S.playing) return;
    const t = curTime();
    const ctx = audioCtx();
    S.songT0 = t; S.ctxT0 = ctx.currentTime; S.rate = pref.tempo;
    S.schedIdx = Math.max(0, beatAt(t) + 1);
  }
  function setPlayIcon() {
    const playing = pref.mode === 'yt' ? (S.ytc && S.ytc.playing) : S.playing;
    $('#pl-play').innerHTML = icon(playing ? 'pause' : 'play');
    $('#pl-play').setAttribute('aria-label', playing ? 'השהה' : 'נגן');
  }

  // ------------------------------------------------------------ frame render
  let curMark = -1, lastSeekUpd = 0;
  function loop() {
    cancelAnimationFrame(S.raf);
    const step = () => {
      frame(false);
      const playing = pref.mode === 'yt' ? (S.ytc && S.ytc.playing) : S.playing;
      if (playing) S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }
  function frame(force) {
    let t = curTime();
    const playing = pref.mode === 'yt' ? (S.ytc && S.ytc.playing) : S.playing;
    if (playing) {
      const now = performance.now();
      if (t >= 0) S.practiced += Math.min(0.25, (now - S.lastTick) / 1000);
      S.lastTick = now;
      if (S.loop && t >= S.loop.b) { seek(S.loop.a); return; }
      if (pref.mode === 'synth' && t >= model.dur + 0.3) { pause(); S.t = 0; frame(true); return; }
    }
    // count-in overlay
    const counting = pref.mode === 'synth' && S.playing && S.countUntil >= 0 && t < S.countUntil;
    let ci = stage.querySelector('.countin');
    if (counting) {
      const per = (S.countUntil - S.songT0) / (model.bpb || 4);
      const n = Math.ceil((S.countUntil - t) / per);
      if (!ci) { ci = h('<div class="countin"></div>'); stage.append(ci); }
      ci.textContent = n;
    } else if (ci) ci.remove();
    const tt = Math.max(0, t);
    if (!playing) S.t = tt;
    const i = eventAt(tt);
    // lane
    if (laneStrip && pref.view !== 'grid') {
      laneStrip.style.transform = `translate3d(${(laneW * 0.28 - tt * PPS).toFixed(1)}px,0,0)`;
      if (i !== curMark || force) {
        if (curMark >= 0 && laneBlocks[curMark]) laneBlocks[curMark].classList.remove('now');
        laneBlocks.forEach((b, k) => { if (k < i) b.classList.add('past'); else b.classList.remove('past'); });
        if (i >= 0 && laneBlocks[i]) laneBlocks[i].classList.add('now');
        curMark = i;
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
          const g = stage.querySelector('#pl-grid');
          const c = gridCells[bi];
          const top = c.offsetTop - g.offsetTop;
          if (top < g.scrollTop + 40 || top > g.scrollTop + g.clientHeight - 90) g.scrollTo({ top: Math.max(0, top - 60), behavior: force ? 'auto' : 'smooth' });
        }
        S.curBar = bi;
      }
      if (bi >= 0 && gridCells[bi]) gridCells[bi].querySelector('.fillbar').style.width = `${(100 * (tt - bars[bi].a) / (bars[bi].b - bars[bi].a)).toFixed(1)}%`;
    }
    // now box
    if (i !== S.curEv || force) {
      S.curEv = i;
      const e = ev[i];
      const nowEl = $('#pl-now');
      if (!e || e.c < 0) { nowEl.textContent = i < 0 ? (ev[0] ? nameOf(ev.find((x) => x.c >= 0)?.c ?? -1) : '—') : 'N.C.'; nowEl.classList.toggle('nc', !(i < 0)); }
      else { nowEl.textContent = nameOf(e.c); nowEl.classList.remove('nc'); }
      nowEl.classList.toggle('long', nowEl.textContent.length > 4);
      const up = stage.querySelector('#pl-up');
      if (up) {
        const seen = []; let k = Math.max(0, i) + (i >= 0 ? 1 : 0);
        const curC = e && e.c >= 0 ? e.c : -9;
        let last = curC;
        while (k < ev.length && seen.length < 4) { const c = ev[k].c; if (c >= 0 && c !== last) { seen.push(c); last = c; } k++; }
        up.innerHTML = seen.map((c) => `<div class="uc"><b>${esc(nameOf(c))}</b>${diagramSVG(voiceOf(c), { w: 72, capo: pref.capo, compact: true, lefty: getState().settings.lefty })}</div>`).join('');
      }
      const showC = e && e.c >= 0 ? e.c : (i < 0 ? (ev.find((x) => x.c >= 0)?.c ?? -1) : -1);
      $('#pl-dg').innerHTML = showC >= 0 && getState().settings.diagrams !== false ? diagramSVG(voiceOf(showC), { w: 118, capo: pref.capo, lefty: getState().settings.lefty }) : '';
      const sh = showC >= 0 && pref.capo > 0 ? `צורת <b class="chord ltr" style="font-size:17px">${esc(chordName(shape(showC)))}</b> עם קאפו ${pref.capo}` : '';
      $('#pl-shape').innerHTML = sh;
      let n = i + 1; while (n < ev.length && ev[n].c < 0) n++;
      $('#pl-next').innerHTML = n < ev.length ? `הבא <b>${esc(nameOf(ev[n].c))}</b>` : '';
      // lyrics
      const lyEl = $('#pl-ly');
      if (model.hasLyrics) {
        let li = i; while (li >= 0 && !ev[li].ly) li--;
        let ln = i + 1; while (ln < ev.length && !ev[ln].ly) ln++;
        lyEl.querySelector('.cur').textContent = li >= 0 ? ev[li].ly : '';
        lyEl.querySelector('.nxt').textContent = ln < ev.length ? ev[ln].ly : '';
      }
    }
    // beat dots
    const bi = beatAt(tt);
    let pos = 0; { let j = bi; while (j > 0 && !model.downs.has(j)) { j--; pos++; } }
    const nb = model.bpb || 4;
    const dots = $('#pl-dots');
    if (dots.childElementCount !== nb) dots.innerHTML = Array.from({ length: nb }, (_, k) => `<i class="${k === 0 ? 'down' : ''}"></i>`).join('');
    [...dots.children].forEach((d, k) => d.classList.toggle('on', (playing || force) && bi >= 0 && k === pos % nb));
    // time + seek bar
    const now = performance.now();
    if (force || now - lastSeekUpd > 250) {
      lastSeekUpd = now;
      $('#pl-t').textContent = fmtTime(tt);
      const sk = $('#pl-seek'); if (!sk.matches(':active')) sk.value = tt.toFixed(1);
    }
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
    // loop the current section, or 4 bars around the playhead
    const secs = model.sections;
    let a = 0, b = model.dur;
    const si = secs.findIndex((s, k) => s.t <= t + 0.01 && (k + 1 >= secs.length || secs[k + 1].t > t));
    if (si >= 0) { a = secs[si].t; b = si + 1 < secs.length ? secs[si + 1].t : model.dur; }
    else {
      buildBars();
      const bi = Math.max(0, bars.findIndex((x) => t >= x.a && t < x.b));
      a = bars[bi] ? bars[bi].a : 0; b = bars[Math.min(bars.length - 1, bi + 3)] ? bars[Math.min(bars.length - 1, bi + 3)].b : model.dur;
    }
    S.loop = { a, b };
    $('#pl-loop').setAttribute('aria-pressed', 'true');
    drawLoop();
    toast(`לולאה: ${fmtTime(a)}–${fmtTime(b)}`);
    if (t < a || t > b) seek(a);
  }

  // ------------------------------------------------------------ controls
  function renderQ() {
    $('#q-tempo').textContent = `${Math.round(pref.tempo * 100)}%`;
    $('#q-capo').textContent = pref.capo;
    $('#q-tr').textContent = pref.tr > 0 ? `+${pref.tr}` : pref.tr;
    $('#q-simp').textContent = ['מלא', 'בינוני', 'בסיסי'][pref.simp];
    $('#pl-sound-l').textContent = STYLES[getState().settings.sound] || 'סטרום';
    $('#pl-metro').setAttribute('aria-pressed', String(!!getState().settings.metronome));
    sc.body.querySelectorAll('#pl-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === pref.mode)));
  }
  function relabel() {
    laneBlocks.forEach((b, k) => { const e = ev[k]; if (e && e.c >= 0) b.querySelector('b').textContent = nameOf(e.c); });
    if (pref.view === 'grid') buildGrid();
    S.curEv = -2; frame(true);
  }
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
  sc.body.querySelector('.qctl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (e.target.closest('#q-bestcapo')) { const c = bestCapo(); pref.capo = c; save(); renderQ(); relabel(); toast(c ? `קאפו ${c} — הכי הרבה אקורדים פתוחים` : 'בלי קאפו זה כבר הכי נוח'); return; }
    if (!b) return;
    const [k, dv] = b.dataset.q.split(':');
    if (k === 'tempo') { pref.tempo = Math.round(Math.max(0.4, Math.min(1.6, pref.tempo + +dv)) * 100) / 100; retime(); }
    else if (k === 'capo') pref.capo = Math.max(0, Math.min(9, pref.capo + +dv));
    else if (k === 'tr') { pref.tr = Math.max(-11, Math.min(11, pref.tr + +dv)); }
    else if (k === 'simp') pref.simp = Math.max(0, Math.min(2, pref.simp + +dv));
    save(); renderQ();
    if (k !== 'tempo') relabel();
  });
  $('#pl-play').addEventListener('click', () => { const playing = pref.mode === 'yt' ? (S.ytc && S.ytc.playing) : S.playing; if (playing) pause(); else play(); });
  $('#pl-restart').addEventListener('click', () => seek(S.loop ? S.loop.a : 0));
  $('#pl-loop').addEventListener('click', toggleLoop);
  $('#pl-metro').addEventListener('click', () => { update((s) => { s.settings.metronome = !s.settings.metronome; }); renderQ(); });
  $('#pl-sound').addEventListener('click', () => {
    const order = ['strum', 'arp', 'hit', 'off'];
    update((s) => { s.settings.sound = order[(order.indexOf(s.settings.sound) + 1) % order.length]; });
    muteAll(); renderQ(); toast('ליווי: ' + STYLES[getState().settings.sound]);
  });
  $('#pl-seek').addEventListener('input', (e) => { S.t = +e.target.value; if (!S.playing && pref.mode === 'synth') frame(true); });
  $('#pl-seek').addEventListener('change', (e) => seek(+e.target.value));
  $('#pl-view').addEventListener('click', () => { pref.view = pref.view === 'grid' ? 'lane' : 'grid'; update((s) => { s.settings.view = pref.view; }); buildStage(); });
  $('#pl-mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b || b.dataset.mode === pref.mode) return; setMode(b.dataset.mode); });
  sc.el.querySelector('[data-fav]').addEventListener('click', (e) => {
    const on = toggleFav(song.k); const b = e.currentTarget; b.innerHTML = icon('star', on ? 'fill' : ''); b.style.color = on ? 'var(--accent)' : 'inherit';
    toast(on ? 'נשמר במועדפים' : 'הוסר מהמועדפים');
  });
  sc.el.querySelector('[data-more]').addEventListener('click', openMore);
  const onKey = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#pl-play').click(); } };
  document.addEventListener('keydown', onKey);

  // ------------------------------------------------------------ YouTube mode
  function setMode(m) {
    pause();
    if (S.ytc && S.ytc.playing) S.ytc.pause();
    pref.mode = m; save();
    renderQ(); renderBanner();
    if (m === 'yt') showYT(); else { $('#pl-yt').hidden = true; if (S.ytc) S.ytc.pause(); }
    setPlayIcon(); frame(true);
  }
  function showYT() {
    const box = $('#pl-yt');
    box.hidden = false;
    if (window.self !== window.top) {
      box.innerHTML = '<div class="banner warn">' + icon('info') + '<span>ניגון השיר המקורי מיוטיוב זמין באפליקציה המותקנת (לא בתצוגה המקדימה הזו).</span></div>';
      return;
    }
    if (!pref.yt) {
      const q = `${song.t} ${song.a || ''}`.trim();
      box.innerHTML = `<div class="syncbar" style="margin-top:0">
        <b>חברו את השיר המקורי מיוטיוב</b>
        <span class="note">1. פתחו חיפוש ביוטיוב · 2. בחרו סרטון (עדיף גרסת אודיו רשמית) והעתיקו את הקישור · 3. חזרו והדביקו.</span>
        <div class="r"><a class="btn sm" href="${ytSearchUrl(q + (model.timed ? ' official audio' : ''))}" target="_blank" rel="noopener">${icon('search')} חיפוש ביוטיוב</a>
        <button class="btn sm primary" data-paste>${icon('paste')} הדבקת קישור</button></div>
        <input id="yt-in" placeholder="או הקלידו/הדביקו כאן קישור" dir="ltr" style="height:40px;border-radius:10px;border:1px solid var(--line);background:var(--surface);padding:0 10px">
      </div>`;
      const inp = box.querySelector('#yt-in');
      const apply = (txt) => {
        const id = parseYouTubeId(txt);
        if (!id) { toast('לא זיהינו קישור יוטיוב'); return; }
        pref.yt = id; if (pref.off == null) pref.off = 0; save(); showYT();
      };
      inp.addEventListener('change', () => apply(inp.value));
      inp.addEventListener('paste', (e) => { setTimeout(() => apply(inp.value), 30); });
      box.querySelector('[data-paste]').addEventListener('click', async () => {
        try { const t = await navigator.clipboard.readText(); apply(t); } catch (e) { inp.focus(); toast('הדביקו את הקישור בשדה'); }
      });
      return;
    }
    box.innerHTML = `<div class="yt-wrap"><div id="yt-el"></div></div>
      <div class="syncbar"><div class="r"><span>סנכרון: <span class="off" id="yt-off">${(pref.off || 0).toFixed(2)}s</span></span>
        <span style="display:flex;gap:4px"><button class="s" data-off="-0.5">−0.5</button><button class="s" data-off="-0.1">−0.1</button><button class="s" data-off="0.1">+0.1</button><button class="s" data-off="0.5">+0.5</button></span></div>
        <div class="r"><button class="s tap" data-tapfirst>האקורד הראשון מתחיל עכשיו</button>${model.timed ? '' : '<button class="s" data-taptempo>טאפ לקצב</button>'}<button class="s" data-unlink>החלפת סרטון</button></div></div>`;
    box.addEventListener('click', onSyncClick);
    loadYT().then(() => {
      if (S.ytc) S.ytc.destroy();
      S.ytReady = false;
      S.ytc = new YTClock(box.querySelector('#yt-el'), pref.yt, {
        onReady: () => { S.ytReady = true; if (pref.tempo !== 1) pref.tempo = S.ytc.setRate(pref.tempo); renderQ(); },
        onState: (s) => { setPlayIcon(); if (s === 1) { S.lastTick = performance.now(); loop(); } else frame(true); },
        onError: (code) => {
          box.querySelector('.yt-wrap').innerHTML = `<div class="empty" style="color:#ddd;padding:20px">הסרטון לא מאפשר ניגון מחוץ ליוטיוב (${code}). נסו סרטון אחר — למשל גרסת ״Official Audio״ או ״Lyrics״.</div>`;
        },
      });
    }).catch(() => { box.querySelector('.yt-wrap').innerHTML = '<div class="empty" style="color:#ddd">אין חיבור ליוטיוב כרגע.</div>'; });
  }
  function onSyncClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.off) { pref.off = Math.round(((pref.off || 0) + +b.dataset.off) * 100) / 100; }
    else if (b.hasAttribute('data-tapfirst')) {
      if (!S.ytc) return;
      pref.off = Math.round((S.ytc.time() - firstChordT()) * 100) / 100;
      toast('מסונכרן! אפשר לכוונן עוד בעזרת ±0.1');
    } else if (b.hasAttribute('data-taptempo')) {
      const now = performance.now();
      S.taps = S.taps.filter((x) => now - x < 3000); S.taps.push(now);
      if (S.taps.length >= 4) {
        const d = []; for (let k = 1; k < S.taps.length; k++) d.push(S.taps[k] - S.taps[k - 1]);
        d.sort((a, c) => a - c);
        const bpm = Math.round(60000 / d[Math.floor(d.length / 2)] / ((S.ytc && S.ytc.rate) || 1));
        if (bpm > 40 && bpm < 260) {
          pref.bpm = bpm; save();
          rebuildSymbolic(bpm);
          toast(`קצב: ${bpm} BPM`);
        }
      } else toast(`המשיכו להקיש בקצב (${S.taps.length}/4)`, 900);
    } else if (b.hasAttribute('data-unlink')) {
      if (S.ytc) { S.ytc.destroy(); S.ytc = null; }
      pref.yt = null; save(); showYT(); return;
    } else return;
    save();
    const o = sc.body.querySelector('#yt-off'); if (o) o.textContent = `${(pref.off || 0).toFixed(2)}s`;
    frame(true);
  }
  function rebuildSymbolic(bpm) {
    if (model.timed) return;
    const src = { e: ev.map((x) => [x.c, x.beats]), s: [], ly: ev.some((x) => x.ly) ? ev.map((x) => x.ly || '') : null };
    const secIdx = model.sections.map((s) => [ev.findIndex((x) => Math.abs(x.t - s.t) < 0.001), s.label]).filter((x) => x[0] >= 0);
    src.s = secIdx;
    const m2 = buildSymbolic(song, src, bpm);
    m2.sections = m2.sections.map((s) => ({ ...s, label: s.label }));
    Object.assign(model, m2);
    ev = model.events;
    $('#pl-seek').max = Math.ceil(model.dur); $('#pl-d').textContent = fmtTime(model.dur);
    buildStage();
  }

  // ------------------------------------------------------------ more menu
  function openMore() {
    const src = SOURCES[song.src] || '';
    const body = h(`<div>
      <div class="rows">
        <div class="row"><span class="grow"><span class="t">מקור הנתונים</span><br><span class="d">${esc(src)}${model.release ? ' · ' + esc(model.release) : ''}</span></span></div>
        <div class="row"><span class="grow"><span class="t">סולם · קצב · משקל</span><br><span class="d ltr">${esc(keyName(song.key) || '—')} · ${Math.round(model.bpm)} BPM · ${model.bpb}/4</span></span></div>
        <div class="row"><span class="grow"><span class="t">סגנון</span><br><span class="d">${esc(GENRES[song.g] || '')}${model.style ? ' · ' + esc(model.style) : ''}</span></span></div>
      </div>
      <div class="section-t">הגדרות ליווי</div>
      <div class="rows">
        <div class="row"><span class="grow"><span class="t">ספירה לפני התחלה</span></span>${'<label class="toggle"><input type="checkbox" id="mo-count" ' + (getState().settings.countIn ? 'checked' : '') + '><span></span></label>'}</div>
        <div class="row"><span class="grow"><span class="t">דיאגרמת אקורד</span></span>${'<label class="toggle"><input type="checkbox" id="mo-dg" ' + (getState().settings.diagrams !== false ? 'checked' : '') + '><span></span></label>'}</div>
        <div class="row" style="display:grid;gap:4px"><span class="t">עוצמת גיטרה</span><input type="range" id="mo-vol" min="0" max="1" step="0.05" value="${getState().settings.volume ?? 0.85}"></div>
        <div class="row" style="display:grid;gap:4px"><span class="t">עוצמת מטרונום</span><input type="range" id="mo-cvol" min="0" max="1" step="0.05" value="${getState().settings.clickVol ?? 0.7}"></div>
      </div>
      ${!model.timed ? `<div class="section-t">קצב בסיס</div><div style="display:flex;align-items:center;gap:10px"><span class="stepper"><button data-bpm="-5">−</button><output id="mo-bpm">${Math.round(model.bpm)}</output><button data-bpm="5">+</button></span><span class="note">BPM · נשמר לשיר הזה</span></div>` : ''}
      <div style="display:grid;gap:10px;margin-top:18px">
        <button class="btn block" data-edit>${icon('edit')} ${song.mine ? 'עריכת השיר' : 'שכפול ועריכה כשיר שלי'}</button>
        <button class="btn ghost block" data-reset>איפוס טרנספוז, קאפו וטמפו</button>
      </div>
      <p class="note" style="margin-top:14px">הנתונים מבוססים על מאגרים פתוחים (CC0 / CC BY 4.0). ללא מילות שירים — אפשר להוסיף מילים לשירים שלכם בייבוא.</p></div>`);
    body.addEventListener('change', (e) => {
      if (e.target.id === 'mo-count') update((s) => { s.settings.countIn = e.target.checked; });
      if (e.target.id === 'mo-dg') { update((s) => { s.settings.diagrams = e.target.checked; }); S.curEv = -2; frame(true); }
    });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'mo-vol') { update((s) => { s.settings.volume = +e.target.value; }); setVolume(+e.target.value); }
      if (e.target.id === 'mo-cvol') update((s) => { s.settings.clickVol = +e.target.value; });
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.bpm) {
        const nb = Math.max(40, Math.min(260, Math.round(model.bpm) + +b.dataset.bpm));
        pref.bpm = nb; save(); pause(); rebuildSymbolic(nb); body.querySelector('#mo-bpm').textContent = nb;
      } else if (b.hasAttribute('data-edit')) { sh.close(); sc.close(); app.openEditor(song, { model }); }
      else if (b.hasAttribute('data-reset')) { pref.tr = 0; pref.capo = 0; pref.tempo = 1; pref.simp = 0; save(); renderQ(); relabel(); retime(); toast('אופס'); }
    });
    const sh = openSheet({ title: 'פרטי השיר', body });
  }

  // ------------------------------------------------------------ teardown
  function teardown() {
    pause();
    if (S.ytc) { try { S.ytc.pause(); } catch (e) { /* */ } S.ytc.destroy(); }
    clearInterval(S.timer); cancelAnimationFrame(S.raf);
    document.removeEventListener('keydown', onKey);
    releaseWake();
    logPlay(song.k, S.practiced, pref.mode);
    app.refresh();
  }

  model.hasLyrics = ev.some((e) => e.ly);
  if (model.hasLyrics) $('#pl-ly').hidden = false;
  renderQ(); renderBanner();
  buildStage();
  if (pref.mode === 'yt') showYT();
  setMix({ guitar: 1, click: 1 });
}
