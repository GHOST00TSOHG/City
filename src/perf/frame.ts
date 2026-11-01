/**
 * A6 frame budget. Streaming-style work (tree LOD refresh, grass scatter, interior builds, worker results) goes
 * through here instead of running whenever it is triggered, so no single frame takes a big lump of CPU or upload.
 *  - `budget.begin()` once at the top of each frame.
 *  - `budget.left()` = ms still available for background work this frame (default 3 ms).
 *  - `budget.upload(bytes)` reserves GPU upload bytes this frame (default 4 MB); false = wait for the next frame.
 *  - `budget.queue(job)` runs a job (returns true when finished) in later frames while time is left.
 * `?a6=0` turns every A6 change off (legacy code paths), so the same build can record a "before" run.
 */
const qs = new URLSearchParams(location.search);
export const A6 = qs.get('a6') !== '0';

type Job = () => boolean;
const jobs: Job[] = [];
let start = 0, uploaded = 0;
export const budget = {
  ms: Number(qs.get('budget') ?? 3),
  uploadCap: 4e6,
  /** per-frame counters (reset in begin), read by the perf overlay and the benchmark */
  stats: { uploadBytes: 0, jobsRun: 0, deferred: 0 },
  begin() { start = performance.now(); uploaded = 0; this.stats.uploadBytes = 0; this.stats.jobsRun = 0; this.stats.deferred = 0; },
  left() { return A6 ? this.ms - (performance.now() - start) : Infinity; },
  upload(bytes: number) {
    if (A6 && uploaded > 0 && uploaded + bytes > this.uploadCap) { this.stats.deferred++; return false; }
    uploaded += bytes; this.stats.uploadBytes += bytes; return true;
  },
  queue(job: Job) { jobs.push(job); },
  /** Run queued jobs until the time budget is used. Always runs at least one so nothing starves. */
  run() {
    let n = 0;
    while (jobs.length && (n === 0 || this.left() > 0)) { const j = jobs[0]; if (j()) jobs.shift(); n++; this.stats.jobsRun++; if (n > 64) break; }
    return jobs.length;
  },
  get pending() { return jobs.length; },
};
