import * as THREE from 'three/webgpu';
import { attribute, vec3, float, positionWorld, normalWorld, cos, sin, dot, fract, floor, smoothstep, mix, time, positionLocal, instanceIndex, vec2 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AreaData, Terrain } from './data';
import { Soup, flatPoly } from './geom';
import { planDocks, deckAt, type DockPlan } from './dockPlan';

const WOOD = new THREE.Color(0x8a7458), FASCIA = new THREE.Color(0x4f4234), UNDER = new THREE.Color(0x2a231c);
const BOAT = [0xf0f0ec, 0x1f3556, 0xa8322e, 0x2a7f86, 0xe3d6b0, 0x3a3d42].map((h) => new THREE.Color(h));

function paint(g: THREE.BufferGeometry, c: number) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3), cc = new THREE.Color(c);
  for (let i = 0; i < n; i++) col.set([cc.r, cc.g, cc.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
}

/** Procedural boat docks fitted to every pier / boardwalk in the bake: plank decking (shader seams, follows the ground on land),
 *  timber pilings to the seabed, cleats, rubber bumpers, ladders and a few moored boats. Everything repeated is instanced:
 *  deck 1 + pilings 1 + cleats 1 + bumpers 1 + ladders 1 + hulls 1 + cabins 1 = 7 draw calls per area. */
export function buildDocks(piers: AreaData['piers'], t: Terrain, plan: DockPlan = planDocks(piers, t)) {
  const group = new THREE.Group(); group.name = 'docks';
  // ---- decking ----
  const s = new Soup(), dirs: number[] = [];
  for (const d of plan.decks) {
    const v0 = s.p.length / 3;
    let area = 0; for (let i = 0; i < d.pts.length; i++) { const p = d.pts[i], q = d.pts[(i + 1) % d.pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    flatPoly(s, d.pts, [], (x, z) => deckAt(t, x, z), WOOD);
    flatPoly(s, d.pts, [], (x, z) => deckAt(t, x, z) - 0.32, UNDER, true);
    for (let i = 0; i < d.pts.length; i++) {
      const [x0, z0] = d.pts[i], [x1, z1] = d.pts[(i + 1) % d.pts.length], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, sg = area >= 0 ? 1 : -1;
      if (l < 0.05) continue;
      s.quad([x0, deckAt(t, x0, z0), z0], [x1, deckAt(t, x1, z1), z1], [x1, deckAt(t, x1, z1) - 0.32, z1], [x0, deckAt(t, x0, z0) - 0.32, z0], FASCIA, [dz / l * sg, 0, -dx / l * sg]);
    }
    const n = s.p.length / 3 - v0; for (let i = 0; i < n; i++) dirs.push(d.dir);
  }
  if (!s.empty) {
    const g = s.geometry(); g.setAttribute('pdir', new THREE.Float32BufferAttribute(dirs, 1));
    const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    const ang = attribute('pdir', 'float'), p = positionWorld, across = dot(p.xz, vec2(sin(ang).negate(), cos(ang))).div(0.2), along = dot(p.xz, vec2(cos(ang), sin(ang)));
    const plank = floor(across), tone = fract(sin(plank.mul(12.9898).add(floor(along.div(2.4).add(plank.mul(0.37))).mul(78.233))).mul(43758.5453)); // per-plank tone, staggered butt joints
    const seam = smoothstep(0.86, 0.98, fract(across)).mul(0.45);
    const top = smoothstep(0.6, 0.9, normalWorld.y);
    mat.colorNode = mix(vec3(1, 1, 1), vec3(0.78, 0.72, 0.66).add(vec3(0.3, 0.26, 0.22).mul(tone)).mul(float(1).sub(seam)), top);
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'dock-decks'; group.add(mesh);
  }
  const mkInst = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1)); m.name = name; m.count = n; m.visible = n > 0; group.add(m); return m; };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  // ---- pilings (unit-height cylinders scaled to the bent) ----
  {
    const n = plan.pilings.length / 4;
    const geo = new THREE.CylinderGeometry(0.17, 0.2, 1, 7).translate(0, 0.5, 0); geo.deleteAttribute('uv');
    const mat = new THREE.MeshLambertNodeMaterial({ color: 0x5b4733 });
    mat.colorNode = mix(vec3(0.36, 0.28, 0.2), vec3(0.2, 0.22, 0.17), smoothstep(0.9, -0.2, positionWorld.y)); // weathered timber, green-black at the tide line
    const m = mkInst('dock-pilings', geo, mat, n);
    for (let i = 0; i < n; i++) { const o = i * 4, a = plan.pilings[o + 2], h = plan.pilings[o + 3] - a; const r = 0.85 + ((i * 2654435761) % 1000) / 1000 * 0.4; M.compose(V.set(plan.pilings[o], a, plan.pilings[o + 1]), Q.identity(), S.set(r, h, r)); m.setMatrixAt(i, M); }
  }
  const place = (m: THREE.InstancedMesh, arr: number[], stride: number, yaw: (o: number) => number) => {
    for (let i = 0; i < arr.length / stride; i++) { const o = i * stride; M.compose(V.set(arr[o], arr[o + 2], arr[o + 1]), Q.setFromAxisAngle(UPV, -yaw(o)), S.set(1, 1, 1)); m.setMatrixAt(i, M); }
  };
  // ---- cleats ----
  {
    const geo = mergeGeometries([paint(new THREE.BoxGeometry(0.34, 0.05, 0.12).translate(0, 0.025, 0), 0x9b9d9e), paint(new THREE.BoxGeometry(0.24, 0.06, 0.07).translate(0, 0.1, 0), 0x9b9d9e), paint(new THREE.BoxGeometry(0.07, 0.1, 0.07).translate(0, 0.06, 0), 0x8a8c8d)])!;
    const m = mkInst('dock-cleats', geo, new THREE.MeshLambertNodeMaterial({ vertexColors: true }), plan.cleats.length / 4);
    place(m, plan.cleats, 4, (o) => plan.cleats[o + 3]);
  }
  // ---- bumpers (rubber fenders hung on the outer face) ----
  {
    const geo = paint(new THREE.CapsuleGeometry(0.1, 0.9, 3, 8).rotateZ(Math.PI / 2), 0x1b1b1e);
    const m = mkInst('dock-bumpers', geo, new THREE.MeshLambertNodeMaterial({ vertexColors: true }), plan.bumpers.length / 4);
    place(m, plan.bumpers, 4, (o) => plan.bumpers[o + 3]);
  }
  // ---- ladders (rails + rungs, hanging into the water; local +x = outward) ----
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const sz of [-0.22, 0.22]) parts.push(paint(new THREE.BoxGeometry(0.05, 2.1, 0.05).translate(0.06, -0.85, sz), 0xb4b7b9), paint(new THREE.BoxGeometry(0.05, 0.42, 0.05).translate(0.0, 0.1, sz), 0xb4b7b9));
    for (let k = 0; k < 6; k++) parts.push(paint(new THREE.BoxGeometry(0.04, 0.04, 0.44).translate(0.06, -0.2 - k * 0.3, 0), 0xa3a6a8));
    const m = mkInst('dock-ladders', mergeGeometries(parts)!, new THREE.MeshLambertNodeMaterial({ vertexColors: true }), plan.ladders.length / 4);
    place(m, plan.ladders, 4, (o) => plan.ladders[o + 3]);
  }
  // ---- moored boats ----
  const nb = plan.boats.length / 5;
  {
    const hull = new THREE.BoxGeometry(1, 0.26, 0.34, 6, 1, 2);
    const pos = hull.attributes.position;
    for (let i = 0; i < pos.count; i++) { // pointed bow (+x), narrower keel, a little sheer
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), bow = Math.max(0, (x - 0.1) / 0.4);
      pos.setZ(i, z * (1 - Math.pow(bow, 1.6) * 0.96) * (y < 0 ? 0.62 : 1)); pos.setY(i, y + (x > 0 ? 0.03 * x : 0.0) + (y < 0 ? 0.0 : 0));
    }
    hull.deleteAttribute('uv'); hull.computeVertexNormals();
    const cabin = mergeGeometries([paint(new THREE.BoxGeometry(0.3, 0.17, 0.24).translate(-0.12, 0.215, 0), 0xf4f4f0), paint(new THREE.BoxGeometry(0.2, 0.06, 0.245).translate(-0.06, 0.235, 0), 0x1d2a33), paint(new THREE.BoxGeometry(0.32, 0.015, 0.26).translate(-0.12, 0.31, 0), 0xdadad4)])!;
    const hm = new THREE.MeshLambertNodeMaterial({ color: 0xffffff }), cm = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    const bob = vec3(0, sin(time.mul(0.9).add(float(instanceIndex).mul(1.7))).mul(0.025), 0);
    hm.positionNode = positionLocal.add(bob); cm.positionNode = positionLocal.add(bob);
    const hulls = mkInst('dock-boats', hull, hm, nb), cabins = mkInst('dock-boat-cabins', cabin, cm, nb);
    for (let i = 0; i < nb; i++) {
      const o = i * 5, len = plan.boats[o + 3];
      M.compose(V.set(plan.boats[o], len * 0.045, plan.boats[o + 1]), Q.setFromAxisAngle(UPV, -plan.boats[o + 2]), S.set(len, len, len));
      hulls.setMatrixAt(i, M); cabins.setMatrixAt(i, M); hulls.setColorAt(i, BOAT[plan.boats[o + 4] % BOAT.length]);
    }
  }
  group.traverse((o) => { o.frustumCulled = false; });
  return { group, plan };
}
