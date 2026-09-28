// Add / edit your own songs: paste a chord sheet or write a progression.
import { GENRES, parseSheet, sheetLinesFor, mergeMine, mySongMeta, SONGS } from '../library.js';
import { fetchSyncedLyrics, alignSheet } from '../lyrics.js';
import { parseChordSymbol, chordName } from '../theory.js';
import { getState, update, save } from '../store.js';
import { h, esc, icon, openScreen, toast } from '../ui.js';
import { app } from '../app.js';

export function parseProgression(text, bpb = 4) {
  const events = [], sections = [];
  const errors = [];
  for (const raw of text.split('\n')) {
    let ln = raw.trim();
    if (!ln || ln.startsWith('//')) continue;
    let lab = null;
    const m = /^([^:|\[\]]{1,24}):\s*(.*)$/.exec(ln);
    if (m && !parseChordSymbol(m[1].trim())) { lab = m[1].trim(); ln = m[2]; }
    let rep = 1;
    const rm = /\s+x(\d+)\s*$/i.exec(ln);
    if (rm) { rep = +rm[1]; ln = ln.slice(0, rm.index); }
    const bars = [];
    for (const tk of ln.match(/\[[^\]]*\]|\S+/g) || []) {
      if (tk === '|') continue;
      if (tk.startsWith('[')) {
        const inner = tk.slice(1, -1).trim().split(/\s+/).filter(Boolean);
        for (const c of inner) { const [n, b] = c.split(':'); bars.push([n, b ? +b : bpb / inner.length]); }
      } else if (tk.includes('*')) { const [n, k] = tk.split('*'); bars.push([n, bpb * +k]); }
      else if (/:\d/.test(tk)) { const [n, b] = tk.split(':'); bars.push([n, +b]); }
      else bars.push([tk.replace(/^\||\|$/g, ''), bpb]);
    }
    if (lab) sections.push([events.length, lab]);
    for (let r = 0; r < rep; r++) {
      for (const [n, b] of bars) {
        if (!n) continue;
        if (['N', 'NC', 'N.C.', '-', '%'].includes(n)) { events.push([-1, b]); continue; }
        const c = parseChordSymbol(n);
        if (c == null) { if (!errors.includes(n)) errors.push(n); continue; }
        events.push([c, b]);
      }
    }
  }
  return { events, sections, errors };
}
export function toProgression(events, sections, bpb = 4) {
  const secAt = new Map(sections.map(([i, l]) => [i, l]));
  const lines = [];
  let cur = [], curLab = null;
  const flush = () => { if (cur.length) lines.push((curLab ? curLab + ': ' : '') + cur.join(' ')); cur = []; curLab = null; };
  events.forEach(([c, b], i) => {
    if (secAt.has(i)) { flush(); curLab = secAt.get(i); }
    const n = c < 0 ? 'N' : chordName(c);
    const bb = Math.round(b * 100) / 100;
    cur.push(bb === bpb ? n : bb % bpb === 0 ? `${n}*${bb / bpb}` : `${n}:${bb}`);
    if (cur.length >= 8) { const lab = curLab; flush(); curLab = null; if (lab) { /* keep label once */ } }
  });
  flush();
  return lines.join('\n');
}

