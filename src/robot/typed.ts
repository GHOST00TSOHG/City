import * as THREE from 'three/webgpu';
import { makePoser, type Bones, type RobotLook, type RobotModel, type PoseInput, REGIONS } from './model';
import { TYPES, SLOT_KEYS, skeleton, type RobotType, type SlotBuild } from './types';
import { createGlitchBody, type ShardData } from './glitch';
import { loadKit, buildSkinned, createKitUniforms, type Kit } from './kit';

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
  for (const s of ['Left', 'Right']) { const nz = new THREE.Object3D(); nz.name = s + 'FootNozzle'; nz.position.set(0, TYPES[type].sole + 0.02, -0.03); by.get(s + 'Foot')!.add(nz); nozzles.push(nz); }
  const bones: Bones = {}; for (const [n, o] of by) (bones as any)[n] = o;
  const joints = [...by.values()].filter((o) => /^(Left|Right)(ForeArm|Leg|Arm)$|^Head$/.test(o.name));
  return { root, arm, by, list, nozzles, bones, joints };
}

/** Mesh types (scout / heavy / worker): one SkinnedMesh per material region, rebuilt when the slot build changes. */
export function createKitRobot(type: RobotType, kit: Kit, look: RobotLook, u: KitU): TypedRobot {
  const R = rig(type);
  const pist = kit.meta.pistons.flatMap((p) => [p.objA, p.objB]).map((n) => { const b = new THREE.Bone(); b.name = n; R.arm.add(b); R.list.push(b); return b; });
  R.root.updateMatrixWorld(true);
  // identity inverses: kit vertices are authored in bone-local space, so skinning = bone.matrixWorld * v
  const skel = new THREE.Skeleton(R.list, R.list.map(() => new THREE.Matrix4())), index = new Map(R.list.map((b, i) => [b.name, i]));
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
  const pose = makePoser(R.bones, TYPES[type].motion);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), inv = new THREE.Matrix4();
  const aimPistons = () => {
    R.root.updateMatrixWorld(true); inv.copy(R.root.matrixWorld).invert();
    kit.meta.pistons.forEach((p, i) => {
      if (build[p.slot] !== p.opt) return;
      A.set(...p.ap).applyMatrix4(R.by.get(p.a)!.matrixWorld).applyMatrix4(inv); B.set(...p.bp).applyMatrix4(R.by.get(p.b)!.matrixWorld).applyMatrix4(inv);
      const a = pist[i * 2], b = pist[i * 2 + 1];
      a.position.copy(A); b.position.copy(B);
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
    equip() { /* parts come with the kit */ },
    animate(s: PoseInput, dt: number) { pose(s, dt); aimPistons(); },
    dispose() { for (const m of meshes.values()) m.geometry.dispose(); skel.dispose(); },
  };
  model.setLook({}); aimPistons();
  return model;
}

/** Glitch v4: a glossy mesh kit (like the other types) plus a small crisp shard overlay (glitch.ts) on the same rig. */
export function createGlitchRobot(kit: Kit, data: ShardData, look: RobotLook, u: KitU): TypedRobot {
  const base = createKitRobot('glitch', kit, look, u);
  const list: THREE.Bone[] = []; base.root.traverse((o) => { if ((o as THREE.Bone).isBone) list.push(o as THREE.Bone); });
  const G = createGlitchBody(data, list.map((b) => b.name), base.root, u.energy, u.damage);
  const bodyMeshes = base.root.children.filter((o) => (o as THREE.SkinnedMesh).isSkinnedMesh);
  const model: TypedRobot = {
    ...base,
    setLook(l) { base.setLook(l); G.setLook(look); },
    animate(s, dt) {
      base.animate(s, dt); G.update(s, dt, list);
      const hide = G.uniforms.uDash.value > 0.5; for (const m of bodyMeshes) m.visible = !hide; // blink-dash: the body dissolves into shards
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
    if (!kits.has(t)) kits.set(t, t === 'glitch' ? Promise.all([loadKit(t, u), fetch(`${import.meta.env.BASE_URL}robot/glitch/shards.json`).then((r) => r.json() as Promise<ShardData>)]) : loadKit(t, u));
    return kits.get(t)!;
  };
  let cur: TypedRobot;
  const make = async (t: RobotType, l: RobotLook) => { const k = await load(t); return t === 'glitch' ? createGlitchRobot(...(k as [Kit, ShardData]), l, u) : createKitRobot(t, k as Kit, l, u); };
  cur = await make(type, look); root.add(cur.root);
  const sw = {
    root, uniforms: u, onSwap: (_m: TypedRobot) => {},
    get type() { return cur.type; }, get nozzles() { return cur.nozzles; }, get height() { return cur.height; }, get joints() { return cur.joints; }, get inner() { return cur; },
    setLook(l: Partial<RobotLook>) { cur.setLook(l); },
    equip() {},
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
