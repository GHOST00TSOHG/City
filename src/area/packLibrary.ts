/** Pack asset engine. The owned GLB packs (public/tja/<pack>/<file>.glb) use one shared "lowpoly" material with colours in COLOR_0, so a prototype is baked to
 *  plain vertex data (position, snorm normal, colour, packMat = [roughness, metalness, emissive, kind], packEmissive) and every placed instance is stamped into ONE
 *  merged BufferGeometry per area, drawn with ONE shared MeshStandardNodeMaterial: thousands of props and buildings for a single draw call.
 *  Decoders are self-hosted (public/draco, public/basis): no CDNs. */
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { attribute, vertexColor, vec3, float, hash, floor, positionWorld, smoothstep, mix, time, sin, uniform, normalWorld, cameraPosition, normalize, dot, abs, pow, reflect, clamp } from 'three/tsl';

const BASE = import.meta.env.BASE_URL;
export const TJA_URL = BASE + 'tja/';

const GLASS_RE = /glass|window|windshield|mirror|screen|water|ice/i;
const NEON_RE = /neon|lantern|lamp|light|glow|sign|holo|arcade_parlor|arcade_cabinet|arcade_sign|fire|ember|andon|ishidoro|beacon|torch|candle/i;
const COOL_GLAZING_PACKS = /^(metropolis|city|city-paris|cyberpunk|vice-beach|suburban-neighborhood|cozy-village|accessibility|construction-site|railway)\//;

/** Baked prototype: plain typed arrays, base on y = 0, centred on x / z. */
export interface Proto { path: string; n: number; pos: Float32Array; nrm: Int8Array; col: Uint8Array; pm: Uint8Array; em: Uint8Array; idx: Uint32Array; tris: number; w: number; h: number; d: number }

/** Every pack model path that actually loaded this session (the verifier checks that all 35 packs appear). */
export const usedPaths = new Set<string>();
let gltf: GLTFLoader | null = null, ktx2: KTX2Loader | null = null;
const cache = new Map<string, Promise<Proto | null>>();
export function initPackLibrary(renderer: THREE.WebGPURenderer) {
  if (gltf) return;
  ktx2 = new KTX2Loader().setTranscoderPath(BASE + 'basis/').detectSupport(renderer);
  gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(new DRACOLoader().setDecoderPath(BASE + 'draco/'));
}
export function packLoader(): GLTFLoader { if (!gltf) throw new Error('initPackLibrary first'); return gltf; }

