import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { uniform, uv, texture, positionLocal, fract, floor, abs, smoothstep, sin, time, mx_noise_float, vec3, mix, float, max, step } from 'three/tsl';
import type { RobotType, Slot, SlotBuild } from './types';

/**
 * Per-type Blender kit (tools/blender/<type>_v2.py → public/robot/<type>/{parts.glb, kit.json, manifest.json}).
 * Nodes are `<slot>__<option>__<Bone>` authored in bone space ('body' = always on, bone 'P<n>' = runtime piston half).
 * Shading: one material per region. Paint regions read the baked masks (R = AO, G = edge wear, B = grime) and the baked
 * normal map; glow regions pulse with `energy`; decal samples the shared atlas through UV1. Damage scorch + repair sweep
 * are per pixel, so battle damage costs no extra draws.
 */
export interface KitUniforms { energy: { value: number }; damage: { value: number }; sweep: { value: number }; glow: { value: THREE.Color } }
/** TSL uniform nodes shared by every robot material (they expose `.value`, so callers treat them as plain uniforms). */
export const createKitUniforms = () => ({ energy: uniform(1), damage: uniform(0), sweep: uniform(-1), glow: uniform(new THREE.Color('#3df2ff')),
  /** Screen face: rect (x, y, w, h) in Head-bone space from kit.json `screens[helmet]` (w = 0 → no face); squint 0..1; xeyes 0/1. */
  screen: uniform(new THREE.Vector4(0, 0, 0, 0)), squint: uniform(0), xeyes: uniform(0) });
type U = ReturnType<typeof createKitUniforms>;
export interface Piston { slot: Slot; opt: string; a: string; ap: [number, number, number]; b: string; bp: [number, number, number]; objA: string; objB: string }
export interface KitMeta { type: RobotType; slots: Record<Slot, string[]>; pistons: Piston[]; screens?: Record<string, [number, number, number, number, number]> }
/** public/robot/<type>/manifest.json (tools/kit-manifest.mjs write): every node and mesh the kit is supposed to contain. */
export interface KitManifest { type: RobotType; nodes: { name: string; slot: string; opt: string; bone: string; meshes: { name: string; region: string; tris: number }[] }[] }
/** Loader self-check: anything the manifest promises that did not make it onto the robot. Empty arrays = complete. */
export interface KitReport { type: RobotType; expectedNodes: number; expectedMeshes: number; expectedTris: number; loadedMeshes: number; missing: string[]; cut: string[]; zeroTri: string[]; unknownBone: string[]; ignored: string[]; badRegion: string[]; ok: boolean }
export interface Kit {
  meta: KitMeta;
  nodes: { slot: string; opt: string; bone: string; meshes: { geo: THREE.BufferGeometry; region: string }[] }[];
  mats: Record<string, THREE.MeshStandardNodeMaterial>;
  report: KitReport;
}
export const PAINT = ['shell', 'joints', 'torso', 'shorts', 'backpack'] as const;
const GLOW = ['visor', 'decalColor', 'screen'];
const FIXED: Record<string, [string, number, number]> = { chrome: ['#c9ccd1', 0.18, 1], rubber: ['#111214', 0.85, 0], glass: ['#05070b', 0.06, 0.2] };

let decalTex: Promise<THREE.Texture> | null = null;
const tl = new THREE.TextureLoader();
const loadTex = (url: string, srgb: boolean) => tl.loadAsync(url).then((t) => { t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; });

