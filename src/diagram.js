// SVG chord diagram: strings vertical (low E on the left), frets horizontal.
import { TUNING } from './chorddb.js';
import { noteName } from './theory.js';

export function diagramSVG(v, opts = {}) {
  const { w = 120, capo = 0, lefty = false, showNotes = false, compact = false, label = '' } = opts;
  if (!v) return `<svg class="dg" viewBox="0 0 100 120" width="${w}"><text x="50" y="60" text-anchor="middle" class="dg-t">?</text></svg>`;
  const frets = 4;
  const fretted = v.f.filter((x) => x > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  let start = maxF <= 4 ? 1 : minF;
  if (maxF - start >= frets) start = maxF - frets + 1;
  const W = 100, H = compact ? 118 : 128;
  const padX = 16, top = compact ? 26 : 30, gridW = W - padX * 2, gridH = compact ? 74 : 80;
  const sx = gridW / 5, fy = gridH / frets;
  const X = (s) => padX + (lefty ? 5 - s : s) * sx;
  let o = `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${w}" role="img" aria-label="${label}">`;
  // nut / capo band
  if (start === 1) {
    if (capo > 0) {
      o += `<rect x="${padX - 5}" y="${top - 7}" width="${gridW + 10}" height="7" rx="3.5" class="dg-capo"/>`;
      o += `<text x="${W / 2}" y="${top - 1.6}" text-anchor="middle" class="dg-capo-t">קאפו ${capo}</text>`;
    } else {
      o += `<rect x="${padX - 0.8}" y="${top - 3.5}" width="${gridW + 1.6}" height="3.5" class="dg-nut"/>`;
    }
  } else {
    o += `<text x="${lefty ? W - padX + 4 : padX - 5}" y="${top + fy * 0.62}" text-anchor="${lefty ? 'start' : 'end'}" class="dg-fn">${start + (capo || 0)}</text>`;
  }
  for (let i = 0; i <= frets; i++) o += `<line x1="${padX}" x2="${padX + gridW}" y1="${top + i * fy}" y2="${top + i * fy}" class="dg-fret"/>`;
  for (let s = 0; s < 6; s++) o += `<line x1="${X(s)}" x2="${X(s)}" y1="${top}" y2="${top + gridH}" class="dg-str" style="stroke-width:${1.5 - s * 0.14}"/>`;
  // open / muted markers
  for (let s = 0; s < 6; s++) {
    const f = v.f[s], x = X(s), y = top - (capo > 0 && start === 1 ? 13 : 9);
    if (f < 0) o += `<path d="M${x - 3.2} ${y - 3.2}L${x + 3.2} ${y + 3.2}M${x + 3.2} ${y - 3.2}L${x - 3.2} ${y + 3.2}" class="dg-x"/>`;
    else if (f === 0) o += `<circle cx="${x}" cy="${y}" r="3.3" class="dg-o"/>`;
  }
  // barres
  for (const bf of v.r || []) {
    const strs = v.f.map((f, i) => (f === bf && v.g[i] === 1 ? i : -1)).filter((i) => i >= 0);
    if (strs.length < 2) continue;
    const a = X(Math.min(...strs)), b = X(Math.max(...strs));
    const y = top + (bf - start + 0.5) * fy;
    o += `<rect x="${Math.min(a, b) - 6}" y="${y - 6}" width="${Math.abs(b - a) + 12}" height="12" rx="6" class="dg-barre"/>`;
    o += `<text x="${(a + b) / 2}" y="${y + 3.4}" text-anchor="middle" class="dg-ft">1</text>`;
  }
  for (let s = 0; s < 6; s++) {
    const f = v.f[s];
    if (f <= 0) continue;
    const inBarre = (v.r || []).includes(f) && v.g[s] === 1;
    const y = top + (f - start + 0.5) * fy, x = X(s);
    const low = v.f.findIndex((x2) => x2 >= 0);
    if (!inBarre) {
      o += `<circle cx="${x}" cy="${y}" r="6.2" class="dg-dot${s === low ? ' root' : ''}"/>`;
      if (v.g[s]) o += `<text x="${x}" y="${y + 3.3}" text-anchor="middle" class="dg-ft">${v.g[s]}</text>`;
    }
  }
  if (showNotes) {
    for (let s = 0; s < 6; s++) {
      const f = v.f[s];
      if (f < 0) continue;
      o += `<text x="${X(s)}" y="${top + gridH + 11}" text-anchor="middle" class="dg-nt">${noteName(TUNING[s] + f + capo)}</text>`;
    }
  }
  return o + '</svg>';
}
