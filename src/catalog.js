// Israeli songs that are not in the open chord databases: listed by name only (no chords, no lyrics).
// Opening one walks the user through the one-tap import from a chord site; the imported song is stored on the device.
import { h, icon, openSheet, esc } from './ui.js';
import { actionSheet } from './polish.js';
import { importFromClipboard, openGuide } from './importer.js';

const RAICHEL = 'הפרויקט של עידן רייכל';
const TUNA = 'טונה';
export const CATALOG = [
  ...['שושנים עצובות', 'רוב השעות', 'מדברים בשקט', 'הנך יפה', 'בואי', 'מילים יפות מאלה', 'שובי אל ביתי', 'האהבה שלי'].map((t) => ({ t, a: RAICHEL, aka: 'עידן רייכל idan raichel' })),
  ...['סחרחורת', 'י"א 2', 'גם זה יעבור', 'השם ירחם', 'סהרה', 'כל הכוכבים', 'יודעת לסובב', 'היי בייב', 'גלגל ענק', 'דאנג', 'עד הבוקר', 'אבודים בחלל', 'היה מדבר', 'קשה בכדור הארץ', 'ילד פריפריה'].map((t) => ({ t, a: TUNA, aka: 'tuna' })),
];
const nrm = (s) => String(s || '').toLowerCase().replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim();
export function catalogMatches(q, haveTitles) {
  const n = nrm(q);
  if (n.length < 2) return [];
  return CATALOG.filter((x) => !haveTitles.has(nrm(x.t)) && (nrm(x.t).includes(n) || nrm(x.a).includes(n) || nrm(x.aka).includes(n)));
}
export const tab4uSearch = (q) => `https://www.tab4u.com/resultsSimple?tab=songs&q=${encodeURIComponent(q)}`;

// when the user comes back from the chord site, offer the import right away (one tap; iOS needs a tap to read the clipboard)
let pending = null, watching = false;
function watchReturn() {
  if (watching) return; watching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !pending) return;
    const it = pending; pending = null;
    setTimeout(() => actionSheet({ title: 'חזרתם מהאתר', sub: it.t, actions: [{ label: 'ייבוא השיר שהעתקתם', icon: 'paste', run: importFromClipboard }] }), 250);
  });
}
export function openImportFor(item) {
  const q = item.a ? `${item.t} ${item.a === RAICHEL ? 'עידן רייכל' : item.a}` : item.t;
  const body = h(`<div class="guide">
    <p class="note">${item.a ? `״${esc(item.t)}״ של ${esc(item.a)} עוד לא נמצא במאגר המובנה.` : `מחפשים את ״${esc(item.t)}״?`} מייבאים אותו פעם אחת עם מילים ואקורדים, והוא נשמר במכשיר — עם סנכרון לשיר המקורי כשאפשר.</p>
    <ol>
      <li><a class="btn primary sm" href="${tab4uSearch(q)}" target="_blank" rel="noopener">${icon('search')} פתיחת השיר בטאב4יו</a></li>
      <li>בדף השיר בספארי — בחרו בסימנייה <b>״לסריג״</b> ולחצו <b>העתק</b>. <button class="lnk" data-guide>אין לי את הסימנייה</button></li>
      <li>חזרו לכאן:<br><button class="btn sync sm" data-imp style="margin-top:8px">${icon('paste')} ייבוא מהלוח</button></li>
    </ol></div>`);
  body.querySelector('a.btn').addEventListener('click', () => { pending = item; watchReturn(); });
  body.querySelector('[data-guide]').addEventListener('click', () => { sh.close(); setTimeout(openGuide, 300); });
  body.querySelector('[data-imp]').addEventListener('click', () => { sh.close(); setTimeout(importFromClipboard, 300); });
  const sh = openSheet({ title: item.t, body });
}
