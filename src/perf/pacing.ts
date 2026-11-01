/**
 * rAF pacing. Never assumes 60 Hz: the display refresh is measured from rAF timestamps in the first second
 * (median interval), and every simulation step uses the real rAF delta since the last *rendered* frame.
 * `?fps=60` caps to 60 by skipping alternate rAFs on a 120 Hz (ProMotion) display; `?fps=120` never caps;
 * `?fps=auto` (default) starts uncapped and drops to 60 on a >90 Hz display when, over a 2 s window, more than
 * 15 % of frames miss the 120 Hz deadline (would alias between 8.3 and 16.7 ms = judder). It stays at 60 after.
 */
const qs = new URLSearchParams(location.search);
const want = qs.get('fps');
let samples: number[] = [], first = 0, prevT = 0, lastRendered = 0, win = 0, miss = 0;
export const pacing = {
  mode: (want === '60' || want === '120' ? want : 'auto') as '60' | '120' | 'auto',
  hz: 0, intervalMs: 1000 / 60, cap: 0 as 0 | 60, autoCapped: false, skipped: 0,
  /** Call with each rAF timestamp. Returns null to skip this rAF, else the ms since the last rendered frame. */
  tick(t: number): number | null {
    if (prevT) { const d = t - prevT; if (!this.hz && d > 2 && d < 50) samples.push(d); }
    prevT = t;
    if (!first) first = t;
    if (!this.hz && t - first > 1000 && samples.length > 10) {
      const s = samples.sort((a, b) => a - b), m = s[s.length >> 1];
      this.hz = Math.round(1000 / m); this.intervalMs = m;
      if (this.mode === '60' && this.hz > 90) this.cap = 60;
    }
    if (this.cap && lastRendered && t - lastRendered < 1000 / this.cap - this.intervalMs * 0.5) { this.skipped++; return null; }
    const d = lastRendered ? t - lastRendered : this.intervalMs; lastRendered = t;
    if (this.mode === 'auto' && this.hz > 90 && !this.cap) {
      win++; if (d > this.intervalMs * 1.5) miss++;
      if (win >= this.hz * 2) { if (miss / win > 0.15) { this.cap = 60; this.autoCapped = true; console.info('[City] pacing: auto-capped to 60 fps'); } win = 0; miss = 0; }
    }
    return d;
  },
  /** target frame interval for budgets (dynamic resolution) */
  get targetMs() { return this.cap ? 1000 / this.cap : this.intervalMs; },
  label() { return `${this.hz || '?'} Hz · fps ${this.mode}${this.cap ? ` (capped ${this.cap}${this.autoCapped ? ', auto' : ''})` : ''}`; },
};
