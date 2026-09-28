// Voicing lookup (chords-db, MIT) with a search-based fallback.
import { QUALITIES, INTERVALS, cidRoot, cidQual, cidBass, makeCid, transposeCid, chordName } from './theory.js';

let DB = null;
export async function loadChordDb() {
  if (DB) return DB;
  const r = await fetch('data/chords.json');
  DB = await r.json();
  return DB;
}
export const TUNING = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (midi)

const cache = new Map();
export function voicings(cid) {
  if (cid < 0) return [];
  if (cache.has(cid)) return cache.get(cid);
  const r = cidRoot(cid), q = QUALITIES[cidQual(cid)], b = cidBass(cid);
  let list = null;
  if (b >= 0 && (q === '' || q === 'm')) list = DB[`${r}|${q}|${b}`];
  if (!list || !list.length) {
    list = DB[`${r}|${q}`] || [];
    if (b >= 0) list = slashify(list, b);
  }
  if (!list.length) list = generate(cid);
  list = list.map((v) => ({ ...v, diff: difficulty(v) }));
  cache.set(cid, list);
  return list;
}

// Put the bass note under a voicing when it fits on a free low string
function slashify(list, bass) {
  const out = [];
  for (const v of list) {
    const f = v.f.slice(), g = v.g.slice();
    let placed = false;
    for (let s = 0; s < 2 && !placed; s++) {
      const low = f.findIndex((x) => x >= 0);
      if (s >= low) break;
      const pcOpen = TUNING[s] % 12;
      const fret = (bass - pcOpen + 12) % 12;
      const fretted = f.filter((x) => x > 0);
      const lo = fretted.length ? Math.min(...fretted) : 0, hi = fretted.length ? Math.max(...fretted) : 0;
      if (fret === 0 || (fret >= lo - 1 && fret <= Math.max(hi, lo + 3) && fret <= lo + 3)) {
        f[s] = fret;
        for (let k = 0; k < s; k++) f[k] = -1;
        g[s] = fret === 0 ? 0 : (g.filter((x) => x > 0).length < 4 ? nextFinger(g) : 0);
        if (fret > 0 && g[s] === 0) continue;
        placed = true;
      }
    }
    out.push(placed ? { ...v, f, g, slash: true } : { ...v, bassNote: bass });
  }
  return out;
}
function nextFinger(g) { const used = new Set(g); for (let k = 1; k <= 4; k++) if (!used.has(k)) return k; return 0; }

export function difficulty(v) {
  const fretted = v.f.filter((x) => x > 0);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const fingers = new Set(v.g.filter((x) => x > 0)).size;
  const barre = v.r && v.r.length ? 1 : 0;
  const open = v.f.filter((x) => x === 0).length;
  const high = fretted.length ? Math.min(...fretted) : 0;
  return fingers + barre * 2.5 + span * 0.6 - open * 0.3 + (high > 5 ? 0.6 : 0);
}
export function isOpenShape(v) { return v && !(v.r && v.r.length) && v.f.every((x) => x <= 4); }

// Brute-force search for voicings (used only when the database has none)
function generate(cid) {
  const r = cidRoot(cid), q = QUALITIES[cidQual(cid)];
  const need = new Set(INTERVALS[q].map((iv) => (r + iv) % 12));
  const ess = new Set(INTERVALS[q].filter((iv) => iv !== 7).map((iv) => (r + iv) % 12));
  const res = [];
  for (let base = 0; base <= 10; base++) {
    const opts = TUNING.map((t) => {
      const o = [-1];
      for (let f = (base === 0 ? 0 : base); f <= base + 3; f++) if (need.has((t + f) % 12)) o.push(f);
      if (base > 0) { if (need.has(t % 12)) o.push(0); }
      return o;
    });
    const cur = [];
    const rec = (s) => {
      if (s === 6) {
        const played = cur.map((f, i) => (f >= 0 ? (TUNING[i] + f) % 12 : -1)).filter((x) => x >= 0);
        if (played.length < 4) return;
        const low = cur.findIndex((f) => f >= 0);
        if ((TUNING[low] + cur[low]) % 12 !== r) return;
        for (const e of ess) if (!played.includes(e)) return;
        // no interior mutes
        const last = 5 - [...cur].reverse().findIndex((f) => f >= 0);
        for (let i = low; i <= last; i++) if (cur[i] < 0) return;
        const fretted = cur.filter((f) => f > 0);
        if (fretted.length > 4 && !barreOK(cur)) return;
        res.push(cur.slice());
        return;
      }
      for (const f of opts[s]) { cur.push(f); rec(s + 1); cur.pop(); }
    };
    rec(0);
  }
  const uniq = new Map();
  for (const f of res) uniq.set(f.join(','), f);
  const vs = [...uniq.values()].map((f) => fingerize(f));
  vs.sort((a, b) => difficulty(a) - difficulty(b));
  const picked = [];
  for (const v of vs) {
    const lo = Math.min(...v.f.filter((x) => x > 0).concat([99]));
    if (picked.some((p) => Math.abs((Math.min(...p.f.filter((x) => x > 0).concat([99]))) - lo) < 2)) continue;
    picked.push(v);
    if (picked.length >= 4) break;
  }
  return picked;
}
function barreOK(f) {
  const fretted = f.filter((x) => x > 0);
  const min = Math.min(...fretted);
  return fretted.filter((x) => x > min).length <= 3;
}
export function fingerize(f) {
  const fretted = f.map((x, i) => [x, i]).filter(([x]) => x > 0);
  const g = f.map(() => 0);
  const r = [];
  if (!fretted.length) return { f, g, r, b: 1 };
  const min = Math.min(...fretted.map(([x]) => x));
  const atMin = fretted.filter(([x]) => x === min);
  let finger = 1;
  if (fretted.length > 4 || (atMin.length >= 2 && atMin[0][1] <= 1)) {
    const first = atMin[0][1];
    const lastIdx = Math.max(...atMin.map(([, i]) => i));
    let ok = true;
    for (let i = first; i <= lastIdx; i++) if (f[i] >= 0 && f[i] < min) ok = false;
    if (ok) {
      r.push(min);
      for (let i = first; i < 6; i++) if (f[i] === min) g[i] = 1;
      finger = 2;
    }
  }
  const rest = fretted.filter(([x, i]) => g[i] === 0).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [x, i] of rest) {
    const want = Math.max(finger, Math.min(4, x - min + (r.length ? 1 : 1)));
    g[i] = Math.min(4, want);
    finger = g[i] + 1;
  }
  return { f, g, r, b: min };
}

export function voicingMidi(v, capo = 0) {
  return v.f.map((f, i) => (f >= 0 ? TUNING[i] + f + capo : -1));
}

// For a sounding chord, which open shape to use with each capo
export function capoOptions(cid) {
  const out = [];
  for (let c = 1; c <= 7; c++) {
    const shape = transposeCid(cid, -c);
    const v = voicings(shape)[0];
    if (v && isOpenShape(v)) out.push({ capo: c, shape, v, name: chordName(shape) });
  }
  return out;
}
export { makeCid };
