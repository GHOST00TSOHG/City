import * as THREE from 'three/webgpu';
import type { TerrainGrid } from './terrainCore';

/** Far ground: a low-detail ring around the baked tile so there is never black emptiness past its edge, from the street or from max altitude.
 *  The inner boundary IS the tile's edge (same vertices, same heights, so there is no step or crack); outward it eases from the edge heights to
 *  a smooth plain at the local edge level (inland: kept above the ground, coastal: the seabed / the land the edge continues into) and runs to 38 km, where the fog
 *  has taken all of it and the sky dome below the horizon is the fog colour. One draw call, ~2 tris per perimeter vertex per layer. */
export const FAR_LAYERS = [10, 24, 50, 100, 190, 340, 600, 1000, 1700, 2800, 4500, 7500, 12000, 19000, 30000, 38000];
export const FAR_RADIUS = FAR_LAYERS[FAR_LAYERS.length - 1];

const LAND = 0x5c5e4e, SEABED = 0xb9b08a, DEEP = 0x2c6a70;
const rgb = (hex: number) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const lin = (c: number) => Math.pow(c, 2.2); // three's vertex colours are linear; the terrain colours above are authored in sRGB
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export interface FarGroundData { positions: Float32Array; colors: Float32Array; indices: Uint32Array; triangles: number }

/** Pure geometry (also run by the map audit): perimeter of the tile -> FAR_LAYERS square rings. */
export function farGroundData(t: TerrainGrid, inland: boolean): FarGroundData {
  const { nx, nz, cell, x0, z0, h } = t;
  // perimeter, clockwise seen from above (x east, z south): top edge W->E, right edge N->S, bottom edge E->W, left edge S->N
  const px: number[] = [], pz: number[] = [], ph: number[] = [], ox: number[] = [], oz: number[] = [];
  const add = (ix: number, iz: number) => { px.push(x0 + ix * cell); pz.push(z0 + iz * cell); ph.push(h[iz * nx + ix]); ox.push(ix === 0 ? -1 : ix === nx - 1 ? 1 : 0); oz.push(iz === 0 ? -1 : iz === nz - 1 ? 1 : 0); };
  for (let ix = 0; ix < nx - 1; ix++) add(ix, 0);
  for (let iz = 0; iz < nz - 1; iz++) add(nx - 1, iz);
  for (let ix = nx - 1; ix > 0; ix--) add(ix, nz - 1);
  for (let iz = nz - 1; iz > 0; iz--) add(0, iz);
  const N = px.length, K = FAR_LAYERS.length + 1;
  const H: Float32Array[] = [Float32Array.from(ph)];
  for (let k = 1; k < K; k++) {
    const d = FAR_LAYERS[k - 1], prev = H[k - 1], rad = Math.min(N >> 1, Math.round(d / cell / 2)); // tangential blur grows with distance: edge bumps smear out, the plain follows the local edge level
    const out = new Float32Array(N), pre = new Float64Array(N * 3 + 1);
    for (let i = 0; i < N * 3; i++) pre[i + 1] = pre[i] + prev[i % N];
    const f = smooth(d / 70);
    for (let i = 0; i < N; i++) {
      const lo = i - rad + N, hi = i + rad + N, avg = rad ? (pre[hi + 1] - pre[lo]) / (2 * rad + 1) : prev[i];
      out[i] = inland ? avg + (Math.max(avg, 0.3) - avg) * f : avg; // inland has no sea: a river bed at the edge climbs to the plain; coastal keeps its seabed under the sea plane
    }
    H.push(out);
  }
  const pos = new Float32Array(N * K * 3), col = new Float32Array(N * K * 3), land3 = rgb(LAND).map(lin), sea = rgb(SEABED).map(lin), deep = rgb(DEEP).map(lin);
  for (let k = 0; k < K; k++) {
    const d = k ? FAR_LAYERS[k - 1] : 0;
    for (let i = 0; i < N; i++) {
      const v = k * N + i, y = H[k][i];
      pos[v * 3] = px[i] + ox[i] * d; pos[v * 3 + 1] = y; pos[v * 3 + 2] = pz[i] + oz[i] * d;
      if (y < 0 && !inland) { const m = Math.min(1, -y / 2.5); for (let q = 0; q < 3; q++) col[v * 3 + q] = sea[q] + (deep[q] - sea[q]) * m; }
      else for (let q = 0; q < 3; q++) col[v * 3 + q] = land3[q];
    }
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, e: number) => { // a,b on layer k; c,e on layer k+1 (c under b, e under a); both triangles face up
    for (const [p, q, r] of [[a, e, b], [b, e, c]]) {
      const e1x = pos[q * 3] - pos[p * 3], e1z = pos[q * 3 + 2] - pos[p * 3 + 2], e2x = pos[r * 3] - pos[p * 3], e2z = pos[r * 3 + 2] - pos[p * 3 + 2];
      if (e1z * e2x - e1x * e2z > 0) idx.push(p, q, r); else idx.push(p, r, q);
    }
  };
  for (let k = 0; k < K - 1; k++) for (let i = 0; i < N; i++) { const j = (i + 1) % N; quad(k * N + i, k * N + j, (k + 1) * N + j, (k + 1) * N + i); }
  return { positions: pos, colors: col, indices: Uint32Array.from(idx), triangles: idx.length / 3 };
}

/** The ring as one lit mesh (fogged like everything else). */
export function buildFarGround(t: TerrainGrid, inland: boolean) {
  const d = farGroundData(t, inland), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3)); g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshLambertNodeMaterial({ vertexColors: true })); m.name = 'far-ground'; m.frustumCulled = false; m.renderOrder = -1;
  return m;
}