export function makeKitMaterials(u: U, masks: THREE.Texture | null, normal: THREE.Texture | null, decals: THREE.Texture | null) {
  const mats: Record<string, THREE.MeshStandardNodeMaterial> = {};
  const p = positionLocal;
  const n = mx_noise_float(p.mul(14)).mul(0.5).add(0.5);
  const scorch = smoothstep(float(1.02).sub(u.damage.mul(0.75)), float(1.1).sub(u.damage.mul(0.75)), n.add(mx_noise_float(p.mul(55)).mul(0.12)));
  const sweep = smoothstep(0.05, 0.0, abs(p.y.sub(u.sweep))).mul(u.sweep.greaterThan(-0.9).select(float(1), float(0)));
  const pulse = sin(time.mul(2.6)).mul(0.25).add(0.85).mul(u.energy);
  const hurt = float(1).sub(u.damage.mul(0.6));
  const mk = (region: string) => {
    // DoubleSide: add-on bevel/boolean plates are thin shells whose back faces must not vanish (no culling differences between Chrome and WebKit)
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }); m.name = region;
    const uCol = uniform(new THREE.Color(FIXED[region]?.[0] ?? '#ffffff')); m.userData.uCol = uCol;
    const mk4 = masks ? texture(masks, uv()) : null;
    const ao = mk4 ? mk4.r : float(1), edge = mk4 ? mk4.g : float(0), grime = mk4 ? mk4.b : float(0);
    if (normal && region !== 'decal') m.normalMap = normal;
    if (GLOW.includes(region)) {
      m.colorNode = uCol.mul(0.25);
      let scan: any = float(1);
      if (region === 'screen') { // scanlines + pixel grid + eye glyphs (neutral / blink / squint on boost / X eyes when wrecked)
        const sc = u.screen, qx = p.x.sub(sc.x).div(max(sc.z, 1e-3)), qy = p.y.sub(sc.y).div(max(sc.w, 1e-3));
        const ex = abs(abs(qx).sub(0.22)), ey = abs(qy.sub(0.04));
        const blink = step(0.975, fract(time.mul(0.31)));
        const hh = mix(float(0.17), float(0.035), max(u.squint, blink));
        const eye = step(ex, 0.1).mul(step(ey, hh));
        const xg = step(abs(ex.sub(ey)), 0.03).mul(step(ex, 0.11)).mul(step(ey, 0.13));
        const glyph = mix(eye, xg, u.xeyes).mul(step(1e-3, sc.z));
        const grid = step(0.12, fract(p.x.mul(260))).mul(step(0.12, fract(p.y.mul(260)))).mul(0.25).add(0.75);
        scan = sin(p.y.mul(900)).mul(0.18).add(0.82).mul(grid).mul(mix(float(1), glyph.mul(1.6).add(0.22), step(1e-3, sc.z)));
      }
      m.emissiveNode = uCol.mul(pulse).mul(region === 'screen' ? 1.2 : 1.7).mul(hurt).mul(scan).add(vec3(0.4, 1.0, 0.9).mul(sweep.mul(2)));
      m.roughness = 0.3;
    } else if (region === 'decal') {
      const d = texture(decals!, uv(1));
      const chip = float(1).sub(smoothstep(0.35, 0.7, edge));
      m.colorNode = uCol.mul(mix(vec3(1), vec3(0.25, 0.2, 0.15), vec3(grime)) as any).mul(ao).mul(float(1).sub(scorch.mul(0.85)));
      m.opacityNode = d.a.mul(chip); m.alphaTest = 0.5; m.transparent = false;
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    } else {
      const fixed = FIXED[region];
      const wear = fixed ? float(0) : smoothstep(0.45, 0.8, edge);
      const paint = mix(uCol, vec3(0.42, 0.42, 0.43), wear).mul(mix(vec3(1), vec3(0.25, 0.2, 0.15), vec3(grime))).mul(ao);
      // panel cuts: thin dark grooves only (never emissive: glow is the visor colour and read as red lines)
      const gy = smoothstep(0.486, 0.496, abs(fract(p.y.mul(7)).sub(0.5))), gx = smoothstep(0.489, 0.497, abs(fract(p.x.mul(6).add(0.25)).sub(0.5)));
      const cut = max(gy, gx.mul(0.7));
      const cutDark = float(1).sub(cut.mul(0.55));
      m.colorNode = mix(paint.mul(cutDark), vec3(0.05, 0.045, 0.04), scorch.mul(0.85));
      m.metalnessNode = fixed ? float(fixed[2]) : max(float(region === 'joints' ? 0.55 : 0.12), wear);
      m.roughnessNode = mix(fixed ? float(fixed[1]) : mix(float(0.45), float(0.85), grime), float(0.95), scorch);
      m.emissiveNode = vec3(0.4, 1.0, 0.9).mul(sweep.mul(2)); // repair sweep only
    }
    return m;
  };
  for (const r of [...PAINT, ...GLOW, 'decal', ...Object.keys(FIXED)]) mats[r] = mk(r);
  return mats;
}

export async function loadKit(type: RobotType, u: U, base = `${import.meta.env.BASE_URL}robot/`): Promise<Kit> {
  const dir = `${base}${type}/`;
  decalTex ??= loadTex(`${base}decals.webp?v=${__ROBOT_V__}`, true);
  const meta = await fetch(`${dir}kit.json?v=${__ROBOT_V__}`).then((r) => r.json() as Promise<KitMeta & { version?: number }>);
  const baked = (meta.version ?? 1) < 2; // v2 kits are add-on modelled with real bevels: no baked mask/normal atlases
  const manifest = await fetch(`${dir}manifest.json`).then((r) => (r.ok ? (r.json() as Promise<KitManifest>) : null)).catch(() => null);
  if (!manifest) console.error(`[kit:${type}] manifest.json missing: part validation is OFF (run node tools/kit-manifest.mjs write ${type})`);
  const [gltf, masks, normal, decals] = await Promise.all([
    new GLTFLoader().loadAsync(`${dir}parts.glb?v=${__ROBOT_V__}`),
    baked ? loadTex(`${dir}masks.webp?v=${__ROBOT_V__}`, false).catch(() => null) : null, baked ? loadTex(`${dir}normal.webp?v=${__ROBOT_V__}`, false).catch(() => null) : null, decalTex,
  ]);
  const mats = makeKitMaterials(u, masks, normal, decals);
  gltf.scene.updateMatrixWorld(true);
  const nodes: Kit['nodes'] = [], ignored: string[] = [];
  for (const o of [...gltf.scene.children]) {
    const [slot, opt, bone] = o.name.split('__'); if (!bone) { ignored.push(o.name); continue; }
    const inv = o.matrixWorld.clone().invert(), meshes: Kit['nodes'][number]['meshes'] = [];
    o.traverse((c: any) => {
      if (!c.isMesh) return;
      const geo = (c.geometry as THREE.BufferGeometry).clone().applyMatrix4(inv.clone().multiply(c.matrixWorld));
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'uv1'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv1 && geo.attributes.uv) geo.setAttribute('uv1', geo.attributes.uv.clone());
      let region = (c.material?.name ?? 'shell').replace(/\.\d+$/, '');
      // Scout's kit has no decalColor material: its thruster intakes (small, glowing) take that slot, like Heavy's shin vents
      if (type === 'scout' && region === 'visor' && /^intake/.test(c.name || o.name)) region = 'decalColor';
      meshes.push({ geo, region });
    });
    nodes.push({ slot, opt, bone, meshes });
  }
  return { meta, nodes, mats, report: checkKit(type, manifest, nodes, mats, ignored) };
}

