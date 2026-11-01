import { quality } from '../perf/quality';
import { diag } from '../perf/diag';
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, vec3, sin, float, time, uniform, texture, uv, instanceColor, cameraPosition, step } from 'three/tsl';
import { A6, budget } from '../perf/frame';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Tree as EzTree } from '@eztree/tree.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import oakLeafUrl from '@eztree/assets/leaves/oak_color.png';
import ashLeafUrl from '@eztree/assets/leaves/ash_color.png';
import oakBarkUrl from '@eztree/assets/bark/oak_color_1k.jpg';
import oakPreset from '@eztree/presets/oak_medium.json';
import ashPreset from '@eztree/presets/ash_medium.json';
import type { Terrain } from './data';

/** Procedural palms and broadleaf trees: alpha-tested frond/leaf cards from a canvas-drawn atlas, spherical canopy normals,
 *  TSL wind sway, two LODs per kind (4 draw calls), instances re-sorted near/far as the camera moves. Nominal height 10 m. */
function atlas(): THREE.CanvasTexture {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d')!; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // top half: palm frond, rib along x
  for (let i = 0; i < 70; i++) {
    const t = i / 70, x = 8 + t * 490, len = 120 * Math.sin(Math.PI * (0.15 + 0.85 * t)) * (1 - t * 0.35);
    for (const sgn of [-1, 1]) {
      g.strokeStyle = `hsl(${88 + rnd() * 20},${45 + rnd() * 15}%,${26 + rnd() * 14}%)`; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + 14, 128 + sgn * len * 0.5, x + 34, 128 + sgn * len); g.stroke();
    }
  }
  g.strokeStyle = '#6b6a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 128); g.lineTo(508, 128); g.stroke();
  // bottom-left: broadleaf clump
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 112, x = 128 + Math.cos(a) * r, y = 384 + Math.sin(a) * r;
    g.fillStyle = `hsl(${85 + rnd() * 35},${35 + rnd() * 20}%,${18 + rnd() * 20 + (1 - r / 112) * 6}%)`;
    g.beginPath(); g.ellipse(x, y, 7 + rnd() * 5, 3.5 + rnd() * 2, rnd() * 3.14, 0, Math.PI * 2); g.fill();
  }
  // bottom-right: bark
  for (let y = 256; y < 512; y += 4) { g.fillStyle = `hsl(30,${18 + rnd() * 8}%,${30 + rnd() * 10}%)`; g.fillRect(256, y, 256, 4); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}

