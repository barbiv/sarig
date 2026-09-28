// YouTube IFrame API wrapper
let apiPromise = null;
export function loadYT() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); res(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; rej(new Error('yt load failed')); };
    document.head.append(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { apiPromise = null; rej(new Error('timeout')); } }, 15000);
  });
  return apiPromise;
}
export function parseYouTubeId(s) {
  if (!s) return null;
  s = s.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/|\/v\/)([\w-]{11})/);
  return m ? m[1] : null;
}
export function ytSearchUrl(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); }

export class YTClock {
  constructor(el, videoId, { onReady, onState, onError } = {}) {
    this.rate = 1; this.lastT = 0; this.lastPerf = 0; this.playing = false; this.ready = false;
    this.p = new window.YT.Player(el, {
      videoId, width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, fs: 0, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: () => { this.ready = true; onReady && onReady(); },
        onStateChange: (e) => {
          this.playing = e.data === 1;
          this.sample(true);
          onState && onState(e.data);
        },
        onError: (e) => onError && onError(e.data),
        onPlaybackRateChange: (e) => { this.rate = e.data; },
      },
    });
  }
  sample(force) {
    if (!this.ready) return;
    let t = 0;
    try { t = this.p.getCurrentTime() || 0; } catch (e) { return; }
    const now = performance.now();
    if (force || t !== this.lastT) { this.lastT = t; this.lastPerf = now; }
  }
  time() {
    this.sample(false);
    if (!this.playing) return this.lastT;
    const pred = this.lastT + ((performance.now() - this.lastPerf) / 1000) * this.rate;
    return pred;
  }
  play() { try { this.p.playVideo(); } catch (e) { /* */ } }
  pause() { try { this.p.pauseVideo(); } catch (e) { /* */ } }
  seek(t) { try { this.p.seekTo(Math.max(0, t), true); this.lastT = Math.max(0, t); this.lastPerf = performance.now(); } catch (e) { /* */ } }
  setRate(r) {
    try {
      const av = this.p.getAvailablePlaybackRates() || [1];
      let best = av[0]; for (const a of av) if (Math.abs(a - r) < Math.abs(best - r)) best = a;
      this.p.setPlaybackRate(best); this.rate = best; return best;
    } catch (e) { return 1; }
  }
  destroy() { try { this.p.destroy(); } catch (e) { /* */ } }
}
