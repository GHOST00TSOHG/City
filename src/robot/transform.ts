import * as THREE from 'three/webgpu';
import type { RobotType } from './types';

/**
 * Transformers-style plate choreography for the on-foot transformations (Heavy ball, Scout hover-sprint, Worker beast gallop).
 * Every armour plate rides its own bone (typed.ts). During a transformation each plate lifts off, flips and settles back in a
 * STAGGERED wave (extremities first when folding, core first when unfolding, plus a per-plate random offset), so the limbs'
 * dark frames and pistons show through; instanced gears spin up at the joints mid-transformation and disappear again.
 * At form 0 and 1 every plate is back at its rest pose on its bone, so the end states have no gaps or interpenetration.
 */
export interface PlateRec { bone: THREE.Bone; c: THREE.Vector3; out: THREE.Vector3; ext: number; h: number; size: number }
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
  let prev = 0, dir = 1, spin = 0, active = false;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return {
    gears,
    /** form 0..1 (controller); plates and gears follow. Cheap when idle (a single check). */
    update(form: number, dt: number) {
      const dp = form - prev; if (dp > 1e-4) dir = 1; else if (dp < -1e-4) dir = -1; prev = form;
      const run = form > 0.002 && form < 0.998;
      if (!run) { if (active) { for (const p of plates) { p.bone.position.copy(p.c); p.bone.quaternion.identity(); p.bone.scale.set(1, 1, 1); } gears.visible = false; active = false; } return; }
      active = true; const tt = dir > 0 ? form : 1 - form; spin += dt * 9 * (dir > 0 ? 1 : -1);
      for (const p of plates) {
        const start = (dir > 0 ? 1 - p.ext : p.ext) * 0.32 + p.h * 0.14, lt = Math.max(0, Math.min(1, (tt - start) / 0.54)), pulse = Math.sin(Math.PI * lt);
        if (pulse < 0.001) { p.bone.position.copy(p.c); p.bone.quaternion.identity(); p.bone.scale.set(1, 1, 1); continue; }
        const lift = (0.05 + 0.16 * p.size) * Math.pow(pulse, 0.8); p.bone.position.copy(p.c).addScaledVector(p.out, lift);
        ax.copy(p.out).cross(Y); if (ax.lengthSq() < 1e-4) ax.copy(X); ax.normalize();
        p.bone.quaternion.setFromAxisAngle(ax, (0.8 + p.h * 0.9) * pulse * (p.h > 0.5 ? 1 : -1)); p.bone.scale.setScalar(1 - 0.1 * pulse);
      }
      const g = Math.pow(Math.sin(Math.PI * Math.max(0, Math.min(1, (tt - 0.06) / 0.88))), 0.7);
      gears.visible = g > 0.02; if (!gears.visible) return;
      root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert();
      G.forEach((d, i) => { const b = by.get(d.bone)!; m4.copy(inv).multiply(b.matrixWorld); ps.set(...d.off); qs.setFromAxisAngle(X, spin * (i % 2 ? -1 : 1) * (1 + (i % 3) * 0.3)); sc.setScalar(d.r * g); m4.multiply(new THREE.Matrix4().compose(ps, qs, sc)); gears.setMatrixAt(i, m4); });
      gears.instanceMatrix.needsUpdate = true;
    },
    dispose() { gears.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
export const plateHash = hash;
