import type { RobotController } from '../robot/controller';
import { A6 } from './frame';
import type { DiagRec } from './diag';
import { pacing } from './pacing';
import { quality, qualityLabel } from './quality';

/**
 * Diagnostics benchmark. `?bench=walk`, `?bench=flight`, or `?bench=all` (walk, then flight).
 * Records every presented frame (real rAF delta since the last rendered frame) with what ran in the frame before it
 * (pipeline compiles, texture/geometry upload, area/tree/interior/grass work, worker messages, loop sections, heap drops)
 * and shows a results panel with a big Copy results button (compact JSON). Also `window.__bench`, `console.log('[City bench]')`.
 */
interface Phase { name: string; ms: number; walk?: boolean; alt?: number; fwd?: boolean; back?: number; burst?: boolean; turn?: number; zoom?: boolean; interior?: boolean }
const FLIGHT: Phase[] = [
  { name: 'low-fast', ms: 12000, alt: 22, fwd: true, burst: true },
  { name: 'climb-cruise', ms: 10000, alt: 250, fwd: true },
  { name: 'sharp-turns', ms: 12000, alt: 35, fwd: true, turn: 1400 },
  { name: 'dive-zoom', ms: 8000, alt: 14, fwd: false, zoom: true },
  { name: 'long-straight', ms: 10000, alt: 60, fwd: true, burst: true },
];
const WALK: Phase[] = [
  { name: 'street-walk', ms: 10000, walk: true, fwd: true },
  { name: 'run-turns', ms: 12000, walk: true, fwd: true, burst: true, turn: 1500 },
  { name: 'interior', ms: 10000, walk: true, fwd: true, interior: true, back: 5000 },
  { name: 'dense-run', ms: 10000, walk: true, fwd: true, burst: true, turn: 4000 },
];
export interface FrameIn { dt: number; work: number; rec: DiagRec; compiles: number; texCalls: number; texBytes: number; geoBytes: number; heap: number }
export interface BenchCtx { ctl: RobotController; canvas: HTMLCanvasElement; start(walk: boolean): void; info(): Record<string, unknown>; interiorEntry(): { out: number[]; look: number[] } | null; teleport(x: number, y: number, z: number, h: number): void }
interface Fr { t: number; ms: number; work: number; causes: string[] }
/** `?benchscale=0.1` shortens every phase (smoke tests) */
const SCALE = Number(new URLSearchParams(location.search).get('benchscale') ?? 1) || 1;
const r1 = (v: number) => Math.round(v * 10) / 10;

export function causesOf(f: FrameIn, prevHeap: number, interval: number) {
  const c: string[] = [], r = f.rec;
  if (f.compiles) c.push(`pipeline compile x${f.compiles}`);
  if (f.texCalls) c.push(`texture upload x${f.texCalls} ${Math.round(f.texBytes / 1024)}kB`);
  if (f.geoBytes > 256 * 1024) c.push(`geometry upload ${Math.round(f.geoBytes / 1024)}kB`);
  for (const [k, n] of Object.entries(r.events)) c.push(n > 1 ? `${k} x${n}` : k);
  if (r.eventMs > 1) c.push(`build work ${r1(r.eventMs)}ms`);
  if (r.workerMs > 0.5) c.push(`worker msgs x${r.workerMsgs} ${r1(r.workerMs)}ms`);
  for (const [k, ms] of Object.entries(r.sections)) if (ms > Math.max(3, interval * 0.3)) c.push(`${k} ${r1(ms)}ms`);
  if (prevHeap && f.heap && prevHeap - f.heap > 1e6) c.push(`GC (heap -${r1((prevHeap - f.heap) / 1e6)}MB)`);
  if (!c.length) {
    if (f.work < interval * 0.6) c.push(f.dt <= interval * 2.5 ? `pacing (rAF ${r1(f.dt)}ms vs work ${r1(f.work)}ms)` : 'unattributed (likely GC/compositor)');
    else c.push(`main-thread JS ${r1(f.work)}ms (GPU-bound if render submit is small)`);
  }
  return c;
}