function checkKit(type: RobotType, man: KitManifest | null, nodes: Kit['nodes'], mats: Kit['mats'], ignored: string[]): KitReport {
  const r: KitReport = { type, expectedNodes: man?.nodes.length ?? 0, expectedMeshes: 0, expectedTris: 0, loadedMeshes: nodes.reduce((a, n) => a + n.meshes.length, 0), missing: [], cut: [], zeroTri: [], unknownBone: [], ignored, badRegion: [], ok: false };
  const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  for (const n of nodes) for (const m of n.meshes) { if (!(tri(m.geo) > 0)) r.zeroTri.push(`${n.slot}__${n.opt}__${n.bone}`); if (!mats[m.region]) r.badRegion.push(`${n.slot}__${n.opt}__${n.bone}:${m.region}`); }
  if (man) {
    const have = new Map(nodes.map((n) => [`${n.slot}__${n.opt}__${n.bone}`, n]));
    for (const e of man.nodes) {
      r.expectedMeshes += e.meshes.length; r.expectedTris += e.meshes.reduce((a, m) => a + m.tris, 0);
      const h = have.get(e.name); if (!h) { r.missing.push(e.name); continue; }
      const got = h.meshes.reduce((a, m) => a + tri(m.geo), 0), want = e.meshes.reduce((a, m) => a + m.tris, 0);
      if (h.meshes.length < e.meshes.length) r.missing.push(`${e.name} (${e.meshes.length - h.meshes.length} of ${e.meshes.length} meshes)`);
      if (got < want) r.cut.push(`${e.name} ${want}->${got} tris`);
    }
  }
  r.ok = !!man && !r.missing.length && !r.cut.length && !r.zeroTri.length && !r.ignored.length && !r.badRegion.length;
  if (man) for (const k of ['missing', 'cut', 'zeroTri', 'ignored', 'badRegion'] as const) if (r[k].length) console.error(`[kit:${type}] ${k}: ${r[k].slice(0, 12).join(', ')}${r[k].length > 12 ? ' ...' : ''}`);
  return r;
}

/** Merge the visible nodes of a build into one skinned geometry per region (rigid: one bone per vertex). */
export function buildSkinned(kit: Kit, build: SlotBuild, boneIndex: (name: string) => number): Map<string, THREE.BufferGeometry> {
  const lost = new Set<string>();
  const per = new Map<string, THREE.BufferGeometry[]>();
  for (const n of kit.nodes) {
    if (n.slot !== 'body' && build[n.slot as Slot] !== n.opt) continue;
    const bi = boneIndex(n.bone); if (bi < 0) { lost.add(`${n.slot}__${n.opt}__${n.bone}`); continue; } // a part bound to a bone the rig lacks would vanish silently
    for (const { geo, region } of n.meshes) {
      const g = geo.index ? geo.clone() : geo.clone(); const c = g.attributes.position.count;
      const si = new Uint16Array(c * 4), sw = new Float32Array(c * 4);
      for (let i = 0; i < c; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const r = kit.mats[region] ? region : 'shell';
      (per.get(r) ?? per.set(r, []).get(r)!).push(g);
    }
  }
  if (lost.size) { kit.report.unknownBone = [...lost]; kit.report.ok = false; console.error(`[kit:${kit.meta.type}] parts bound to bones missing from the rig: ${[...lost].join(', ')}`); }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [r, list] of per) {
    const idx = list.some((g) => g.index), norm = idx ? list.map((g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]))) : list;
    const m = mergeGeometries(norm, false); if (m) out.set(r, m); else { kit.report.missing.push(`region ${r} (geometries have different attribute sets)`); kit.report.ok = false; console.error(`[kit:${kit.meta.type}] region ${r} failed to merge: every part in it would vanish`); }
    list.forEach((g) => g.dispose());
  }
  return out;
}