const BARK = [0.55, 0.05, 0.95, 0.45]; // u0,v0,u1,v1 (uv v up: bottom half of canvas = v 0..0.5)
function setUV(g: THREE.BufferGeometry, r: number[]) {
  const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, r[0] + u.getX(i) * (r[2] - r[0]), r[1] + u.getY(i) * (r[3] - r[1]));
  return g;
}
function trunk(h: number, r0: number, r1: number, seg: number, lean: number) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 6, true).translate(0, h / 2, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; p.setX(i, p.getX(i) + lean * t * t); }
  return setUV(g, BARK);
}
function sphereNormals(g: THREE.BufferGeometry, c: THREE.Vector3) {
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).sub(c).normalize(); n.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z); }
  return g;
}
function palm(hi: boolean, far = false) {
  const lean = 0.9, parts = [trunk(9.4, 0.24, 0.16, hi ? 7 : far ? 3 : 4, lean)];
  const top = new THREE.Vector3(lean, 9.4, 0), N = hi ? 11 : 6, segs = hi ? 6 : 3;
  for (let k = 0; k < N; k++) {
    const az = (k / N) * Math.PI * 2 + (k % 2) * 0.3, rise = 0.5 - (k % 3) * 0.28, L = 4.2 + (k % 4) * 0.35;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, d = t * L, y = Math.sin(rise) * d - 0.42 * d * d / L * 1.6, w = 0.95 * Math.sin(Math.PI * Math.min(1, 0.15 + t)) + 0.15;
      const cx = Math.cos(az), cz = Math.sin(az), px = -cz, pz = cx;
      for (const side of [-1, 1]) {
        pos.push(top.x + cx * d + px * side * w, top.y + y - 0.12 * w, top.z + cz * d + pz * side * w);
        uvs.push(t * 0.98 + 0.01, side < 0 ? 0.5 : 1);
      }
      pos.push(top.x + cx * d, top.y + y + 0.05, top.z + cz * d); uvs.push(t * 0.98 + 0.01, 0.75); // raised rib = V fold
      if (s < segs) { const b = s * 3; idx.push(b, b + 3, b + 2, b + 2, b + 3, b + 5, b + 2, b + 5, b + 1, b + 1, b + 5, b + 4); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    parts.push(sphereNormals(g.toNonIndexed(), top.clone().setY(top.y - 1.5)));
  }
  return finish(parts.map(p => (p.index ? p.toNonIndexed() : p)));
}
function broad(hi: boolean) {
  const parts = [trunk(4.2, 0.3, 0.2, hi ? 6 : 4, 0.15)];
  const c = new THREE.Vector3(0, 6.6, 0), n = hi ? 34 : 9, r = new THREE.Vector3(); let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (hi) for (let b = 0; b < 3; b++) parts.push(trunk(3, 0.14, 0.06, 4, 0).rotateZ(0.6).rotateY(b * 2.1).translate(0, 3.9, 0));
  for (let i = 0; i < n; i++) {
    r.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiply(new THREE.Vector3(3.6, 2.5, 3.6)).multiplyScalar(0.55 + rnd() * 0.5);
    const sz = hi ? 2.6 + rnd() * 1.2 : 4.8;
    const q = new THREE.PlaneGeometry(sz, sz); setUV(q, [0.02, 0.02, 0.48, 0.48]);
    q.lookAt(r.clone()); q.rotateY(rnd() * 0.6); q.translate(c.x + r.x, c.y + r.y, c.z + r.z);
    parts.push(sphereNormals(q.toNonIndexed(), c.clone().setY(c.y - 1)));
  }
  return finish(parts.map(p => (p.index ? p.toNonIndexed() : p)));
}
function finish(parts: THREE.BufferGeometry[]) {
  parts.forEach(p => { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k); });
  const g = mergeGeometries(parts)!; g.computeBoundingSphere(); return g;
}


// ---------------------------------------------------------------------------------------------
// Species / LOD model. A species is a list of LOD levels; each level is one or more (geometry, material)
// parts normalised to a 10 m tall tree with its base at the origin. Providers:
//   - procedural palm (this file), ez-tree broadleaf (MIT, generated at load), card impostor (far LOD)
//   - glTF drop-in: public/trees/species.json [{ "name", "kind": 0|1, "url": "/trees/x.glb", "lods": [maxDist,...] }]
//     each glb's top-level children named LOD0, LOD1, ... (SpeedTree's glTF export layout). Loaded if present.
export interface TreePart { geometry: THREE.BufferGeometry; material: THREE.Material }
export interface TreeLod { maxDist: number; parts: TreePart[] }
export interface TreeSpecies { name: string; kind: 0 | 1; lods: TreeLod[] }

