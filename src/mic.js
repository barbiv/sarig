// Microphone engine: pitch detection (tuner) and chord recognition (listening feedback).
import { ensureAudio, audioCtx } from './audio.js';
import { INTERVALS, QUALITIES, cidRoot, cidQual, NQ } from './theory.js';

let stream = null, source = null, analyser = null, users = 0, mode = null;
let timeBuf = null, freqBuf = null;

export function micSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

// opts.echo: keep echo cancellation (useful while the app plays backing audio)
export async function startMic({ echo = false } = {}) {
  const want = echo ? 'echo' : 'raw';
  users++;
  if (stream && mode === want) return analyser;
  if (stream) stopTracks();
  ensureAudio();
  const ctx = audioCtx();
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* older iOS */ }
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: echo, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  mode = want;
  source = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);
  timeBuf = new Float32Array(analyser.fftSize);
  freqBuf = new Float32Array(analyser.frequencyBinCount);
  if (ctx.state === 'suspended') await ctx.resume();
  return analyser;
}
function stopTracks() {
  try { source && source.disconnect(); } catch (e) { /* */ }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; source = null; analyser = null;
}
export function stopMic() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  stopTracks();
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* */ }
}
export function micActive() { return !!stream; }

function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }

// ---------------------------------------------------------------- pitch (McLeod pitch method)
export function readPitch() {
  if (!analyser) return null;
  analyser.getFloatTimeDomainData(timeBuf);
  const level = rms(timeBuf);
  if (level < 0.008) return { freq: 0, level, clarity: 0 };
  const sr = audioCtx().sampleRate;
  const N = 4096, buf = timeBuf.subarray(timeBuf.length - N);
  const minLag = Math.floor(sr / 1400), maxLag = Math.floor(sr / 60);
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = minLag; tau <= maxLag + 1; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i < N - tau; i++) { const a = buf[i], b = buf[i + tau]; acf += a * b; m += a * a + b * b; }
    nsdf[tau] = m ? (2 * acf) / m : 0;
  }
  // pick the first peak above k * highest peak
  let maxPeak = 0; const peaks = [];
  let pos = false;
  for (let tau = minLag + 1; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0 && nsdf[tau - 1] <= 0) pos = true;
    if (pos && nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) { peaks.push(tau); if (nsdf[tau] > maxPeak) maxPeak = nsdf[tau]; }
  }
  if (!peaks.length || maxPeak < 0.5) return { freq: 0, level, clarity: maxPeak };
  const tau = peaks.find((p) => nsdf[p] >= 0.9 * maxPeak);
  const a = nsdf[tau - 1], b = nsdf[tau], c = nsdf[tau + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  const period = tau + (Number.isFinite(shift) ? shift : 0);
  return { freq: sr / period, level, clarity: b };
}

// ---------------------------------------------------------------- chroma + chord matching
let chromaAvg = new Float32Array(12);
let noiseFloor = 0.004;
export function readChroma() {
  if (!analyser) return null;
  analyser.getFloatTimeDomainData(timeBuf);
  const level = rms(timeBuf);
  analyser.getFloatFrequencyData(freqBuf);
  const sr = audioCtx().sampleRate, n = freqBuf.length, binHz = sr / 2 / n;
  const lo = Math.floor(70 / binHz), hi = Math.min(n - 2, Math.ceil(1800 / binHz));
  const mag = new Float32Array(hi + 2);
  for (let k = lo - 1; k <= hi + 1; k++) mag[k] = Math.pow(10, freqBuf[k] / 20);
  const chroma = new Float32Array(12);
  for (let k = lo; k <= hi; k++) {
    const m = mag[k];
    if (!(m > mag[k - 1] && m >= mag[k + 1])) continue;
    // local whitening: compare with neighbourhood average
    let avg = 0, cnt = 0; const w = Math.max(3, Math.round(k * 0.06));
    for (let j = Math.max(lo, k - w); j <= Math.min(hi, k + w); j++) { avg += mag[j]; cnt++; }
    avg /= cnt;
    const v = m - avg * 1.4;
    if (v <= 0) continue;
    const f = k * binHz;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const cents = Math.abs(midi - Math.round(midi));
    const wLow = f < 110 ? 0.8 : f > 1000 ? 0.6 : 1;
    chroma[pc] += v * (1 - cents) * wLow;
  }
  let norm = 0; for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 12; i++) chroma[i] /= norm;
  // quiet frames decay the running average instead of polluting it
  const active = level > Math.max(0.01, noiseFloor * 3);
  if (!active) noiseFloor = noiseFloor * 0.98 + level * 0.02;
  for (let i = 0; i < 12; i++) chromaAvg[i] = active ? chromaAvg[i] * 0.5 + chroma[i] * 0.5 : chromaAvg[i] * 0.85;
  return { chroma: chromaAvg, level, active };
}
export function resetChroma() { chromaAvg = new Float32Array(12); }

const tplCache = new Map();
function template(cid) {
  const base = cid % (12 * NQ);
  if (tplCache.has(base)) return tplCache.get(base);
  const r = cidRoot(base), q = QUALITIES[cidQual(base)];
  const t = new Float32Array(12);
  // chord tones plus their strongest harmonics (octaves, 12th = fifth, 17th = major third)
  INTERVALS[q].forEach((iv, i) => {
    const w = i === 0 ? 1 : iv % 12 === 7 ? 0.8 : (iv % 12 === 3 || iv % 12 === 4) ? 1 : 0.7;
    const pc = (r + iv) % 12;
    t[pc] += w * 1.6;
    t[(pc + 7) % 12] += w * 0.33;
    t[(pc + 4) % 12] += w * 0.15;
  });
  let n = 0; for (let i = 0; i < 12; i++) n += t[i] * t[i];
  n = Math.sqrt(n); for (let i = 0; i < 12; i++) t[i] /= n;
  tplCache.set(base, t);
  return t;
}
export function chordScore(chroma, cid) {
  const t = template(cid); let s = 0;
  for (let i = 0; i < 12; i++) s += chroma[i] * t[i];
  return s;
}
const COMMON = [];
for (let r = 0; r < 12; r++) for (const q of [0, 1, 2, 4]) COMMON.push(r * NQ + q);
// Is the expected chord what's being played? returns { ok, score, best, bestScore, level }
export function matchChord(expected, { alternatives = COMMON } = {}) {
  const c = readChroma();
  if (!c) return null;
  if (!c.active) return { ok: false, silent: true, score: 0, level: c.level };
  const score = chordScore(c.chroma, expected);
  let best = expected, bestScore = score;
  for (const a of alternatives) { const s = chordScore(c.chroma, a); if (s > bestScore) { bestScore = s; best = a; } }
  const ok = score >= 0.64 && score >= bestScore - 0.06;
  return { ok, score, best, bestScore, level: c.level, silent: false };
}
// Which of these chords is being played (for exercises)? returns index or -1
export function whichChord(cids) {
  const c = readChroma();
  if (!c || !c.active) return { idx: -1, silent: true };
  const sc = cids.map((x) => chordScore(c.chroma, x));
  let bi = 0; sc.forEach((s, i) => { if (s > sc[bi]) bi = i; });
  const second = Math.max(...sc.filter((_, i) => i !== bi), 0);
  return { idx: sc[bi] >= 0.62 && sc[bi] - second >= 0.025 ? bi : -1, score: sc[bi], silent: false, scores: sc };
}
