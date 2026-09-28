// Navigation: tab pages + pushed screens on a single document scroller (so iOS status-bar tap scrolls to top),
// slide transitions, edge swipe-back and browser history integration.
import { esc, icon } from './ui.js';

const stack = []; // pushed screens, top = last
let pagesEl = null;
let tabPageFn = () => null; // returns the active tab page element
let ignorePop = 0;

export function initNav(container, getActiveTabPage) {
  pagesEl = container;
  tabPageFn = getActiveTabPage;
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    const top = stack[stack.length - 1];
    if (top) top.close(true);
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  installSwipeBack();
}
export function topPage() { return stack.length ? stack[stack.length - 1].el : tabPageFn(); }
export function hasScreens() { return stack.length > 0; }

function onScroll() {
  const pg = topPage();
  if (!pg) return;
  const tb = pg.querySelector(':scope > .topbar');
  if (tb) tb.classList.toggle('scrolled', window.scrollY > 36);
}
export function refreshTopbar() { onScroll(); }

function below(i) { return i > 0 ? stack[i - 1].el : tabPageFn(); }
function setTabbar() { document.body.classList.toggle('has-screen', stack.length > 0); }

export function openScreen({ cls = '', title = '', sub = '', actions = '', onClose = null, fixed = false }) {
  const prevEl = topPage();
  const prevY = window.scrollY;
  const el = document.createElement('section');
  el.className = `page screen ${fixed ? 'fixed' : ''} ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<header class="topbar always"><div class="tb-inner">
      <button class="iconbtn back" data-back aria-label="חזרה">${icon('back')}</button>
      <div class="ttl"><b>${esc(title)}</b><span>${esc(sub)}</span></div>
      <div class="acts">${actions}</div></div></header><div class="sc-body"></div>`;
  el.classList.add('entering');
  pagesEl.append(el);
  const entry = {
    el, prevEl, prevY, fixed, closed: false,
    close(fromPop, opts = {}) {
      if (entry.closed) return;
      entry.closed = true;
      if (!fromPop) { ignorePop++; history.back(); }
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (opts.swiped) finishSwipeOut(entry, opts.dx); else animateOut(entry);
      setTabbar();
      onClose && onClose();
    },
  };
  stack.push(entry);
  history.pushState({ sarig: stack.length }, '');
  setTabbar();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => {
    if (entry.closed) return;
    prevEl.classList.add('hidden-page');
    el.classList.remove('entering', 'in');
    window.scrollTo(0, 0);
    onScroll();
  }, 340);
  el.querySelector('[data-back]').addEventListener('click', () => entry.close(false));
  return {
    el, body: el.querySelector('.sc-body'),
    close: () => entry.close(false),
    setTitle(t, sb) { el.querySelector('.ttl b').textContent = t; el.querySelector('.ttl span').textContent = sb || ''; },
  };
}

function animateOut(entry) {
  const { el, prevEl, prevY, fixed } = entry;
  const y = window.scrollY;
  el.classList.remove('entering', 'in');
  el.classList.add('leaving');
  if (!fixed) el.style.top = `${-y}px`;
  prevEl.classList.remove('hidden-page', 'under');
  prevEl.style.top = '';
  window.scrollTo(0, prevY);
  onScroll();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
    el.style.transform = 'translateX(-100%)';
  }));
  setTimeout(() => el.remove(), 320);
}
function finishSwipeOut(entry, dx) {
  const { el, prevEl, prevY } = entry;
  prevEl.classList.remove('under', 'hidden-page');
  prevEl.style.top = '';
  el.classList.remove('dragging');
  el.classList.add('leaving');
  window.scrollTo(0, prevY);
  onScroll();
  requestAnimationFrame(() => {
    el.style.transition = 'transform .22s ease-out';
    el.style.transform = `translateX(${dx < 0 ? '-100%' : '100%'})`;
  });
  setTimeout(() => el.remove(), 240);
}

// ---------------------------------------------------------------- swipe back from either screen edge
function installSwipeBack() {
  let s = null;
  const EDGE = 28;
  document.addEventListener('touchstart', (e) => {
    if (!stack.length || e.touches.length !== 1) return;
    const t = e.touches[0];
    const W = window.innerWidth;
    if (t.clientX > EDGE && t.clientX < W - EDGE) return;
    if (document.querySelector('.sheet.on')) return;
    const top = stack[stack.length - 1];
    if (top.el.classList.contains('entering')) return;
    s = { top, x0: t.clientX, y0: t.clientY, dx: 0, started: false, fromRight: t.clientX >= W - EDGE, t0: performance.now() };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
    if (!s.started) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (!(s.fromRight ? dx < -8 : dx > 8)) return;
      s.started = true;
      const { el, prevEl, prevY, fixed } = s.top;
      s.y = window.scrollY;
      el.classList.add('dragging');
      if (!fixed) el.style.top = `${-s.y}px`;
      prevEl.classList.remove('hidden-page');
      prevEl.classList.add('under');
      prevEl.style.top = `${-prevY}px`;
    }
    s.dx = s.fromRight ? Math.min(0, dx) : Math.max(0, dx);
    s.top.el.style.transform = `translateX(${s.dx}px)`;
  }, { passive: true });
  const end = () => {
    if (!s) return;
    const st = s; s = null;
    if (!st.started) return;
    const { el, prevEl } = st.top;
    const v = Math.abs(st.dx) / Math.max(1, performance.now() - st.t0);
    if (Math.abs(st.dx) > window.innerWidth * 0.3 || v > 0.55) {
      st.top.close(false, { swiped: true, dx: st.dx });
    } else {
      el.style.transition = 'transform .2s ease-out';
      el.style.transform = 'translateX(0)';
      setTimeout(() => {
        el.classList.remove('dragging'); el.style.transition = ''; el.style.transform = ''; el.style.top = '';
        prevEl.classList.remove('under'); prevEl.classList.add('hidden-page'); prevEl.style.top = '';
        window.scrollTo(0, st.y);
      }, 210);
    }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}

// ---------------------------------------------------------------- scroll lock for bottom sheets
let lockY = 0, locks = 0;
export function lockScroll() {
  if (locks++ > 0) return;
  lockY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed'; b.top = `${-lockY}px`; b.left = '0'; b.right = '0';
}
export function unlockScroll() {
  if (--locks > 0) return;
  locks = 0;
  const b = document.body.style;
  b.position = ''; b.top = ''; b.left = ''; b.right = '';
  window.scrollTo(0, lockY);
}
