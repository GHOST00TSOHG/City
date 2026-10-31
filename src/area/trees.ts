import * as THREE from 'three/webgpu';
import { attribute, positionLocal, vec3, sin, float, time, uniform, texture, uv, instanceColor } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
function palm(hi: boolean) {
  const lean = 0.9, parts = [trunk(9.4, 0.24, 0.16, hi ? 7 : 4, lean)];
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

export function buildTrees(flat: number[], terrain: Terrain) {
  const tex = atlas(), uWind = uniform(1);
  const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
  const t = texture(tex, uv());
  mat.colorNode = t.rgb.mul(instanceColor);
  mat.opacityNode = t.a;
  // wind: sway grows with height² (from the untransformed geometry), plus a faster flutter at canopy tips
  const h = attribute('position', 'vec3').y.div(10), p = positionLocal;
  const ph = p.x.mul(0.045).add(p.z.mul(0.03));
  const sway = sin(time.mul(1.1).add(ph)).mul(0.22).add(sin(time.mul(2.3).add(ph.mul(1.7))).mul(0.07)).mul(h.mul(h)).mul(uWind);
  const flutter = sin(time.mul(5.5).add(p.x.mul(1.3)).add(p.z.mul(1.1))).mul(0.05).mul(h.mul(h).mul(h)).mul(uWind);
  mat.positionNode = p.add(vec3(sway.add(flutter), flutter.mul(0.6), sway.mul(0.6).sub(flutter)));
  const geos = [[palm(true), palm(false)], [broad(true), broad(false)]];
  const N = flat.length / 5, mats = new Float32Array(N * 16), cols = new Float32Array(N * 3), kind = new Uint8Array(N), xz = new Float32Array(N * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const counts = [0, 0];
  for (let i = 0; i < N; i++) {
    const x = flat[i * 5] / 10, z = flat[i * 5 + 1] / 10, k = flat[i * 5 + 2], hh = flat[i * 5 + 3] / 10, sd = flat[i * 5 + 4] / 255;
    const sc = hh / 10, w = sc * (0.85 + sd * 0.3);
    q.setFromAxisAngle(Y, sd * Math.PI * 2);
    m.compose(new THREE.Vector3(x, terrain.heightAt(x, z) - 0.1, z), q, new THREE.Vector3(w, sc, w)).toArray(mats, i * 16);
    col.setHSL(0, 0, 1).multiplyScalar(0.8 + sd * 0.35); if (k === 1) col.g *= 1.05;
    cols.set([col.r * (k ? 0.95 : 1.02), col.g, col.b * 0.92], i * 3); kind[i] = k; xz[i * 2] = x; xz[i * 2 + 1] = z; counts[k]++;
  }
  const meshes = geos.map((pair, k) => pair.map((g, lod) => {
    const im = new THREE.InstancedMesh(g, mat, counts[k]); im.count = 0; im.frustumCulled = false;
    im.name = `trees ${k ? 'broad' : 'palm'} ${lod ? 'lo' : 'hi'}`;
    im.setColorAt(0, col); return im;
  }));
  const group = new THREE.Group(); meshes.flat().forEach(mm => group.add(mm));
  const NEAR = 170, FAR = 3200, last = new THREE.Vector3(1e9, 0, 0);
  function update(cam: THREE.Vector3) {
    if (cam.distanceTo(last) < 12) return; last.copy(cam);
    const c = [[0, 0], [0, 0]];
    for (let i = 0; i < N; i++) {
      const dx = xz[i * 2] - cam.x, dz = xz[i * 2 + 1] - cam.z, d = Math.hypot(dx, dz, cam.y * 0.5);
      if (d > FAR) continue;
      const lod = d < NEAR ? 0 : 1, im = meshes[kind[i]][lod], j = c[kind[i]][lod]++;
      (im.instanceMatrix.array as Float32Array).set(mats.subarray(i * 16, i * 16 + 16), j * 16);
      (im.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), j * 3);
    }
    meshes.forEach((pair, k) => pair.forEach((im, lod) => { im.count = c[k][lod]; im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; }));
  }
  return { group, update, uWind, triangles: () => meshes.flat().reduce((s, im) => s + im.count * (im.geometry.attributes.position.count / 3), 0) };
}
