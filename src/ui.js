// Small UI toolkit: html escaping, icons, sheets, screens, toasts.
import { lockScroll, unlockScroll, topPage } from './nav.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

const P = {
  songs: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  chords: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M4 13h16M9.3 3v18M14.7 3v18"/><circle cx="9.3" cy="10.5" r="1.6" fill="currentColor"/><circle cx="14.7" cy="15.5" r="1.6" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 6.5l1.5-1.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  metro: '<path d="M8 21h8l-3-17h-2z"/><path d="M12 14l6-8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sound: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  yt: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.2v5.6l5-2.8z" fill="currentColor"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  grid: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="13" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/>',
  lane: '<path d="M3 12h18"/><rect x="3" y="7" width="6" height="10" rx="1.5"/><rect x="11" y="7" width="4" height="10" rx="1.5"/><path d="M18 5v14"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M18 2v4h-4M6 22v-4h4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 4h16"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.9L8 14"/>',
  fire: '<path d="M12 22c4 0 7-2.7 7-6.8 0-4-3.2-6.2-4.3-9.7-.3 2-1.3 3.3-2.7 4-.3-3-1.8-5.8-4.3-7.5.4 3.4-3.7 6.6-3.7 12.2C4 19.3 7.6 22 12 22z"/>',
  guitar: '<path d="M19.5 2.5l2 2-3 3-2-2z"/><path d="M16.5 5.5l-5 5"/><path d="M10.5 8.5c-1.3-1.3-3.7-1.1-4.9.6-.6.8-.5 1.9-1.4 2.6-1.8 1.4-2.5 4.4-.5 6.4s5 1.3 6.4-.5c.7-.9 1.8-.8 2.6-1.4 1.7-1.2 1.9-3.6.6-4.9"/><circle cx="8.5" cy="15.5" r="1.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  lines: '<path d="M4 6h16M4 12h11M4 18h14"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  tuner: '<path d="M5 19a9 9 0 1 1 14 0"/><path d="M12 13l3.5-5"/><circle cx="12" cy="13" r="1.6" fill="currentColor"/><path d="M8 21h8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bigplay: '<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>',
  stage: '<rect x="3" y="4" width="12" height="16" rx="2"/><path d="M18 4v16M21 4v16"/><circle cx="9" cy="9" r="2"/><path d="M6 15h6"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
};
export function icon(name, extra = '') {
  const fill = name === 'star' && extra === 'fill' ? 'currentColor' : 'none';
  return `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

let toastEl = null, toastT = null;
export function toast(msg, ms = 2200) {
  if (!toastEl) { toastEl = h('<div class="toast" role="status" aria-live="polite"></div>'); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
}

// Bottom sheet
export function openSheet({ title = '', body, foot = null, onClose = null, tall = false }) {
  const scrim = h('<div class="scrim"></div>');
  const sh = h(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
    <div class="sh-head"><h2>${esc(title)}</h2><button class="iconbtn" data-close aria-label="סגור">${icon('close')}</button></div>
    <div class="sh-body"></div></div>`);
  if (tall) sh.style.height = '92%';
  const bodyEl = sh.querySelector('.sh-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  if (foot) { const f = h('<div class="sh-foot"></div>'); if (typeof foot === 'string') f.innerHTML = foot; else f.append(foot); sh.append(f); }
  document.body.append(scrim, sh);
  lockScroll();
  const rec = sh.offsetHeight > window.innerHeight * 0.55 ? recede() : null;
  requestAnimationFrame(() => { scrim.classList.add('on'); sh.classList.add('on'); });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    sh.style.transform = '';
    sh.style.transition = '';
    scrim.classList.remove('on'); sh.classList.remove('on');
    rec && rec();
    unlockScroll();
    setTimeout(() => { scrim.remove(); sh.remove(); }, 460);
    onClose && onClose();
  };
  scrim.addEventListener('click', close);
  sh.querySelector('[data-close]').addEventListener('click', close);
  // drag to close
  let y0 = null, dy = 0, t0 = 0;
  const grab = sh.querySelector('.grab'), head = sh.querySelector('.sh-head');
  [grab, head].forEach((el) => {
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; t0 = performance.now(); sh.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const d = e.touches[0].clientY - y0;
      dy = d >= 0 ? d : -Math.sqrt(-d) * 2.2; // rubber band when pulled up
      sh.style.transform = `translateY(${dy}px)`;
      scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / (sh.offsetHeight || 400)));
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (y0 == null) return;
      const v = dy / Math.max(1, performance.now() - t0);
      sh.style.transition = ''; scrim.style.opacity = '';
      if (dy > 110 || (dy > 24 && v > 0.5)) close(); else sh.style.transform = '';
      y0 = null; dy = 0;
    });
  });
  return { el: sh, body: bodyEl, close };
}

