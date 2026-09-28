// Automatic YouTube matching: pre-resolved map (built by a GitHub Action) + live search fallback (Piped).
let mapP = null;
export function loadYtMap() {
  if (!mapP) mapP = fetch('data/yt.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return mapP;
}
const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://pipedapi.leptons.xyz'];
const BAD = /\b(live|cover|karaoke|lesson|tutorial|remix|reaction|piano|how to play|slowed|nightcore|8d)\b/i;
const norm = (s) => (s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9א-ת ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function pipedSearch(q) {
  for (const base of PIPED) {
    const c = new AbortController();
    const tm = setTimeout(() => c.abort(), 6000);
    try {
      const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`, { signal: c.signal });
      if (!r.ok) continue;
      const d = await r.json();
      if (d && Array.isArray(d.items)) return d.items.filter((x) => x.url && x.url.includes('watch?v='));
    } catch (e) { /* try next */ } finally { clearTimeout(tm); }
  }
  return null;
}
// returns [[id, dur, isTopic, channel], ...]
export async function findVideos(song, { duration = 0 } = {}) {
  const map = await loadYtMap();
  if (map[song.k] && map[song.k].length) return { list: map[song.k], src: 'map' };
  if (!navigator.onLine) return { list: [], src: 'offline' };
  const artist = ['Traditional', 'מסורתי', 'עממי'].includes(song.a) ? '' : (song.a || '');
  const heb = /[֐-׿]/.test(song.t);
  const items = await pipedSearch(`${artist} ${song.t}`.trim() + (heb ? '' : ' audio'));
  if (!items) return { list: [], src: 'fail' };
  const nt = norm(song.t), na = norm(artist);
  const scored = items.slice(0, 10).map((x) => {
    const t = norm(x.title), ch = x.uploaderName || '';
    let s = 0;
    if (ch.endsWith(' - Topic')) s += 4;
    const toks = nt.split(' ').filter((w) => w.length > 1);
    if (toks.length) s += (3 * toks.filter((w) => t.includes(w)).length) / toks.length;
    const at = na.split(' ').filter((w) => w.length > 2);
    if (at.length) s += (2 * at.filter((w) => t.includes(w) || norm(ch).includes(w)).length) / at.length;
    if (BAD.test(x.title) && !BAD.test(song.t)) s -= 3;
    if (duration && x.duration > 0) s -= Math.min(4, Math.abs(x.duration - duration) / 8);
    return { id: x.url.split('v=')[1].slice(0, 11), dur: x.duration || 0, topic: ch.endsWith(' - Topic') ? 1 : 0, ch, s };
  }).filter((x) => x.s > 1.5).sort((a, b) => b.s - a.s);
  return { list: scored.slice(0, 3).map((x) => [x.id, x.dur, x.topic, x.ch]), src: 'search' };
}
