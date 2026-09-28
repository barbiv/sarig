// Guitar tuner (microphone, McLeod pitch detection)
import { startMic, stopMic, readPitch, micSupported } from '../mic.js';
import { ensureAudio, audioCtx, pickString, muteAll } from '../audio.js';
import { getState, update } from '../store.js';
import { esc, icon, toast } from '../ui.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const TUNINGS = [
  { id: 'std', name: 'סטנדרטי', notes: [40, 45, 50, 55, 59, 64] },
  { id: 'half', name: 'חצי טון למטה', notes: [39, 44, 49, 54, 58, 63] },
  { id: 'dropd', name: 'Drop D', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'full', name: 'טון למטה', notes: [38, 43, 48, 53, 57, 62] },
  { id: 'dadgad', name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { id: 'openg', name: 'Open G', notes: [38, 43, 50, 55, 59, 62] },
  { id: 'opend', name: 'Open D', notes: [38, 45, 50, 54, 57, 62] },
];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

let el, running = false, raf = 0, lock = -1, hist = [], smooth = null, lastGood = 0, inTuneSince = 0, visible = false;

export function mount(root) {
  el = root;
  render();
  el.addEventListener('click', onClick);
  el.addEventListener('change', (e) => { if (e.target.id === 'tn-tuning') { update((s) => { s.settings.tuning = e.target.value; }); lock = -1; render(); } });
}
export function onShow() { visible = true; if (getState().settings.tunerAuto && !running) start(true); }
export function onHide() { visible = false; stop(); }

function tuning() { return TUNINGS.find((t) => t.id === getState().settings.tuning) || TUNINGS[0]; }
function a4() { return getState().settings.a4 || 440; }

