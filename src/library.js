// Song index, filters and song data loading.
import { decodeChordList, basicOf, cidRoot, NQ, parseChordSymbol } from './theory.js';
import { getState } from './store.js';

export let INDEX = null;
export let SONGS = [];
export let GENRES = [];
export const LANGS = ['עברית', 'אנגלית', 'אחר'];
export const SOURCES = {
  curated: 'עריכה ידנית (מהלך בסיסי מקורב)', billboard: 'McGill Billboard — מתוזמן מול ההקלטה',
  isophonics: 'Isophonics — מתוזמן מול ההקלטה', uspop: 'USPOP2002 — מתוזמן מול ההקלטה',
  rw: 'Robbie Williams Dataset — מתוזמן', rockcorpus: 'Rock Corpus (de Clercq & Temperley)', ireal: 'iReal Pro (ChoCo)',
  irealforum: 'iReal Pro Forum (ChoCo)', wikifonia: 'Wikifonia (ChoCo)', biab: 'Band-in-a-Box corpus (ChoCo)', mine: 'השירים שלי',
};

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9֐-׿ ]+/g, ' ');

export async function loadIndex() {
  if (INDEX) return INDEX;
  const r = await fetch('data/index.json');
  INDEX = await r.json();
  GENRES = INDEX.genres;
  SONGS = INDEX.songs.map(decodeRow);
  mergeMine();
  return INDEX;
}
function decodeRow(r) {
  const [id, t, a, lang, g, y, key, bpm, bpb, flags, diff, ch, capo, pop, dur, src, sk] = r;
  const chords = decodeChordList(ch);
  return {
    k: 'db:' + sk, id, t, a, lang, g, y, key, bpm, bpb, flags, diff, chords, capo, pop, dur,
    src: INDEX.src[src], timed: !!(flags & 1), nobarre: !!(flags & 8), capoEasy: !!(flags & 16), curated: !!(flags & 4),
    basics: [...new Set(chords.map(basicOf))], s: norm(t + ' ' + a),
  };
}
export function mergeMine() {
  const st = getState();
  SONGS = SONGS.filter((s) => s.src !== 'mine');
  const mine = Object.values(st.mySongs || {}).map(mySongMeta);
  SONGS = mine.concat(SONGS);
}
export function mySongMeta(m) {
  const chords = [...new Set(m.events.map((e) => e[0]).filter((c) => c >= 0).map((c) => c % (12 * NQ)))];
  return {
    k: 'my:' + m.uid, id: -1, t: m.title, a: m.artist || '', lang: m.lang ?? 0, g: m.genre ?? GENRES.indexOf('לא מסווג'), y: m.year || 0,
    key: -1, bpm: m.bpm, bpb: m.bpb || 4, flags: 4, diff: 2, chords, capo: 0, pop: 999, dur: 0, src: 'mine', timed: false,
    nobarre: false, capoEasy: false, curated: false, mine: true, basics: [...new Set(chords.map(basicOf))], s: norm(m.title + ' ' + (m.artist || '')),
  };
}
export const byKey = (k) => SONGS.find((s) => s.k === k);

// ------------------------------------------------------------ filters
export function defaultFilters() {
  return { q: '', lang: 'all', genres: [], diff: [], nMin: 1, nMax: 99, chordMode: 'any', chords: [], capoMatch: true,
    nobarre: false, capoEasy: false, bpmMin: 0, bpmMax: 400, decades: [], ts: [], timed: false, key: -1, keyMode: 'any',
    hasYT: false, mine: false, sort: 'pop' };
}
export function activeFilterCount(f) {
  let n = 0;
  if (f.genres.length) n++; if (f.diff.length) n++; if (f.nMin > 1 || f.nMax < 99) n++; if (f.chords.length) n++;
  if (f.nobarre) n++; if (f.capoEasy) n++; if (f.bpmMin > 0 || f.bpmMax < 400) n++; if (f.decades.length) n++;
  if (f.ts.length) n++; if (f.timed) n++; if (f.key >= 0) n++; if (f.hasYT) n++; if (f.mine) n++; if (f.keyMode !== 'any') n++;
  return n;
}
function shiftBasic(b, n) { const r = Math.floor(b / 5), f = b % 5; return (((r + n) % 12) + 12) % 12 * 5 + f; }

