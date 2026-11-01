import * as THREE from 'three/webgpu';
import { float, length, pow, uniform, uv, vec3 } from 'three/tsl';
import type { RobotType } from './types';
const uBeamK = uniform(0); // 0..1 headlight beam brightness (Scout motorcycle mode)

/**
 * Transformers-style plate choreography for the on-foot transformations (Heavy ball, Scout motorcycle mode, Worker tread mode).
 * Every armour plate rides its own bone (typed.ts). During a transformation each plate lifts off, flips and settles back in a
 * STAGGERED wave (extremities first when folding, core first when unfolding, plus a per-plate random offset), so the limbs'
 * dark frames and pistons show through; instanced gears spin up at the joints mid-transformation and disappear again.
 * At form 0 and 1 every plate is back at its rest pose on its bone, so the end states have no gaps or interpenetration.
 */
export interface PlateRec { bone: THREE.Bone; c: THREE.Vector3; out: THREE.Vector3; ext: number; h: number; size: number; parent: string; /** collapse target in the parent bone's space (plates sink into the ball) */ sink?: THREE.Vector3 }
/** Heavy's ball: plates on the Hips, the waist / back panel / stacks / mast on the Spine, and any dome plate poking out further than `outlier` m from the dome centre collapse into the sphere so nothing but the dome shows. */
const BALL = { Hips: [0, 0.36, 0.02], Spine: [0, 0.54, 0], outlier: 0.6 } as const;
const GEARS: Record<RobotType, { bone: string; off: [number, number, number]; r: number }[]> = {
  heavy: [{ bone: 'LeftArm', off: [0.1, 0, 0], r: 0.17 }, { bone: 'RightArm', off: [-0.1, 0, 0], r: 0.17 }, { bone: 'LeftUpLeg', off: [0.1, 0, 0], r: 0.16 }, { bone: 'RightUpLeg', off: [-0.1, 0, 0], r: 0.16 },
    { bone: 'LeftLeg', off: [0.1, 0, 0], r: 0.13 }, { bone: 'RightLeg', off: [-0.1, 0, 0], r: 0.13 }, { bone: 'LeftForeArm', off: [0.1, 0, 0], r: 0.12 }, { bone: 'RightForeArm', off: [-0.1, 0, 0], r: 0.12 }, { bone: 'Spine', off: [0, 0.25, 0.3], r: 0.14 }, { bone: 'Spine', off: [0, 0.55, 0.3], r: 0.1 }],
  scout: [{ bone: 'LeftArm', off: [0.07, 0, 0], r: 0.1 }, { bone: 'RightArm', off: [-0.07, 0, 0], r: 0.1 }, { bone: 'LeftUpLeg', off: [0.07, 0, 0], r: 0.11 }, { bone: 'RightUpLeg', off: [-0.07, 0, 0], r: 0.11 },
    { bone: 'LeftLeg', off: [0.06, 0, 0], r: 0.09 }, { bone: 'RightLeg', off: [-0.06, 0, 0], r: 0.09 }, { bone: 'Spine', off: [0, 0.2, 0.2], r: 0.1 }, { bone: 'Spine', off: [0, 0.4, 0.2], r: 0.08 }],
  worker: [{ bone: 'LeftArm', off: [0.1, 0, 0], r: 0.14 }, { bone: 'RightArm', off: [-0.1, 0, 0], r: 0.14 }, { bone: 'LeftUpLeg', off: [0.1, 0, 0], r: 0.13 }, { bone: 'RightUpLeg', off: [-0.1, 0, 0], r: 0.13 },
    { bone: 'LeftLeg', off: [0.08, 0, 0], r: 0.1 }, { bone: 'RightLeg', off: [-0.08, 0, 0], r: 0.1 }, { bone: 'LeftForeArm', off: [0.08, 0, 0], r: 0.1 }, { bone: 'RightForeArm', off: [-0.08, 0, 0], r: 0.1 }, { bone: 'Spine', off: [0, 0.3, 0.25], r: 0.12 }],
  glitch: [],
};
const hash = (i: number) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };

