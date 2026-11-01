/** Landmark loader (spec: knowledge/JONN-DIRECTIONS.md §1). Reads public/landmarks/index.json, then each
 *  <area>/<slug>/manifest.json, and places the .glb by lat/lon/headingDeg around the area origin.
 *  meshopt + KTX2 decoders are self-hosted (public/basis/); the Basis transcoder runs in KTX2Loader's worker pool. */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Building, Terrain } from './data';
import { ringPts } from './geom';

export interface LandmarkManifest {
  id: string; name: string; area: string; file: string; lat: number; lon: number;
  headingDeg: number; scale?: number; elevationM?: number | null; lod?: { tris?: number[]; switchM?: number[] };
  /** Optional OSM outline as [lat, lon] pairs; used for building culling instead of the model's rotated bounding box. */
  footprint?: [number, number][];
  /** Generated buildings within this many metres of the footprint are culled (default 4). 0 = touching only; false = no culling. */
  cullMarginM?: number | false;
}
/** World-space xz outline a landmark claims; generated buildings that touch it (plus margin) are not built. */
export interface LandmarkFootprint { id: string; pts: [number, number][]; margin: number; minX: number; maxX: number; minZ: number; maxZ: number }
/** World-space pad a landmark stands on: its plan outline (OSM footprint or rotated model box) and the height its base sits at. */
export interface LandmarkPad { id: string; pts: [number, number][]; y: number; minX: number; maxX: number; minZ: number; maxZ: number }
/** World-space collision triangles (flat xyz triples) from each landmark's <slug>_COL mesh. */
export interface LandmarkCollider { tris: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number }

const BASE = import.meta.env.BASE_URL;
const R = 6378137; // same sphere as tools/bake/lib.mjs projector
let ktx2: KTX2Loader | null = null;
let index: Promise<Record<string, string[]>> | null = null;

/** Area origins come from the baked area manifest (same point the bake projected from). */
export async function buildLandmarks(areaId: string, origin: { lat: number; lon: number } | undefined, terrain: Terrain, renderer: THREE.WebGPURenderer) {
  const group = new THREE.Group(); group.name = 'landmarks';
  const colliders: LandmarkCollider[] = [], footprints: LandmarkFootprint[] = [], pads: LandmarkPad[] = [];
  if (!origin) return { group, colliders, footprints, pads };
  index ??= fetch(BASE + 'landmarks/index.json').then((r) => (r.ok ? r.json() : {}), () => ({}));
  const slugs = (await index)[areaId] ?? [];
  if (!slugs.length) return { group, colliders, footprints, pads };
  ktx2 ??= new KTX2Loader().setTranscoderPath(BASE + 'basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const k = (Math.PI / 180) * R, c = Math.cos((origin.lat * Math.PI) / 180);
  for (const slug of slugs) {
    try {
      const dir = `${BASE}landmarks/${areaId}/${slug}/`;
      const m: LandmarkManifest = await (await fetch(dir + 'manifest.json')).json();
      const gltf = await loader.loadAsync(dir + m.file);
      const levels = [0, 1, 2].map((i) => gltf.scene.children.find((n) => new RegExp(`_LOD${i}$`).test(n.name))).filter(Boolean) as THREE.Object3D[];
      if (!levels.length) throw new Error('no _LOD nodes');
      let col: THREE.Mesh | undefined;
      levels[0].traverse((n) => { if (/_COL$/.test(n.name) && (n as THREE.Mesh).isMesh) col = n as THREE.Mesh; });
      col?.removeFromParent();
      const lod = new THREE.LOD(); lod.name = 'landmark:' + m.id;
      const sw = m.lod?.switchM ?? [150, 600];
      levels.forEach((n, i) => lod.addLevel(n, i === 0 ? 0 : sw[i - 1] ?? sw[sw.length - 1]));
      // Model-space plan box (lod still at identity), before the col mesh is counted (it was removed above).
      lod.updateMatrixWorld(true);
      const local = new THREE.Box3().setFromObject(levels[0]);
      // glTF front is -Z (north at heading 0); headingDeg is clockwise from north, three's +Y rotation is counter-clockwise.
      lod.rotation.y = -THREE.MathUtils.degToRad(m.headingDeg ?? 0);
      lod.scale.setScalar(m.scale ?? 1);
      const x = (m.lon - origin.lon) * k * c, z = -(m.lat - origin.lat) * k;
      lod.position.set(x, 0, z); lod.updateMatrixWorld(true);
      // Sit on the lowest ground under the footprint (origin = lowest street-side point, spec §1).
      const box = new THREE.Box3().setFromObject(levels[0]);
      let y = Infinity;
      for (let sx = box.min.x; sx <= box.max.x + 0.01; sx += 4) for (let sz = box.min.z; sz <= box.max.z + 0.01; sz += 4) y = Math.min(y, terrain.heightAt(sx, sz));
      lod.position.y = m.elevationM ?? Math.max(y, 0); lod.updateMatrixWorld(true);
      group.add(lod);
      if (col) colliders.push(toCollider(col, lod.matrixWorld));
      const pts: [number, number][] = m.footprint?.length! >= 3
          ? m.footprint!.map(([la, lo]) => [(lo - origin.lon) * k * c, -(la - origin.lat) * k])
          : ([[local.min.x, local.min.z], [local.max.x, local.min.z], [local.max.x, local.max.z], [local.min.x, local.max.z]] as const)
              .map(([px, pz]) => { const v = new THREE.Vector3(px, 0, pz).applyMatrix4(lod.matrixWorld); return [v.x, v.z] as [number, number]; });
      // the pad is the union of the outline and the model's own plan box (a tower or steps can overhang an OSM outline)
      const boxPts = ([[local.min.x, local.min.z], [local.max.x, local.min.z], [local.max.x, local.max.z], [local.min.x, local.max.z]] as const)
        .map(([px, pz]) => { const v = new THREE.Vector3(px, 0, pz).applyMatrix4(lod.matrixWorld); return [v.x, v.z] as [number, number]; });
      const f = makeFootprint(m.id, pts, 0), fb = makeFootprint(m.id, boxPts, 0);
      pads.push({ id: m.id, pts: boxPts, y: lod.position.y, minX: Math.min(f.minX, fb.minX), maxX: Math.max(f.maxX, fb.maxX), minZ: Math.min(f.minZ, fb.minZ), maxZ: Math.max(f.maxZ, fb.maxZ) });
      if (m.cullMarginM !== false) footprints.push(makeFootprint(m.id, pts, Math.max(0, m.cullMarginM ?? 4)));
    } catch (e) { console.warn('[City] landmark failed', areaId, slug, e); }
  }
  return { group, colliders, footprints, pads };
}

function toCollider(mesh: THREE.Mesh, parent: THREE.Matrix4): LandmarkCollider {
  mesh.updateMatrix();
  const mw = new THREE.Matrix4().multiplyMatrices(parent, mesh.matrix);
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = g.getAttribute('position'), v = new THREE.Vector3(), tris = new Float32Array(pos.count * 3);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw); tris.set([v.x, v.y, v.z], i * 3);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  }
  return { tris, minX, maxX, minZ, maxZ };
}

