import * as THREE from 'three/webgpu';
import SKEL from './skeleton.json';
import { makePoser, type Bones, type RobotLook, type RobotModel, type PoseInput, REGIONS } from './model';
import { TYPES, SLOT_KEYS, skeleton, type RobotType, type SlotBuild } from './types';
import { createGlitchBody, type ShardData } from './glitch';
import { loadKit, buildSkinned, createKitUniforms, plateKey, type Kit } from './kit';
import { createTransformFx, plateHash, type PlateRec } from './transform';

export type KitU = ReturnType<typeof createKitUniforms>;
export interface TypedRobot extends RobotModel { type: RobotType; uniforms: KitU; joints: THREE.Object3D[] }
const buildOf = (l: RobotLook) => Object.fromEntries(SLOT_KEYS.map((k) => [k, l[k]])) as SlotBuild;
const sameBuild = (a: SlotBuild, b: SlotBuild) => SLOT_KEYS.every((k) => a[k] === b[k]);

/** Bone rig from skeleton.json, built detached at the origin so skin bind matrices are identity. */
function rig(type: RobotType) {
  const root = new THREE.Group(); root.name = 'Robot'; root.userData.type = type;
  const arm = new THREE.Bone(); arm.name = 'Armature'; root.add(arm);
  const by = new Map<string, THREE.Bone>(), list: THREE.Bone[] = [arm];
  for (const b of skeleton(type)) {
    const o = new THREE.Bone(); o.name = b.name; o.position.set(...b.pos); (b.parent ? by.get(b.parent)! : arm).add(o); by.set(b.name, o); list.push(o);
  }
  by.get('Hips')!.userData.y0 = by.get('Hips')!.position.y;
  const nozzles: THREE.Object3D[] = [];
  // jet nozzles (thrust.ts points each flame down the nozzle's -Y): boots for most; the medic flies on a backpack
  // regen-core jet (main lift, userData.k = flame scale) plus two palm boosters at the wrists
  const noz = (name: string, bone: string, x: number, y: number, z: number, k = 1) => {
    const nz = new THREE.Object3D(); nz.name = name; nz.position.set(x, y, z); nz.userData.k = k; by.get(bone)?.add(nz); nozzles.push(nz);
  };
  if (TYPES[type].flight.style === 'medic') {
    noz('BackNozzle', 'Spine', 0, 0.2, -0.3, 1.35); noz('LeftPalmNozzle', 'LeftForeArm', 0, (SKEL as any)[type].hand - 0.07, 0, 0.5); noz('RightPalmNozzle', 'RightForeArm', 0, (SKEL as any)[type].hand - 0.07, 0, 0.5);
  } else for (const s of ['Left', 'Right']) noz(s + 'FootNozzle', s + 'Foot', 0, TYPES[type].sole + 0.02, TYPES[type].soleZ ?? -0.03);
  const bones: Bones = {}; for (const [n, o] of by) (bones as any)[n] = o;
  const joints = [...by.values()].filter((o) => /^(Left|Right)(ForeArm|Leg|Arm)$|^Head$/.test(o.name));
  return { root, arm, by, list, nozzles, bones, joints };
}

