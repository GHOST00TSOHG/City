import * as THREE from 'three/webgpu';
import { attribute, vec3, uniform, positionLocal, sin, float } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Terrain } from './data';

/** FICTIONAL "City Ferry" dock (original design, not based on any real dock; see knowledge/JONN-LANDMARKS.md #20):
 *  a timber pier on piles, a small glazed shelter and a moored ferry that bobs. Two draw calls (dock, ferry). */
export function buildFerryDock(dock: { x: number; z: number; a: number }, terrain: Terrain) {
  const x = dock.x / 10, z = dock.z / 10, ang = dock.a / 1000; // a = heading from shore out to water (rad, +x east, +z south)
  const paint = (g: THREE.BufferGeometry, c: number, glow = 0) => {
    const n = g.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) col.set([cc.r, cc.g, cc.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('glow', new THREE.BufferAttribute(gl, 1)); g.deleteAttribute('uv'); return g;
  };
  const deckY = 1.6, L = 42, W = 7;
  const p: THREE.BufferGeometry[] = [];
  p.push(paint(new THREE.BoxGeometry(L, 0.4, W).translate(L / 2 - 4, deckY, 0), 0x6b5a48)); // pier deck (local +x = out over water)
  p.push(paint(new THREE.BoxGeometry(14, 0.4, 16).translate(L - 4 + 7, deckY, 0), 0x6b5a48)); // T-head float
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) p.push(paint(new THREE.CylinderGeometry(0.22, 0.22, 7, 6).translate(-4 + i * (L + 10) / 8, deckY - 3.3, s * (W / 2 - 0.3)), 0x3d342b));
  for (let i = 0; i <= 10; i++) for (const s of [-1, 1]) p.push(paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(-4 + i * L / 10, deckY + 0.7, s * (W / 2 - 0.1)), 0x2f3236));
  for (const s of [-1, 1]) p.push(paint(new THREE.BoxGeometry(L, 0.06, 0.06).translate(L / 2 - 4, deckY + 1.2, s * (W / 2 - 0.1)), 0x2f3236));
  // shelter: posts, glass, lit sign band ("City Ferry", fictional: no real operator's branding)
  p.push(paint(new THREE.BoxGeometry(9, 0.25, 6).translate(L + 3, deckY + 3.3, 0), 0x2b2e33));
  for (const [dx, dz] of [[-4.2, -2.7], [4.2, -2.7], [-4.2, 2.7], [4.2, 2.7]]) p.push(paint(new THREE.BoxGeometry(0.18, 3.1, 0.18).translate(L + 3 + dx, deckY + 1.75, dz), 0x2b2e33));
  p.push(paint(new THREE.BoxGeometry(8.4, 2.6, 0.05).translate(L + 3, deckY + 1.5, -2.7), 0x8fb4c4, 0.15));
  p.push(paint(new THREE.BoxGeometry(5.5, 0.7, 0.12).translate(L + 3, deckY + 3.85, 3.0), 0xf0e6c8, 1.6)); // sign band
  for (const dz of [-6, 6]) p.push(paint(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 6).translate(L + 9, deckY + 1.8, dz), 0x2f3236), paint(new THREE.SphereGeometry(0.22, 8, 6).translate(L + 9, deckY + 3.7, dz), 0xffe2b0, 3));
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  mat.emissiveNode = vec3(1.0, 0.82, 0.58).mul(attribute('glow', 'float'));
  const dockMesh = new THREE.Mesh(mergeGeometries(p)!, mat); dockMesh.name = 'ferry-dock';

  // ferry: ~34 m double-deck passenger boat moored along the T-head
  const f: THREE.BufferGeometry[] = [];
  f.push(paint(new THREE.BoxGeometry(30, 2.2, 9).translate(0, 0.4, 0), 0xe8e8e4));
  f.push(paint(new THREE.CylinderGeometry(4.5, 4.5, 2.2, 12, 1, false, 0, Math.PI).rotateY(Math.PI).translate(15, 0.4, 0), 0xe8e8e4));
  f.push(paint(new THREE.BoxGeometry(31, 0.5, 9.4).translate(0, -0.6, 0), 0x2a3a4e));
  f.push(paint(new THREE.BoxGeometry(22, 2.4, 8).translate(-2, 2.7, 0), 0xf2f2ee));
  f.push(paint(new THREE.BoxGeometry(21.6, 1.1, 8.1).translate(-2, 2.9, 0), 0xffe7bd, 1.1)); // lit window band
  f.push(paint(new THREE.BoxGeometry(14, 2.2, 7).translate(-4, 5.0, 0), 0xf2f2ee));
  f.push(paint(new THREE.BoxGeometry(13.6, 0.9, 7.1).translate(-4, 5.2, 0), 0xffe7bd, 0.9));
  f.push(paint(new THREE.BoxGeometry(4, 1.6, 5).translate(4, 6.8, 0), 0x30343a));
  f.push(paint(new THREE.SphereGeometry(0.25, 8, 6).translate(4, 8.0, 0), 0xffffff, 3));
  const fmat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  const uT = uniform(0);
  fmat.positionNode = positionLocal.add(vec3(0, sin(uT.mul(0.9)).mul(0.12), 0));
  fmat.emissiveNode = vec3(1.0, 0.85, 0.6).mul(attribute('glow', 'float')).mul(float(1));
  const ferry = new THREE.Mesh(mergeGeometries(f)!, fmat); ferry.name = 'ferry';

  const group = new THREE.Group(); group.name = 'ferry-dock';
  const y = Math.max(terrain.heightAt(x, z), 0) + 0; // dock sits at the shore line, deck ~1.6 m above water
  dockMesh.position.set(x, 0, z); dockMesh.rotation.y = -ang;
  const c = Math.cos(ang), s = Math.sin(ang), fx = L + 3, fz = 13.5; // berth beside the T-head
  ferry.position.set(x + c * fx - s * fz, 0.35, z + s * fx + c * fz); ferry.rotation.y = -ang;
  group.add(dockMesh, ferry);
  void y;
  return { group, update(t: number) { uT.value = t; ferry.rotation.z = Math.sin(t * 0.7) * 0.012; } };
}