/** Highest collider surface straight under (x, z), or null. */
export function colliderTopAt(cols: LandmarkCollider[], x: number, z: number) {
  let best: number | null = null;
  for (const c of cols) {
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    const t = c.tris;
    for (let i = 0; i < t.length; i += 9) {
      const ax = t[i], az = t[i + 2], bx = t[i + 3], bz = t[i + 5], cx = t[i + 6], cz = t[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const y = l1 * t[i + 1] + l2 * t[i + 4] + l3 * t[i + 7];
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

function makeFootprint(id: string, pts: [number, number][], margin: number): LandmarkFootprint {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { id, pts, margin, minX, maxX, minZ, maxZ };
}

/** Drops generated buildings whose outer ring intersects (or comes within margin of) any landmark footprint.
 *  Runs once per area build, before the merged building chunks, interiors and collision are made, so the culled
 *  shells never exist: no extra draw calls, no per-frame cost, no stale collision. */
export function cullUnderLandmarks(list: Building[], fps: LandmarkFootprint[]) {
  const culled: Record<string, number> = {};
  if (!fps.length) return { kept: list, culled };
  for (const f of fps) culled[f.id] = 0;
  const kept = list.filter((b) => {
    const pts = ringPts(b.r[0] ?? []) as [number, number][]; if (pts.length < 3) return true;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    for (const f of fps) {
      if (maxX < f.minX - f.margin || minX > f.maxX + f.margin || maxZ < f.minZ - f.margin || minZ > f.maxZ + f.margin) continue;
      if (polysTouch(pts, f.pts, f.margin)) { culled[f.id]++; return false; }
    }
    return true;
  });
  return { kept, culled };
}

type P = [number, number];
const inPoly = (pts: P[], x: number, z: number) => {
  let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  } return c;
};
const segDist2 = (p: P, a: P, b: P) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L));
  const x = a[0] + dx * t - p[0], z = a[1] + dz * t - p[1]; return x * x + z * z;
};
const cross = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segsCross = (a: P, b: P, c: P, d: P) => cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
/** True if polygons overlap, one contains the other, or their outlines come within `margin` metres. */
function polysTouch(a: P[], b: P[], margin: number) {
  if (inPoly(b, a[0][0], a[0][1]) || inPoly(a, b[0][0], b[0][1])) return true;
  const m2 = margin * margin;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i], a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b0 = b[j], b1 = b[(j + 1) % b.length];
      if (segsCross(a0, a1, b0, b1)) return true;
      if (m2 > 0 && (segDist2(a0, b0, b1) <= m2 || segDist2(b0, a0, a1) <= m2)) return true;
    }
  }
  return false;
}

