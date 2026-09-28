// Music theory helpers: chord ids, names, transposition, parsing.
export const QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', '7sus4', 'dim', 'dim7',
  'm7b5', 'aug', '6', 'm6', 'add9', '9', 'maj9', 'm9', 'madd9', '5',
  'mMaj7', '7#9', '7b9', '13', '6/9', 'aug7', '7b5'];
export const NQ = QUALITIES.length;
export const QI = Object.fromEntries(QUALITIES.map((q, i) => [q, i]));

export const INTERVALS = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus2: [0, 2, 7],
  sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], 9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14], madd9: [0, 3, 7, 14], 5: [0, 7], mMaj7: [0, 3, 7, 11], '7#9': [0, 4, 7, 10, 15],
  '7b9': [0, 4, 7, 10, 13], 13: [0, 4, 7, 10, 21], '6/9': [0, 4, 7, 9, 14], aug7: [0, 4, 8, 10], '7b5': [0, 4, 6, 10],
};
export const INTERVAL_NAMES = { 0: 'יסוד', 2: '2', 3: 'טרצה קטנה', 4: 'טרצה גדולה', 5: 'קוורטה', 6: 'קווינטה מוקטנת',
  7: 'קווינטה', 8: 'קווינטה מוגדלת', 9: 'סקסטה', 10: 'ספטימה קטנה', 11: 'ספטימה גדולה', 13: 'b9', 14: '9', 15: '#9', 21: '13' };

export const QUALITY_INFO = {
  '': ['מז׳ור', 'basic'], m: ['מינור', 'basic'], 7: ['שביעית דומיננטית', 'seventh'], maj7: ['מז׳ור 7', 'seventh'],
  m7: ['מינור 7', 'seventh'], sus2: ['sus2', 'sus'], sus4: ['sus4', 'sus'], '7sus4': ['7sus4', 'sus'],
  dim: ['מוקטן', 'dimaug'], dim7: ['מוקטן 7', 'dimaug'], m7b5: ['חצי מוקטן', 'dimaug'], aug: ['מוגדל', 'dimaug'],
  6: ['סקסטה', 'ext'], m6: ['מינור 6', 'ext'], add9: ['add9', 'sus'], 9: ['9', 'ext'], maj9: ['מז׳ור 9', 'ext'],
  m9: ['מינור 9', 'ext'], madd9: ['מינור add9', 'ext'], 5: ['פאוור קורד', 'basic'], mMaj7: ['מינור-מז׳ור 7', 'ext'],
  '7#9': ['7#9 (הנדריקס)', 'ext'], '7b9': ['7b9', 'ext'], 13: ['13', 'ext'], '6/9': ['6/9', 'ext'], aug7: ['מוגדל 7', 'dimaug'],
  '7b5': ['7b5', 'dimaug'],
};
export const QUALITY_GROUPS = [
  ['basic', 'בסיסיים'], ['seventh', 'שביעיות'], ['sus', 'sus ו-add'], ['dimaug', 'מוקטנים ומוגדלים'], ['ext', 'ג׳אז והרחבות'],
];

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PREF = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ROOTS = PREF;
export const NOTE_HE = ['דו', 'דו#', 'רה', 'מי♭', 'מי', 'פה', 'פה#', 'סול', 'סול#', 'לה', 'סי♭', 'סי'];

let spelling = 'auto';
export function setSpelling(s) { spelling = s; }
export function noteName(pc, keyHint) {
  pc = ((pc % 12) + 12) % 12;
  if (spelling === 'sharp') return SHARP[pc];
  if (spelling === 'flat') return FLAT[pc];
  if (keyHint != null && keyHint >= 0) {
    const flatKeys = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb (major)
    const root = keyHint >> 1, minor = keyHint & 1;
    const rel = minor ? (root + 3) % 12 : root;
    if (flatKeys.has(rel) && rel !== 6) return FLAT[pc];
    if (rel === 6 || [7, 2, 9, 4, 11].includes(rel)) return SHARP[pc];
  }
  return PREF[pc];
}

