/** Landmark loader (spec: knowledge/JONN-DIRECTIONS.md §1). Reads public/landmarks/index.json, then each
 *  <area>/<slug>/manifest.json, and places the .glb by lat/lon/headingDeg around the area origin.
 *  meshopt + KTX2 decoders are self-hosted (public/basis/); the Basis transcoder runs in KTX2Loader's worker pool. */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Terrain } from './data';

export interface LandmarkManifest {
  id: string; name: string; area: string; file: string; lat: number; lon: number;
  headingDeg: number; scale?: number; elevationM?: number | null; lod?: { tris?: number[]; switchM?: number[] };
}
/** World-space collision triangles (flat xyz triples) from each landmark's <slug>_COL mesh. */
export interface LandmarkCollider { tris: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number }

const BASE = import.meta.env.BASE_URL;
const R = 6378137; // same sphere as tools/bake/lib.mjs projector
let ktx2: KTX2Loader | null = null;
let index: Promise<Record<string, string[]>> | null = null;

/** Area origins come from the baked area manifest (same point the bake projected from). */
export async function buildLandmarks(areaId: string, origin: { lat: number; lon: number } | undefined, terrain: Terrain, renderer: THREE.WebGPURenderer) {
  const group = new THREE.Group(); group.name = 'landmarks';
  const colliders: LandmarkCollider[] = [];
  if (!origin) return { group, colliders };
  index ??= fetch(BASE + 'landmarks/index.json').then((r) => (r.ok ? r.json() : {}), () => ({}));
  const slugs = (await index)[areaId] ?? [];
  if (!slugs.length) return { group, colliders };
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
    } catch (e) { console.warn('[City] landmark failed', areaId, slug, e); }
  }
  return { group, colliders };
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
