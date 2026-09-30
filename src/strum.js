// Strumming patterns: two slots per beat (down-beat, "and"). D = down, U = up, . = rest (hand keeps moving).
export const STRUMS = {
  folk: { name: 'קלאסי', bpb: 4, p: 'D.DU.UDU' },
  ballad: { name: 'בלדה', bpb: 4, p: 'D.DUD.DU' },
  down: { name: 'רבעים (מתחילים)', bpb: 4, p: 'D.D.D.D.' },
  eighths: { name: 'שמיניות (רוק)', bpb: 4, p: 'DUDUDUDU' },
  pop: { name: 'פופ', bpb: 4, p: 'D.D.DUDU' },
  reggae: { name: 'רגאיי', bpb: 4, p: '.D.D.D.D' },
  waltz: { name: 'ואלס', bpb: 3, p: 'D.DUDU' },
  waltzEasy: { name: 'ואלס (מתחילים)', bpb: 3, p: 'D.D.D.' },
  six8: { name: '6/8', bpb: 2, p: 'D.DU' },
  six8Easy: { name: '6/8 (מתחילים)', bpb: 2, p: 'D.D.' },
};
const ROCK = new Set([0, 17]); // רוק, רוק ישראלי
const REGGAE = 10;

// Pick a pattern that suits the song (time signature, style, tempo, level)
export function autoStrum(song, model, easy) {
  const bpb = model.bpb || 4;
  if (bpb === 3) return easy ? 'waltzEasy' : 'waltz';
  if (bpb === 2) return easy ? 'six8Easy' : 'six8';
  if (easy) return 'down';
  const bpm = model.bpm || 100;
  if (song.g === REGGAE) return 'reggae';
  if (bpm >= 150) return 'down';
  if (ROCK.has(song.g) && bpm >= 95) return 'eighths';
  if (bpm >= 125) return 'pop';
  if (bpm < 78) return 'ballad';
  return 'folk';
}
export function strumsFor(bpb) { return Object.entries(STRUMS).filter(([, s]) => s.bpb === (bpb === 3 || bpb === 2 ? bpb : 4)); }
export const arrow = (c) => (c === 'D' ? '↓' : c === 'U' ? '↑' : '·');
