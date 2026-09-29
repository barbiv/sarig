// iOS-style interaction polish: press states, sliding segmented-control thumbs, long-press, action sheets.
import { esc, icon, haptic, h } from './ui.js';
import { lockScroll, unlockScroll } from './nav.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function installPolish() {
  // iOS Safari only applies :active while a touch listener exists
  document.addEventListener('touchstart', () => {}, { passive: true });
  // haptic tick on switches
  document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('.toggle input')) haptic(); }, true);
  // segmented controls: animated thumb that slides to the selected segment
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'childList' ? [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches('.seg') || n.querySelector('.seg')))
        : r.attributeName === 'aria-pressed' ? r.target.parentElement && r.target.parentElement.classList.contains('seg')
          : r.target.classList && (r.target.classList.contains('page') || r.target.classList.contains('sheet'))) { scheduleSegs(); return; }
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'class'] });
  window.addEventListener('resize', () => scheduleSegs(true));
  scheduleSegs();
}

export function refreshSegs() { scheduleSegs(); }
let segRaf = 0;
const lastGeo = new Map(); // seg id -> {x,w} so redrawn controls still animate from their previous position
function scheduleSegs(noAnim) {
  if (segRaf) return;
  segRaf = requestAnimationFrame(() => { segRaf = 0; document.querySelectorAll('.seg').forEach((s) => placeThumb(s, noAnim)); });
}
function placeThumb(seg, noAnim) {
  if (!seg.isConnected || seg.offsetParent === null) return;
  const on = seg.querySelector(':scope > button[aria-pressed="true"]');
  let th = seg.querySelector(':scope > .seg-thumb');
  if (!on) { if (th) th.style.opacity = '0'; return; }
  const x = on.offsetLeft, w = on.offsetWidth, y = on.offsetTop, hh = on.offsetHeight;
  const fresh = !th;
  if (fresh) {
    th = document.createElement('i'); th.className = 'seg-thumb'; th.setAttribute('aria-hidden', 'true');
    seg.prepend(th); seg.classList.add('has-thumb');
    const prev = seg.id && lastGeo.get(seg.id);
    if (prev && !noAnim) { th.style.transition = 'none'; th.style.transform = `translateX(${prev.x}px)`; th.style.width = prev.w + 'px'; th.style.top = y + 'px'; th.style.height = hh + 'px'; void th.offsetWidth; th.style.transition = ''; }
    else th.style.transition = 'none';
  } else if (noAnim) th.style.transition = 'none';
  const key = `${x}|${w}|${y}|${hh}`;
  if (th.dataset.k === key) { th.style.opacity = '1'; return; }
  th.dataset.k = key;
  th.style.opacity = '1';
  th.style.transform = `translateX(${x}px)`;
  th.style.width = w + 'px';
  th.style.top = y + 'px';
  th.style.height = hh + 'px';
  if (seg.id) lastGeo.set(seg.id, { x, w });
  if (th.style.transition === 'none') requestAnimationFrame(() => { th.style.transition = ''; });
}

// Long press (with movement tolerance). Calls cb(target, event). Suppresses the click that follows.
export function onLongPress(root, selector, cb, ms = 480) {
  let tm = null, sx = 0, sy = 0, target = null, fired = false;
  const cancel = () => { clearTimeout(tm); tm = null; if (target) target.classList.remove('pressing'); target = null; };
  root.addEventListener('touchstart', (e) => {
    const t = e.target.closest(selector); if (!t || e.touches.length > 1) return;
    fired = false; target = t; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    t.classList.add('pressing');
    tm = setTimeout(() => { fired = true; const el = target; cancel(); haptic(); cb(el, e); }, ms);
  }, { passive: true });
  root.addEventListener('touchmove', (e) => { if (!tm) return; const t = e.touches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) cancel(); }, { passive: true });
  root.addEventListener('touchend', () => { cancel(); if (fired) setTimeout(() => { fired = false; }, 400); });
  root.addEventListener('touchcancel', cancel);
  root.addEventListener('click', (e) => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', (e) => { const t = e.target.closest(selector); if (!t) return; e.preventDefault(); if (!fired) cb(t, e); });
}

// iOS action sheet: grouped actions + a separate cancel button.
export function actionSheet({ title = '', sub = '', actions = [] }) {
  const scrim = h('<div class="scrim as-scrim"></div>');
  const box = h(`<div class="asheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="as-group">${title ? `<div class="as-head"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>` : ''}
      ${actions.map((a, i) => `<button class="as-btn${a.destructive ? ' danger' : ''}" data-i="${i}">${a.icon ? icon(a.icon, a.fill ? 'fill' : '') : ''}<span>${esc(a.label)}</span></button>`).join('')}</div>
    <button class="as-btn as-cancel" data-cancel>ביטול</button></div>`);
  document.body.append(scrim, box);
  lockScroll();
  requestAnimationFrame(() => { scrim.classList.add('on'); box.classList.add('on'); });
  let closed = false;
  const close = () => { if (closed) return; closed = true; scrim.classList.remove('on'); box.classList.remove('on'); unlockScroll(); setTimeout(() => { scrim.remove(); box.remove(); }, 320); };
  scrim.addEventListener('click', close);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    close();
    if (b.dataset.i != null) { const a = actions[+b.dataset.i]; setTimeout(() => a.run && a.run(), 120); }
  });
  return { close };
}

export const spinner = (label = '') => `<div class="loading"><span class="spin" aria-hidden="true">${'<i></i>'.repeat(8)}</span>${label ? `<span>${esc(label)}</span>` : ''}</div>`;