function normalise(gs: THREE.BufferGeometry[]) {
  const box = new THREE.Box3(); gs.forEach(g => { g.computeBoundingBox(); box.union(g.boundingBox!); });
  const s = 10 / (box.max.y - box.min.y), c = box.getCenter(new THREE.Vector3());
  gs.forEach(g => { g.translate(-c.x, -box.min.y, -c.z); g.scale(s, s, s); g.computeBoundingSphere(); });
}
// A6/Safari: decode images with createImageBitmap (off the main thread) instead of <img> + decode-on-upload.
const bmpLoader = typeof createImageBitmap !== 'undefined' ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' }) : null;
const texLoader = new THREE.TextureLoader();
function loadTex(url: string) {
  if (!bmpLoader) return texLoader.load(url);
  const t = new THREE.Texture(); t.flipY = false; const t0 = performance.now();
  bmpLoader.load(url, (img) => { t.image = img; t.needsUpdate = true; diag.event('image decode (bitmap)', 0); diag.section('decode wait', performance.now() - t0); });
  return t;
}
function tex(url: string, repeat = false) { const t = loadTex(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

function ezGeometry(preset: any, lod: number) {
  const tr = new EzTree(); tr.loadFromJson(structuredClone(preset));
  const o: any = tr.options; o.seed = preset.seed;
  if (lod === 1) { // mid LOD: fewer segments/sections, fewer but larger leaves
    for (const k of Object.keys(o.branch.segments)) o.branch.segments[k] = Math.max(3, Math.ceil(o.branch.segments[k] / 2));
    for (const k of Object.keys(o.branch.sections)) o.branch.sections[k] = Math.max(1, Math.ceil(o.branch.sections[k] / 2));
    o.branch.levels = Math.max(1, o.branch.levels - 1); o.leaves.count = Math.max(4, Math.round(o.leaves.count * 0.8)); o.leaves.size *= 2.6;
  }
  tr.generate();
  const b = (tr.branchesMesh.geometry as any).clone() as THREE.BufferGeometry, l = (tr.leavesMesh.geometry as any).clone() as THREE.BufferGeometry;
  normalise([b, l]);
  l.computeBoundingBox(); const c = l.boundingBox!.getCenter(new THREE.Vector3());
  sphereNormals(l, c.setY(c.y - 1.5));
  return { b, l };
}

function windMaterial(mat: THREE.MeshLambertNodeMaterial, uWind: any, map: THREE.Texture, alpha: boolean) {
  const t = texture(map, uv());
  mat.colorNode = (t.rgb as any).mul(instanceColor);
  if (alpha) mat.opacityNode = t.a;
  const h: any = attribute('position', 'vec3').y.div(10), p: any = positionLocal;
  const ph = p.x.mul(0.045).add(p.z.mul(0.03));
  const sway = sin(time.mul(1.1).add(ph)).mul(0.22).add(sin(time.mul(2.3).add(ph.mul(1.7))).mul(0.07)).mul(h.mul(h)).mul(uWind);
  const flutter = sin(time.mul(5.5).add(p.x.mul(1.3)).add(p.z.mul(1.1))).mul(alpha ? 0.05 : 0.0).mul(h.mul(h).mul(h)).mul(uWind);
  const moved = p.add((vec3 as any)(sway.add(flutter), flutter.mul(0.6), sway.mul(0.6).sub(flutter)));
  if (!A6) { mat.positionNode = moved; return mat; }
  // A6 LOD range test on the GPU: each bucket mesh carries its own [lo, hi) distance band (per-object uniforms) and
  // every instance its world xz (`tpos`). Instances outside the band collapse to a point, so LOD bands stay exact
  // every frame while the CPU only refreshes near buckets now and then, and the far bucket never re-uploads.
  const lo = uniform(0).onObjectUpdate(({ object }: any) => object.userData.lo ?? 0), hi = uniform(1e9).onObjectUpdate(({ object }: any) => object.userData.hi ?? 1e9);
  const tp: any = attribute('tpos', 'vec2'), cp: any = cameraPosition;
  const d = (vec3 as any)(tp.x.sub(cp.x), cp.y, tp.y.sub(cp.z)).length();
  mat.positionNode = moved.mul(step(lo, d).mul(step(d, hi)));
  return mat;
}

function builtinSpecies(uWind: any): TreeSpecies[] {
  const atlasTex = atlas();
  const cards = windMaterial(new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 }), uWind, atlasTex, true);
  const bark = windMaterial(new THREE.MeshLambertNodeMaterial(), uWind, tex(oakBarkUrl, true), false);
  const leafMats = [oakLeafUrl, ashLeafUrl].map(u => windMaterial(new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 }), uWind, tex(u), true));
  const far: TreePart = { geometry: broad(false), material: cards };
  const palmSp: TreeSpecies = { name: 'palm', kind: 0, lods: [
    { maxDist: 120 * quality.treeDist, parts: [{ geometry: palm(true), material: cards }] },
    { maxDist: 420 * quality.treeDist, parts: [{ geometry: palm(false), material: cards }] },
    { maxDist: 3200, parts: [{ geometry: palm(false, true), material: cards }] }] };
  const ez = [oakPreset, ashPreset].map((pr, i) => {
    const hi = ezGeometry(pr, 0), mid = ezGeometry(pr, 1);
    return { name: i ? 'ez-ash' : 'ez-oak', kind: 1 as const, lods: [
      { maxDist: 85 * quality.treeDist, parts: [{ geometry: hi.b, material: bark }, { geometry: hi.l, material: leafMats[i] }] },
      { maxDist: 200 * quality.treeDist, parts: [{ geometry: mid.b, material: bark }, { geometry: mid.l, material: leafMats[i] }] },
      { maxDist: 3200, parts: [far] }] };
  });
  return [palmSp, ...ez];
}

