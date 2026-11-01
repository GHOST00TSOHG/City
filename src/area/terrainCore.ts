/** Pure terrain decode + sampling: no runtime imports, so the audit tool can run it under plain node. */
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
  return { nx, nz, cell: cellCm / 100, x0: x0Cm / 100, z0: z0Cm / 100, h, cover };
}
/** Bilinear-on-triangles height, same split as the mesh triangles (a-c diagonal) so things sit exactly on the rendered ground. */
export function sampleHeight(t: TerrainGrid, x: number, z: number) {
  const { nx, nz, cell, x0, z0, h } = t;
  const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001), fz = Math.min(Math.max((z - z0) / cell, 0), nz - 1.001);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * nx + ix;
  const a = h[i], b = h[i + 1], c = h[i + nx + 1], d = h[i + nx];
  return tx > tz ? a + (b - a) * tx + (c - b) * tz : a + (c - d) * tx + (d - a) * tz;
}