export function createTransformFx(type: RobotType, root: THREE.Object3D, by: Map<string, THREE.Bone>, plates: PlateRec[]) {
  // gears: ONE instanced draw, attached to joint bones, scaled 0 (and hidden) outside a transformation
  const G = GEARS[type].filter((g) => by.has(g.bone));
  const geo = (() => { const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.62, 0.62, 0.28, 18).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.28, 0.28, 0.4, 10).rotateZ(Math.PI / 2)];
    for (let i = 0; i < 10; i++) { const b = new THREE.BoxGeometry(0.28, 0.22, 0.2); b.translate(0, 0.72, 0); b.rotateX((i / 10) * Math.PI * 2); parts.push(b); }
    // merge by hand (all plain position/normal geometries)
    const pos: number[] = [], nor: number[] = [], idx: number[] = []; let o = 0;
    for (const g of parts) { const ng = g.index ? g : g.toNonIndexed(); const p = ng.attributes.position, n = ng.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o); else for (let i = 0; i < p.count; i++) idx.push(o + i); o += p.count; }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m; })();
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#7d838c', metalness: 0.9, roughness: 0.35, emissive: '#331a08', side: THREE.DoubleSide });
  const gears = new THREE.InstancedMesh(geo, mat, Math.max(1, G.length)); gears.frustumCulled = false; gears.visible = false; gears.name = `${type}:gears`; gears.count = G.length; root.add(gears);
  const m4 = new THREE.Matrix4(), inv = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(), qs = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0);
  // ---- Worker tread mode: two tank-tread units drop from the shins to the floor (root space), 2 draws (belts + moving track links), only while deployed
  const merge = (parts: THREE.BufferGeometry[]) => { const pos: number[] = [], nor: number[] = [], idx: number[] = []; let o = 0; for (const g of parts) { const ng = g.index ? g : g.toNonIndexed(), p = ng.attributes.position, n = ng.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o); else for (let i = 0; i < p.count; i++) idx.push(o + i); o += p.count; } const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m; };
  const TL = 1.3, TR = 0.2, TW = 0.26; // belt straight length, wheel radius, width
  let treads: THREE.InstancedMesh | null = null, links: THREE.InstancedMesh | null = null; const NL = 26, tdep = [0, 0];
  if (type === 'worker') {
    const body = merge([new THREE.BoxGeometry(TW * 0.8, TR * 1.5, TL).translate(0, 0, 0), new THREE.CylinderGeometry(TR, TR, TW, 16).rotateZ(Math.PI / 2).translate(0, 0, TL / 2), new THREE.CylinderGeometry(TR, TR, TW, 16).rotateZ(Math.PI / 2).translate(0, 0, -TL / 2),
      new THREE.CylinderGeometry(TR * 0.55, TR * 0.55, TW * 1.1, 10).rotateZ(Math.PI / 2).translate(0, -TR * 0.5, 0.2), new THREE.CylinderGeometry(TR * 0.55, TR * 0.55, TW * 1.1, 10).rotateZ(Math.PI / 2).translate(0, -TR * 0.5, -0.2),
      new THREE.BoxGeometry(TW * 0.5, 0.3, 0.3).translate(0, 0.3, 0)]); // + strut up to the hull
    treads = new THREE.InstancedMesh(body, new THREE.MeshStandardNodeMaterial({ color: '#6b7078', metalness: 0.6, roughness: 0.45, emissive: '#1a1a10', side: THREE.DoubleSide }), 2); treads.frustumCulled = false; treads.visible = false; treads.name = 'worker:treads'; treads.count = 2; root.add(treads);
    links = new THREE.InstancedMesh(new THREE.BoxGeometry(TW * 1.08, 0.05, 0.1), new THREE.MeshStandardNodeMaterial({ color: '#b8bcc4', metalness: 0.7, roughness: 0.35, emissive: '#2a2418' }), NL * 2); links.frustumCulled = false; links.visible = false; links.name = 'worker:tread-links'; links.count = NL * 2; root.add(links);
  }
  const PER = 2 * TL + 2 * Math.PI * TR, lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3(1, 1, 1), ones = new THREE.Vector3(1, 1, 1), treadX = 0.4, treadY = TR + 0.015;
  const pathAt = (u: number, out: THREE.Vector3) => { // stadium loop around the belt: bottom run backward, rear arc, top run forward, front arc; returns the tangent angle about X
    let d = (((u % 1) + 1) % 1) * PER; const R = TR + 0.02;
    if (d < TL) { out.set(0, -R, TL / 2 - d); return Math.PI / 2; } d -= TL;
    if (d < Math.PI * R) { const a = d / R; out.set(0, -R * Math.cos(a), -TL / 2 - R * Math.sin(a)); return Math.PI / 2 + a; } d -= Math.PI * R;
    if (d < TL) { out.set(0, R, -TL / 2 + d); return -Math.PI / 2; } d -= TL;
    const a = d / R; out.set(0, R * Math.cos(a), TL / 2 + R * Math.sin(a)); return -Math.PI / 2 + a;
  };
  let linkU = 0;
  const treadUpdate = (form: number, dt: number, gs: number) => {
    if (!treads || !links) return;
    tdep[0] = smooth(Math.max(0, Math.min(1, (form - 0.25) / 0.6))); tdep[1] = smooth(Math.max(0, Math.min(1, (form - 0.34) / 0.6))); // right side lands a beat later: staggered drop
    const vis = tdep[0] > 0.01; treads.visible = links.visible = vis; if (!vis) return;
    linkU += gs * dt / PER;
    for (let k = 0; k < 2; k++) {
      const sd = k ? -1 : 1, d = tdep[k], cy = treadY + (1 - d) * 0.6; lp.set(sd * treadX, cy, 0.05); ls.set(1, 0.6 + 0.4 * d, 0.7 + 0.3 * d);
      m4.compose(lp, lq.identity(), ls); treads.setMatrixAt(k, m4);
      for (let i = 0; i < NL; i++) { const ang = pathAt(linkU + i / NL, ps), qx = new THREE.Quaternion().setFromAxisAngle(X, ang); lp.set(sd * treadX + ps.x, cy + ps.y * (0.6 + 0.4 * d), 0.05 + ps.z * (0.7 + 0.3 * d)); m4.compose(lp, qx, ones); links.setMatrixAt(k * NL + i, m4); }
    }
    treads.instanceMatrix.needsUpdate = true; links.instanceMatrix.needsUpdate = true;
  };
  if (type === 'heavy') for (const p of plates) { if (p.parent === 'Hips') p.sink = new THREE.Vector3(...BALL.Hips); else if (p.parent === 'Spine' && (p.c.y < 0.22 || /\/(back_plate|stack|mast)/.test(p.bone.name) || p.c.distanceTo(new THREE.Vector3(...BALL.Spine)) > BALL.outlier)) p.sink = new THREE.Vector3(...BALL.Spine); } // sinks: everything below the dome (waist, rings, pistons) and the back panel / stacks / mast
  // ---- Scout motorcycle mode: two wheels (tires + spoked rims, 2 draws), a giant round headlight lens + working beam (additive cone) + glow pool on the road (3 draws). No real light: the scene's light count never changes.
  const WR = 0.34; let tires: THREE.InstancedMesh | null = null, rims: THREE.InstancedMesh | null = null, lens: THREE.Mesh | null = null, beam: THREE.Mesh | null = null, pool: THREE.Mesh | null = null, lensMat: THREE.MeshBasicNodeMaterial | null = null, pipes: THREE.InstancedMesh | null = null;
  const nozL = root.getObjectByName('LeftFootNozzle'), nozR = root.getObjectByName('RightFootNozzle'), pq = new THREE.Quaternion(), pa = new THREE.Vector3(), pb2 = new THREE.Vector3();
  const wheelPos = [new THREE.Vector3(), new THREE.Vector3()]; let wheelSpin = 0, motoA = 0;
  const hb = by.get('Head'), lh = by.get('LeftHand'), rh = by.get('RightHand'), hp = by.get('Hips');
  if (type === 'scout' && hb && lh && rh && hp) {
    const tire = new THREE.CylinderGeometry(WR, WR, 0.15, 28).rotateZ(Math.PI / 2);
    const rimParts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(WR * 0.74, WR * 0.74, 0.17, 24, 1, true).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12).rotateZ(Math.PI / 2)];
    for (let i = 0; i < 6; i++) { const sp = new THREE.BoxGeometry(0.05, WR * 1.5, 0.035); sp.rotateX((i / 6) * Math.PI); rimParts.push(sp); }
    const rim = merge(rimParts);
    tires = new THREE.InstancedMesh(tire, new THREE.MeshStandardNodeMaterial({ color: '#34373e', metalness: 0.2, roughness: 0.8 }), 2); rims = new THREE.InstancedMesh(rim, new THREE.MeshStandardNodeMaterial({ color: '#d8dbe0', metalness: 0.9, roughness: 0.3, emissive: '#2a2a32', side: THREE.DoubleSide }), 2);
    for (const m of [tires, rims]) { m.frustumCulled = false; m.visible = false; m.count = 2; root.add(m); } tires.name = 'scout:tires'; rims.name = 'scout:rims';
    lensMat = new THREE.MeshBasicNodeMaterial({ color: '#fff4d8' }); lens = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), lensMat); lens.name = 'scout:headlight'; lens.visible = false; lens.frustumCulled = false; root.add(lens);
    const cone = new THREE.ConeGeometry(1.5, 7, 28, 1, true); cone.translate(0, -3.5, 0); cone.rotateX(-Math.PI / 2); // apex at the lens, opens forward (+z)
    const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    bm.colorNode = vec3(1.0, 0.93, 0.72).mul(uBeamK); bm.opacityNode = pow(uv().y, 1.3).mul(0.17).mul(uBeamK); beam = new THREE.Mesh(cone, bm); beam.name = 'scout:beam'; beam.visible = false; beam.frustumCulled = false; beam.renderOrder = 6; root.add(beam);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    pm.colorNode = vec3(1.0, 0.92, 0.7).mul(uBeamK); pm.opacityNode = pow(float(1).sub(length(uv().sub(0.5)).mul(2).min(1)), 2).mul(0.35).mul(uBeamK);
    pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.06, 1, 16, 1, true).translate(0, 0.5, 0), new THREE.MeshStandardNodeMaterial({ color: '#c9ccd2', metalness: 0.95, roughness: 0.25, emissive: '#1c1410', side: THREE.DoubleSide }), 4);
    pipes.name = 'scout:pipes'; pipes.frustumCulled = false; pipes.visible = false; pipes.count = 4; root.add(pipes); // 2 tailpipes (end on the foot nozzles) + 2 fork tubes
    pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pm); pool.name = 'scout:beam-pool'; pool.visible = false; pool.frustumCulled = false; pool.renderOrder = 6; root.add(pool);
  }
  const mq = new THREE.Quaternion(), mq2 = new THREE.Quaternion(), mp = new THREE.Vector3(), mf = new THREE.Vector3(), mS = new THREE.Vector3(), mm = new THREE.Matrix4(), hv3 = new THREE.Vector3(), rootInvM = new THREE.Matrix4();
  const motoUpdate = (form: number, dt: number, gs: number) => {
    if (!tires || !rims || !lens || !beam || !pool || !lensMat || !pipes) return;
    const vis = form > 0.3; for (const m of [tires, rims, lens, beam, pool, pipes]) m.visible = vis; if (!vis) return;
    root.updateMatrixWorld(true); rootInvM.copy(root.matrixWorld).invert(); wheelSpin += gs * dt / WR;
    // wheels: the front one sits between the fork tips (the hands), the rear one under the hips; both always rest on the road (root y = 0)
    const L0 = hb!.matrixWorld; hv3.set(0, 0.12, 0.1).applyMatrix4(L0).applyMatrix4(rootInvM); const fz = hv3.z - 0.02; // front wheel under the headlight (the arms are folded away)
    hp!.getWorldPosition(mp); mp.applyMatrix4(rootInvM); const rz = mp.z - 0.52;
    const dF = smooth(Math.max(0, Math.min(1, (form - 0.3) / 0.4))), dR = smooth(Math.max(0, Math.min(1, (form - 0.42) / 0.4)));
    [[fz, dF], [rz, dR]].forEach(([z, d], k) => { mp.set(0, WR * (0.4 + 0.6 * d) , z as number); mq.setFromAxisAngle(X, wheelSpin); mS.setScalar(0.35 + 0.65 * (d as number)); mm.compose(mp, mq, mS); tires!.setMatrixAt(k, mm); rims!.setMatrixAt(k, mm); });
    tires.instanceMatrix.needsUpdate = rims.instanceMatrix.needsUpdate = true;
    // tailpipes: each runs 0.75 m forward from its foot nozzle (the flame starts at the pipe end); forks: from the lens down to the front hub
    const dP = smooth(Math.max(0, Math.min(1, (form - 0.35) / 0.45)));
    [nozL, nozR].forEach((nz, k) => { if (!nz) return; nz.getWorldPosition(pa).applyMatrix4(rootInvM); nz.getWorldQuaternion(pq); mq2.copy(root.getWorldQuaternion(mq).invert()).multiply(pq); // nozzle orientation in root space; its +Y points back into the pipe
      mS.set(1, 0.75 * dP + 0.001, 1); mm.compose(pa, mq2, mS); pipes!.setMatrixAt(k, mm); });
    const hubY = WR * (0.4 + 0.6 * dF);
    for (let k = 0; k < 2; k++) { pa.set(k ? -0.11 : 0.11, hubY, fz); pb2.set(k ? -0.11 : 0.11, hv3.y + 0.05, hv3.z - 0.12); const len = pa.distanceTo(pb2); mq2.setFromUnitVectors(Y, pb2.clone().sub(pa).normalize()); mS.set(0.6, len * dF + 0.001, 0.6); mm.compose(pa, mq2, mS); pipes.setMatrixAt(2 + k, mm); }
    pipes.instanceMatrix.needsUpdate = true;
    // headlight: a big round lens on the (enlarged) head, facing forward; the beam cone + road pool fade in with the form
    motoA += ((form > 0.85 ? 1 : 0) - motoA) * (1 - Math.exp(-dt * 9)); uBeamK.value = motoA;
    // forward direction of the bike = root +z (the body travels along it); the beam leans a little toward the road
    mf.set(0, -0.09, 1).normalize();
    const L = hb!.matrixWorld; mp.set(0, 0.12, 0.1).applyMatrix4(L).applyMatrix4(rootInvM); // lens centre in front of the head
    lens.position.copy(mp); lens.scale.set(0.21, 0.21, 0.1).multiplyScalar(0.25 + 0.75 * smooth(Math.max(0, Math.min(1, (form - 0.5) / 0.4)))); lens.quaternion.identity(); lensMat.color.setScalar(1).multiplyScalar(1 + motoA * 3);
    beam.position.copy(mp); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mf); beam.scale.setScalar(0.4 + 0.6 * motoA);
    const tHit = mf.y < -0.01 ? Math.min(7, mp.y / -mf.y) : 5; pool.position.set(mp.x + mf.x * tHit, 0.03, mp.z + mf.z * tHit); pool.scale.set(2.4 + tHit * 0.2, 1, 3.4 + tHit * 0.3);
  };
  let prev = 0, dir = 1, spin = 0, active = false;
  const attached = type === 'heavy'; // Heavy's plates hinge in place (small tilt, a few mm of lift): nothing ever leaves the body while the ball opens / closes
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return {
    gears,
    /** form 0..1 (controller); plates and gears follow. Cheap when idle (a single check). */
    update(form: number, dt: number, gs = 0) {
      treadUpdate(form, dt, gs); motoUpdate(form, dt, gs);
      const dp = form - prev; if (dp > 1e-4) dir = 1; else if (dp < -1e-4) dir = -1; prev = form;
      const run = form > 0.002;
      if (!run) { if (active) { for (const p of plates) { p.bone.position.copy(p.c); p.bone.quaternion.identity(); p.bone.scale.set(1, 1, 1); } gears.visible = false; active = false; } return; }
      active = true; const tt = dir > 0 ? form : 1 - form; spin += dt * 9 * (dir > 0 ? 1 : -1);
      for (const p of plates) {
        const start = (dir > 0 ? 1 - p.ext : p.ext) * 0.32 + p.h * 0.14, lt = Math.max(0, Math.min(1, (tt - start) / 0.54)), pulse = Math.sin(Math.PI * lt);
        const cp = p.sink ? smooth(Math.max(0, Math.min(1, (form - 0.5 - p.h * 0.08) / 0.4))) : 0; // sink into the ball (form 0.5 to 0.95)
        if (pulse < 0.001) { if (cp > 0) { p.bone.position.lerpVectors(p.c, p.sink!, cp); p.bone.scale.setScalar(1 - 0.95 * cp); } else { p.bone.position.copy(p.c); p.bone.scale.set(1, 1, 1); } p.bone.quaternion.identity(); continue; }
        const lift = (attached ? 0.006 + 0.014 * p.size : 0.05 + 0.16 * p.size) * Math.pow(pulse, 0.8); p.bone.position.copy(p.c).addScaledVector(p.out, lift);
        ax.copy(p.out).cross(Y); if (ax.lengthSq() < 1e-4) ax.copy(X); ax.normalize();
        p.bone.quaternion.setFromAxisAngle(ax, (attached ? 0.22 + p.h * 0.16 : 0.8 + p.h * 0.9) * pulse * (p.h > 0.5 ? 1 : -1)); p.bone.scale.setScalar((1 - 0.1 * pulse) * (1 - 0.95 * cp)); if (cp > 0) p.bone.position.lerp(p.sink!, cp);
      }
      if (form > 0.998) { gears.visible = false; return; }
      const g = Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, (tt - 0.06) / 0.88))), 0.7);
      gears.visible = g > 0.02; if (!gears.visible) return;
      root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert();
      G.forEach((d, i) => { const b = by.get(d.bone)!; m4.copy(inv).multiply(b.matrixWorld); ps.set(...d.off); qs.setFromAxisAngle(X, spin * (i % 2 ? -1 : 1) * (1 + (i % 3) * 0.3)); sc.setScalar(d.r * g); m4.multiply(new THREE.Matrix4().compose(ps, qs, sc)); gears.setMatrixAt(i, m4); });
      gears.instanceMatrix.needsUpdate = true;
    },
    dispose() { for (const m of [tires, rims, lens, beam, pool, pipes]) m?.removeFromParent(); treads?.removeFromParent(); links?.removeFromParent(); gears.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
export const plateHash = hash;
