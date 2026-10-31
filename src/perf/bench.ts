import type { RobotController } from '../robot/controller';
import { gpu } from './gpuHooks';
import { A6 } from './frame';

/**
 * `?bench=flight`: a scripted robot flight that records every frame time and reports per-phase stats.
 * Run it in a real browser on the target machine (headless frame rates mean nothing). Phases cover the A6 cases:
 * low and fast over streets, climb to cruise, sharp turns, a dive with chase-camera zoom in/out, and a long straight
 * run toward the area edge. Pass = no frame over 33 ms and p99 at or under 20 ms (A6 target).
 */
interface Phase { name: string; ms: number; alt: number; fwd: boolean; burst?: boolean; turn?: number; zoom?: boolean }
const PHASES: Phase[] = [
  { name: 'low-fast', ms: 12000, alt: 22, fwd: true, burst: true },
  { name: 'climb-cruise', ms: 10000, alt: 250, fwd: true },
  { name: 'sharp-turns', ms: 12000, alt: 35, fwd: true, turn: 1400 },
  { name: 'dive-zoom', ms: 8000, alt: 14, fwd: false, zoom: true },
  { name: 'long-straight', ms: 10000, alt: 60, fwd: true, burst: true },
];
export interface BenchCtx { ctl: RobotController; canvas: HTMLCanvasElement; start(): void; info(): Record<string, unknown> }

export function createFlightBench(ctx: BenchCtx) {
  const { ctl } = ctx;
  const status = document.createElement('div'); status.id = 'bench-status'; status.textContent = 'Benchmark: warming up…'; document.body.appendChild(status);
  const ft: number[] = [], cpu: number[] = [], up: number[] = [], comp: number[] = [];
  let phase = -1, phaseT = 0, settle = 3500, done = false, flip = 0, zoomT = 0, frames0 = 0;
  const results: any[] = [];
  const keys = ['KeyW', 'ShiftLeft', 'Space', 'KeyC', 'KeyA', 'KeyD'];
  const held = new Set<string>();
  const hold = (k: string, on: boolean) => { if (on === held.has(k)) return; if (on) held.add(k); else held.delete(k); ctl.press(k, on); };
  const release = () => keys.forEach((k) => hold(k, false));
  const stat = (name: string, a: number[], c: number[], u: number[], k: number[]) => {
    const s = [...a].sort((x, y) => x - y), n = s.length || 1, avg = a.reduce((x, y) => x + y, 0) / n;
    return { phase: name, frames: a.length, fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(2), p50: +(s[n >> 1] ?? 0).toFixed(2), p99: +(s[Math.floor(n * 0.99)] ?? 0).toFixed(2), worstMs: +(s[n - 1] ?? 0).toFixed(1),
      over33: a.filter((v) => v > 33.4).length, over20: a.filter((v) => v > 20).length, cpuAvgMs: +(c.reduce((x, y) => x + y, 0) / n).toFixed(2), cpuMaxMs: +Math.max(0, ...c).toFixed(1),
      maxUploadKB: +(Math.max(0, ...u) / 1024).toFixed(0), compiles: k.reduce((x, y) => x + y, 0) };
  };
  let seg = { a: [] as number[], c: [] as number[], u: [] as number[], k: [] as number[] };
  function finishPhase() { results.push(stat(PHASES[phase].name, seg.a, seg.c, seg.u, seg.k)); seg = { a: [], c: [], u: [], k: [] }; }
  function report() {
    done = true; release(); status.remove();
    const all = stat('ALL', ft, cpu, up, comp), pass = all.over33 === 0 && all.p99 <= 20;
    const out = { bench: 'flight', a6: A6, pass, ua: navigator.userAgent, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, ...ctx.info(), when: new Date().toISOString(), total: all, phases: results };
    (window as any).__bench = out; console.log('[City bench]', JSON.stringify(out));
    const el = document.createElement('div'); el.id = 'bench';
    const row = (r: any) => `<tr><td>${r.phase}</td><td>${r.frames}</td><td>${r.fps}</td><td>${r.p50}</td><td>${r.p99}</td><td class="${r.worstMs > 33.4 ? 'fail' : 'pass'}">${r.worstMs}</td><td>${r.over33}</td><td>${r.over20}</td><td>${r.cpuAvgMs}/${r.cpuMaxMs}</td><td>${r.maxUploadKB}</td><td>${r.compiles}</td></tr>`;
    el.innerHTML = `<b>Flight benchmark — <span class="${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span></b> (target: no frame over 33 ms, p99 ≤ 20 ms)${A6 ? '' : ' · A6 OFF (before)'}<br>${out.screen} · ${(out as any).backend ?? ''} · ${(out as any).area ?? ''}
      <table><tr><th>phase</th><th>frames</th><th>fps</th><th>p50 ms</th><th>p99 ms</th><th>worst ms</th><th>&gt;33</th><th>&gt;20</th><th>cpu avg/max ms</th><th>max upload kB</th><th>compiles</th></tr>${results.map(row).join('')}${row(all)}</table>
      <button type="button" data-a="copy">Copy JSON</button> <button type="button" data-a="again">Run again</button> <button type="button" data-a="close">Close</button>`;
    el.addEventListener('click', (e) => { const a = (e.target as HTMLElement).dataset.a;
      if (a === 'copy') navigator.clipboard?.writeText(JSON.stringify(out, null, 1)).then(() => ((e.target as HTMLElement).textContent = 'Copied'), () => prompt('Copy:', JSON.stringify(out)));
      if (a === 'again') location.reload(); if (a === 'close') el.remove(); });
    document.body.appendChild(el);
  }
  return {
    get running() { return !done; },
    /** Called every frame from the main loop, before the robot update. dtMs = rAF-to-rAF time. */
    frame(dtMs: number, cpuMs: number) {
      if (done) return;
      if (phase < 0) { // warm-up: start the flight, then settle so boot work is not measured
        if (settle === 3500) { ctx.start(); }
        settle -= dtMs; if (settle > 0) return;
        phase = 0; phaseT = 0; frames0 = 0; return;
      }
      frames0++; if (frames0 > 1) { ft.push(dtMs); cpu.push(cpuMs); up.push(gpu.uploadBytes); comp.push(gpu.compiles); seg.a.push(dtMs); seg.c.push(cpuMs); seg.u.push(gpu.uploadBytes); seg.k.push(gpu.compiles); }
      const P = PHASES[phase]; phaseT += dtMs;
      if (ctl.mode !== 'ROCKETS') { ctl.press('KeyF', true); ctl.press('KeyF', false); } // GROUND/SKYDIVING -> ROCKETS
      const dy = P.alt - (ctl.pos.y - Math.max(ctl.floor.y, 0));
      hold('Space', dy > 2); hold('KeyC', dy < -4); hold('KeyW', P.fwd); hold('ShiftLeft', !!P.burst && ctl.burst > 0.1);
      if (P.turn) { flip = Math.floor(phaseT / P.turn) % 2; hold('KeyA', flip === 0); hold('KeyD', flip === 1); }
      if (P.zoom && (zoomT += dtMs) > 90) { zoomT = 0; ctx.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.sin(phaseT / 900) * 160 })); }
      status.textContent = `Benchmark: ${P.name} (${phase + 1}/${PHASES.length}) ${(phaseT / 1000).toFixed(0)}/${P.ms / 1000}s — don't touch the keys`;
      if (phaseT >= P.ms) { release(); finishPhase(); phase++; phaseT = 0; flip = 0; if (phase >= PHASES.length) report(); }
    },
  };
}
