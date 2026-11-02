/** Time slicing for main-thread work: `const tick = slicer(); for (...) { await tick(); ... }` yields to the event loop (so a frame can render) once `ms` of work has run. */
export function slicer(ms = 4) {
  let t = performance.now();
  return async () => { if (performance.now() - t > ms) { await new Promise<void>((r) => setTimeout(r, 0)); t = performance.now(); } };
}
