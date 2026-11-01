/**
 * Per-frame cause counters for the benchmark. Code that may cost a frame reports into `diag`:
 *  - `diag.event(name, ms?)` — a discrete piece of work (area build, tree refresh, interior build, grass refresh…)
 *  - `diag.worker(ms)` — time spent in a worker onmessage handler on the main thread
 *  - `diag.section(name, ms)` — main-loop section timings (physics, fx, world update, jobs, render submit)
 * The main loop calls `diag.take()` at the top of each rAF, so a record covers the previous frame's work plus any
 * worker messages handled between frames, i.e. everything that could have delayed the frame just presented.
 */
export interface DiagRec { events: Record<string, number>; eventMs: number; workerMs: number; workerMsgs: number; sections: Record<string, number> }
const fresh = (): DiagRec => ({ events: {}, eventMs: 0, workerMs: 0, workerMsgs: 0, sections: {} });
let cur = fresh();
export const diag = {
  event(name: string, ms = 0) { cur.events[name] = (cur.events[name] ?? 0) + 1; cur.eventMs += ms; },
  worker(ms: number) { cur.workerMs += ms; cur.workerMsgs++; },
  section(name: string, ms: number) { cur.sections[name] = (cur.sections[name] ?? 0) + ms; },
  take(): DiagRec { const r = cur; cur = fresh(); return r; },
  /** Wrap a worker onmessage handler so its main-thread time is attributed. */
  wrap<T extends (e: MessageEvent) => void>(f: T) { return (e: MessageEvent) => { const t = performance.now(); try { f(e); } finally { diag.worker(performance.now() - t); } }; },
};
