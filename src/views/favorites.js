import { SONGS, byKey } from '../library.js';
import { getState } from '../store.js';
import { esc, icon } from '../ui.js';
import { songRowHTML, onListClickFactory } from './songs.js';
import { app } from '../app.js';

let el;
export function mount(root) {
  el = root;
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-go]')) { app.go('songs'); return; }
    if (e.target.closest('[data-add]')) { app.openEditor(null); return; }
    handler(e);
    if (e.target.closest('[data-fav]')) setTimeout(render, 250);
  });
  render();
}
const handler = onListClickFactory((k) => byKey(k));
export function onShow() { render(); }

function render() {
  if (!el) return;
  const st = getState();
  const favs = Object.entries(st.favorites).sort((a, b) => b[1] - a[1]).map(([k]) => byKey(k)).filter(Boolean);
  const recent = st.recent.map(byKey).filter(Boolean).filter((s) => !st.favorites[s.k]).slice(0, 8);
  const mine = SONGS.filter((s) => s.mine);
  const plays = {};
  st.plays.forEach((p) => { plays[p.k] = (plays[p.k] || 0) + p.d; });
  const row = (s) => songRowHTML(s, { static: true });
  el.innerHTML = `
    <div class="vhead"><div><h1>מועדפים</h1><div class="sub">${favs.length} שירים שמורים · גישה מהירה לנגינה</div></div>
      <button class="iconbtn" data-add aria-label="הוספת שיר">${icon('plus')}</button></div>
    ${favs.length ? `<div class="rows" style="padding:0 12px">${favs.map(row).join('')}</div>`
      : `<div class="card empty" style="padding:30px 18px"><b>עוד אין מועדפים</b>לחצו על הכוכב ליד שיר כדי לשמור אותו כאן.<br><br><button class="btn primary" data-go>${icon('songs')} לרשימת השירים</button></div>`}
    ${recent.length ? `<div class="section-t">נוגנו לאחרונה</div><div class="rows" style="padding:0 12px">${recent.map(row).join('')}</div>` : ''}
    ${mine.length ? `<div class="section-t">השירים שלי <span>${mine.length}</span></div><div class="rows" style="padding:0 12px">${mine.map(row).join('')}</div>` : ''}
    ${favs.length ? `<p class="note" style="margin-top:16px">זמן תרגול בשירים המועדפים: ${favs.map((s) => plays[s.k] ? `${esc(s.t)} ${Math.round(plays[s.k] / 60)} דק׳` : '').filter(Boolean).slice(0, 5).join(' · ') || 'עוד לא נוגנו'}</p>` : ''}`;
  el.querySelectorAll('.song').forEach((b) => { b.style.borderBottom = '1px solid var(--line)'; });
  el.querySelectorAll('.rows .song:last-child').forEach((b) => { b.style.borderBottom = '0'; });
}