export function openEditor(song, { model = null, importMode = false } = {}) {
  const st = getState();
  const mine = song && song.mine ? st.mySongs[song.k.slice(3)] : null;
  const d = mine ? { ...mine } : {
    title: song ? song.t : '', artist: song ? song.a : '', lang: song ? song.lang : 0, genre: song ? song.g : GENRES.indexOf('לא מסווג'),
    bpm: model ? Math.round(model.bpm) : (song && song.bpm) || 90, bpb: (song && song.bpb) || 4, events: [], sections: [], lyrics: null,
  };
  let mode = importMode || !song || (mine && mine.sheetText) ? 'sheet' : 'prog';
  let progText = '';
  if (mine) progText = toProgression(mine.events, mine.sections || [], mine.bpb || 4);
  else if (model && !importMode) {
    const bpb = model.bpb || 4;
    const spb = 60 / model.bpm;
    const evs = model.events.map((e) => [e.c, Math.max(0.5, Math.round((e.beats ?? e.d / spb) * 2) / 2)]);
    const secs = model.sections.map((s) => [model.events.findIndex((e) => Math.abs(e.t - s.t) < 0.02), s.label]).filter((x) => x[0] >= 0);
    progText = toProgression(evs, secs, bpb);
  }
  let sheetText = (mine && mine.sheetText) || '', beatsPer = (mine && mine.beatsPer) || d.bpb || 4;
  const sc = openScreen({ title: mine ? 'עריכת שיר' : song ? 'שיר שלי חדש' : 'הוספת שיר', sub: song ? song.t : '' });
  sc.body.innerHTML = `
    <div class="field"><label for="ed-t">שם השיר</label><input id="ed-t" value="${esc(d.title)}" autocomplete="off"></div>
    <div class="field"><label for="ed-a">אמן</label><input id="ed-a" value="${esc(d.artist || '')}" autocomplete="off"></div>
    <div class="grid2">
      <div class="field"><label for="ed-g">סגנון</label><select id="ed-g">${GENRES.map((g, i) => `<option value="${i}" ${i === d.genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div class="field"><label for="ed-l">שפה</label><select id="ed-l"><option value="0">עברית</option><option value="1">אנגלית</option><option value="2">אחר</option></select></div>
    </div>
    <div class="grid2">
      <div class="field"><label>קצב (BPM)</label><span class="stepper"><button data-bpm="-5">−</button><output id="ed-bpm">${d.bpm}</output><button data-bpm="5">+</button></span></div>
      <div class="field"><label>משקל</label><div class="seg" id="ed-ts"><button data-ts="4">4/4</button><button data-ts="3">3/4</button><button data-ts="2">6/8</button></div></div>
    </div>
    <div class="seg" id="ed-mode" style="margin:6px 0 12px"><button data-m="sheet">הדבקת דף אקורדים</button><button data-m="prog">כתיבת מהלך</button></div>
    <div id="ed-pane"></div>
    <div class="section-t">תצוגה מקדימה</div>
    <div id="ed-prev" class="card" style="padding:12px;direction:ltr"></div>
    <div style="display:grid;gap:10px;margin-top:16px">
      <button class="btn primary block" id="ed-save">${icon('check')} שמירה ונגינה</button>
      ${mine ? `<button class="btn ghost block" id="ed-del" style="color:var(--bad)">${icon('trash')} מחיקת השיר</button>` : ''}
    </div>`;
  const $ = (s) => sc.body.querySelector(s);
  $('#ed-l').value = String(d.lang ?? 0);
  const parsed = () => {
    if (mode === 'sheet') { const r = parseSheet(sheetText, { beatsPerChord: beatsPer }); return { ...r, errors: [] }; }
    const r = parseProgression(progText, d.bpb || 4); return { ...r, lyrics: null };
  };
  const renderPane = () => {
    sc.body.querySelectorAll('#ed-mode [data-m]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    sc.body.querySelectorAll('#ed-ts [data-ts]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ts === (d.bpb || 4))));
    const pane = $('#ed-pane');
    if (mode === 'sheet') {
      pane.innerHTML = `<p class="note">העתיקו שיר מאתר אקורדים (למשל טאב4יו, נגנו או Ultimate Guitar) והדביקו כאן — שורות אקורדים, מילים וכותרות כמו ״בית״ ו״פזמון״ יזוהו אוטומטית. המילים נשמרות רק במכשיר שלכם.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap"><button class="btn sm" id="ed-t4u">${icon('search')} חיפוש בטאב4יו</button><button class="btn sm primary" id="ed-paste">${icon('paste')} הדבקה מהלוח</button>
          <span class="note">פעימות לכל אקורד</span><span class="stepper"><button data-bp="-1">−</button><output id="ed-bp">${beatsPer}</output><button data-bp="1">+</button></span></div>
        <div class="field"><textarea id="ed-sheet" dir="auto" placeholder="[פזמון]&#10;Am      F       C     G&#10;מילים של השיר כאן...">${esc(sheetText)}</textarea></div>`;
      const ta = $('#ed-sheet');
      ta.style.textAlign = 'start';
      ta.addEventListener('input', () => { sheetText = ta.value; renderPrev(); });
      $('#ed-t4u').addEventListener('click', () => {
        const q = $('#ed-t').value.trim();
        window.open(q ? `https://www.tab4u.com/resultsSimple?tab=songs&q=${encodeURIComponent(q)}` : 'https://www.tab4u.com/', '_blank', 'noopener');
      });
      $('#ed-paste').addEventListener('click', async () => {
        try { const t = await navigator.clipboard.readText(); if (t) { sheetText = t; ta.value = t; renderPrev(); } } catch (e) { ta.focus(); toast('הדביקו בשדה (לחיצה ארוכה ← הדבק)'); }
      });
    } else {
      pane.innerHTML = `<p class="note">כל אקורד = תיבה אחת. <span class="kbd">G*2</span> = שתי תיבות · <span class="kbd">[C G]</span> = שני אקורדים בתיבה · <span class="kbd">D:2</span> = שתי פעימות · <span class="kbd">x2</span> בסוף שורה = חזרה · אפשר לתת שם לקטע: <span class="kbd">פזמון: C G Am F</span></p>
        <div class="field"><textarea id="ed-prog" placeholder="בית: G D Em C x2&#10;פזמון: C G D Em&#10;C G D*2">${esc(progText)}</textarea></div>`;
      const ta = $('#ed-prog');
      ta.addEventListener('input', () => { progText = ta.value; renderPrev(); });
    }
    renderPrev();
  };
  const renderPrev = () => {
    const r = parsed();
    const pv = $('#ed-prev');
    if (!r.events.length) { pv.innerHTML = '<span class="note" style="direction:rtl;display:block;text-align:right">עדיין לא זוהו אקורדים.</span>'; return; }
    const secAt = new Map(r.sections.map(([i, l]) => [i, l]));
    const bars = Math.round(r.events.reduce((s, e) => s + e[1], 0) / (d.bpb || 4));
    const mins = r.events.reduce((s, e) => s + e[1], 0) * 60 / d.bpm;
    let html = `<div class="note" style="direction:rtl;text-align:right;margin-bottom:8px">${r.events.length} אקורדים · ${bars} תיבות · ${Math.floor(mins / 60)}:${String(Math.round(mins % 60)).padStart(2, '0')} דק׳ ב־${d.bpm} BPM${r.errors.length ? ` · <span style="color:var(--bad)">לא זוהו: ${esc(r.errors.join(', '))}</span>` : ''}</div><div style="display:flex;flex-wrap:wrap;gap:6px">`;
    r.events.slice(0, 160).forEach(([c, b], i) => {
      if (secAt.has(i)) html += `<span class="pill sync" style="height:28px;direction:rtl">${esc(secAt.get(i))}</span>`;
      html += `<span class="chip chord" style="height:30px;min-width:38px;font-size:15px">${esc(c < 0 ? '—' : chordName(c))}${b !== (d.bpb || 4) ? `<small style="opacity:.6;font-size:11px">${b}</small>` : ''}</span>`;
    });
    pv.innerHTML = html + (r.events.length > 160 ? ' …' : '') + '</div>';
  };
  sc.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) { mode = b.dataset.m; renderPane(); }
    else if (b.dataset.ts) { d.bpb = +b.dataset.ts; renderPane(); }
    else if (b.dataset.bpm) { d.bpm = Math.max(40, Math.min(260, d.bpm + +b.dataset.bpm)); $('#ed-bpm').textContent = d.bpm; renderPrev(); }
    else if (b.dataset.bp) { beatsPer = Math.max(1, Math.min(16, beatsPer + +b.dataset.bp)); $('#ed-bp').textContent = beatsPer; renderPrev(); }
  });
  $('#ed-save').addEventListener('click', async () => {
    const r = parsed();
    const title = $('#ed-t').value.trim();
    if (!title) { toast('תנו לשיר שם'); $('#ed-t').focus(); return; }
    if (r.events.filter((x) => x[0] >= 0).length < 2) { toast('צריך לפחות שני אקורדים'); return; }
    if (mode === 'prog' && mine && mine.lyrics && r.events.length === mine.events.length) { r.lyrics = mine.lyrics; r.lines = mine.lines; r.pos = mine.pos; }
    const uid = mine ? mine.uid : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const artist = $('#ed-a').value.trim();
    const rec = { uid, title, artist, lang: +$('#ed-l').value, genre: +$('#ed-g').value, bpm: d.bpm, bpb: d.bpb || 4,
      events: r.events, sections: r.sections, lyrics: r.lyrics && r.lyrics.some(Boolean) ? r.lyrics : null,
      lines: r.lines && r.lines.some((l) => l.text) ? r.lines : null, pos: r.pos || null,
      sheetText: mode === 'sheet' ? sheetText : null, beatsPer, created: mine ? mine.created : Date.now(), updated: Date.now() };
    // try to align the sheet to the original recording using synced lyrics
    if (rec.lines) {
      const btn = $('#ed-save');
      btn.disabled = true; btn.textContent = 'מחפש מילים מסונכרנות לשיר המקורי…';
      try {
        const lrc = await fetchSyncedLyrics({ key: 'my:' + title + '|' + artist, title, artist });
        const al = lrc && alignSheet(sheetLinesFor({ lines: rec.lines, events: rec.events, pos: rec.pos || [] }), lrc.lines, { secPerChord: (beatsPer * 60) / d.bpm });
        if (al) {
          rec.tev = al.tev; rec.lineTimes = al.lineTimes; rec.end = Math.max(lrc.dur || 0, al.tev[al.tev.length - 1][0] + 6); rec.syncInfo = `${al.matched}/${al.total}`;
          toast(`סונכרן לשיר המקורי (${al.matched} מתוך ${al.total} שורות)`, 3000);
        } else if (lrc) toast('נמצאו מילים אבל ההתאמה חלשה — השיר ינוגן בקצב שבחרתם', 3500);
        else toast('לא נמצאו מילים מסונכרנות — השיר ינוגן בקצב שבחרתם', 3000);
      } catch (e) { /* offline */ }
    }
    update((s) => { s.mySongs[uid] = rec; const p = s.songPrefs['my:' + uid]; if (p) { delete p.bpm; delete p.mode; } }, true);
    mergeMine();
    sc.close();
    app.refresh();
    const meta = SONGS.find((x) => x.k === 'my:' + uid) || mySongMeta(rec);
    setTimeout(() => app.openPlayer(meta), 380);
  });
  const del = $('#ed-del');
  if (del) {
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) { armed = true; del.textContent = 'לחצו שוב כדי למחוק לצמיתות'; setTimeout(() => { armed = false; del.innerHTML = `${icon('trash')} מחיקת השיר`; }, 3000); return; }
      update((s) => { delete s.mySongs[mine.uid]; delete s.favorites['my:' + mine.uid]; }, true);
      mergeMine(); sc.close(); app.refresh(); toast('השיר נמחק');
    });
  }
  renderPane();
}