export function createBench(kind: 'walk' | 'flight' | 'all', ctx: BenchCtx) {
  const { ctl } = ctx;
  const routes: [string, Phase[]][] = kind === 'all' ? [['walk', WALK], ['flight', FLIGHT]] : kind === 'walk' ? [['walk', WALK]] : [['flight', FLIGHT]];
  const status = document.createElement('div'); status.id = 'bench-status'; status.textContent = 'Benchmark: warming up…'; document.body.appendChild(status);
  let ri = 0, phase = -1, phaseT = 0, settle = 3500, done = false, zoomT = 0, t0 = 0, prevHeap = 0, started = false;
  let frames: Fr[] = [], seg: number[] = [];
  const out: any = { bench: kind, a6: A6, ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, routes: [] as any[] };
  const keys = ['KeyW', 'KeyS', 'ShiftLeft', 'Space', 'KeyC', 'KeyA', 'KeyD'];
  const held = new Set<string>();
  const hold = (k: string, on: boolean) => { if (on === held.has(k)) return; if (on) held.add(k); else held.delete(k); ctl.press(k, on); };
  const release = () => keys.forEach((k) => hold(k, false));
  const pct = (s: number[], p: number) => r1(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0);
  const stat = (a: number[]) => { const s = [...a].sort((x, y) => x - y), n = s.length || 1, avg = a.reduce((x, y) => x + y, 0) / n;
    return { frames: a.length, fps: r1(1000 / avg), avg: r1(avg), p50: pct(s, 0.5), p95: pct(s, 0.95), p99: pct(s, 0.99), worst: r1(s[s.length - 1] ?? 0),
      over16: a.filter((v) => v > 16.7 * 1.05).length, over33: a.filter((v) => v > 33.4).length, over50: a.filter((v) => v > 50).length }; };
  let phases: any[] = [];
  function finishRoute() {
    const all = frames.map((f) => f.ms);
    const sustained: any[] = []; for (let s = 0; s < (frames.at(-1)?.t ?? 0); s += 5000) { const b = frames.filter((f) => f.t >= s && f.t < s + 5000).map((f) => f.ms).sort((x, y) => x - y); if (b.length) sustained.push([Math.round(s / 1000), r1(b.reduce((x, y) => x + y, 0) / b.length), pct(b, 0.95)]); }
    const worst = [...frames].sort((a, b) => b.ms - a.ms).slice(0, 10).map((f) => ({ t: r1(f.t / 1000), ms: r1(f.ms), work: r1(f.work), causes: f.causes }));
    const tally: Record<string, number> = {}; for (const f of frames) if (f.ms > 16.7 * 1.05) for (const c of f.causes) { const k = c.replace(/ [\d.]+(ms|kB|MB\))| x\d+|\(.*\)/g, '').trim(); tally[k] = (tally[k] ?? 0) + 1; }
    out.routes.push({ route: routes[ri][0], total: stat(all), phases, worst10: worst, longFrameCauses: tally, sustained5s: sustained });
    frames = []; phases = [];
  }
  function report() {
    done = true; release(); status.remove();
    Object.assign(out, ctx.info(), { refreshHz: pacing.hz, pacing: pacing.label(), skippedRaf: pacing.skipped, quality: qualityLabel(), qualityWarmup: quality.warmup, when: new Date().toISOString(),
      memory: (performance as any).memory ? 'performance.memory' : 'n/a (unattributed long frames = likely GC/compositor)' });
    (window as any).__bench = out; console.log('[City bench]', JSON.stringify(out));
    const el = document.createElement('div'); el.id = 'bench';
    const T = (s: any) => `<td>${s.frames}</td><td>${s.fps}</td><td>${s.p50}</td><td>${s.p95}</td><td>${s.p99}</td><td class="${s.worst > 33.4 ? 'fail' : 'pass'}">${s.worst}</td><td>${s.over16}</td><td>${s.over33}</td><td>${s.over50}</td>`;
    const route = (r: any) => `<h3>${r.route}</h3><table><tr><th>phase</th><th>frames</th><th>fps</th><th>p50</th><th>p95</th><th>p99</th><th>worst</th><th>&gt;16.7</th><th>&gt;33</th><th>&gt;50</th></tr>
      ${r.phases.map((p: any) => `<tr><td>${p.phase}</td>${T(p)}</tr>`).join('')}<tr class="tot"><td>ALL</td>${T(r.total)}</tr></table>
      <div class="w"><b>10 worst frames</b> (t s · ms · work ms · causes)<ol>${r.worst10.map((w: any) => `<li>${w.t}s · <b>${w.ms}</b> · ${w.work} · ${w.causes.join(', ')}</li>`).join('')}</ol>
      <b>long-frame causes:</b> ${Object.entries(r.longFrameCauses).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}<br><b>sustained (5 s avg/p95 ms):</b> ${r.sustained5s.map((s: any) => `${s[0]}s ${s[1]}/${s[2]}`).join('  ')}</div>`;
    const text = JSON.stringify(out);
    el.innerHTML = `<button type="button" class="copy" data-a="copy">Copy results</button>
      <div><b>City ${kind} benchmark</b>${A6 ? '' : ' · A6 OFF'}<br>${out.backend} · ${out.adapter ?? ''} · ${out.refreshHz} Hz measured · ${out.pacing}<br>quality ${out.quality} · ${out.screen}<br><small>${out.ua}</small></div>
      ${out.routes.map(route).join('')}
      <textarea readonly hidden></textarea>
      <button type="button" data-a="again">Run again</button> <button type="button" data-a="close">Close</button>`;
    const ta = el.querySelector('textarea')!; ta.value = text;
    el.addEventListener('click', (e) => { const b = e.target as HTMLElement, a = b.dataset.a;
      if (a === 'copy') {
        const ok = () => { b.textContent = 'Copied ✓'; (window as any).__benchCopied = true; };
        const fallback = () => { ta.hidden = false; ta.focus(); ta.select(); try { if (document.execCommand('copy')) return ok(); } catch { /* shown for manual copy */ } b.textContent = 'Select-all + copy the box below'; };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
      }
      if (a === 'again') location.reload(); if (a === 'close') el.remove(); });
    document.body.appendChild(el);
  }
  function beginRoute() { const walk = routes[ri][1][0].walk!; ctx.start(walk); settle = 3500 * Math.min(1, SCALE * 3); phase = -1; started = true; }
  return {
    get running() { return !done; },
    /** Called on every rendered frame, before the simulation update. */
    frame(f: FrameIn) {
      if (done) return;
      if (!started) beginRoute();
      const PH = routes[ri][1];
      if (phase < 0) { settle -= f.dt; if (settle > 0) return; phase = 0; phaseT = 0; seg = []; if (!t0) t0 = performance.now(); return; }
      const t = performance.now() - t0;
      frames.push({ t, ms: f.dt, work: f.work, causes: f.dt > 16.7 * 1.05 || f.dt > pacing.targetMs * 1.5 ? causesOf(f, prevHeap, pacing.targetMs) : [] });
      prevHeap = f.heap; seg.push(f.dt);
      const P = PH[phase]; phaseT += f.dt;
      if (P.walk) {
        if (ctl.mode === 'ROCKETS') { ctl.press('KeyF', true); ctl.press('KeyF', false); }
        if (P.interior && phaseT === f.dt) { const e = ctx.interiorEntry(); if (e) ctx.teleport(e.out[0], e.out[1] + 0.3, e.out[2], Math.atan2(e.look[0] - e.out[0], e.look[2] - e.out[2])); }
        const back = P.back !== undefined && phaseT > P.back;
        hold('KeyW', !!P.fwd && !back); hold('KeyS', back); hold('ShiftLeft', !!P.burst);
      } else {
        if (ctl.mode !== 'ROCKETS') { ctl.press('KeyF', true); ctl.press('KeyF', false); }
        const dy = P.alt! - (ctl.pos.y - Math.max(ctl.floor.y, 0));
        hold('Space', dy > 2); hold('KeyC', dy < -4); hold('KeyW', !!P.fwd); hold('ShiftLeft', !!P.burst && ctl.burst > 0.1);
        if (P.zoom && (zoomT += f.dt) > 90) { zoomT = 0; ctx.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.sin(phaseT / 900) * 160 })); }
      }
      if (P.turn) { const flip = Math.floor(phaseT / P.turn) % 2; hold('KeyA', flip === 0); hold('KeyD', flip === 1); }
      status.textContent = `Benchmark ${routes[ri][0]}: ${P.name} (${phase + 1}/${PH.length}) ${(phaseT / 1000).toFixed(0)}/${(P.ms * SCALE / 1000).toFixed(0)}s — don't touch the keys`;
      if (phaseT >= P.ms * SCALE) {
        release(); phases.push({ phase: P.name, ...stat(seg) }); seg = []; phase++; phaseT = 0;
        if (phase >= PH.length) { finishRoute(); ri++; if (ri >= routes.length) report(); else { started = false; t0 = 0; } }
      }
    },
  };
}
