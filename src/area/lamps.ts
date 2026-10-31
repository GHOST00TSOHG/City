import * as THREE from 'three/webgpu';
import { uniform, attribute, vertexColor, vec3, uv, length, smoothstep, float, distance, cameraPosition, positionWorld, exp } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Terrain } from './data';

const POLE_H = 6.2, ARM = 1.5;

/** Street lamps: one instanced draw call for the posts (small warm lens, no sprite or halo),
 *  one for soft warm light pools on the ground that fade out with camera distance, so they never read as discs from the air. */
export function buildLamps(lamps: number[][], terrain: Terrain) {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, c: number, glow = 0) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { col.set([cc.r, cc.g, cc.b], i * 3); gl[i] = glow; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    g.deleteAttribute('uv'); return g;
  };
  const metal = 0x3a3d40;
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.11, POLE_H, 8, 1, true).translate(0, POLE_H / 2, 0), metal));
  parts.push(paint(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8).translate(0, 0.25, 0), metal));
  parts.push(paint(new THREE.CylinderGeometry(0.035, 0.035, ARM, 6).rotateZ(Math.PI / 2).translate(ARM / 2, POLE_H - 0.05, 0), metal));
  parts.push(paint(new THREE.BoxGeometry(0.62, 0.14, 0.3).translate(ARM, POLE_H - 0.06, 0), 0x2e3134));
  parts.push(paint(new THREE.BoxGeometry(0.5, 0.02, 0.22).translate(ARM, POLE_H - 0.14, 0), 0xffe2b0, 1)); // lens, facing down
  const geo = mergeGeometries(parts)!;
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  mat.emissiveNode = vec3(1.0, 0.78, 0.5).mul(attribute('glow', 'float')).mul(2.2);
  const posts = new THREE.InstancedMesh(geo, mat, lamps.length); posts.name = 'lamps';

  const pool = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const r = length(uv().sub(0.5)).mul(2);
  const fall = exp(r.mul(r).mul(-4.5)).mul(float(1).sub(smoothstep(0.75, 1, r)));
  const near = float(1).sub(smoothstep(90, 260, distance(cameraPosition, positionWorld)));
  const uWet = uniform(0), uFog = uniform(0);
  // wet ground reflects the lamp as a stronger, tighter glint; fog widens the glow
  pmat.colorNode = vec3(1.0, 0.7, 0.4).mul(fall.add(exp(r.mul(r).mul(-14)).mul(uWet.mul(0.9)))).mul(near).mul(float(0.3).add(uFog.mul(0.12)));
  const pools = new THREE.InstancedMesh(pool, pmat, lamps.length); pools.name = 'lamp pools'; pools.renderOrder = 2;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1);
  lamps.forEach((l, i) => {
    const x = l[0] / 10, z = l[1] / 10, a = (l[3] ?? 0) / 1000, y = Math.max(terrain.heightAt(x, z), 0.1);
    q.setFromAxisAngle(Y, -a);
    posts.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, s1));
    const hx = x + Math.cos(a) * ARM, hz = z + Math.sin(a) * ARM;
    pools.setMatrixAt(i, m.compose(new THREE.Vector3(hx, Math.max(terrain.heightAt(hx, hz), 0.1) + 0.04, hz), q, new THREE.Vector3(17, 1, 17)));
  });
  posts.computeBoundingSphere(); pools.computeBoundingSphere();
  void positionWorld; void vertexColor;
  return { posts, pools, uWet, uFog };
}
