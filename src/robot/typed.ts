import * as THREE from 'three/webgpu';
import { uniform, uniformArray, instancedBufferAttribute, positionLocal, vec3, vec4, float, sin, time, step, mix, max, fract } from 'three/tsl';
import { makePoser, type Bones, type RobotLook, type RobotModel, type PoseInput, REGIONS } from './model';
import { TYPES, SLOT_KEYS, skeleton, type RobotType, type SlotBuild } from './types';
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
  const pose = makePoser(R.bones);
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

/** Glitch: every cube of every part in ONE InstancedMesh; bones are a mat4 uniform array indexed per instance. */
export interface CubeData { vox: number; parts: { slot: string; opt: string; bone: string; cubes: [number, number, number, number, number][] }[] }
export function createGlitchRobot(data: CubeData, look: RobotLook, u: KitU): TypedRobot {
  const R = rig('glitch');
  const boneNames = R.list.map((b) => b.name), n = data.parts.reduce((s, p) => s + p.cubes.length, 0);
  const off = new Float32Array(n * 4), aux = new Float32Array(n * 4), dir = new Float32Array(n * 3);
  let i = 0;
  data.parts.forEach((p, pi) => {
    const bi = Math.max(0, boneNames.indexOf(p.bone));
    for (const [x, y, z, s, c] of p.cubes) {
      off.set([x, y, z, s * 0.94], i * 4); aux.set([bi, c, pi, Math.random()], i * 4);
      const v = new THREE.Vector3(x, y * 0.3, z).normalize().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.8)).normalize();
      dir.set([v.x, v.y, v.z], i * 3); i++;
    }
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const aOff = instancedBufferAttribute(new THREE.InstancedBufferAttribute(off, 4), 'vec4') as any, aAux = instancedBufferAttribute(new THREE.InstancedBufferAttribute(aux, 4), 'vec4') as any, aDir = instancedBufferAttribute(new THREE.InstancedBufferAttribute(dir, 3), 'vec3') as any;
  const boneMats = R.list.map(() => new THREE.Matrix4()), uBones = uniformArray(boneMats, 'mat4');
  const vis = data.parts.map(() => 0), uVis = uniformArray(vis, 'float');
  const uWhite = uniform(new THREE.Color()), uDark = uniform(new THREE.Color()), uGlitch = uniform(new THREE.Color());
  const seed = aAux.w, part = aAux.z, col = aAux.y;
  // drift: a few cubes always float off and return; burst scatters all of them; damage loosens a growing share
  const idle = step(0.975, seed).mul(sin(time.mul(1.3).add(seed.mul(40))).mul(0.5).add(0.5)).mul(0.22);
  const scatter = max(float(0), u.energy.sub(1.5)).mul(seed.mul(0.5).add(0.15));
  const loose = step(float(1).sub(u.damage.mul(0.4)), fract(seed.mul(7.13))).mul(sin(time.mul(2).add(seed.mul(30))).mul(0.06).add(0.1));
  const snap = u.sweep.greaterThan(-0.9).select(float(0), float(1));
  const local = positionLocal.mul(aOff.w.mul(uVis.element(part.toInt()))).add(aOff.xyz).add(aDir.mul(idle.add(scatter).add(loose.mul(snap))));
  const mat = new THREE.MeshStandardNodeMaterial({ flatShading: true, roughness: 0.25, metalness: 0.05 });
  mat.positionNode = (uBones.element(aAux.x.toInt()) as any).mul(vec4(local, 1)).xyz;
  const glow = col.greaterThan(1.5);
  mat.colorNode = glow.select(uGlitch.mul(0.3), col.greaterThan(0.5).select(uDark, uWhite)).mul(float(1).sub(u.damage.mul(0.35)));
  const flick = step(0.9, fract(sin(time.mul(23).add(seed.mul(91))).mul(43758.5))).mul(0.8).add(0.6);
  mat.emissiveNode = mix(vec3(0), uGlitch.mul(u.energy.mul(1.6)).mul(flick), glow.select(float(1), float(0)));
  mat.roughnessNode = col.greaterThan(0.5).select(float(0.55), float(0.22));
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.name = 'glitch:cubes'; mesh.frustumCulled = false;
  const id = new THREE.Matrix4(); for (let k = 0; k < n; k++) mesh.setMatrixAt(k, id);
  R.root.add(mesh);
  const pose = makePoser(R.bones), inv = new THREE.Matrix4();
  const model: TypedRobot = {
    type: 'glitch', root: R.root, nozzles: R.nozzles, height: TYPES.glitch.height, uniforms: u, joints: R.joints,
    setLook(l) {
      Object.assign(look, l);
      data.parts.forEach((p, k) => (vis[k] = p.slot === 'body' || (look as any)[p.slot] === p.opt ? 1 : 0));
      u.screen.value.set(0, 0, 0, 0); uWhite.value.set(look.shell); uDark.value.set(look.joints); uGlitch.value.set(look.visor); u.glow.value.set(look.visor);
    },
    equip() {},
    animate(s, dt) {
      pose(s, dt); R.root.updateMatrixWorld(true); inv.copy(R.root.matrixWorld).invert();
      R.list.forEach((b, k) => boneMats[k].multiplyMatrices(inv, b.matrixWorld));
    },
    dispose() { geo.dispose(); mat.dispose(); },
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
  const kits = new Map<RobotType, Promise<Kit | CubeData>>();
  const load = (t: RobotType) => {
    if (!kits.has(t)) kits.set(t, t === 'glitch' ? fetch(`${import.meta.env.BASE_URL}robot/glitch/cubes.json`).then((r) => r.json()) : loadKit(t, u));
    return kits.get(t)!;
  };
  let cur: TypedRobot;
  const make = async (t: RobotType, l: RobotLook) => { const k = await load(t); return t === 'glitch' ? createGlitchRobot(k as CubeData, l, u) : createKitRobot(t, k as Kit, l, u); };
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