function render() {
  const t = tuning();
  el.innerHTML = `
    <div class="vhead"><div><h1>כוונון</h1><div class="sub">נגנו מיתר אחד בכל פעם, קרוב לטלפון</div></div></div>
    <div class="tuner card">
      <div class="tn-gauge" id="tn-g">${gaugeSVG()}</div>
      <div class="tn-note"><b id="tn-n">—</b><span id="tn-o"></span></div>
      <div class="tn-hint" id="tn-h">${running ? 'מקשיב…' : 'לחצו ״הפעלה״ ואשרו גישה למיקרופון'}</div>
      <div class="tn-strings" id="tn-s">${t.notes.map((m, i) => `<button class="tn-str" data-s="${i}" aria-pressed="${lock === i}"><b>${esc(NAMES[m % 12])}</b><small>${6 - i}</small></button>`).join('')}</div>
      <div class="tn-row"><button class="btn primary big-play" id="tn-go">${running ? icon('pause') + ' עצירה' : icon('play') + ' הפעלה'}</button></div>
    </div>
    <div class="section-t">הגדרות</div>
    <div class="rows">
      <div class="row"><span class="grow"><span class="t">כוונון</span></span><select id="tn-tuning" class="sel">${TUNINGS.map((x) => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)} · ${x.notes.map((m) => NAMES[m % 12]).join(' ')}</option>`).join('')}</select></div>
      <div class="row"><span class="grow"><span class="t">בחירת מיתר</span><br><span class="d">${lock < 0 ? 'אוטומטית לפי הצליל' : `נעול על מיתר ${6 - lock} — לחצו שוב לביטול`}</span></span></div>
      <div class="row"><span class="grow"><span class="t">כיול A4</span></span><span class="stepper"><button data-a4="-1">−</button><output>${a4()} Hz</output><button data-a4="1">+</button></span></div>
      <div class="row"><span class="grow"><span class="t">הפעלה אוטומטית בכניסה ללשונית</span></span><label class="toggle"><input type="checkbox" id="tn-auto" ${getState().settings.tunerAuto ? 'checked' : ''}><span></span></label></div>
    </div>
    <p class="note" style="margin-top:12px">לחיצה ארוכה על מיתר משמיעה את הצליל שלו. באייפון: אם הצליל שקט מדי — בדקו שמתג השקט כבוי.</p>`;
  el.querySelector('#tn-auto').addEventListener('change', (e) => update((s) => { s.settings.tunerAuto = e.target.checked; }));
  el.querySelectorAll('.tn-str').forEach((b) => {
    let tm = null;
    b.addEventListener('touchstart', () => { tm = setTimeout(() => { tm = null; playRef(+b.dataset.s); b.dataset.long = '1'; }, 450); }, { passive: true });
    b.addEventListener('touchend', () => { if (tm) clearTimeout(tm); });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); playRef(+b.dataset.s); });
  });
}
function gaugeSVG() {
  let ticks = '';
  for (let c = -50; c <= 50; c += 5) {
    const a = (c / 50) * 70 * Math.PI / 180;
    const r1 = c % 25 === 0 ? 76 : 82, r2 = 90;
    ticks += `<line x1="${100 + r1 * Math.sin(a)}" y1="${104 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${104 - r2 * Math.cos(a)}" class="tn-tick${c === 0 ? ' z' : ''}"/>`;
  }
  return `<svg viewBox="0 0 200 118" role="img" aria-label="מחוג כוונון">
    <path d="M${100 - 90 * Math.sin(70 * Math.PI / 180)} ${104 - 90 * Math.cos(70 * Math.PI / 180)} A90 90 0 0 1 ${100 + 90 * Math.sin(70 * Math.PI / 180)} ${104 - 90 * Math.cos(70 * Math.PI / 180)}" class="tn-arc"/>
    <path d="M${100 - 90 * Math.sin(5.6 * Math.PI / 180)} ${104 - 90 * Math.cos(5.6 * Math.PI / 180)} A90 90 0 0 1 ${100 + 90 * Math.sin(5.6 * Math.PI / 180)} ${104 - 90 * Math.cos(5.6 * Math.PI / 180)}" class="tn-ok"/>
    ${ticks}
    <text x="30" y="114" class="tn-lbl">♭</text><text x="170" y="114" class="tn-lbl">♯</text>
    <g id="tn-needle" style="transform-origin:100px 104px"><line x1="100" y1="104" x2="100" y2="22" class="tn-needle"/><circle cx="100" cy="104" r="6" class="tn-hub"/></g>
  </svg>`;
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'tn-go') { if (running) stop(); else start(false); }
  else if (b.dataset.s != null) {
    if (b.dataset.long) { delete b.dataset.long; return; }
    const i = +b.dataset.s; lock = lock === i ? -1 : i; render();
  } else if (b.dataset.a4) { update((s) => { s.settings.a4 = Math.max(430, Math.min(450, a4() + +b.dataset.a4)); }); render(); }
}
function playRef(i) {
  ensureAudio();
  const off = tuning().notes[i] - [40, 45, 50, 55, 59, 64][i];
  muteAll();
  pickString({ f: [0, 0, 0, 0, 0, 0] }, i, audioCtx().currentTime + 0.02, { vel: 0.9, capo: off });
}
async function start(silent) {
  if (!micSupported()) { toast('המכשיר לא מאפשר גישה למיקרופון'); return; }
  try { await startMic({ echo: false }); } catch (e) {
    if (!silent) toast('אין גישה למיקרופון. אפשרו גישה בהגדרות ספארי ← מיקרופון');
    return;
  }
  running = true; hist = []; smooth = null;
  update((s2) => { s2.tunedDay = new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate(); });
  render();
  loop();
}
function stop() {
  if (!running) return;
  running = false; cancelAnimationFrame(raf); stopMic();
  if (visible) render();
}
function loop() {
  if (!running) return;
  const p = readPitch();
  const now = performance.now();
  const needle = el.querySelector('#tn-needle'), nEl = el.querySelector('#tn-n'), oEl = el.querySelector('#tn-o'), hEl = el.querySelector('#tn-h');
  if (p && p.freq > 60 && p.freq < 1400 && p.clarity > 0.85) {
    hist.push(p.freq); if (hist.length > 5) hist.shift();
    const med = hist.slice().sort((a, b) => a - b)[Math.floor(hist.length / 2)];
    smooth = smooth && Math.abs(med / smooth - 1) < 0.03 ? smooth * 0.7 + med * 0.3 : med;
    lastGood = now;
    const midi = 69 + 12 * Math.log2(smooth / a4());
    const t = tuning();
    let target;
    if (lock >= 0) target = t.notes[lock];
    else { target = t.notes.reduce((best, m) => (Math.abs(m - midi) < Math.abs(best - midi) ? m : best), t.notes[0]); if (Math.abs(target - midi) > 2.5) target = Math.round(midi); }
    const cents = Math.max(-50, Math.min(50, (midi - target) * 100));
    const si = t.notes.indexOf(target);
    el.querySelectorAll('.tn-str').forEach((b, k) => b.classList.toggle('hot', k === si));
    needle.style.transform = `rotate(${(cents / 50) * 70}deg)`;
    nEl.textContent = NAMES[((target % 12) + 12) % 12];
    oEl.textContent = `${Math.floor(target / 12) - 1} · ${smooth.toFixed(1)} Hz`;
    const ok = Math.abs(cents) <= 4;
    el.querySelector('.tuner').classList.toggle('ok', ok);
    if (ok) { if (!inTuneSince) inTuneSince = now; hEl.textContent = now - inTuneSince > 400 ? '✓ מכוון' : 'כמעט…'; }
    else { inTuneSince = 0; hEl.textContent = cents < 0 ? `נמוך ב־${Math.round(-cents)} סנט — להדק ↑` : `גבוה ב־${Math.round(cents)} סנט — לשחרר ↓`; }
    void nm;
  } else if (now - lastGood > 1200) {
    hEl.textContent = 'נגנו מיתר…';
    el.querySelector('.tuner').classList.remove('ok');
  }
  raf = requestAnimationFrame(loop);
}
