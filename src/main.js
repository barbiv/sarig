import { loadState, getState, update, requestPersist } from './store.js';
import { loadIndex, mergeMine } from './library.js';
import { loadChordDb } from './chorddb.js';
import { setSpelling } from './theory.js';
import { h, icon, toast } from './ui.js';
import { app } from './app.js';
import * as Songs from './views/songs.js';
import * as Tuner from './views/tuner.js';
import * as Chords from './views/chords.js';
import * as Trainer from './views/trainer.js';
import * as Progress from './views/progress.js';
import { openPlayer } from './views/player.js';
import { openEditor } from './views/editor.js';
import { ensureAudio } from './audio.js';
import { initNav, hasScreens, refreshTopbar } from './nav.js';
import { showWhatsNew } from './whatsnew.js';
import * as Mic from './mic.js';
import { parseChordSymbol } from './theory.js';
window.__sarig = { Mic, parseChordSymbol };

const TABS = [
  { id: 'songs', label: 'שירים', icon: 'songs', mod: Songs },
  { id: 'chords', label: 'אקורדים', icon: 'chords', mod: Chords },
  { id: 'tuner', label: 'כוונון', icon: 'tuner', mod: Tuner },
  { id: 'trainer', label: 'אימון', icon: 'timer', mod: Trainer },
  { id: 'progress', label: 'התקדמות', icon: 'chart', mod: Progress },
];
const mounted = new Set();
const scrollPos = {};
let current = null;
const pageOf = (id) => document.getElementById('v-' + id);

function go(id, { top = false } = {}) {
  if (id !== 'favs' && !TABS.some((t) => t.id === id)) id = 'songs';
  if (current && current !== id) {
    scrollPos[current] = window.scrollY;
    const prev = TABS.find((x) => x.id === current);
    if (prev && prev.mod.onHide) prev.mod.onHide();
  }
  if (id === 'favs') { id = 'songs'; setTimeout(() => Songs.setScope && Songs.setScope('fav'), 0); }
  for (const t of TABS) {
    const on = t.id === id;
    pageOf(t.id).classList.toggle('hidden-page', !on);
    document.querySelector(`.tab[data-tab="${t.id}"]`).setAttribute('aria-selected', String(on));
  }
  const t = TABS.find((x) => x.id === id);
  const body = pageOf(id).querySelector('.vbody');
  if (!mounted.has(id)) { t.mod.mount(body); mounted.add(id); } else if (t.mod.onShow) t.mod.onShow();
  const changed = current !== id;
  current = id;
  window.scrollTo(0, top ? 0 : (changed ? scrollPos[id] || 0 : window.scrollY));
  refreshTopbar();
  update((s) => { s.settings.tab = id; });
  history.replaceState(history.state, '', '#' + id);
}

async function boot() {
  const splash = document.getElementById('splash');
  await loadState();
  const st = getState();
  setSpelling(st.settings.spelling || 'auto');
  Progress.applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', Progress.applyTheme);
  try {
    await Promise.all([loadIndex(), loadChordDb()]);
  } catch (e) {
    splash.querySelector('p').textContent = 'לא הצלחנו לטעון את המאגר. בדקו חיבור לאינטרנט ונסו שוב.';
    return;
  }
  mergeMine();
  const appEl = document.getElementById('app');
  appEl.innerHTML = `<main id="pages">${TABS.map((t) => `<section class="page tabpage hidden-page" id="v-${t.id}" aria-label="${t.label}">
      <header class="topbar"><div class="tb-inner"><b class="tb-title">${t.label}</b></div></header><div class="vbody"></div></section>`).join('')}</main>
    <nav class="tabbar" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="false">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</nav>`;
  initNav(appEl.querySelector('#pages'), () => pageOf(current));
  appEl.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    if (b.dataset.tab === current) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go(b.dataset.tab);
  });
  app.go = go;
  app.openPlayer = openPlayer;
  app.openEditor = (song, opts) => openEditor(song, opts);
  app.showSongsWithChords = (basics, mode) => { go('songs'); Songs.setChordFilter(basics, mode); };
  app.refresh = () => { mergeMine(); const t = TABS.find((x) => x.id === current); if (t && mounted.has(t.id) && t.mod.onShow) t.mod.onShow(); if (mounted.has('songs')) Songs.refresh(false); };
  const hash = location.hash.slice(1);
  go(TABS.some((t) => t.id === hash) ? hash : st.settings.tab || 'songs');
  splash.remove();
  // storage persistence + audio unlock on first interaction
  const first = () => { requestPersist(); ensureAudio(); window.removeEventListener('pointerdown', first); };
  window.addEventListener('pointerdown', first);
  if (!st.onboarded) onboarding(); else showWhatsNew();
}

function onboarding() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const el = h(`<div class="onb" role="dialog" aria-label="ברוכים הבאים">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>סריג.<br>לומדים גיטרה עם שירים.</h1>
    <p>אלפי שירים עם אקורדים שרצים בזמן אמת, ספריית אקורדים מלאה, ואימוני מעברים שמודדים את ההתקדמות שלכם.</p>
    <ul>
      <li><i>${icon('songs')}</i><div><b>Play Along</b><span>ליווי מובנה בכל קצב, או השיר המקורי מיוטיוב עם טיימליין מסונכרן.</span></div></li>
      <li><i>${icon('chords')}</i><div><b>כל האקורדים</b><span>עד 4 צורות אחיזה לכל אקורד, עם אצבעות, ברה וקאפו.</span></div></li>
      <li><i>${icon('timer')}</i><div><b>אימון ושיאים</b><span>טיימר, מטרונום, גרפים ולוח אימונים.</span></div></li>
    </ul>
    ${ios && !standalone && window.self === window.top ? `<div class="card install"><b>להתקנה באייפון</b><span class="note">בספארי: לחצו על ${icon('share').replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px"')} שיתוף ← ״הוספה למסך הבית״. כך האפליקציה תיפתח במסך מלא והנתונים יישמרו בצורה הכי יציבה.</span></div>` : ''}
    <div style="flex:1"></div>
    <button class="btn primary block" style="height:54px;font-size:18px">בואו נתחיל</button></div>`);
  document.body.append(el);
  el.querySelector('button.btn').addEventListener('click', () => { update((s) => { s.onboarded = Date.now(); s.seenVersion = APP_VERSION; }, true); el.remove(); requestPersist(); });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('גרסה חדשה מוכנה — תופעל בפתיחה הבאה', 3500); });
      });
    }).catch(() => {});
  });
}
boot();
