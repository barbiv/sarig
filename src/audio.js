// Web Audio guitar: Karplus-Strong plucked strings, strums, metronome clicks.
import { voicingMidi } from './chorddb.js';

let ctx = null, master = null, bus = null, clickBus = null;
const bufs = new Map();
const voices = new Array(6).fill(null);
let volume = 0.9;

export function audioCtx() { return ctx; }
export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
  const body1 = ctx.createBiquadFilter(); body1.type = 'peaking'; body1.frequency.value = 110; body1.Q.value = 1.2; body1.gain.value = 5;
  const body2 = ctx.createBiquadFilter(); body2.type = 'peaking'; body2.frequency.value = 240; body2.Q.value = 1.4; body2.gain.value = 3;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 3800; air.gain.value = -4;
  bus = ctx.createGain(); bus.gain.value = 0.55;
  bus.connect(body1); body1.connect(body2); body2.connect(air); air.connect(comp);
  clickBus = ctx.createGain(); clickBus.gain.value = 0.5; clickBus.connect(comp);
  comp.connect(master); master.connect(ctx.destination);
  // silent unlock buffer for iOS
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
  return ctx;
}
export function setVolume(v) { volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
export function setMix({ guitar, click } = {}) {
  if (!ctx) return;
  if (guitar != null) bus.gain.setTargetAtTime(guitar * 0.55, ctx.currentTime, 0.02);
  if (click != null) clickBus.gain.setTargetAtTime(click * 0.5, ctx.currentTime, 0.02);
}

function noteBuffer(midi) {
  if (bufs.has(midi)) return bufs.get(midi);
  const sr = ctx.sampleRate;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const dur = midi < 52 ? 3.2 : 2.6;
  const len = Math.floor(sr * dur);
  const buffer = ctx.createBuffer(1, len, sr);
  const out = buffer.getChannelData(0);
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  // excitation: filtered noise with pick-position comb
  let prev = 0;
  for (let i = 0; i < N; i++) { const n = Math.random() * 2 - 1; prev = prev * 0.45 + n * 0.55; ring[i] = prev; }
  const pp = Math.max(1, Math.floor(N * 0.13));
  for (let i = N - 1; i >= pp; i--) ring[i] -= ring[i - pp] * 0.8;
  const decay = 0.9985 - Math.min(0.006, (freq - 80) / 180000);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx], nidx = idx + 1 === N ? 0 : idx + 1, b = ring[nidx];
    out[i] = a;
    ring[idx] = decay * 0.5 * (a + b);
    idx = nidx;
  }
  // soft attack + tail fade
  const att = Math.floor(sr * 0.002);
  for (let i = 0; i < att; i++) out[i] *= i / att;
  const fade = Math.floor(sr * 0.3);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  bufs.set(midi, buffer);
  return buffer;
}
export function warmNotes(midis) { if (!ctx) return; for (const m of midis) if (m > 0) noteBuffer(m); }

function pluck(string, midi, t, vel, dur) {
  if (voices[string]) {
    const vo = voices[string];
    try { vo.g.gain.cancelScheduledValues(t); vo.g.gain.setTargetAtTime(0, t, 0.012); vo.s.stop(t + 0.12); } catch (e) { /* ignore */ }
  }
  const s = ctx.createBufferSource();
  s.buffer = noteBuffer(midi);
  const g = ctx.createGain();
  g.gain.value = vel;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = (string - 2.5) * 0.06; s.connect(g); g.connect(pan); pan.connect(bus); } else { s.connect(g); g.connect(bus); }
  s.start(t);
  if (dur) { g.gain.setTargetAtTime(0, t + dur, 0.05); s.stop(t + dur + 0.4); }
  voices[string] = { s, g };
}

// dir: 'D' or 'U'; vel 0..1
export function strum(v, t, { dir = 'D', vel = 0.8, capo = 0, spread = null, strings = null } = {}) {
  if (!ctx || !v) return;
  const midi = voicingMidi(v, capo);
  let order = [0, 1, 2, 3, 4, 5].filter((s) => midi[s] > 0);
  if (strings) order = order.filter((s) => strings.includes(s));
  if (dir === 'U') order = order.reverse().slice(0, 4);
  const sp = spread != null ? spread : (dir === 'U' ? 0.009 : 0.013);
  order.forEach((s, k) => pluck(s, midi[s], t + k * sp, vel * (dir === 'U' ? 0.55 : 0.75) * (0.9 + Math.random() * 0.2)));
}
export function pickString(v, string, t, { vel = 0.7, capo = 0 } = {}) {
  if (!ctx || !v) return;
  const midi = voicingMidi(v, capo);
  if (midi[string] > 0) pluck(string, midi[string], t, vel);
}
export function bassString(v) { return v ? v.f.findIndex((x) => x >= 0) : -1; }
export function muteAll(t) {
  if (!ctx) return;
  t = t || ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const vo = voices[i];
    if (vo) { try { vo.g.gain.cancelScheduledValues(t); vo.g.gain.setTargetAtTime(0, t, 0.02); vo.s.stop(t + 0.2); } catch (e) { /* */ } voices[i] = null; }
  }
}
export function click(t, accent = false, vol = 1) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = accent ? 1760 : 1175;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime((accent ? 0.9 : 0.55) * vol, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.06);
  o.connect(g); g.connect(clickBus);
  o.start(t); o.stop(t + 0.08);
}
// Quick preview of a chord (library / trainer)
export function previewChord(v, { capo = 0, arp = false } = {}) {
  ensureAudio();
  const t = ctx.currentTime + 0.03;
  muteAll(t - 0.01);
  if (arp) {
    const midi = voicingMidi(v, capo);
    let k = 0;
    for (let s = 0; s < 6; s++) if (midi[s] > 0) { pluck(s, midi[s], t + k * 0.16, 0.7); k++; }
  } else strum(v, t, { dir: 'D', vel: 0.95, capo, spread: 0.022 });
}