export const cidBase = (cid) => cid % (12 * NQ);
export const cidRoot = (cid) => Math.floor(cidBase(cid) / NQ);
export const cidQual = (cid) => cidBase(cid) % NQ;
export const cidBass = (cid) => Math.floor(cid / (12 * NQ)) - 1;
export function makeCid(root, q, bass = -1) {
  root = ((root % 12) + 12) % 12;
  const b = root * NQ + q;
  if (bass < 0 || bass === root) return b;
  return b + 12 * NQ * ((((bass % 12) + 12) % 12) + 1);
}
export function transposeCid(cid, n) {
  if (cid < 0 || !n) return cid;
  const b = cidBass(cid);
  return makeCid(cidRoot(cid) + n, cidQual(cid), b < 0 ? -1 : b + n);
}
export function chordName(cid, keyHint) {
  if (cid < 0) return 'N.C.';
  const r = cidRoot(cid), q = cidQual(cid), b = cidBass(cid);
  let s = noteName(r, keyHint) + QUALITIES[q];
  if (b >= 0) s += '/' + noteName(b, keyHint);
  return s;
}
// "basic" family used for filters & simplification
const BASIC = [0, 1, 2, 0, 1, 0, 0, 2, 3, 3, 3, 4, 0, 1, 0, 2, 0, 1, 1, 0, 1, 2, 2, 2, 0, 2, 2];
export const BASIC_SUFFIX = ['', 'm', '7', 'dim', 'aug'];
export const basicOf = (cid) => cidRoot(cid) * 5 + BASIC[cidQual(cid)];
export function simplifyCid(cid, level) {
  if (cid < 0 || !level) return cid;
  const q = cidQual(cid);
  const fam = BASIC[q];
  const map = [0, 1, 2, 8, 11];
  let nq = map[fam];
  if (level === 1) {
    // keep 7ths & sus, drop extensions
    const keep = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 19: 19 };
    if (keep[q] != null) nq = keep[q];
    else if (q === 16) nq = 3; else if (q === 17) nq = 4; else if ([15, 21, 22, 23, 25, 26].includes(q)) nq = 2;
  }
  if (level === 2 && q === 19) nq = 0;
  return makeCid(cidRoot(cid), nq, -1);
}

export function parseRoot(s) {
  const m = /^([A-Ga-g])([#b♯♭]*)/.exec(s);
  if (!m) return null;
  let r = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  for (const ch of m[2]) r += (ch === '#' || ch === '♯') ? 1 : -1;
  return { root: ((r % 12) + 12) % 12, rest: s.slice(m[0].length) };
}
const ALIAS = {
  '': '', M: '', maj: '', major: '', min: 'm', mi: 'm', '-': 'm', minor: 'm', M7: 'maj7', Maj7: 'maj7', ma7: 'maj7', 'Δ': 'maj7',
  'Δ7': 'maj7', j7: 'maj7', min7: 'm7', mi7: 'm7', '-7': 'm7', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', 'm7(b5)': 'm7b5',
  o: 'dim', '°': 'dim', o7: 'dim7', '°7': 'dim7', '+': 'aug', '+5': 'aug', sus: 'sus4', 2: 'sus2', add2: 'add9',
  '7sus': '7sus4', 'm(add9)': 'madd9', 'madd2': 'madd9', add11: '', 4: 'sus4', mmaj7: 'mMaj7', 'm(maj7)': 'mMaj7',
  mM7: 'mMaj7', '7+': 'aug7', '+7': 'aug7', '7#5': 'aug7', 11: '7sus4', m11: 'm7', maj13: 'maj9', m13: 'm9', 69: '6/9',
  '7b13': '7', '9sus4': '7sus4', 'm7add11': 'm7', 'add4': 'sus4', 'dim5': 'dim', '7(b9)': '7b9', '7(#9)': '7#9',
  '7M': 'maj7', 'sus2sus4': 'sus4', 'maj6': '6', 'min6': 'm6', 'min9': 'm9', 'maj7sus2': 'maj7', 'add9sus4': 'sus4',
  '9b5': '7b5', 'aug9': 'aug7', '7sus2': '7sus4', 'm6/9': 'm6', 'm69': 'm6', '6add9': '6/9', 'dim9': 'dim7', 'm9b5': 'm7b5',
};
export function parseChordSymbol(tok) {
  if (!tok) return null;
  tok = tok.trim().replace(/[()]$/, (m) => m);
  let bass = -1;
  let main = tok;
  const slash = tok.lastIndexOf('/');
  if (slash > 0 && !/6\/9$/.test(tok)) {
    const br = parseRoot(tok.slice(slash + 1));
    if (br && br.rest === '') { bass = br.root; main = tok.slice(0, slash); }
  }
  const r = parseRoot(main);
  if (!r) return null;
  let rest = r.rest.replace(/^\((.*)\)$/, '$1');
  let q = ALIAS[rest] != null ? ALIAS[rest] : rest;
  if (QI[q] == null) {
    // try stripping parentheses like 7(9)
    const s2 = rest.replace(/[()]/g, '');
    q = ALIAS[s2] != null ? ALIAS[s2] : s2;
    if (QI[q] == null) return null;
  }
  return makeCid(r.root, QI[q], bass);
}

export function chordTones(cid) {
  const r = cidRoot(cid), q = QUALITIES[cidQual(cid)];
  return INTERVALS[q].map((iv) => ({ pc: (r + iv) % 12, iv }));
}
export function keyName(k) {
  if (k == null || k < 0) return '';
  return noteName(k >> 1, k) + (k & 1 ? 'm' : '');
}
export function b36(s, i) { return parseInt(s.substr(i, 2), 36); }
export function decodeChordList(s) { const out = []; for (let i = 0; i < s.length; i += 2) out.push(b36(s, i)); return out; }