/** Signed-ish distance (m) from (x, z) to a pad outline: <= 0 inside, else the distance to the nearest edge. */
function padDist(pd: LandmarkPad, x: number, z: number) {
  if (inPoly(pd.pts, x, z)) return 0;
  let d = Infinity; for (let i = 0, j = pd.pts.length - 1; i < pd.pts.length; j = i++) d = Math.min(d, segDist2([x, z], pd.pts[j], pd.pts[i]));
  return Math.sqrt(d);
}

/** Flattens the terrain heightfield under every landmark pad to the landmark's base height (so it is neither buried in a slope nor
 *  floating over a dip), blending back to the original ground over `blend` m around it. Run once per area load, BEFORE the terrain
 *  mesh, roads, trees and grass are built (they all sample the same heights). Idempotent: running it twice gives the same heights. */
export function flattenUnderLandmarks(t: { nx: number; nz: number; cell: number; x0: number; z0: number; h: Float32Array }, pads: LandmarkPad[], blend = 14) {
  let n = 0;
  for (const pd of pads) {
    const pad = t.cell * 0.75; // grid cells are coarse (8 m): every vertex within ~3/4 cell of the outline is held flat so the rendered triangles under the walls are level
    const ix0 = Math.max(0, Math.floor((pd.minX - blend - pad - t.x0) / t.cell)), ix1 = Math.min(t.nx - 1, Math.ceil((pd.maxX + blend + pad - t.x0) / t.cell));
    const iz0 = Math.max(0, Math.floor((pd.minZ - blend - pad - t.z0) / t.cell)), iz1 = Math.min(t.nz - 1, Math.ceil((pd.maxZ + blend + pad - t.z0) / t.cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const d = padDist(pd, t.x0 + ix * t.cell, t.z0 + iz * t.cell) - pad, i = iz * t.nx + ix;
      if (d >= blend) continue;
      const w = d <= 0 ? 1 : 1 - (d / blend) * (d / blend) * (3 - 2 * (d / blend));
      t.h[i] = t.h[i] + (pd.y - t.h[i]) * w; n++;
    }
  }
  return n;
}

/** Drops trees whose trunk stands inside (or within `margin` m of) a landmark pad. `flat` is the baked tree list (5 numbers per tree, x / z in dm). */
export function treesOutsideLandmarks(flat: number[], pads: LandmarkPad[], margin = 3) {
  if (!pads.length) return { flat, removed: 0 };
  const out: number[] = []; let removed = 0;
  for (let i = 0; i + 4 < flat.length; i += 5) {
    const x = flat[i] / 10, z = flat[i + 1] / 10;
    if (pads.some((pd) => x > pd.minX - margin && x < pd.maxX + margin && z > pd.minZ - margin && z < pd.maxZ + margin && padDist(pd, x, z) <= margin)) { removed++; continue; }
    out.push(flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4]);
  }
  return { flat: out, removed };
}

/** Marks every grass-mask cell inside (or within `margin` m of) a landmark pad as blocked, so no grass grows through the floor. */
export function blockGrassUnderLandmarks(mask: { nx: number; nz: number; cell: number; x0: number; z0: number; bits: Uint8Array }, pads: LandmarkPad[], margin = 1.5) {
  let n = 0;
  for (const pd of pads) {
    const ix0 = Math.max(0, Math.floor((pd.minX - margin - mask.x0) / mask.cell)), ix1 = Math.min(mask.nx - 1, Math.ceil((pd.maxX + margin - mask.x0) / mask.cell));
    const iz0 = Math.max(0, Math.floor((pd.minZ - margin - mask.z0) / mask.cell)), iz1 = Math.min(mask.nz - 1, Math.ceil((pd.maxZ + margin - mask.z0) / mask.cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      if (padDist(pd, mask.x0 + ix * mask.cell, mask.z0 + iz * mask.cell) > margin + mask.cell * 0.71) continue;
      const j = iz * mask.nx + ix; mask.bits[j >> 3] |= 1 << (j & 7); n++;
    }
  }
  return n;
}
