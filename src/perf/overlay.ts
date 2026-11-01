import { gpu } from './gpuHooks';
import { budget, A6 } from './frame';

/**
 * In-game perf overlay (toggle with P or the backquote key; `?perf=1` opens it). Frame-time graph of the last 240
 * frames with 16.7 / 33 ms lines, plus fps, worst frame, p99, long-frame counts (>33 ms, >20 ms), CPU ms in our
 * frame loop, and per-frame GPU uploads / shader compiles. "Reset" clears the worst/long counters.
 */
const N = 240;
export function createPerfOverlay(getInfo: () => string) {
  const el = document.createElement('div'); el.id = 'perf';
  el.innerHTML = `<canvas width="240" height="70"></canvas><pre></pre><button type="button">Reset</button>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas')!, g = cv.getContext('2d')!, pre = el.querySelector('pre')!;
  const ft = new Float32Array(N), cpu = new Float32Array(N), sorted = new Float32Array(N);
  let i = 0, filled = 0, worst = 0, long33 = 0, long20 = 0, frames = 0, upMax = 0, compTotal = 0, lastText = 0;
  const reset = () => { worst = 0; long33 = 0; long20 = 0; frames = 0; upMax = 0; compTotal = 0; };
  el.querySelector('button')!.addEventListener('click', reset);
  const api = {
    visible: false,
    setVisible(v: boolean) { api.visible = v; el.classList.toggle('on', v); },
    reset,
    /** Called once per frame with the rAF-to-rAF time and the CPU ms our loop took. */
    frame(dtMs: number, cpuMs: number) {
      ft[i] = dtMs; cpu[i] = cpuMs; i = (i + 1) % N; filled = Math.min(N, filled + 1); frames++;
      if (frames > 2) { worst = Math.max(worst, dtMs); if (dtMs > 33.4) long33++; if (dtMs > 20) long20++; }
      upMax = Math.max(upMax, gpu.uploadBytes); compTotal += gpu.compiles;
      if (!api.visible) return;
      const W = cv.width, H = cv.height, sy = H / 50; g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
      for (let k = 0; k < filled; k++) {
        const j = (i - filled + k + N) % N, v = ft[j], c = cpu[j];
        g.fillStyle = v > 33.4 ? '#ff4d4d' : v > 20 ? '#ffb340' : '#4dd88a'; g.fillRect(k, H - Math.min(H, v * sy), 1, Math.min(H, v * sy));
        g.fillStyle = 'rgba(120,180,255,.8)'; g.fillRect(k, H - Math.min(H, c * sy), 1, 1);
      }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, H - 16.7 * sy, W, 1); g.fillStyle = 'rgba(255,80,80,.7)'; g.fillRect(0, H - 33.3 * sy, W, 1);
      const now = performance.now(); if (now - lastText < 250) return; lastText = now;
      sorted.set(ft); const s = sorted.subarray(0, filled).sort(); const avg = s.reduce((a, b) => a + b, 0) / (filled || 1);
      pre.textContent = `${(1000 / avg).toFixed(0)} fps  avg ${avg.toFixed(1)} ms  p99 ${s[Math.floor(filled * 0.99)]?.toFixed(1)} ms\n`
        + `worst ${worst.toFixed(1)} ms  >33ms ${long33}  >20ms ${long20}  (${frames} frames)\n`
        + `cpu ${cpu[(i - 1 + N) % N].toFixed(1)} ms  upload ${(gpu.uploadBytes / 1024).toFixed(0)} kB (max ${(upMax / 1024).toFixed(0)})  compiles ${compTotal}\n`
        + `jobs ${budget.pending}  A6 ${A6 ? 'on' : 'OFF'}  ${getInfo()}`;
    },
  };
  addEventListener('keydown', (e) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; if ((e.code === 'KeyP' || e.code === 'Backquote') && !e.repeat) api.setVisible(!api.visible); });
  return api;
}
export type PerfOverlay = ReturnType<typeof createPerfOverlay>;
