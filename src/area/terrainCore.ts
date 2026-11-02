/** Pure terrain decode + height query (no imports): shared by the runtime (data.ts), the bake clean step (tools/bake/clean.mjs, run by node's
 *  type stripping) and the map audit, so every tool sees exactly the ground the game renders. Units: m, x east, z south, y up. */
export interface TerrainGrid { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array; cover: Uint8Array }

/** Pure decode (no closures) so it can run in a worker: header, heights (dm -> m, blurred), cover classes. */
export function decodeTerrain(buf: ArrayBuffer): TerrainGrid {
  const head = new Int32Array(buf, 0, 6);
  if (head[0] !== 0x43545231) throw new Error('terrain.bin: bad magic');
  const [, nx, nz, cellCm, x0Cm, z0Cm] = head;
  const n = nx * nz, hi = new Int16Array(buf, 24, n), cover = new Uint8Array(buf, 24 + n * 2, n).slice();
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = hi[i] / 10;
  // Four box-blur passes soften the 8 m grid so the coastline (0 m contour) reads as a smooth curve, not stairs.
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (src[i] > 2 || src[i] < -2) { let edge = false; for (const j of [i - 1, i + 1, i - nx, i + nx]) if ((src[j] < 0) !== (src[i] < 0)) edge = true; if (!edge) continue; }
      h[i] = (src[i] * 4 + src[i - 1] + src[i + 1] + src[i - nx] + src[i + nx]) / 8;
    }
  }
  easeShoreline(h, nx, nz);
  return { nx, nz, cell: cellCm / 100, x0: x0Cm / 100, z0: z0Cm / 100, h, cover };
}

/** Largest height change allowed between two grid vertices on opposite sides of the waterline (m). */
export const SHORE_MAX_STEP = 0.9;
/** Smallest |height| a vertex keeps (m): no triangle lies flat on the waterline, and land stays land / water stays water. */
export const SHORE_MIN = 0.07;

/** Shoreline ease: the baked bathymetry drops a bulkhead or a river bank straight into the water (steps of 1-8 m between neighbouring vertices at
 *  the 0 m contour). Land and water vertices touching the waterline are pulled toward it so the crossing edge changes by at most SHORE_MAX_STEP,
 *  then a short band around the shore is relaxed so the bank becomes a ramp, not a cliff + a stair. The waterline contour stays where it was
 *  (every vertex keeps its sign) and ground more than 4 cells from the water is untouched. In place. */
function easeShoreline(h: Float32Array, nx: number, nz: number) {
  const n = nx * nz, N4 = [-1, 1, -nx, nx];
  const near = (i: number, j: number) => { const ix = i % nx; return !((j === i - 1 && ix === 0) || (j === i + 1 && ix === nx - 1) || j < 0 || j >= n); };
  // 1. cap the crossing edges (both sides move toward the waterline); repeat because a vertex can touch several crossings
  const cap = SHORE_MAX_STEP / 2, capCrossings = () => {
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) {
      if (h[i] < 0) continue;
      for (const d of N4) { const j = i + d; if (!near(i, j) || h[j] >= 0) continue; if (h[i] - h[j] > SHORE_MAX_STEP) { if (h[i] > cap) h[i] = cap; if (h[j] < -cap) h[j] = -cap; } }
    }
  };
  capCrossings();
  // 2. distance (in cells) from the waterline, then relax the band with a weight that fades to nothing at 4 cells
  const dist = new Uint8Array(n).fill(255), q: number[] = [];
  for (let i = 0; i < n; i++) for (const d of N4) { const j = i + d; if (near(i, j) && (h[i] < 0) !== (h[j] < 0)) { dist[i] = 0; q.push(i); break; } }
  for (let k = 0; k < q.length; k++) { const i = q[k]; if (dist[i] >= 4) continue; for (const d of N4) { const j = i + d; if (near(i, j) && dist[j] === 255) { dist[j] = dist[i] + 1; q.push(j); } } }
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    for (const i of q) {
      if (dist[i] === 0) continue; // the waterline vertices keep their capped value
      const w = (4 - dist[i]) / 5; let s = 0, c = 0; for (const d of N4) { const j = i + d; if (near(i, j)) { s += src[j]; c++; } }
      if (!c) continue;
      const v = src[i] * (1 - w) + (s / c) * w;
      h[i] = src[i] >= 0 ? Math.max(v, SHORE_MIN) : Math.min(v, -SHORE_MIN); // keep the sign: the waterline does not move
    }
  }
  capCrossings(); // the relaxed band must not lift a vertex back over a crossing
  // 3. nothing hugs the waterline closer than SHORE_MIN (no flat triangle at sea level)
  for (let i = 0; i < n; i++) if (Math.abs(h[i]) < SHORE_MIN) h[i] = h[i] >= 0 ? SHORE_MIN : -SHORE_MIN;
}

/** Bilinear-on-triangles height, same split as the mesh triangles (a-c diagonal) so things sit exactly on the rendered ground. */
export function sampleHeight(t: TerrainGrid, x: number, z: number) {
  const { nx, nz, cell, x0, z0, h } = t;
  const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001), fz = Math.min(Math.max((z - z0) / cell, 0), nz - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * nx + ix;
  const a = h[i], b = h[i + 1], c = h[i + nx + 1], d = h[i + nx];
  return tx > tz ? a + (b - a) * tx + (c - b) * tz : a + (c - d) * tx + (d - a) * tz;
}
