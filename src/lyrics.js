// Synced lyrics (LRCLIB, fetched on the device) and alignment of pasted chord sheets to the recording.
import { kvGet, kvSet } from './store.js';

const API = 'https://lrclib.net/api';
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-֑ͯ-ׇ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9א-ת ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function parseLRC(txt) {
  const out = [];
  for (const raw of (txt || '').split('\n')) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) out.push({ t: +m[1] * 60 + +m[2], text });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function getJSON(url, ms = 7000) {
  const c = new AbortController();
  const tm = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

// Returns { lines:[{t,text}], plain, dur } or null. Cached on the device.
export async function fetchSyncedLyrics({ key, title, artist, duration }) {
  const ck = 'lrc:' + key;
  const cached = await kvGet(ck);
  if (cached) return cached.none ? null : cached;
  if (!navigator.onLine) return null;
  const q = new URLSearchParams({ track_name: title, artist_name: artist || '' });
  let best = null;
  if (duration && artist) {
    const d = await getJSON(`${API}/get?${q}&duration=${Math.round(duration)}`);
    if (d && d.syncedLyrics) best = d;
  }
  if (!best) {
    const list = await getJSON(`${API}/search?${q}`) || (artist ? null : await getJSON(`${API}/search?q=${encodeURIComponent(title)}`));
    if (Array.isArray(list)) {
      const nt = norm(title), na = norm(artist);
      const scored = list.filter((x) => x.syncedLyrics).map((x) => {
        let s = 0;
        if (norm(x.trackName) === nt) s += 3; else if (norm(x.trackName).includes(nt) || nt.includes(norm(x.trackName))) s += 1.5;
        if (na && norm(x.artistName).split(' ').some((w) => w.length > 2 && na.includes(w))) s += 2;
        if (duration && x.duration) s -= Math.min(3, Math.abs(x.duration - duration) / 6);
        return { x, s };
      }).sort((a, b) => b.s - a.s);
      if (scored.length && scored[0].s >= 2.5) best = scored[0].x;
    }
  }
  if (!best) { await kvSet(ck, { none: true, at: Date.now() }); return null; }
  const res = { lines: parseLRC(best.syncedLyrics), dur: best.duration || 0, src: `${best.artistName} — ${best.trackName}` };
  if (res.lines.length < 3) { await kvSet(ck, { none: true, at: Date.now() }); return null; }
  await kvSet(ck, res);
  return res;
}

function bigrams(s) { const b = new Map(); s = s.replace(/\s+/g, ' '); for (let i = 0; i < s.length - 1; i++) { const g = s.substr(i, 2); b.set(g, (b.get(g) || 0) + 1); } return b; }
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) || 0);
  return (2 * inter) / (na + nb || 1);
}

// sheetLines: [{text, chords:[{cid,pos}]}] (text '' = chord-only line). lrc: [{t,text}]
// Returns { tev:[[t,cid]], lineTimes:[[t0,t1]], matched, total } or null
export function alignSheet(sheetLines, lrc, { secPerChord = 2 } = {}) {
  const L = sheetLines.map((l, i) => ({ ...l, i })).filter((l) => l.text);
  const R = lrc.filter((r) => r.text);
  if (L.length < 2 || R.length < 3) return null;
  const n = L.length, m = R.length;
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  const S = (i, j) => similarity(L[i].text, R[j].text);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = S(i - 1, j - 1);
      let best = dp[i - 1][j], w = 1;
      if (dp[i][j - 1] > best) { best = dp[i][j - 1]; w = 2; }
      if (sim > 0.45 && dp[i - 1][j - 1] + sim > best) { best = dp[i - 1][j - 1] + sim; w = 3; }
      dp[i][j] = best; bt[i][j] = w;
    }
  }
  const match = new Map();
  for (let i = n, j = m; i > 0 && j > 0;) {
    const w = bt[i][j];
    if (w === 3) { match.set(L[i - 1].i, j - 1); i--; j--; } else if (w === 1) i--; else j--;
  }
  if (match.size < Math.max(2, n * 0.4)) return null;
  // time span for every sheet line
  const times = new Array(sheetLines.length).fill(null);
  for (const [li, j] of match) times[li] = [R[j].t, j + 1 < m ? R[j + 1].t : R[j].t + 4];
  // interpolate unmatched lyric lines and chord-only lines between anchors
  const idxs = [...match.keys()].sort((a, b) => a - b);
  const firstI = idxs[0], lastI = idxs[idxs.length - 1];
  const chordsIn = (a, b) => { let c = 0; for (let k = a; k < b; k++) c += Math.max(1, sheetLines[k].chords.length); return c; };
  // before first anchor
  if (firstI > 0) {
    const end = times[firstI][0];
    const need = chordsIn(0, firstI) * secPerChord;
    const start = Math.max(0, end - need);
    fill(0, firstI, start, end);
  }
  for (let k = 0; k < idxs.length - 1; k++) {
    const a = idxs[k], b = idxs[k + 1];
    if (b - a > 1) fill(a + 1, b, times[a][1], times[b][0]);
    // clamp anchor end to next anchor start
    times[a][1] = Math.min(times[a][1], times[b][0]);
  }
  if (lastI < sheetLines.length - 1) {
    const st = times[lastI][1];
    fill(lastI + 1, sheetLines.length, st, st + chordsIn(lastI + 1, sheetLines.length) * secPerChord);
  }
  function fill(a, b, t0, t1) {
    const tot = chordsIn(a, b) || 1;
    let t = t0; const per = Math.max(0.3, (t1 - t0) / tot);
    for (let k = a; k < b; k++) { const w = Math.max(1, sheetLines[k].chords.length) * per; times[k] = [t, t + w]; t += w; }
  }
  const tev = [];
  sheetLines.forEach((l, k) => {
    const [t0, t1] = times[k];
    const cs = l.chords.slice().sort((x, y) => x.pos - y.pos);
    cs.forEach((c, q) => {
      const pos = l.text ? c.pos : q / cs.length;
      tev.push([t0 + Math.max(0, Math.min(0.97, pos)) * (t1 - t0), c.cid, k]);
    });
  });
  tev.sort((x, y) => x[0] - y[0]);
  return { tev, lineTimes: times, matched: match.size, total: n };
}
