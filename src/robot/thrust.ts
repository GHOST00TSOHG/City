import * as THREE from 'three/webgpu';
import { uv, vec3, mix, smoothstep, float, uniform, time, sin } from 'three/tsl';

/**
 * Boot thrust: flickering yellow-orange additive flame cones (inner core + outer), one shared point light,
 * fast-fading dark smoke plus ground dust / water spray from one instanced pool. 2 flame draws + 1 particle draw.
 */
export function createThrust(scene: THREE.Scene, count: number) {
  const uBurst = uniform(0);
  const flameMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  { const v = uv().y; // 1 at nozzle, 0 at tip
    const core = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.92, 0.6), smoothstep(0.55, 1.0, v));
    const flick = sin(time.mul(53)).mul(0.08).add(0.92);
    // BURST: white-hot core with blue edge and standing shock diamonds (bright bands along the jet)
    const hot = mix(vec3(0.75, 0.88, 1.0), vec3(1, 1, 1), smoothstep(0.4, 1.0, v));
    const diamonds = smoothstep(0.55, 0.95, sin(v.mul(46).sub(time.mul(4))).mul(0.5).add(0.5)).mul(smoothstep(0.1, 0.6, v)).mul(1.4);
    flameMat.colorNode = mix(core, hot.mul(diamonds.add(0.75)), uBurst).mul(flick).mul(2.2);
    flameMat.opacityNode = smoothstep(0.0, 0.5, v).mul(float(0.9)); }
  const geo = new THREE.ConeGeometry(0.06, 1, 10, 1, true).translate(0, -0.5, 0);
  const inner = new THREE.ConeGeometry(0.03, 0.6, 8, 1, true).translate(0, -0.3, 0);
  const merged = new THREE.BufferGeometry();
  { const a = [geo, inner]; const pos: number[] = [], u: number[] = [], idx: number[] = [];
    for (const g of a) { const o = pos.length / 3; pos.push(...(g.attributes.position.array as Float32Array)); u.push(...(g.attributes.uv.array as Float32Array)); for (const i of g.index!.array) idx.push(i + o); g.dispose(); }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); merged.setIndex(idx); }
  const flames = Array.from({ length: count }, () => { const m = new THREE.Mesh(merged, flameMat); m.frustumCulled = false; m.renderOrder = 5; scene.add(m); return m; });
  const light = new THREE.PointLight(0xff8a30, 0, 14, 2); const lc0 = new THREE.Color(0xff8a30), lc1 = new THREE.Color(0xbfe4ff); scene.add(light);

  const N = 220, puffGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const puffMat = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.38, depthWrite: false });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, N); puffs.frustumCulled = false; puffs.count = N;
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.3, g: 1 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) { puffs.setMatrixAt(i, m4.makeScale(0, 0, 0)); puffs.setColorAt(i, c.set(0x222222)); }
  scene.add(puffs);
  let next = 0, acc = 0;
  const emit = (p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, col: number) => {
    const i = next, o = P[i]; next = (next + 1) % N; o.p.copy(p); o.v.copy(v); o.life = o.max = life; o.s = size; o.g = grow; puffs.setColorAt(i, c.set(col));
  };
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), rv = new THREE.Vector3();
  return {
    /** power 0..1 per frame (0 hides), burst 0..1; ground = height under the robot, water = it's over sea. */
    update(dt: number, power: number, burst: number, vel: THREE.Vector3, ground: number | null, water: boolean) {
      uBurst.value = burst;
      let lx = 0, ly = 0, lz = 0;
      flames.forEach((f, i) => {
        const nz = (f.userData.src as THREE.Object3D | undefined); f.visible = power > 0.02 && !!nz; if (!nz) return;
        nz.getWorldPosition(f.position); nz.getWorldQuaternion(f.quaternion);
        const len = (0.35 + power * 0.55 + burst * 1.1) * (0.82 + Math.random() * 0.36);
        f.scale.set(1 + burst * 0.6, len, 1 + burst * 0.6); lx += f.position.x; ly += f.position.y; lz += f.position.z;
      });
      if (flames.length) light.position.set(lx / flames.length, ly / flames.length - 0.3, lz / flames.length);
      light.color.copy(lc0).lerp(lc1, burst); light.intensity = power > 0.02 ? (6 + burst * 10) * power * (0.8 + Math.random() * 0.4) : 0;
      // emit
      acc += dt * (power > 0.02 ? 70 + burst * 90 : 0);
      while (acc >= 1) { acc -= 1;
        for (const f of flames) { if (!f.visible) continue;
          dir.set(0, -1, 0).applyQuaternion(f.quaternion); tmp.copy(f.position).addScaledVector(dir, f.scale.y * 0.9);
          rv.copy(vel).multiplyScalar(0.15).addScaledVector(dir, 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6));
          if (burst > 0.2 && Math.random() < 0.5) emit(tmp, rv, 0.35, 0.18, 1.5, 0xdff1ff); // white-hot trail
          else emit(tmp, rv, 0.7 + Math.random() * 0.4, 0.12, 2.2, 0x1c1c1e);
          if (ground !== null && f.position.y - ground < 6 && Math.random() < 0.6) { // dust / spray where the jet hits
            const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 3;
            tmp.set(f.position.x, ground + 0.1, f.position.z); rv.set(Math.cos(a) * s, water ? 2.5 + Math.random() * 2 : 0.6, Math.sin(a) * s);
            emit(tmp, rv, 0.9, water ? 0.12 : 0.2, water ? 1.2 : 2.5, water ? 0xc8d4e0 : 0x6b6152);
          }
        }
      }
      for (let i = 0; i < N; i++) {
        const o = P[i]; if (o.life <= 0) { puffs.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        o.life -= dt; o.v.multiplyScalar(Math.exp(-dt * 2.5)); o.v.y += dt * 0.6; o.p.addScaledVector(o.v, dt);
        const k = 1 - o.life / o.max, s = Math.max(0, o.s * (1 + k * o.g) * (1 - k * k));
        puffs.setMatrixAt(i, m4.compose(o.p, q, sc.setScalar(s)));
      }
      puffs.instanceMatrix.needsUpdate = true; if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
    },
    attach(nozzles: THREE.Object3D[]) { flames.forEach((f, i) => (f.userData.src = nozzles[i])); },
    setVisible(v: boolean) { puffs.visible = v; if (!v) { flames.forEach((f) => (f.visible = false)); light.intensity = 0; } },
  };
}
