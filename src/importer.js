// Import songs copied from chord sites (clipboard) + the one-tap Safari bookmark guide.
import { BOOKMARKLET } from './bookmarklet_url.js';
import { h, icon, openSheet, toast } from './ui.js';
import { app } from './app.js';
import { isChordToken } from './library.js';

export function looksLikeSheet(txt) {
  if (!txt) return false;
  const lines = txt.split('\n');
  let n = 0;
  for (const l of lines) { const t = l.trim().split(/\s+/).filter(Boolean); if (t.length && t.filter((x) => isChordToken(x) === 'chord').length >= Math.max(1, t.length * 0.6)) n++; }
  return n >= 2;
}
export async function importFromClipboard() {
  let txt = '';
  try { txt = await navigator.clipboard.readText(); } catch (e) { /* denied */ }
  if (!txt) { app.openEditor(null, { importMode: true }); toast('הדביקו את השיר בשדה'); return; }
  if (!looksLikeSheet(txt)) { toast('בלוח אין שיר עם אקורדים — העתיקו שיר ונסו שוב'); openGuide(); return; }
  app.openEditor(null, { importText: txt });
}
export function openGuide() {
  const body = h(`<div class="guide">
    <p class="note">עם הסימנייה ״לסריג״ בספארי מעתיקים שיר מכל אתר אקורדים (טאב4יו, נגנו, Ultimate Guitar ועוד) בלחיצה אחת — בלי לסמן טקסט.</p>
    <div class="section-t">התקנה (פעם אחת)</div>
    <ol>
      <li>לחצו כאן כדי להעתיק את הקוד של הסימנייה:<br><button class="btn primary sm" data-copy style="margin-top:8px">${icon('paste')} העתקת הסימנייה</button></li>
      <li>בספארי פתחו דף כלשהו ← כפתור השיתוף ← <b>הוספת סימנייה</b> ← שמרו.</li>
      <li>פתחו את הסימניות ← <b>ערוך</b> ← בחרו את הסימנייה החדשה ← שנו את השם ל־<b>לסריג</b> ← מחקו את הכתובת והדביקו במקומה את הקוד.</li>
    </ol>
    <div class="section-t">שימוש</div>
    <ol>
      <li>בדף של שיר באתר אקורדים — הקישו בשורת הכתובת ״לסריג״ ובחרו את הסימנייה.</li>
      <li>בחלונית שנפתחת לחצו <b>העתק</b>.</li>
      <li>חזרו לסריג ← <b>ייבוא מהלוח</b>. השיר נכנס, ואם יש לו מילים מסונכרנות — הוא יסונכרן לשיר המקורי אוטומטית.</li>
    </ol>
    <p class="note">השירים שמייבאים נשמרים רק במכשיר שלכם.</p></div>`);
  body.querySelector('[data-copy]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(BOOKMARKLET); e.currentTarget.textContent = 'הועתק ✓'; } catch (err) { toast('לא הצלחנו להעתיק — נסו שוב'); }
  });
  openSheet({ title: 'ייבוא בלחיצה אחת', body });
}