export function filterSongs(f) {
  const st = getState();
  const q = norm(f.q).trim();
  const terms = q ? q.split(/\s+/) : [];
  const sel = new Set(f.chords);
  const genres = new Set(f.genres), diffs = new Set(f.diff), decs = new Set(f.decades), tss = new Set(f.ts);
  const out = [];
  for (const s of SONGS) {
    if (f.lang !== 'all' && s.lang !== f.lang) continue;
    if (terms.length && !terms.every((t) => s.s.includes(t))) continue;
    if (genres.size && !genres.has(s.g)) continue;
    if (diffs.size && !diffs.has(s.diff)) continue;
    const n = s.basics.length;
    if (n < f.nMin || n > f.nMax) continue;
    if (f.nobarre && !s.nobarre) continue;
    if (f.capoEasy && !(s.capoEasy || s.nobarre)) continue;
    if (f.timed && !s.timed) continue;
    if (f.mine && !s.mine) continue;
    if (f.bpmMin > 0 || f.bpmMax < 400) { if (!s.bpm || s.bpm < f.bpmMin || s.bpm > f.bpmMax) continue; }
    if (decs.size && !(s.y && decs.has(Math.floor(s.y / 10) * 10))) continue;
    if (tss.size && !tss.has(s.bpb)) continue;
    if (f.key >= 0 && (s.key >> 1) !== f.key) continue;
    if (f.keyMode !== 'any' && (s.key < 0 || (s.key & 1) !== (f.keyMode === 'minor' ? 1 : 0))) continue;
    if (f.hasYT && !(st.songPrefs[s.k] && st.songPrefs[s.k].yt)) continue;
    let capoFit = -1;
    if (sel.size) {
      if (f.chordMode === 'any') { if (!s.basics.some((b) => sel.has(b))) continue; }
      else if (f.chordMode === 'all') { if (!f.chords.every((b) => s.basics.includes(b))) continue; }
      else {
        // only: every chord of the song is in the selection (optionally via capo)
        if (s.basics.every((b) => sel.has(b))) capoFit = 0;
        else if (f.capoMatch) {
          for (let c = 1; c <= 7; c++) if (s.basics.every((b) => sel.has(shiftBasic(b, -c)))) { capoFit = c; break; }
        }
        if (capoFit < 0) continue;
      }
    }
    out.push(capoFit > 0 ? { s, capoFit } : { s, capoFit: 0 });
  }
  const cmp = {
    pop: (a, b) => b.s.pop - a.s.pop,
    az: (a, b) => a.s.t.localeCompare(b.s.t, 'he'),
    easy: (a, b) => a.s.diff - b.s.diff || a.s.basics.length - b.s.basics.length || b.s.pop - a.s.pop,
    year: (a, b) => (b.s.y || 0) - (a.s.y || 0),
    old: (a, b) => (a.s.y || 9999) - (b.s.y || 9999),
    fast: (a, b) => (b.s.bpm || 0) - (a.s.bpm || 0),
    slow: (a, b) => (a.s.bpm || 999) - (b.s.bpm || 999),
  }[f.sort] || ((a, b) => b.s.pop - a.s.pop);
  out.sort(cmp);
  return out;
}

// ------------------------------------------------------------ song data
const chunkCache = new Map();
async function loadChunk(c) {
  if (chunkCache.has(c)) return chunkCache.get(c);
  const p = fetch(`data/s/${c}.json`).then((r) => { if (!r.ok) throw new Error('net'); return r.json(); });
  chunkCache.set(c, p);
  try { return await p; } catch (e) { chunkCache.delete(c); throw e; }
}
const STYLE_BPM = [['ballad', 72], ['up tempo', 210], ['medium up', 170], ['medium swing', 130], ['slow', 80], ['bossa', 128],
  ['samba', 180], ['waltz', 140], ['bluegrass', 150], ['fiddle', 150], ['rock', 116], ['pop', 104], ['funk', 100], ['reggae', 80],
  ['latin', 120], ['blues', 96], ['country', 110], ['swing', 140]];
export function defaultBpm(song, data) {
  const st = (data && data.st || '').toLowerCase();
  for (const [k, v] of STYLE_BPM) if (st.includes(k)) return v;
  const g = GENRES[song.g] || '';
  if (g.includes('בלדה')) return 72;
  if (g.includes('ג׳אז')) return 130;
  return 96;
}

