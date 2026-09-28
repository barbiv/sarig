// "What's new" sheet shown once after an update
import { getState, update } from './store.js';
import { openSheet, esc } from './ui.js';

export const CHANGES = [
  { v: '1.1.1', date: '2026-09-29', items: ['קישורי יוטיוב חדשים מגיעים לאפליקציה מיד, בלי לחכות לעדכון'] },
  { v: '1.1.0', date: '2026-09-29', items: [
    'Play Along חדש בסגנון JustinGuitar: שורות מילים עם אקורדים מעליהן, סימון שרץ בזמן אמת, תיבות אקורדים ודפוס פריטה',
    'חיבור אוטומטי לשיר המקורי ביוטיוב — בלי להדביק קישורים',
    'מילים מסונכרנות לשירים (כשהן קיימות במאגר LRCLIB)',
    'ייבוא מטאב4יו משודרג: האקורדים יושבים מעל המילים, וסנכרון אוטומטי לשיר המקורי',
    'התאמה מלאה לאייפון: הטאבים צמודים לתחתית, גלילה חלקה בכל המסכים, לחיצה על שורת הסטטוס גוללת למעלה, החלקה מהקצה חוזרת אחורה',
    'המשך מהמקום שעצרתם, חיפוש לפי אקורדים ועוד שיפורים קטנים',
  ] },
  { v: '1.0.0', date: '2026-09-28', items: ['השקה: Play Along, ספריית אקורדים, אימון מעברים והתקדמות'] },
];
export function showWhatsNew(force = false) {
  const st = getState();
  if (!force && st.seenVersion === APP_VERSION) return;
  if (!force && !st.seenVersion) { update((s) => { s.seenVersion = APP_VERSION; }); }
  const list = force ? CHANGES : CHANGES.filter((c) => !st.seenVersion || cmp(c.v, st.seenVersion) > 0);
  update((s) => { s.seenVersion = APP_VERSION; });
  if (!list.length) return;
  openSheet({ title: force ? 'היסטוריית גרסאות' : `מה חדש בגרסה ${APP_VERSION}`, body: list.map((c) => `
    <div class="section-t" style="margin-top:6px">גרסה ${esc(c.v)} · ${esc(c.date.split('-').reverse().join('.'))}</div>
    <ul class="wn">${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('') });
}
function cmp(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; }
