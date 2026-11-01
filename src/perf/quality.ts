/**
 * Quality tier + dynamic resolution (tuned for the fanless MacBook Air M4 at 2560x1664 / 60 Hz).
 * `?quality=air|high|auto` (default auto). Auto starts on Air and only moves to High when the device is clearly faster:
 * >= 12 logical cores AND a clean GPU warm-up (rendering at the High pixel ratio with no missed vsyncs).
 * Content distances (grass radius, tree LOD bands, interior load range, FX particles) are fixed at load from the tier
 * chosen before the warm-up (Air for auto); the warm-up only raises the resolution ceiling.
 * Dynamic resolution: render scale (x the tier's base pixel ratio) drops 0.1 when the smoothed frame time is over
 * budget, down to 0.7, and creeps back up 0.05 after a long clean stretch; each drop after a rise doubles that wait.
 */
const qs = new URLSearchParams(location.search);
export type Tier = 'air' | 'high';
const want = qs.get('quality');
export const quality = {
  mode: (want === 'air' || want === 'high' ? want : 'auto') as 'air' | 'high' | 'auto',
  tier: (want === 'high' ? 'high' : 'air') as Tier,
  /** load-time content settings (from the pre-warm-up tier) */
  grassR: want === 'high' ? 40 : 30,
  treeDist: want === 'high' ? 1 : 0.75,
  interiorNear: want === 'high' ? 18 : 14,
  fxParticles: want === 'high' ? 90 : 56,
  basePR() { return this.tier === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.25); },
  scale: 1, minScale: 0.7, dynres: qs.get('dynres') !== '0',
  warmup: null as null | { frames: number; missed: number; p50: number; cores: number; result: Tier },
};

/** Decide auto tier from a short warm-up: render `n` frames at the High pixel ratio and count missed vsyncs. */
export async function warmupTier(render: () => void, setPR: (pr: number) => void, intervalMs: number, n = 40) {
  if (quality.mode !== 'auto') { setPR(quality.basePR()); return; }
  const cores = navigator.hardwareConcurrency || 4;
  setPR(Math.min(devicePixelRatio, 2));
  const d: number[] = []; let last = 0;
  await new Promise<void>((done) => { const f = (t: number) => { if (last) d.push(t - last); last = t; render(); if (d.length >= n) done(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const s = d.slice(5).sort((a, b) => a - b), missed = s.filter((v) => v > intervalMs * 1.5).length;
  const result: Tier = cores >= 12 && missed === 0 ? 'high' : 'air';
  quality.tier = result; quality.warmup = { frames: s.length, missed, p50: +(s[s.length >> 1] ?? 0).toFixed(2), cores, result };
  setPR(quality.basePR() * quality.scale);
}

let ema = 0, over = 0, clean = 0, upWait = 4000, cooldown = 0, rose = false;
/** Call once per rendered frame with the frame delta and the target interval; returns true when the pixel ratio changed. */
export function dynres(frameMs: number, targetMs: number, setPR: (pr: number) => void) {
  if (!quality.dynres) return false;
  ema = ema ? ema + (Math.min(frameMs, 100) - ema) * 0.08 : frameMs;
  cooldown -= frameMs;
  if (ema > targetMs * 1.08) { over++; clean = 0; } else { over = 0; if (frameMs < targetMs * 1.25) clean += frameMs; else clean = 0; }
  if (cooldown > 0) return false;
  if (over > 20 && quality.scale > quality.minScale + 1e-3) {
    quality.scale = Math.max(quality.minScale, +(quality.scale - 0.1).toFixed(2)); over = 0; cooldown = 1000; if (rose) upWait = Math.min(64000, upWait * 2); rose = false;
    setPR(quality.basePR() * quality.scale); return true;
  }
  if (clean > upWait && quality.scale < 1) {
    quality.scale = Math.min(1, +(quality.scale + 0.05).toFixed(2)); clean = 0; cooldown = 1500; rose = true;
    setPR(quality.basePR() * quality.scale); return true;
  }
  return false;
}
export const qualityLabel = () => `${quality.tier}${quality.mode === 'auto' ? ' (auto)' : ''} · scale ${quality.scale.toFixed(2)} · PR ${(quality.basePR() * quality.scale).toFixed(2)}`;