/** Mesh types (scout / heavy / worker): one SkinnedMesh per material region, rebuilt when the slot build changes. */
export function createKitRobot(type: RobotType, kit: Kit, look: RobotLook, u: KitU): TypedRobot {
  const R = rig(type);
  const pist = kit.meta.pistons.flatMap((p) => [p.objA, p.objB]).map((n) => { const b = new THREE.Bone(); b.name = n; R.arm.add(b); R.list.push(b); return b; });
  // one bone per armour plate (child of the plate's own bone, at the plate centre) so transformations can move plates individually;
  // its bind inverse is T(-centre), so at rest the plate is exactly where it was authored (bone-local, identity-inverse convention for the rest)
  const plates: PlateRec[] = [], inverses = new Map<THREE.Bone, THREE.Matrix4>(), cen = new THREE.Vector3(), pc = new THREE.Vector3();
  for (const n of kit.nodes) {
    const pb = R.by.get(n.bone); if (!pb || /Hand|F\d_|Foot$/.test(n.bone) || type === 'glitch') continue;
    for (const m of n.meshes) {
      const g = m.geo; g.computeBoundingBox(); const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3()), tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (tris < 8 || Math.max(sz.x, sz.y, sz.z) < 0.05) continue;
      const c = bb.getCenter(new THREE.Vector3()), b = new THREE.Bone(); b.name = plateKey(n, m); b.position.copy(c); pb.add(b); R.list.push(b); inverses.set(b, new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      plates.push({ bone: b, c, out: new THREE.Vector3(), ext: 0, h: plateHash(plates.length), size: Math.min(1, Math.max(sz.x, sz.y, sz.z) / 0.4), parent: n.bone });
    }
  }
  R.root.updateMatrixWorld(true);
  cen.set(0, 0, 0); { const sp = R.by.get('Spine')!; sp.getWorldPosition(cen); cen.y += 0.25; }
  for (const p of plates) { p.bone.getWorldPosition(pc); p.out.copy(pc).sub(cen); p.ext = Math.min(1, p.out.length() / 1.1); p.out.normalize(); }
  const skel = new THREE.Skeleton(R.list, R.list.map((b) => inverses.get(b) ?? new THREE.Matrix4())), index = new Map(R.list.map((b, i) => [b.name, i]));
  const xfx = createTransformFx(type, R.root, R.by, plates);
  const meshes = new Map<string, THREE.SkinnedMesh>();
  let build = buildOf(look);
  const rebuild = () => {
    const geos = buildSkinned(kit, build, (n) => index.get(n) ?? -1);
    for (const [r, m] of meshes) if (!geos.has(r)) { m.geometry.dispose(); m.removeFromParent(); meshes.delete(r); }
    for (const [r, g] of geos) {
      let m = meshes.get(r);
      if (m) { m.geometry.dispose(); m.geometry = g; continue; }
      m = new THREE.SkinnedMesh(g, kit.mats[r]); m.name = `${type}:${r}`; m.frustumCulled = false; m.castShadow = false;
      R.root.add(m); m.updateMatrixWorld(true); m.bind(skel, new THREE.Matrix4()); meshes.set(r, m);
    }
  };
  rebuild();
  const pose = makePoser(R.bones, TYPES[type].motion, TYPES[type].flight.style, TYPES[type].gait);
  // Foot ground clamp: the lowest sole vertices of each foot (from the kit's own foot geometry) must never go below the floor plane (the
  // robot root). Heel-to-toe roll and knee bend used to push a big foot (Heavy) 3-4 cm into the ground, so it looked like the foot was missing.
  const soleAnchors = (side: 'Left' | 'Right') => {
    // lowest vertex per 6 cm xz cell over the whole foot (not only the flat sole): a pitched foot rolls on its heel / toe / dome, not on the sole plane
    const cell = new Map<string, THREE.Vector3>(); let lo = 1e9;
    for (const n of kit.nodes) if (n.slot === 'body' && n.bone === `${side}Foot`) for (const m of n.meshes) { const a = m.geo.attributes.position; for (let i = 0; i < a.count; i++) lo = Math.min(lo, a.getY(i)); }
    for (const n of kit.nodes) if (n.slot === 'body' && n.bone === `${side}Foot`) for (const m of n.meshes) { const a = m.geo.attributes.position; for (let i = 0; i < a.count; i++) { const y = a.getY(i); if (y > lo + 0.1) continue; const k = `${Math.round(a.getX(i) / 0.06)}:${Math.round(a.getZ(i) / 0.06)}`, c = cell.get(k); if (!c || y < c.y) cell.set(k, new THREE.Vector3(a.getX(i), y, a.getZ(i))); } }
    const pts = [...cell.values()], step = Math.max(1, Math.floor(pts.length / 64)); return { pts: pts.filter((_, i) => i % step === 0), bone: R.by.get(`${side}Foot`)! };
  };
  const feet = [soleAnchors('Left'), soleAnchors('Right')], fv = new THREE.Vector3(), GROUND = new Set(['idle', 'walk', 'run', 'land']);
  const clampFeet = (anim: string) => {
    const hips = R.by.get('Hips')!; if (!GROUND.has(anim)) return;
    R.root.updateMatrixWorld(true); const floor = R.root.matrixWorld.elements[13]; let low = 1e9;
    for (const f of feet) for (const p of f.pts) low = Math.min(low, fv.copy(p).applyMatrix4(f.bone.matrixWorld).y - floor);
    if (low < 0) { hips.position.y -= low; R.root.updateMatrixWorld(true); }
  };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), inv = new THREE.Matrix4();
  let ballForm = 0;
  const aimPistons = () => {
    R.root.updateMatrixWorld(true); inv.copy(R.root.matrixWorld).invert();
    kit.meta.pistons.forEach((p, i) => {
      if (build[p.slot] !== p.opt) return;
      A.set(...p.ap).applyMatrix4(R.by.get(p.a)!.matrixWorld).applyMatrix4(inv); B.set(...p.bp).applyMatrix4(R.by.get(p.b)!.matrixWorld).applyMatrix4(inv);
      const a = pist[i * 2], b = pist[i * 2 + 1];
      a.position.copy(A); b.position.copy(B); const ps = 1 - Math.min(1, Math.max(0, (ballForm - 0.15) / 0.35)); a.scale.setScalar(ps); b.scale.setScalar(ps); // pistons retract smoothly with the fold (both ends stay on their bones), no pop
      const d = B.clone().sub(A).normalize(); a.quaternion.setFromUnitVectors(Y, d); b.quaternion.setFromUnitVectors(Y, d.negate());
    });
  };
  const model: TypedRobot = {
    type, root: R.root, nozzles: R.nozzles, height: TYPES[type].height, uniforms: u, joints: R.joints,
    setLook(l) {
      Object.assign(look, l);
      const nb = buildOf(look); if (!sameBuild(nb, build)) { build = nb; rebuild(); }
      const sc = kit.meta.screens?.[build.helmet]; u.screen.value.set(sc?.[0] ?? 0, sc?.[1] ?? 0, sc?.[3] ?? 0, sc?.[4] ?? 0);
      for (const r of REGIONS) kit.mats[r]?.userData.uCol.value.set(look[r]);
      kit.mats.screen.userData.uCol.value.set(look.visor);
      kit.mats.decal.userData.uCol.value.set(look.decalColor);
      u.glow.value.set(look.visor);
    },
    animate(s: PoseInput, dt: number) { pose(s, dt); if ((s.form ?? 0) < 0.25) clampFeet(s.anim); xfx.update(s.form ?? 0, dt, s.gs ?? 0); ballForm = type === 'heavy' || type === 'scout' ? s.form ?? 0 : 0; aimPistons(); },
    dispose() { for (const m of meshes.values()) m.geometry.dispose(); skel.dispose(); xfx.dispose(); },
  };
  model.setLook({}); aimPistons();
  (model as any).kitReport = kit.report;
  return model;
}

