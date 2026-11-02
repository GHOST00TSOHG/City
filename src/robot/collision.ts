import type { Building, Terrain } from '../area/data';
import { ringPts } from '../area/geom';
import { foundation } from '../area/foundation';
import { colliderTopAt, type LandmarkCollider } from '../area/landmarks';

/** Spatial grid of building footprints → roof height at a point (land on roofs, block walls in flight). */
export function createCollision(list: Building[], terrain: Terrain, landmarks: LandmarkCollider[] = []) {
  const CELL = 24, grid = new Map<number, number[]>();
  const polys: { pts: [number, number][]; top: number; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const key = (ix: number, iz: number) => ix * 73856093 ^ iz * 19349663;
  for (const b of list) {
    const pts = ringPts(b.r[0] ?? []) as [number, number][]; if (pts.length < 3) continue;
    let gmin = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { gmin = Math.min(gmin, terrain.heightAt(x, z)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    // Pitched roofs: stand at the mean of eave and ridge (close enough for a 1.35 m robot; flat roofs exact).
    const top = foundation([pts, ...b.r.slice(1).map(ringPts)] as [number, number][][], terrain).floor + b.h - (b.s !== 'flat' && b.rh > 0.2 ? b.rh * 0.5 : 0);
    const i = polys.push({ pts, top, minX, maxX, minZ, maxZ }) - 1;
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const k = key(ix, iz); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    }
  }
  const inside = (pts: [number, number][], x: number, z: number) => {
    let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i], [xj, zj] = pts[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    } return c;
  };
  return {
    /** Highest roof under (x, z), or null. */
    roofAt(x: number, z: number) {
      const a = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a && !landmarks.length) return null;
      let best: number | null = landmarks.length ? colliderTopAt(landmarks, x, z) : null;
      for (const i of a ?? []) { const p = polys[i]; if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue; if (inside(p.pts, x, z) && (best === null || p.top > best)) best = p.top; }
      return best;
    },
  };
}
export type Collision = ReturnType<typeof createCollision>;
