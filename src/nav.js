// Navigation: tab pages + pushed screens on a single document scroller (so iOS status-bar tap scrolls to top),
// slide transitions, edge swipe-back and browser history integration.
import { esc, icon } from './ui.js';

const stack = []; // pushed screens, top = last
let pagesEl = null;
let tabPageFn = () => null; // returns the active tab page element
let ignorePop = 0;
let dimEl = null;
const PARK = 0.3; // how far the page underneath slides while a screen is pushed (iOS parallax)
const EASE = 'cubic-bezier(.32,.72,0,1)';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function dim(v, dur) {
  if (!dimEl) return;
  if (dimEl.style.display !== 'block') { dimEl.style.transition = 'none'; dimEl.style.opacity = '0'; dimEl.style.display = 'block'; void dimEl.offsetWidth; }
  dimEl.style.transition = dur ? `opacity ${dur}ms ${EASE}` : 'none';
  dimEl.style.opacity = String(v);
  if (!v) setTimeout(() => { if (dimEl.style.opacity === '0') dimEl.style.display = 'none'; }, dur + 30);
}
function park(pg, frac, dur) {
  if (!pg) return;
  pg.style.transition = dur ? `transform ${dur}ms ${EASE}` : 'none';
  pg.style.transform = frac ? `translate3d(${(frac * 100).toFixed(2)}%,0,0)` : '';
}

export function initNav(container, getActiveTabPage) {
  pagesEl = container;
  tabPageFn = getActiveTabPage;
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    const top = stack[stack.length - 1];
    if (top) top.close(true);
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  dimEl = document.createElement('div'); dimEl.className = 'navdim'; document.body.append(dimEl);
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
  const still = reduce();
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('in'); if (!still) { park(prevEl, PARK, 360); dim(1, 360); } }));
  setTimeout(() => {
    if (entry.closed) return;
    park(prevEl, 0, 0); dim(0, 0);
    prevEl.classList.add('hidden-page');
    el.classList.remove('entering', 'in');
    window.scrollTo(0, 0);
    onScroll();
  }, still ? 20 : 370);
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
  const still = reduce();
  if (!still) { park(prevEl, PARK, 0); dim(1, 0); }
  window.scrollTo(0, prevY);
  onScroll();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = `transform ${still ? 0 : 340}ms ${EASE}`;
    el.style.transform = 'translateX(-100%)';
    if (!still) { park(prevEl, 0, 340); dim(0, 340); }
  }));
  setTimeout(() => { el.remove(); park(prevEl, 0, 0); }, still ? 30 : 380);
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
    el.style.transition = `transform .26s ${EASE}`;
    el.style.transform = `translateX(${dx < 0 ? '-100%' : '100%'})`;
    park(prevEl, 0, 260); dim(0, 260);
  });
  setTimeout(() => { el.remove(); park(prevEl, 0, 0); }, 290);
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
    const prog = Math.min(1, Math.abs(s.dx) / window.innerWidth);
    park(s.top.prevEl, PARK * (1 - prog) * (s.fromRight ? 1 : -1), 0);
    dim(1 - prog, 0);
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
      el.style.transition = `transform .26s ${EASE}`;
      el.style.transform = 'translateX(0)';
      park(prevEl, PARK * (st.fromRight ? 1 : -1), 260); dim(1, 260);
      setTimeout(() => {
        el.classList.remove('dragging'); el.style.transition = ''; el.style.transform = ''; el.style.top = '';
        park(prevEl, 0, 0); dim(0, 0);
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
