/** Where a building stands on the ground. Pure (no three): used by the shell builder, interiors, collision and the map audit so they agree.
 *  The wall base follows the old convention (0.4 m under the floor, which the facade/interior maths are built on); the shell then extends a skirt
 *  down to the lowest terrain sample so nothing floats, and the floor is raised on slopes so walls are never buried by more than BURY_MAX. */
export interface HeightQuery { heightAt(x: number, z: number): number }
export type Ring = [number, number][];
export interface Foundation {
  /** floor level (m): where the ground floor stands */
  floor: number;
  /** wall base / facade origin: floor - 0.4 (parts: set by the caller) */
  wallBase: number;
  /** lowest point of the shell (base cap); at most wallBase, and 0.3 m under the lowest terrain sample */
  bottom: number;
  minT: number; maxB: number;
}
export const BURY_MAX = 0.4, SKIRT = 0.3, FOOT = 0.4, SAMPLE_STEP = 0.75;

/** Boundary samples every <= step along every ring edge (outer and holes), plus a coarse interior grid. */
export function footprintSamples(rings: Ring[], step = SAMPLE_STEP) {
  const boundary: [number, number][] = [], interior: [number, number][] = [];
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) boundary.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  const o = rings[0]; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of o) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const gs = Math.max(2, Math.min(5, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 400)));
  const inside = (p: Ring, x: number, z: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  for (let x = minX + gs / 2; x < maxX; x += gs) for (let z = minZ + gs / 2; z < maxZ; z += gs) if (inside(o, x, z) && !rings.slice(1).some((h) => inside(h, x, z))) interior.push([x, z]);
  return { boundary, interior };
}

export function foundation(rings: Ring[], t: HeightQuery): Foundation {
  const { boundary, interior } = footprintSamples(rings);
  let minT = Infinity, maxB = -Infinity;
  for (const [x, z] of boundary) { const h = t.heightAt(x, z); minT = Math.min(minT, h); maxB = Math.max(maxB, h); }
  for (const [x, z] of interior) minT = Math.min(minT, t.heightAt(x, z));
  const floor = Math.max(minT, 0.2, maxB - BURY_MAX), wallBase = floor - FOOT;
  return { floor, wallBase, bottom: Math.min(wallBase, minT - SKIRT), minT, maxB };
}