const v3 = new THREE.Vector3(), n3 = new THREE.Vector3(), nm = new THREE.Matrix3();
/** Load and bake one pack model (cached). Returns null when the file is not deployed. */
export function loadProto(path: string): Promise<Proto | null> {
  let p = cache.get(path);
  if (!p) cache.set(path, (p = bake(path).catch((e) => { console.warn('[City] pack model skipped', path, e?.message ?? e); return null; })));
  return p;
}
async function bake(path: string): Promise<Proto | null> {
  const g = await packLoader().loadAsync(TJA_URL + path);
  usedPaths.add(path); g.scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = []; g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let nv = 0, ni = 0; for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3), nrm = new Int8Array(nv * 4), col = new Uint8Array(nv * 4), pm = new Uint8Array(nv * 4), em = new Uint8Array(nv * 4), idx = new Uint32Array(ni);
  const fileName = path.split('/').pop()!, nameNeon = NEON_RE.test(fileName), coolOK = COOL_GLAZING_PACKS.test(path);
  const mirror = path.startsWith('metropolis/'), crownTower = /glass_supertall|crown_tower|twisting_supertall|corporate_hq|twin_tower|hotel_tower|mixeduse_tower|residential_highrise/.test(fileName);
  const bb = new THREE.Box3().setFromObject(g.scene), crownY = bb.max.y - 0.04 * (bb.max.y - bb.min.y);
  let vo = 0, io = 0; const c = new THREE.Color();
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
  for (const m of meshes) {
    const geo = m.geometry, P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color;
    const mats = [m.material].flat() as THREE.MeshStandardMaterial[], mat = mats[0] ?? ({} as THREE.MeshStandardMaterial);
    const label = `${m.name} ${mat.name ?? ''}`, glassName = GLASS_RE.test(label), neonName = NEON_RE.test(label) || nameNeon;
    const rough = mat.roughness ?? 0.9, metal = mat.metalness ?? 0, baseCol = mat.color ?? c.set(1, 1, 1);
    const eCol = mat.emissive ?? null, eInt = (mat as any).emissiveIntensity ?? 1;
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < P.count; i++, vo++) {
      v3.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      pos[vo * 3] = v3.x; pos[vo * 3 + 1] = v3.y; pos[vo * 3 + 2] = v3.z;
      if (v3.y < minY) minY = v3.y; if (v3.y > maxY) maxY = v3.y; if (v3.x < minX) minX = v3.x; if (v3.x > maxX) maxX = v3.x; if (v3.z < minZ) minZ = v3.z; if (v3.z > maxZ) maxZ = v3.z;
      if (N) { n3.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nrm[vo * 4] = Math.round(n3.x * 127); nrm[vo * 4 + 1] = Math.round(n3.y * 127); nrm[vo * 4 + 2] = Math.round(n3.z * 127); } else nrm[vo * 4 + 1] = 127;
      let r = baseCol.r, gg = baseCol.g, b = baseCol.b;
      if (C) { r *= C.getX(i); gg *= C.getY(i); b *= C.getZ(i); }
      col[vo * 4] = Math.round(Math.min(1, r) * 255); col[vo * 4 + 1] = Math.round(Math.min(1, gg) * 255); col[vo * 4 + 2] = Math.round(Math.min(1, b) * 255); col[vo * 4 + 3] = 255;
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const cool = coolOK && b - r > 0.07 && lum > 0.02 && lum < 0.38 && b >= gg * 0.92; // dark bluish glazing on buildings
      const glass = glassName || cool;
      const hot = neonName && (mx > 0.7 && mx - mn > 0.25 || lum > 0.62); // lit parts of lanterns, signs, neon
      let ro = rough, me = metal, kind = 0, e = 0, er = 0, eg = 0, eb = 0;
      if (glass) { ro = 0.06; me = mirror ? 0.62 : 0.45; kind = 0.5; }
      if (crownTower && v3.y > crownY && (glass || mx - mn < 0.2)) { er = Math.max(er, 0.3); eg = Math.max(eg, 0.75); eb = Math.max(eb, 1.0); e = 1; kind = 1; } // thin glowing crown strip on skyline towers
      if (eCol && (eCol.r + eCol.g + eCol.b) > 0.01) { er = eCol.r * eInt; eg = eCol.g * eInt; eb = eCol.b * eInt; e = 1; kind = 1; }
      if (hot) { const k = 1.7; er = Math.max(er, r * k); eg = Math.max(eg, gg * k); eb = Math.max(eb, b * k); e = 1; kind = 1; ro = Math.min(ro, 0.5); }
      pm[vo * 4] = Math.round(ro * 255); pm[vo * 4 + 1] = Math.round(me * 255); pm[vo * 4 + 2] = Math.round(e * 255); pm[vo * 4 + 3] = Math.round(kind * 255);
      em[vo * 4] = Math.round(Math.min(4, er) / 4 * 255); em[vo * 4 + 1] = Math.round(Math.min(4, eg) / 4 * 255); em[vo * 4 + 2] = Math.round(Math.min(4, eb) / 4 * 255);
    }
    const base = vo - P.count;
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[io++] = geo.index.getX(i) + base; else for (let i = 0; i < P.count; i++) idx[io++] = base + i;
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < nv; i++) { pos[i * 3] -= cx; pos[i * 3 + 1] -= minY; pos[i * 3 + 2] -= cz; }
  g.scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.geometry.dispose(); for (const mt of [mm.material].flat()) { for (const v of Object.values(mt) as unknown[]) (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose(); mt.dispose(); } } });
  return { path, n: nv, pos, nrm, col, pm, em, idx: idx.subarray(0, io), tris: io / 3, w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
}

/** The one shared material for every merged pack mesh: vertex colour, per-vertex roughness / metalness / emissive, and deterministic lit windows on glazing. */
export const uPackNight = uniform(1);
export function createPackMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  const pmv = attribute('packMat', 'vec4'), emv = attribute('packEmissive', 'vec4');
  mat.envMapIntensity = 2.0; // mirror-glass towers pick up the night-sky / city-glow environment
  const glass = smoothstep(0.4, 0.6, pmv.w).mul(float(1).sub(smoothstep(0.7, 0.9, pmv.w)));
  mat.roughnessNode = mix(pmv.x, float(0.05), glass); mat.metalnessNode = mix(pmv.y, float(0.75), glass); // curtain-wall glazing is near-mirror
  // glass gleam: Fresnel-weighted sky gradient (sapphire overhead, warm city glow toward the horizon) reflected off every glazed face, independent of the PMREM environment
  const view = normalize(cameraPosition.sub(positionWorld)), fres = pow(float(1).sub(abs(dot(normalWorld, view))), 2.5), rv = reflect(view.negate(), normalWorld);
  const skyRefl = mix(vec3(0.95, 0.5, 0.28).mul(0.55), vec3(0.08, 0.26, 0.62).mul(1.5), clamp(rv.y.mul(1.6).add(0.2), 0, 1));
  const cell = floor(positionWorld.mul(vec3(0.7, 0.9, 0.7))), h = hash(cell.x.add(cell.y.mul(7.3)).add(cell.z.mul(13.1)));
  const lit = h.lessThan(0.36).select(float(1), float(0)), warm = hash(h.mul(91)).lessThan(0.7).select(vec3(1.0, 0.66, 0.34), vec3(0.62, 0.88, 1.0));
  const neon = smoothstep(0.85, 0.95, pmv.w), flicker = sin(time.mul(7).add(h.mul(40))).mul(0.06).add(1);
  mat.emissiveNode = emv.rgb.mul(4).mul(neon.mul(1.0).add(float(1).sub(neon)).mul(flicker)).add(warm.mul(lit).mul(glass).mul(1.3).mul(uPackNight)).add(skyRefl.mul(fres.mul(0.9).add(0.06)).mul(glass).mul(uPackNight));
  void vertexColor; void mix; void vec3;
  return mat;
}

