// Tiny SVG charts drawn to scale.
import { HE_DAYS } from './ui.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
export function linReg(ys) {
  const n = ys.length;
  if (n < 2) return { a: ys[0] || 0, b: 0 };
  const mx = (n - 1) / 2, my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
  const b = den ? num / den : 0;
  return { a: my - b * mx, b };
}

// points: [{t, y}] in chronological order; one mark per session
export function lineChart(points, { unit = '', w = 340, h = 190, best = true } = {}) {
  if (!points.length) return '<p class="note" style="text-align:center;padding:30px 0">אין עדיין נתונים — סיים תרגיל ראשון כדי לראות גרף.</p>';
  const L = 30, R = 10, T = 12, B = 26;
  const ys = points.map((p) => p.y);
  const maxY = niceMax(Math.max(...ys) * 1.1);
  const n = points.length;
  const X = (i) => (n === 1 ? L + (w - L - R) / 2 : L + (i * (w - L - R)) / (n - 1));
  const Y = (v) => T + (h - T - B) * (1 - v / maxY);
  let o = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="גרף התקדמות">`;
  const nt = [5, 4, 2].find((q) => Math.abs(maxY / q - Math.round(maxY / q)) < 1e-9 && maxY / q >= 1) || 4;
  for (let k = 0; k <= nt; k++) {
    const v = (maxY * k) / nt, y = Y(v);
    o += `<line x1="${L}" x2="${w - R}" y1="${y}" y2="${y}" class="ch-grid"/><text x="${L - 5}" y="${y + 3.5}" text-anchor="end" class="ch-axis">${+v.toFixed(v < 10 ? 1 : 0)}</text>`;
  }
  // x labels: first, middle, last dates
  const idx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [...Array(n).keys()];
  for (const i of idx) {
    const d = new Date(points[i].t);
    o += `<text x="${X(i)}" y="${h - 8}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}" class="ch-axis">${d.getDate()}/${d.getMonth() + 1}</text>`;
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  if (n > 1) o += `<path d="${path}L${X(n - 1)} ${Y(0)}L${X(0)} ${Y(0)}Z" class="ch-area"/>`;
  o += `<path d="${path}" class="ch-line"/>`;
  if (n > 2) {
    const { a, b } = linReg(ys);
    o += `<line x1="${X(0)}" y1="${Y(Math.max(0, a))}" x2="${X(n - 1)}" y2="${Y(Math.max(0, a + b * (n - 1)))}" class="ch-trend"/>`;
  }
  const bi = ys.indexOf(Math.max(...ys));
  points.forEach((p, i) => {
    if (n <= 40 || i === n - 1) o += `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${i === bi && best ? 5 : 3}" class="${i === bi && best ? 'ch-best' : 'ch-dot'}"/>`;
  });
  o += `<text x="${X(bi)}" y="${Math.max(10, Y(ys[bi]) - 9)}" text-anchor="middle" class="ch-lbl">שיא ${ys[bi]}${unit}</text>`;
  return o + '</svg>';
}

// bars: [{label, a, b}] stacked (a = trainer, b = songs) minutes
export function barChart(bars, { w = 340, h = 170 } = {}) {
  const L = 26, R = 6, T = 10, B = 24;
  const maxY = niceMax(Math.max(1, ...bars.map((b) => b.a + b.b)));
  const n = bars.length, bw = (w - L - R) / n;
  const Y = (v) => T + (h - T - B) * (1 - v / maxY);
  let o = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="דקות תרגול ביום">`;
  for (let k = 0; k <= 2; k++) {
    const v = (maxY * k) / 2, y = Y(v);
    o += `<line x1="${L}" x2="${w - R}" y1="${y}" y2="${y}" class="ch-grid"/><text x="${L - 4}" y="${y + 3.5}" text-anchor="end" class="ch-axis">${v < 10 ? +v.toFixed(1) : Math.round(v)}</text>`;
  }
  bars.forEach((b, i) => {
    const x = L + i * bw + bw * 0.18, ww = bw * 0.64;
    const ya = Y(b.a), yb = Y(b.a + b.b);
    if (b.a > 0) o += `<rect x="${x}" y="${ya}" width="${ww}" height="${Y(0) - ya}" rx="2" class="ch-bar"/>`;
    if (b.b > 0) o += `<rect x="${x}" y="${yb}" width="${ww}" height="${ya - yb}" rx="2" class="ch-bar b2"/>`;
    if (b.label) o += `<text x="${x + ww / 2}" y="${h - 8}" text-anchor="middle" class="ch-axis">${b.label}</text>`;
  });
  return o + '</svg>';
}

// Calendar heat-map: dayMap {YYYY-MM-DD: value}; weeks back
export function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function heatmap(dayMap, weeks = 16, thresholds = [1, 10, 20]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - today.getDay() - (weeks - 1) * 7);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > today) { cells += '<i style="visibility:hidden"></i>'; continue; }
    const v = dayMap[dayKey(d)] || 0;
    const l = v >= thresholds[2] ? 3 : v >= thresholds[1] ? 2 : v >= thresholds[0] ? 1 : 0;
    cells += `<i class="${l ? 'l' + l : ''}${+d === +today ? ' today' : ''}" title="${d.getDate()}.${d.getMonth() + 1}: ${Math.round(v)}"></i>`;
  }
  const days = HE_DAYS.map((d, i) => `<span>${i % 2 === 0 ? d : ''}</span>`).join('');
  return `<div class="heatwrap"><div class="heat-days">${days}</div><div class="heat" style="grid-template-columns:repeat(${weeks},1fr)">${cells}</div></div>`;
}

export function sparkline(ys, w = 64, h = 28) {
  if (ys.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const min = Math.min(...ys), max = Math.max(...ys), rng = max - min || 1;
  const X = (i) => 2 + (i * (w - 4)) / (ys.length - 1), Y = (v) => h - 3 - ((v - min) / rng) * (h - 6);
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="area" d="${d}L${X(ys.length - 1)} ${h}L2 ${h}Z"/><path d="${d}"/></svg>`;
}
export function ring(frac, label = '') {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 64 64" aria-label="${label}"><circle class="bgc" cx="32" cy="32" r="${r}"/><circle class="fgc" cx="32" cy="32" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, frac))}"/></svg>`;
}
