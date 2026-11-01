import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/** Self-hosted CC0 material textures (public/textures/*.ktx2, see LICENSES.md there). Each file is one KTX2 2D array
 *  (Basis ETC1S, mipmapped), so a material samples a whole set through one sampler: `texture(t, uv).depth(layer)`. */
export const GROUND = { grass: 0, sand: 1, soil: 2, concrete: 3 } as const;
export const WALL = { brick: 0, paintedBrick: 1, stucco: 2, siding: 3, concrete: 4 } as const;
export const ROOF = { shingle: 0, terracotta: 1, gravel: 2 } as const;
export interface MaterialTextures { ground: THREE.Texture; walls: THREE.Texture; roofs: THREE.Texture }

let loader: KTX2Loader | null = null;
function fallback(layers: number, rgb: [number, number, number]) { // 1x1 grey layers if a file is missing, so nothing breaks
  const d = new Uint8Array(layers * 4); for (let i = 0; i < layers; i++) d.set([...rgb, 255], i * 4);
  const t = new THREE.DataArrayTexture(d, 1, 1, layers); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
export async function loadMaterialTextures(renderer: THREE.WebGPURenderer): Promise<MaterialTextures> {
  const base = import.meta.env.BASE_URL;
  loader ??= new KTX2Loader().setTranscoderPath(base + 'basis/').detectSupport(renderer);
  const one = async (name: string, layers: number) => {
    try {
      const t = await loader!.loadAsync(`${base}textures/${name}.ktx2`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
      return t;
    } catch (e) { console.warn('[City] texture fallback', name, e); return fallback(layers, [128, 128, 128]); }
  };
  const [ground, walls, roofs] = await Promise.all([one('ground', 4), one('walls', 5), one('roofs', 3)]);
  return { ground, walls, roofs };
}

/** Per-area painting: wall material mix (weights per WALL id, houses vs larger buildings), paint palettes, roof mix, ground tint. */
export interface AreaStyle { house: number[]; big: number[]; paints: number[]; roofPitched: number[]; groundTint: number; sandBias: number }
const NJ_PAINT = [0xe8e4da, 0xd9d2c3, 0xbfc6c2, 0xc9b79a, 0x9aa7a4, 0xd8cdb4, 0xf0ede6, 0xa8988a, 0x8f9a86, 0xcfc1a6];
export const AREA_STYLE: Record<string, AreaStyle> = {
  // Florida: pastel stucco and white clapboard (conch houses), terracotta + light shingle roofs, sandy ground
  keywest: { house: [0, 0.05, 0.35, 0.6, 0], big: [0.05, 0.1, 0.6, 0.05, 0.2], paints: [0xf3efe4, 0xf2e3c4, 0xd9ecdf, 0xf4d9d0, 0xd5e6ef, 0xf6f1d8, 0xe9f1e6, 0xf0e0e6], roofPitched: [0.55, 0.45, 0], groundTint: 0xfff6e0, sandBias: 0.25 },
  // Jersey Shore towns: vinyl/wood siding houses, some brick and stucco, dark asphalt shingles
  bayshore: { house: [0.08, 0.04, 0.08, 0.8, 0], big: [0.35, 0.1, 0.2, 0.15, 0.2], paints: NJ_PAINT, roofPitched: [0.92, 0.08, 0], groundTint: 0xffffff, sandBias: 0.1 },
  // Fort Hancock: yellow/buff brick officers' row and barracks, a few clapboard buildings
  sandyhook: { house: [0.15, 0.6, 0, 0.25, 0], big: [0.25, 0.55, 0, 0.05, 0.15], paints: [0xe2c98f, 0xd8bf86, 0xead7a8, 0xf0ece0, 0xcdb68a], roofPitched: [0.7, 0.3, 0], groundTint: 0xfffaf0, sandBias: 0.2 },
  // Newark: red brick rowhouses and walk-ups, siding on frame houses, concrete and brick commercial
  newark: { house: [0.4, 0.05, 0.05, 0.5, 0], big: [0.55, 0.05, 0.05, 0.05, 0.3], paints: NJ_PAINT, roofPitched: [0.95, 0.05, 0], groundTint: 0xf4f2ee, sandBias: 0 },
  // Passaic riverfront: brick mills and warehouses, concrete industrial, siding houses
  passaic: { house: [0.3, 0.05, 0.05, 0.6, 0], big: [0.5, 0.05, 0.05, 0.05, 0.35], paints: NJ_PAINT, roofPitched: [0.95, 0.05, 0], groundTint: 0xf6f4ef, sandBias: 0 },
};
export const styleFor = (id: string) => AREA_STYLE[id] ?? AREA_STYLE.bayshore;
/** Deterministic weighted pick from a hash value in [0,1). */
export function pick(w: number[], h: number) { const s = w.reduce((a, b) => a + b, 0) || 1; let acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i] / s; if (h < acc) return i; } return w.length - 1; }

// Per-layer constants (linear means measured from the source JPGs) so every material lands at a believable albedo.
export const WALL_SCALE = [2.4, 2.4, 3, 2.6, 4];            // metres per texture tile
export const WALL_PAINTED = [0, 1, 1, 1, 0];                // 1 = paint colour comes from the vertex colour
export const WALL_MEAN = [0.161, 0.692, 0.664, 0.05, 0.11]; // linear luminance means (painted layers are normalised by this)
export const WALL_GAIN = [1, 1, 1, 1, 2.4];                 // brick as-is, dark concrete lifted to ~0.27
export const ROOF_GAIN = [3, 1, 0.5];                       // shingle ~0.08, terracotta as-is, gravel ~0.34
export const GROUND_GAIN = [1.1, 1.15, 0.85, 0.9];
export const GROUND_SCALE = [3.5, 5, 6, 3];
// Asphalt-shingle colours (linear-ish sRGB hex), picked per building so pitched roofs aren't one dark mass.
export const SHINGLE = [0x4f4c48, 0x625a52, 0x6e4c3c, 0x4a5257, 0x7a4236, 0x83807a, 0x5a5f4c, 0x3c3a38, 0x8a6e58];
