// Persistent state: IndexedDB (primary) + localStorage mirror, debounced writes.
const DB_NAME = 'fretline';
const KEY = 'state';
const LS_KEY = 'fretline-state';

const DEFAULT = () => ({
  v: 1,
  _ts: 0,
  created: Date.now(),
  favorites: {},
  known: [],
  recent: [],
  settings: { lefty: false, spelling: 'auto', theme: 'auto', sound: 'strum', countIn: true, metronome: false,
    haptics: true, simplify: 0, volume: 0.85, clickVol: 0.7, view: 'lane', diagrams: true },
  songPrefs: {},
  plays: [],
  practice: [],
  exercises: [],
  mySongs: {},
  dayGoal: 15,
});

let state = DEFAULT();
let db = null;
const listeners = new Set();

function idb() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no idb'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readonly');
    const q = tx.objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbSet(k, v) {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function kvGet(k) { try { return await idbGet(k); } catch (e) { return null; } }
export async function kvSet(k, v) { try { await idbSet(k, v); } catch (e) { /* ignore */ } }

function merge(base, s) {
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  return out;
}

export async function loadState() {
  let a = null, b = null;
  try { a = await idbGet(KEY); } catch (e) { a = null; }
  try { const t = localStorage.getItem(LS_KEY); b = t ? JSON.parse(t) : null; } catch (e) { b = null; }
  const pick = a && b ? (a._ts >= b._ts ? a : b) : (a || b);
  state = pick ? merge(DEFAULT(), pick) : DEFAULT();
  return state;
}
export function getState() { return state; }

let timer = null;
export function save(immediate = false) {
  state._ts = Date.now();
  clearTimeout(timer);
  const run = () => {
    const snap = JSON.parse(JSON.stringify(state));
    idbSet(KEY, snap).catch(() => {});
    try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) { /* quota */ }
  };
  if (immediate) run(); else timer = setTimeout(run, 350);
  listeners.forEach((f) => f(state));
}
export function update(fn, immediate) { fn(state); save(immediate); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });
window.addEventListener('pagehide', () => save(true));

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* ignore */ }
  return false;
}
export async function persistStatus() {
  try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { return false; }
}
export function exportJSON() { return JSON.stringify({ app: 'fretline', exported: new Date().toISOString(), state }, null, 1); }
export function importJSON(txt) {
  const d = JSON.parse(txt);
  const s = d.state || d;
  if (!s || typeof s !== 'object' || !('favorites' in s)) throw new Error('bad file');
  state = merge(DEFAULT(), s);
  save(true);
}
export function resetAll() { state = DEFAULT(); save(true); }

// ---- helpers
export function isFav(k) { return !!state.favorites[k]; }
export function toggleFav(k) { update((s) => { if (s.favorites[k]) delete s.favorites[k]; else s.favorites[k] = Date.now(); }); return isFav(k); }
export function songPref(k) { return state.songPrefs[k] || (state.songPrefs[k] = {}); }
export function pushRecent(k) {
  update((s) => { s.recent = [k, ...s.recent.filter((x) => x !== k)].slice(0, 30); });
}
export function logPlay(k, sec, mode, acc = null) {
  if (sec < 5) return;
  update((s) => { const rec = { k, t: Date.now() - sec * 1000, d: Math.round(sec), m: mode }; if (acc != null) rec.acc = acc; s.plays.push(rec); if (s.plays.length > 5000) s.plays.splice(0, 1000); });
}
export function logPractice(rec) { update((s) => { s.practice.push(rec); }, true); }
