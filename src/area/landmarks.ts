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
/** World-space collision triangles (flat xyz triples) from each landmark's <slug>_COL mesh. */
export interface LandmarkCollider { tris: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number }

const BASE = import.meta.env.BASE_URL;
const R = 6378137; // same sphere as tools/bake/lib.mjs projector
let ktx2: KTX2Loader | null = null;
let index: Promise<Record<string, string[]>> | null = null;

/** Area origins come from the baked area manifest (same point the bake projected from). */
export async function buildLandmarks(areaId: string, origin: { lat: number; lon: number } | undefined, terrain: Terrain, renderer: THREE.WebGPURenderer) {
  const group = new THREE.Group(); group.name = 'landmarks';
  const colliders: LandmarkCollider[] = [], footprints: LandmarkFootprint[] = [];
  if (!origin) return { group, colliders, footprints };
  index ??= fetch(BASE + 'landmarks/index.json').then((r) => (r.ok ? r.json() : {}), () => ({}));
  const slugs = (await index)[areaId] ?? [];
  if (!slugs.length) return { group, colliders, footprints };
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
      tuneLandmarkMaterials(lod, m.id);
      if (m.id === 'newark-schools-stadium') attachStadiumFloodLights(lod);
      group.add(lod);
      if (col) colliders.push(toCollider(col, lod.matrixWorld));
      if (m.cullMarginM !== false) {
        const pts: [number, number][] = m.footprint?.length! >= 3
          ? m.footprint!.map(([la, lo]) => [(lo - origin.lon) * k * c, -(la - origin.lat) * k])
          : ([[local.min.x, local.min.z], [local.max.x, local.min.z], [local.max.x, local.max.z], [local.min.x, local.max.z]] as const)
              .map(([px, pz]) => { const v = new THREE.Vector3(px, 0, pz).applyMatrix4(lod.matrixWorld); return [v.x, v.z] as [number, number]; });
        footprints.push(makeFootprint(m.id, pts, Math.max(0, m.cullMarginM ?? 4)));
      }
    } catch (e) { console.warn('[City] landmark failed', areaId, slug, e); }
  }
  return { group, colliders, footprints };
}

/** Night readability tweaks for landmark glTF materials (emissive-* slots). */
function tuneLandmarkMaterials(root: THREE.Object3D, id: string) {
  const lampBoost = id === 'newark-schools-stadium' ? 1.2 : 1 // glb lamp emission is already doubled (f7c3be6);
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (!m?.emissive) continue;
      const name = m.name ?? '';
      if (name === 'emissive-lamp') {
        m.emissiveIntensity = (m.emissiveIntensity || 1) * lampBoost;
        m.emissive.multiplyScalar(1.15);
      } else if (name === 'emissive-windows') m.emissiveIntensity = (m.emissiveIntensity || 1) * 1.1;
    }
  });
}

/** Four corner flood banks + arch lamps: cheap point lights parented to the landmark (no extra draws). */
function attachStadiumFloodLights(lod: THREE.Object3D) {
  const g = new THREE.Group();
  g.name = 'stadium-flood-lights';
  const v = new THREE.Vector3(), acc = new THREE.Vector3();
  let n = 0;
  lod.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.some((m) => (m as THREE.Material).name === 'emissive-lamp')) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) return;
    acc.set(0, 0, 0);
    const c = bb.getCenter(acc);
    mesh.localToWorld(v.copy(c));
    lod.worldToLocal(v);
    if (v.y < 12) return;
    const light = new THREE.PointLight(0xffe8c8, 2.8, 140, 1.4);
    light.position.copy(v);
    g.add(light);
    n++;
  });
  if (n) lod.add(g);
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