export async function loadSong(song) {
  const st = getState();
  const pref = st.songPrefs[song.k] || {};
  if (song.mine) {
    const m = st.mySongs[song.k.slice(3)];
    return buildSymbolic(song, { e: m.events, s: m.sections || [], ly: m.lyrics || null }, pref.bpm || m.bpm || 90);
  }
  const chunk = await loadChunk(Math.floor(song.id / INDEX.chunk));
  const d = chunk[song.id];
  if (!d) throw new Error('missing');
  if (song.timed) return buildTimed(song, d);
  const bpm = pref.bpm || song.bpm || defaultBpm(song, d);
  const m = buildSymbolic(song, d, bpm);
  m.release = d.r;
  m.style = d.st;
  m.capoHint = d.ch || 0;
  return m;
}
function buildTimed(song, d) {
  const ev = [];
  let t = 0;
  for (let i = 0; i < d.e.length; i += 2) { t += d.e[i]; ev.push({ t: t / 100, c: d.e[i + 1] }); }
  const end = d.end / 100;
  for (let i = 0; i < ev.length; i++) ev[i].d = (i + 1 < ev.length ? ev[i + 1].t : end) - ev[i].t;
  let beats = [], downs = new Set();
  if (d.b) { let b = 0; beats = d.b.map((x) => (b += x) / 100); let di = 0; for (const x of d.d) { di += x; downs.add(di); } }
  const sections = (d.s || []).map(([cs, l]) => ({ t: cs / 100, label: secLabel(l) }));
  return { timed: true, events: ev.filter((e) => e.d > 0.01), beats, downs, sections, dur: end, bpm: song.bpm || 100, bpb: song.bpb || 4, release: d.r };
}
export function buildSymbolic(song, d, bpm) {
  const spb = 60 / bpm;
  const ev = [];
  let beat = 0;
  const secAt = new Map((d.s || []).map(([i, l]) => [i, l]));
  const sections = [];
  d.e.forEach(([c, b], i) => {
    if (secAt.has(i)) sections.push({ t: beat * spb, label: secLabel(secAt.get(i)) });
    ev.push({ t: beat * spb, d: b * spb, c, beats: b, ly: d.ly ? d.ly[i] : undefined });
    beat += b;
  });
  const total = beat;
  const beats = [], downs = new Set();
  const bpb = song.bpb || 4;
  for (let i = 0; i <= Math.ceil(total); i++) { if (i % bpb === 0) downs.add(i); beats.push(i * spb); }
  return { timed: false, events: ev, beats, downs, sections, dur: total * spb, bpm, bpb, totalBeats: total };
}
const SEC_HE = { intro: 'פתיחה', verse: 'בית', chorus: 'פזמון', refrain: 'פזמון', bridge: 'גשר', solo: 'סולו', outro: 'סיום',
  interlude: 'מעבר', instrumental: 'כלי', 'pre-chorus': 'טרום-פזמון', prechorus: 'טרום-פזמון', 'pre chorus': 'טרום-פזמון', trans: 'מעבר',
  transition: 'מעבר', fadeout: 'דעיכה', coda: 'קודה', ending: 'סיום', theme: 'נושא', 'main theme': 'נושא', 'pre-verse': 'טרום-בית',
  verse_a: 'בית', verse_b: 'בית', break: 'הפסקה' };
function secLabel(l) {
  const k = String(l).toLowerCase().replace(/[0-9_]+$/, '').replace(/\(.*\)/, '').trim();
  return SEC_HE[k] || SEC_HE[k.split(/[ _]/)[0]] || l;
}

// ------------------------------------------------------------ chord-sheet import
const HEADER = /^\s*[\[(]?\s*(פתיחה|בית|פזמון|גשר|סיום|מעבר|סולו|intro|verse|chorus|bridge|outro|solo|pre-?chorus|interlude|coda|הקדמה|אינטרו)[^\]\n]*[\])]?\s*:?\s*$/i;
export function isChordToken(tok) {
  const t = tok.replace(/^[|(\[]+|[|)\],.]+$/g, '');
  if (!t) return null;
  if (/^x\d+$/i.test(t) || t === '|' || t === '-' || t === '%') return 'skip';
  return parseChordSymbol(t) != null ? 'chord' : null;
}
export function parseSheet(text, { beatsPerChord = 4 } = {}) {
  const lines = text.replace(/\r/g, '').split('\n');
  const events = [], sections = [], lyrics = [];
  let pendingLy = null;
  let lastChordLine = -1;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trim();
    if (!line) continue;
    const hm = HEADER.exec(line);
    if (hm && line.length < 30) { sections.push([events.length, hm[1].replace(/:$/, '')]); continue; }
    const toks = line.split(/\s+/);
    let chords = 0, other = 0;
    for (const t of toks) { const k = isChordToken(t); if (k === 'chord') chords++; else if (k !== 'skip') other++; }
    const isChordLine = chords > 0 && chords >= other * 2;
    if (isChordLine) {
      const cs = toks.map((t) => t.replace(/^[|(\[]+|[|)\],.]+$/g, '')).filter((t) => isChordToken(t) === 'chord').map(parseChordSymbol);
      const nextLine = (lines[li + 1] || '').trim();
      const nextIsLyric = nextLine && !HEADER.test(nextLine) && !(() => {
        const tk = nextLine.split(/\s+/); let c = 0, o = 0; for (const t of tk) { const k = isChordToken(t); if (k === 'chord') c++; else if (k !== 'skip') o++; } return c > 0 && c >= o * 2;
      })();
      const ly = nextIsLyric ? nextLine : '';
      cs.forEach((c, i) => { events.push([c, beatsPerChord]); lyrics.push(i === 0 ? ly : ''); });
      if (nextIsLyric) li++;
      lastChordLine = li;
      pendingLy = null;
    } else {
      // lyric line without chords: attach to the previous chord if any
      pendingLy = line;
      if (lyrics.length && lastChordLine === li - 1) { /* already attached */ }
    }
  }
  return { events, sections, lyrics };
}
export function styleOfSong(s) { return GENRES[s.g] || ''; }
export function rootsOf(s) { return s.chords.map(cidRoot); }