export { openScreen } from './nav.js';

// iOS-style "card" presentation: the page behind a large sheet shrinks back and gets rounded corners.
let recedeDepth = 0;
export function recede() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || recedeDepth++ > 0) return () => { recedeDepth = Math.max(0, recedeDepth - 1); };
  const pg = topPage();
  const tb = document.body.classList.contains('has-screen') ? null : document.querySelector('.tabbar');
  const H = window.innerHeight;
  const els = [];
  let top = 0, fixed = true;
  if (pg) {
    fixed = getComputedStyle(pg).position === 'fixed';
    top = -pg.getBoundingClientRect().top;
    pg.style.transformOrigin = fixed ? '50% 50%' : `50% ${top + H / 2}px`;
    if (!fixed) pg.style.clipPath = `inset(${Math.max(0, top)}px 0 ${Math.max(0, pg.offsetHeight - top - H)}px 0 round 12px)`;
    else pg.style.borderRadius = '12px';
    els.push(pg);
  }
  if (tb) { tb.style.transformOrigin = `50% ${H / 2 - tb.getBoundingClientRect().top}px`; els.push(tb); }
  document.documentElement.classList.add('receded');
  requestAnimationFrame(() => els.forEach((e) => { e.classList.add('recede-anim'); e.style.transform = 'scale(.935)'; }));
  const finish = () => {
    document.documentElement.classList.remove('receded');
    els.forEach((e) => { e.classList.remove('recede-anim'); e.style.transform = ''; e.style.transformOrigin = ''; e.style.clipPath = ''; e.style.borderRadius = ''; });
  };
  return () => {
    recedeDepth = 0;
    els.forEach((e) => { e.style.transform = ''; });
    // if the page scrolled while closing (e.g. results refreshed), drop the effect at once instead of clipping the wrong area
    requestAnimationFrame(() => { if (pg && !fixed && pg.isConnected && Math.abs(-pg.getBoundingClientRect().top - top) > 2) { els.forEach((e) => { e.style.transition = 'none'; }); finish(); requestAnimationFrame(() => els.forEach((e) => { e.style.transition = ''; })); } });
    setTimeout(finish, 460);
  };
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtMin(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} דק׳`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שע׳`;
}
export const HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export function fmtDate(ts, withTime = false) {
  const d = new Date(ts);
  const s = `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
  return withTime ? `${s} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : s;
}
export function relDay(ts) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const diff = Math.floor((d0 - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff < 7) return `לפני ${diff} ימים`;
  return fmtDate(ts);
}
export function toggleHTML(id, checked) {
  return `<label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label>`;
}

// Haptic tick (iOS 18+ Safari: toggling a native switch plays a system haptic)
let hapticEl = null;
export function haptic() {
  try {
    if (!hapticEl) {
      hapticEl = document.createElement('label');
      hapticEl.setAttribute('aria-hidden', 'true');
      hapticEl.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none';
      hapticEl.innerHTML = '<input type="checkbox" switch>';
      document.body.append(hapticEl);
    }
    hapticEl.click();
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (e) { /* no haptics */ }
}