/** Glitch v5: the dark machinery kit plus the voxel skin + drifting cube cloud (glitch.ts) on the same rig. */
export function createGlitchRobot(kit: Kit, data: ShardData, look: RobotLook, u: KitU): TypedRobot {
  const base = createKitRobot('glitch', kit, look, u);
  const list: THREE.Bone[] = []; base.root.traverse((o) => { if ((o as THREE.Bone).isBone) list.push(o as THREE.Bone); });
  // solid skin: one cube per 3 cm cell on the machinery geometry (arms, legs, spine, ribs; not the face, hands or feet) so the voxel skin covers the whole body
  const fill: { bone: string; x: number; y: number; z: number }[] = [], seen = new Set<string>(); let kitN = 0;
  for (const nd of kit.nodes) { if (nd.slot !== 'body' || /Head|Hand|F\d_|Foot$/.test(nd.bone)) continue; for (const m of nd.meshes) { const g = m.geo, pos = g.attributes.position; g.computeBoundingBox(); const sz = g.boundingBox!.getSize(new THREE.Vector3()); if (Math.max(sz.x, sz.y, sz.z) < 0.04) continue;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = `${nd.bone}:${Math.round(x / 0.03)}:${Math.round(y / 0.03)}:${Math.round(z / 0.03)}`; if (seen.has(k)) continue; seen.add(k); fill.push({ bone: nd.bone, x, y, z }); kitN++; } } }
  const G = createGlitchBody(data, list.map((b) => b.name), base.root, u.energy, u.damage, fill);
  const bodyMeshes = base.root.children.filter((o) => (o as THREE.SkinnedMesh).isSkinnedMesh);
  const model: TypedRobot = {
    ...base,
    setLook(l) { base.setLook(l); G.setLook(look); },
    animate(s, dt) {
      base.animate(s, dt); G.update(s, dt, list);
      const hide = G.uniforms.uDash.value > 0.5 || G.cloudOn; for (const m of bodyMeshes) m.visible = !hide; // blink-dash: the body dissolves into shards
    },
    dispose() { base.dispose(); G.dispose(); },
  };
  model.setLook({}); model.animate({ anim: 'idle', phase: 0, speed: 0, lean: 0, bank: 0, crouch: 0, t: 0 }, 0.016);
  return model;
}