/** Optional drop-in models (e.g. SpeedTree glTF exports). Missing manifest = none; never fatal. */
async function gltfSpecies(uWind: any): Promise<TreeSpecies[]> {
  let list: any[] = [];
  try { const r = await fetch('/trees/species.json'); if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return []; list = await r.json(); } catch { return []; }
  const loader = new GLTFLoader(), out: TreeSpecies[] = [];
  for (const sp of list) {
    try {
      const g = await loader.loadAsync(sp.url); const lods: TreeLod[] = [];
      g.scene.children.filter(c => /LOD\d/i.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).forEach((node, i) => {
        const parts: TreePart[] = []; node.updateMatrixWorld(true);
        node.traverse((m: any) => { if (!m.isMesh) return; const geo = m.geometry.clone().applyMatrix4(m.matrixWorld); const src = m.material;
          const mat = windMaterial(new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0) }), uWind, src.map ?? new THREE.Texture(), !!src.map);
          parts.push({ geometry: geo, material: mat }); });
        normalise(parts.map(p => p.geometry)); lods.push({ maxDist: (sp.lods?.[i] ?? [120, 400, 3200][i] ?? 3200) * (i < 2 ? quality.treeDist : 1), parts });
      });
      if (lods.length) out.push({ name: sp.name, kind: sp.kind, lods });
    } catch (e) { console.warn('tree model skipped', sp.url, e); }
  }
  return out;
}