/** Stamps prototypes into growing merged arrays. */
export class PackBatch {
  private pos: number[] = []; private nrm: number[] = []; private col: number[] = []; private pm: number[] = []; private em: number[] = []; private idx: number[] = [];
  tris = 0; count = 0;
  constructor(readonly triCap = 1_400_000) {}
  /** Adds one instance (rot = yaw radians, sx / sy / sz = scale; sy and sz default to sx). Returns false when over the triangle budget. */
  add(p: Proto, x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx): boolean {
    if (this.tris + p.tris > this.triCap) return false;
    const cs = Math.cos(rot), sn = Math.sin(rot), base = this.pos.length / 3, uni = sx === sy && sy === sz;
    for (let i = 0; i < p.n; i++) {
      const px = p.pos[i * 3] * sx, py = p.pos[i * 3 + 1] * sy, pz = p.pos[i * 3 + 2] * sz;
      this.pos.push(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs);
      let nx = p.nrm[i * 4], ny = p.nrm[i * 4 + 1], nz = p.nrm[i * 4 + 2];
      if (!uni) { nx /= sx; ny /= sy; nz /= sz; const l = Math.hypot(nx, ny, nz) || 1; nx = nx / l * 127; ny = ny / l * 127; nz = nz / l * 127; }
      this.nrm.push(Math.round(nx * cs + nz * sn), Math.round(ny), Math.round(-nx * sn + nz * cs), 0);
      for (let k = 0; k < 4; k++) { this.col.push(p.col[i * 4 + k]); this.pm.push(p.pm[i * 4 + k]); this.em.push(p.em[i * 4 + k]); }
    }
    for (let i = 0; i < p.idx.length; i++) this.idx.push(p.idx[i] + base);
    this.tris += p.tris; this.count++; return true;
  }
  /** A plain coloured box (plinths, slabs, plaza floors, basin rims): footprint w x d at (cx, cz) yawed by rot, from y0 to y1. */
  addBox(cx: number, cz: number, w: number, d: number, rot: number, y0: number, y1: number, rgb: [number, number, number], rough = 0.88, emissive = 0) {
    const cs = Math.cos(rot), sn = Math.sin(rot), hw = w / 2, hd = d / 2, base = this.pos.length / 3;
    const corner = (u: number, v: number): [number, number] => [cx + u * cs + v * sn, cz - u * sn + v * cs];
    const faces: [number, number, number, number, number, number, number][] = []; void faces;
    const quad = (pts: [number, number, number][], n: [number, number, number]) => {
      const b = this.pos.length / 3;
      for (const [x, y, z] of pts) { this.pos.push(x, y, z); this.nrm.push(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127), 0); this.col.push(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), 255); this.pm.push(Math.round(rough * 255), 0, Math.round(emissive * 255), emissive > 0 ? 255 : 0); this.em.push(Math.round(rgb[0] * emissive * 64), Math.round(rgb[1] * emissive * 64), Math.round(rgb[2] * emissive * 64), 0); }
      this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    void base;
    const [a, b, c, d2] = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
    quad([[a[0], y1, a[1]], [d2[0], y1, d2[1]], [c[0], y1, c[1]], [b[0], y1, b[1]]], [0, 1, 0]);
    const side = (p0: [number, number], p1: [number, number]) => { const nx = p1[1] - p0[1], nz = -(p1[0] - p0[0]), l = Math.hypot(nx, nz) || 1; quad([[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], [nx / l, 0, nz / l]); };
    side(a, b); side(b, c); side(c, d2); side(d2, a);
    this.tris += 10; this.count++;
  }
  /** A flat annulus wall (round basin rim): ring between radii r0 and r1, from y0 to y1, as n segments. */
  addRing(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, rgb: [number, number, number], n = 24, rough = 0.88, emissive = 0) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2, rm = (r0 + r1) / 2, seg = Math.hypot(rm * (a1 - a0), 0) + 0.02;
      this.addBox(cx + Math.cos(am) * rm, cz + Math.sin(am) * rm, r1 - r0, seg * 1.04, -am + Math.PI / 2 - Math.PI / 2 + Math.PI / 2, y0, y1, rgb, rough, emissive);
    }
  }
  build(name: string, material: THREE.Material): THREE.Mesh | null {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(this.nrm), 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.col), 4, true));
    g.setAttribute('packMat', new THREE.BufferAttribute(new Uint8Array(this.pm), 4, true));
    g.setAttribute('packEmissive', new THREE.BufferAttribute(new Uint8Array(this.em), 4, true));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.pos = []; this.nrm = []; this.col = []; this.pm = []; this.em = []; this.idx = [];
    const m = new THREE.Mesh(g, material); m.name = name; return m;
  }
}
