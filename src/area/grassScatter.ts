import { sampleHeight, type TerrainGrid } from './data';
/** Pure grass scatter (shared by the main-thread legacy path and the A6 grass worker). */
export const R = 40, DENS = 22, MAX = 140000; // radius m, blades per m², cap
// cover classes that grow grass: land (yards) 0, grass 1, wetland 5, pitch 6
const GROWS: Record<number, number> = { 0: 0.75, 1: 1, 5: 0.6, 6: 1 };
export interface MaskGrid { nx: number; nz: number; cell: number; x0: number; z0: number; bits: Uint8Array }
export function maskBlocked(m: MaskGrid, x: number, z: number) {
  const ix = Math.round((x - m.x0) / m.cell), iz = Math.round((z - m.z0) / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return true; const j = iz * m.nx + ix; return (m.bits[j >> 3] >> (j & 7) & 1) === 1;
}
const h2 = (a: number, b: number, c: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Fills arr with [x, y, z, seed] blades within R of (cx, cz). Returns the blade count. */
export function scatterGrass(t: TerrainGrid, mask: MaskGrid | null, camX: number, camZ: number, arr: Float32Array) {
  const coverAt = (x: number, z: number) => { const ix = Math.round((x - t.x0) / t.cell), iz = Math.round((z - t.z0) / t.cell);
    return ix < 0 || iz < 0 || ix >= t.nx || iz >= t.nz ? 255 : t.cover[iz * t.nx + ix]; };
  let n = 0; const cx = Math.floor(camX), cz = Math.floor(camZ);
  for (let gz = cz - R; gz <= cz + R && n < MAX; gz++) for (let gx = cx - R; gx <= cx + R && n < MAX; gx++) {
    const dx = gx + 0.5 - camX, dz = gz + 0.5 - camZ; if (dx * dx + dz * dz > R * R) continue;
    const grow = GROWS[coverAt(gx + 0.5, gz + 0.5)]; if (!grow) continue;
    if (mask && maskBlocked(mask, gx + 0.5, gz + 0.5)) continue;
    const y0 = sampleHeight(t, gx + 0.5, gz + 0.5); if (y0 < 0.25) continue;
    const k = Math.floor(DENS * grow * (0.6 + h2(gx, gz, 7) * 0.8));
    for (let i = 0; i < k && n < MAX; i++) {
      const x = gx + h2(gx, gz, i * 3 + 1), z = gz + h2(gx, gz, i * 3 + 2);
      arr[n * 4] = x; arr[n * 4 + 1] = sampleHeight(t, x, z) - 0.02; arr[n * 4 + 2] = z; arr[n * 4 + 3] = h2(gx, gz, i * 3 + 3); n++;
    }
  }
  return n;
}