export async function buildTrees(flat: number[], terrain: Terrain) {
  const uWind = uniform(1);
  const extra = await gltfSpecies(uWind);
  const species = [...builtinSpecies(uWind), ...extra];
  const byKind = [0, 1].map(k => { const own = extra.filter(s => s.kind === k); return own.length ? own : species.filter(s => s.kind === k); });
  const N = flat.length / 5, mats = new Float32Array(N * 16), cols = new Float32Array(N * 3), spIdx = new Uint8Array(N), xz = new Float32Array(N * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const counts = new Array(species.length).fill(0);
  for (let i = 0; i < N; i++) {
    const x = flat[i * 5] / 10, z = flat[i * 5 + 1] / 10, k = flat[i * 5 + 2], hh = flat[i * 5 + 3] / 10, sd = flat[i * 5 + 4];
    const pool = byKind[k] ?? byKind[1], sp = species.indexOf(pool[sd % pool.length]);
    const sc = hh / 10, w = sc * (0.85 + (sd / 255) * 0.3) * (k === 1 ? 1.15 : 1);
    q.setFromAxisAngle(Y, (sd / 255) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, terrain.heightAt(x, z) - 0.1, z), q, new THREE.Vector3(w, sc, w)).toArray(mats, i * 16);
    const v = 0.82 + ((sd * 37) % 255) / 255 * 0.3; col.setRGB(v * (k ? 0.93 : 1.0), v, v * 0.9);
    cols.set([col.r, col.g, col.b], i * 3); spIdx[i] = sp; xz[i * 2] = x; xz[i * 2 + 1] = z; counts[sp]++;
  }
  const group = new THREE.Group();
  if (!A6) { // legacy path (?a6=0): re-bucket every tree and re-upload whole buffers each 12 m of camera movement
    const buckets = species.map((sp, s) => sp.lods.map((lod, li) => lod.parts.map((pt) => {
      const im = new THREE.InstancedMesh(pt.geometry, pt.material, Math.max(1, counts[s])); im.count = 0; im.frustumCulled = false;
      im.name = `trees ${sp.name} lod${li}`; im.setColorAt(0, col); group.add(im); return im;
    })));
    const last = new THREE.Vector3(1e9, 0, 0), c: number[][] = species.map(sp => sp.lods.map(() => 0));
    function update(cam: THREE.Vector3) {
      if (cam.distanceTo(last) < 12) return; last.copy(cam);
      c.forEach(a => a.fill(0));
      for (let i = 0; i < N; i++) {
        const s = spIdx[i], d = Math.hypot(xz[i * 2] - cam.x, xz[i * 2 + 1] - cam.z, cam.y), lods = species[s].lods;
        let li = 0; while (li < lods.length && d > lods[li].maxDist) li++; if (li >= lods.length) continue;
        const j = c[s][li]++;
        for (const im of buckets[s][li]) { (im.instanceMatrix.array as Float32Array).set(mats.subarray(i * 16, i * 16 + 16), j * 16); (im.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), j * 3); }
      }
      buckets.forEach((lv, s) => lv.forEach((parts, li) => parts.forEach(im => { im.count = c[s][li]; im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; })));
    }
    const triangles = () => buckets.flat(2).reduce((t, im) => t + im.count * ((im.geometry.index?.count ?? im.geometry.attributes.position.count) / 3), 0);
    return { group, update, uWind, triangles, species: species.map(s => s.name), refreshes: 0 };
  }
  // A6 path. Far LOD: one bucket per species holding every tree, uploaded once. Near LODs: filled from a 64 m grid
  // around the camera with a distance pad, refreshed only after the camera moves REFRESH m, uploading just the used
  // range (and only when the frame's upload budget allows). The GPU range test above trims each band exactly.
  const CELL = 64, PAD = 40, REFRESH = 20;
  let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
  for (let i = 0; i < N; i++) { gx0 = Math.min(gx0, xz[i * 2]); gz0 = Math.min(gz0, xz[i * 2 + 1]); gx1 = Math.max(gx1, xz[i * 2]); gz1 = Math.max(gz1, xz[i * 2 + 1]); }
  if (!N) { gx0 = gz0 = 0; gx1 = gz1 = 1; }
  const gw = Math.max(1, Math.ceil((gx1 - gx0) / CELL) + 1), gh = Math.max(1, Math.ceil((gz1 - gz0) / CELL) + 1);
  const cellStart = new Uint32Array(gw * gh + 1), order = new Uint32Array(N);
  const cellOf = (i: number) => Math.floor((xz[i * 2] - gx0) / CELL) + Math.floor((xz[i * 2 + 1] - gz0) / CELL) * gw;
  for (let i = 0; i < N; i++) cellStart[cellOf(i) + 1]++;
  for (let k = 0; k < gw * gh; k++) cellStart[k + 1] += cellStart[k];
  { const fill = cellStart.slice(0, gw * gh); for (let i = 0; i < N; i++) order[fill[cellOf(i)]++] = i; }
  type Bucket = { meshes: THREE.InstancedMesh[]; tpos: THREE.InstancedBufferAttribute; lo: number; hi: number; n: number };
  const share = (g: THREE.BufferGeometry) => { const o = new THREE.BufferGeometry(); for (const k in g.attributes) o.setAttribute(k, g.attributes[k]); if (g.index) o.setIndex(g.index); o.boundingSphere = g.boundingSphere; return o; };
  const near: Bucket[][] = species.map(() => []);
  species.forEach((sp, s) => sp.lods.forEach((lod, li) => {
    const isFar = li === sp.lods.length - 1, cap = Math.max(1, counts[s]);
    const tpos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    const lo = li ? sp.lods[li - 1].maxDist : 0, hi = lod.maxDist;
    const meshes = lod.parts.map((pt) => {
      const g = share(pt.geometry); g.setAttribute('tpos', tpos);
      const im = new THREE.InstancedMesh(g, pt.material, cap); im.count = 0; im.frustumCulled = false; im.setColorAt(0, col);
      im.name = `trees ${sp.name} lod${li}`; im.userData.lo = lo; im.userData.hi = hi; group.add(im);
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage); return im; // DynamicDraw makes the WebGPU renderer re-upload the whole matrix buffer every frame
    });
    if (isFar) { // every tree of this species, written once
      let j = 0;
      for (let i = 0; i < N; i++) if (spIdx[i] === s) {
        for (const im of meshes) { (im.instanceMatrix.array as Float32Array).set(mats.subarray(i * 16, i * 16 + 16), j * 16); (im.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), j * 3); }
        tpos.array[j * 2] = xz[i * 2]; tpos.array[j * 2 + 1] = xz[i * 2 + 1]; j++;
      }
      meshes.forEach(im => (im.count = j));
    } else near[s].push({ meshes, tpos, lo, hi, n: 0 });
  }));
  const last = new THREE.Vector3(1e9, 0, 0), prev = new THREE.Vector3(1e9, 0, 0), vel = new THREE.Vector3();
  let refreshes = 0;
  function update(cam: THREE.Vector3) {
    if (prev.x < 1e8) vel.lerp(prev.sub(cam).negate(), 0.2); prev.copy(cam); // m/frame, smoothed
    if (cam.distanceTo(last) < REFRESH) return;
    // Prefetch: also cover where the camera will be in ~30 frames (0.5 s), so a fast flight never outruns the pad.
    const lead = Math.min(150, vel.length() * 30), pad = PAD + lead;
    const cx = cam.x + vel.x * 30 * 0.5, cz = cam.z + vel.z * 30 * 0.5;
    let maxHi = 0; for (const b of near.flat()) maxHi = Math.max(maxHi, b.hi);
    const r = Math.sqrt(Math.max(0, (maxHi + pad) ** 2 - cam.y * cam.y));
    // bytes this refresh would upload (estimate from last time) — wait for a frame with room if over budget
    let est = 0; for (const b of near.flat()) est += b.n * (16 + 3 + 2) * 4 * b.meshes.length;
    if (!budget.upload(est)) return;
    last.copy(cam); refreshes++; diag.event('tree refresh');
    for (const bs of near) for (const b of bs) b.n = 0;
    const c0 = Math.max(0, Math.floor((cx - r - gx0) / CELL)), c1 = Math.min(gw - 1, Math.floor((cx + r - gx0) / CELL));
    const r0 = Math.max(0, Math.floor((cz - r - gz0) / CELL)), r1 = Math.min(gh - 1, Math.floor((cz + r - gz0) / CELL));
    for (let rz = r0; rz <= r1; rz++) for (let k = cellStart[rz * gw + c0]; k < cellStart[rz * gw + c1 + 1]; k++) {
      const i = order[k], s = spIdx[i], bs = near[s];
      const d = Math.hypot(xz[i * 2] - cam.x, xz[i * 2 + 1] - cam.z, cam.y), dp = Math.hypot(xz[i * 2] - cx, xz[i * 2 + 1] - cz, cam.y);
      const dm = Math.min(d, dp), dM = Math.max(d, dp);
      for (const b of bs) {
        if (dM < b.lo - PAD || dm > b.hi + PAD) continue;
        const j = b.n++;
        for (const im of b.meshes) { (im.instanceMatrix.array as Float32Array).set(mats.subarray(i * 16, i * 16 + 16), j * 16); (im.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), j * 3); }
        b.tpos.array[j * 2] = xz[i * 2]; b.tpos.array[j * 2 + 1] = xz[i * 2 + 1];
      }
    }
    for (const bs of near) for (const b of bs) {
      if (!b.n && !b.meshes[0].count) continue;
      for (const im of b.meshes) {
        im.count = b.n; if (!b.n) continue;
        im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.addUpdateRange(0, b.n * 16); im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.clearUpdateRanges(); im.instanceColor!.addUpdateRange(0, b.n * 3); im.instanceColor!.needsUpdate = true;
      }
      if (b.n) { b.tpos.clearUpdateRanges(); b.tpos.addUpdateRange(0, b.n * 2); b.tpos.needsUpdate = true; }
    }
  }
  const triangles = () => (group.children as THREE.InstancedMesh[]).reduce((t, im) => t + im.count * ((im.geometry.index?.count ?? im.geometry.attributes.position.count) / 3), 0);
  return { group, update, uWind, triangles, species: species.map(s => s.name), get refreshes() { return refreshes; } };
}
