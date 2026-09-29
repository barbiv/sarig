// One color per chord root, used everywhere a chord is drawn as a bubble/chip.
import { cidRoot, cidQual } from './theory.js';
const ROOT = ['#E5484D', '#D6409F', '#FF6A13', '#D9A300', '#E8B600', '#6BAA1F', '#30A46C', '#12A594', '#0A91D0', '#1E5F96', '#5B5BD6', '#8E4EC6'];
const MINOR = new Set([1, 4, 10, 13, 17, 18, 20]);
export function chordColor(cid) {
  if (cid == null || cid < 0) return { bg: '#3a3a3c', fg: '#fff' };
  const base = ROOT[cidRoot(cid)];
  const minor = MINOR.has(cidQual(cid));
  return { bg: minor ? shade(base, 0.72) : base, fg: '#fff' };
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
