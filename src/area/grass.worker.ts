import { scatterGrass, type MaskGrid } from './grassScatter';
import type { TerrainGrid } from './data';
/** A6 grass worker: scatters blades around a point into a buffer the main thread hands over, then hands it back. */
let terrain: TerrainGrid | null = null, mask: MaskGrid | null = null;
(self as any).onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.init) { terrain = d.terrain; mask = d.mask; return; }
  const arr: Float32Array = d.arr, n = terrain ? scatterGrass(terrain, mask, d.x, d.z, arr) : 0;
  (self as any).postMessage({ arr, n, x: d.x, z: d.z }, [arr.buffer]);
};