/**
 * The player robot: a stable root that hosts the current type. `setType` loads that type's kit (cached) and swaps the
 * body in place, keeping transform, paint and damage; `onSwap` lets thrust FX re-attach to the new nozzles.
 */
export async function createRobotSwitch(type: RobotType, look: RobotLook) {
  const root = new THREE.Group(); root.name = 'PlayerRobot';
  const u = createKitUniforms();
  const kits = new Map<RobotType, Promise<Kit | [Kit, ShardData]>>();
  const load = (t: RobotType) => {
    if (!kits.has(t)) kits.set(t, t === 'glitch' ? Promise.all([loadKit(t, u), fetch(`${import.meta.env.BASE_URL}robot/glitch/shards.json?v=${__ROBOT_V__}`).then((r) => r.json() as Promise<ShardData>)]) : loadKit(t, u));
    return kits.get(t)!;
  };
  let cur: TypedRobot;
  const make = async (t: RobotType, l: RobotLook) => { const k = await load(t); return t === 'glitch' ? createGlitchRobot(...(k as [Kit, ShardData]), l, u) : createKitRobot(t, k as Kit, l, u); };
  cur = await make(type, look); root.add(cur.root);
  const sw = {
    root, uniforms: u, onSwap: (_m: TypedRobot) => {},
    get type() { return cur.type; }, get nozzles() { return cur.nozzles; }, get height() { return cur.height; }, get joints() { return cur.joints; }, get inner() { return cur; },
    setLook(l: Partial<RobotLook>) { cur.setLook(l); },
    animate(s: PoseInput, dt: number) { cur.animate(s, dt); },
    async setType(t: RobotType, l: RobotLook) {
      if (t === cur.type) { cur.setLook(l); return; }
      const next = await make(t, { ...l }); root.remove(cur.root); cur.dispose(); cur = next; root.add(cur.root); sw.onSwap(cur);
    },
    preload(t: RobotType) { void load(t); },
    dispose() { cur.dispose(); },
  };
  return sw;
}
export type RobotSwitch = Awaited<ReturnType<typeof createRobotSwitch>>;
