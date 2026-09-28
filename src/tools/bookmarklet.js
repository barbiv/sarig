// Source of the "copy to Sarig" Safari bookmark (runs on a chord page the user is viewing).
(() => {
  const CH = /^\(?[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add|M|°|ø|\+|-)?[0-9]*(sus[24]?|add[0-9]+|b5|#5|b9|#9|maj7)*(\/[A-G][#b]?)?\)?$/;
  const L = document.body.innerText.replace(/ /g, ' ').split('\n');
  const isC = (l) => { const t = l.trim().split(/\s+/).filter(Boolean); if (!t.length) return false; const c = t.filter((x) => CH.test(x.replace(/[|,]/g, ''))).length; return c > 0 && c >= t.length * 0.6; };
  const I = []; L.forEach((l, i) => { if (isC(l)) I.push(i); });
  if (I.length < 2) { alert('לא נמצאו אקורדים בדף הזה'); return; }
  let best = [], cur = [I[0]];
  for (let k = 1; k < I.length; k++) { if (I[k] - I[k - 1] > 12) { if (cur.length > best.length) best = cur; cur = []; } cur.push(I[k]); }
  if (cur.length > best.length) best = cur;
  const HD = /^\s*[\[(]?\s*(פתיחה|בית|פזמון|גשר|סיום|מעבר|סולו|intro|verse|chorus|bridge|outro|solo|pre-?chorus|interlude)[^\n]{0,12}[\])]?\s*:?\s*$/i;
  let a = best[0];
  while (a > 0 && HD.test(L[a - 1])) a--;
  let z = best[best.length - 1] + 1;
  if (z < L.length && L[z].trim() && !isC(L[z])) z++;
  while (z < L.length && L[z].trim() && L[z].trim().length > 3 && !/[|©]/.test(L[z]) && z - best[best.length - 1] < 3) z++;
  const body = L.slice(a, z).join('\n');
  let head = ((document.querySelector('h1') || {}).innerText || document.title).replace(/אקורדים ל?שיר|אקורדים|chords|tabs?/gi, '').trim();
  let t = head, ar = '';
  const m = head.match(/^(.+?)\s+(?:של|by|[-–|])\s+(.+)$/i);
  if (m) { t = m[1].trim(); ar = m[2].trim(); }
  const txt = '[סריג] ' + t + '\n[אמן] ' + ar + '\n' + body;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:auto 10px 10px 10px;z-index:2147483647;background:#1d1714;color:#f2e9db;border-radius:16px;padding:14px;font:16px -apple-system,system-ui,sans-serif;direction:rtl;box-shadow:0 10px 40px rgba(0,0,0,.5)';
  d.innerHTML = '<b style="display:block;margin-bottom:6px">העתקה לסריג</b><div style="opacity:.8;font-size:14px;margin-bottom:10px">' + (t || 'שיר') + (ar ? ' · ' + ar : '') + ' · ' + best.length + ' שורות אקורדים</div>';
  const b = document.createElement('button');
  b.textContent = 'העתק';
  b.style.cssText = 'width:100%;height:50px;border:0;border-radius:12px;background:#f2a93b;color:#1a1108;font:700 18px system-ui';
  const x = document.createElement('button');
  x.textContent = 'סגירה';
  x.style.cssText = 'width:100%;height:40px;border:0;background:none;color:#b4a593;margin-top:6px;font:15px system-ui';
  b.onclick = () => {
    const done = () => { b.textContent = 'הועתק ✓ פתחו את סריג ← ״ייבוא מהלוח״'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  };
  x.onclick = () => d.remove();
  d.append(b, x);
  document.body.appendChild(d);
})();
