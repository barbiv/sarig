import { loadState, getState, update, requestPersist } from './store.js';
import { loadIndex, mergeMine } from './library.js';
import { loadChordDb } from './chorddb.js';
import { setSpelling } from './theory.js';
import { h, icon, toast } from './ui.js';
import { app } from './app.js';
import * as Songs from './views/songs.js';
import * as Favs from './views/favorites.js';
import * as Chords from './views/chords.js';
import * as Trainer from './views/trainer.js';
import * as Progress from './views/progress.js';
import { openPlayer } from './views/player.js';
import { openEditor } from './views/editor.js';
import { ensureAudio } from './audio.js';

const TABS = [
  { id: 'songs', label: 'שירים', icon: 'songs', mod: Songs },
  { id: 'favs', label: 'מועדפים', icon: 'star', mod: Favs },
  { id: 'chords', label: 'אקורדים', icon: 'chords', mod: Chords },
  { id: 'trainer', label: 'אימון', icon: 'timer', mod: Trainer },
  { id: 'progress', label: 'התקדמות', icon: 'chart', mod: Progress },
];
const mounted = new Set();
let current = null;

function go(id) {
  if (!TABS.some((t) => t.id === id)) id = 'songs';
  for (const t of TABS) {
    const v = document.getElementById('v-' + t.id);
    const on = t.id === id;
    v.hidden = !on;
    document.querySelector(`.tab[data-tab="${t.id}"]`).setAttribute('aria-selected', String(on));
    if (on) {
      if (!mounted.has(t.id)) { t.mod.mount(v); mounted.add(t.id); } else if (current !== id || true) t.mod.onShow && t.mod.onShow();
    }
  }
  current = id;
  update((s) => { s.settings.tab = id; });
  history.replaceState(null, '', '#' + id);
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
  appEl.innerHTML = `<main class="views">${TABS.map((t) => `<section class="view" id="v-${t.id}" hidden aria-label="${t.label}"></section>`).join('')}</main>
    <nav class="tabbar" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="false">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</nav>`;
  appEl.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    if (b.dataset.tab === current) { const v = document.getElementById('v-' + current); v.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    go(b.dataset.tab);
  });
  app.go = go;
  app.openPlayer = openPlayer;
  app.openEditor = (song, opts) => openEditor(song, opts);
  app.showSongsWithChords = (basics, mode) => { go('songs'); Songs.setChordFilter(basics, mode); };
  app.refresh = () => { mergeMine(); const t = TABS.find((x) => x.id === current); if (t && mounted.has(t.id) && t.mod.onShow) t.mod.onShow(); if (mounted.has('songs')) Songs.refresh(false); };
  const hash = location.hash.slice(1);
  go(hash || st.settings.tab || 'songs');
  splash.remove();
  // storage persistence + audio unlock on first interaction
  const first = () => { requestPersist(); ensureAudio(); window.removeEventListener('pointerdown', first); };
  window.addEventListener('pointerdown', first);
  if (!st.onboarded) onboarding();
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
  el.querySelector('button.btn').addEventListener('click', () => { update((s) => { s.onboarded = Date.now(); }, true); el.remove(); requestPersist(); });
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
