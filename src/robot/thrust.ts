import * as THREE from 'three/webgpu';
import { uv, vec3, mix, smoothstep, float, uniform, uniformArray, time, sin, fract, step, attribute, instanceIndex, instancedBufferAttribute, positionLocal, Fn } from 'three/tsl';
import type { FlightProfile } from './types';

const MAXN = 4;
/**
 * Per-type jet thrust, 3 draws total whatever the nozzle count:
 *  - flames: ONE additive InstancedMesh (one instance per nozzle). Each instance is a merged white-hot core cone, an
 *    orange outer plume and a faint wobbling heat-haze sheath (layer attribute). Colours core -> mid -> edge come from
 *    the type's FlightProfile (Worker: green-tinted regen core); length and whiteness grow with throttle.
 *  - smoke / dust / spray: one instanced puff pool (Heavy kicks up a big dust ring).
 *  - sparks: one additive instanced pool of hot streaks shed from the nozzles.
 * Plus one point light (the whole fire budget: 1 light, 4 draws, no per-frame allocations beyond the pools).
 * Fire: a white-blue hot core inside a hotter orange cone that stretches and flickers with throttle (short at idle, long in
 * BURST), a faint heat-haze sheath (opacity shimmer, no refraction pass), sparks + slow embers, smoke trails, and dust / scorch
 * puffs on the ground at take-off and landing. Heavy (`soft`) gets wide, slow, low-pressure plumes. Glitch (`plume: 'cubes'`) has
 * no fire at all: a steady violet/magenta exhaust of tiny emissive voxel cubes (4th draw, positions computed in the vertex shader).
 */
export function createThrust(scene: THREE.Scene, _count = MAXN) {
  const uBurst = uniform(0), uPow = uniform(0), uSoft = uniform(0), uHot = uniform(new THREE.Color('#b8d8ff')), uCore = uniform(new THREE.Color()), uMid = uniform(new THREE.Color()), uEdge = uniform(new THREE.Color());
  let F: FlightProfile = { style: 'scout', flame: 1, width: 1, core: '#fff6e0', mid: '#ffb347', edge: '#ff5a14', pulse: 0, dust: 1, launch: 0, bob: 0, smoke: 1 };
  const flameMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  { const v = uv().y, layer = attribute('layer', 'float'); // v: 1 at nozzle, 0 at tip
    const isCore = step(0.5, layer).mul(float(1).sub(step(1.5, layer))), isHaze = step(1.5, layer); // layers are exact 0 / 1 / 2
    const seed = float(instanceIndex).mul(1.7);
    // outer plume: deep edge colour at the tip -> mid near the nozzle; core: mid -> white-hot; hotter with throttle
    const outer = mix(uEdge.mul(0.8), uMid.mul(0.85), smoothstep(0.25, 0.95, v));
    const core = mix(uMid, mix(uHot, uCore, smoothstep(0.55, 1.0, v)), smoothstep(0.1, 0.65, v.add(uPow.mul(0.2))));
    const hot = mix(uHot as any, vec3(1, 1, 1), smoothstep(0.4, 1.0, v));
    const diamonds = smoothstep(0.55, 0.95, sin(v.mul(46).sub(time.mul(4))).mul(0.5).add(0.5)).mul(smoothstep(0.1, 0.6, v)).mul(1.4).mul(float(1).sub(uSoft.mul(0.85)));
    const turb = sin(v.mul(23).sub(time.mul(float(31).sub(uSoft.mul(18)))).add(seed)).mul(float(0.12).sub(uSoft.mul(0.05))).add(sin(time.mul(float(53).sub(uSoft.mul(30))).add(seed)).mul(0.08)).add(0.9);
    const base = mix(outer, core.mul(1.5), isCore);
    const col = mix(base, hot.mul(diamonds.add(0.75)), uBurst.mul(float(1).sub(isHaze)));
    flameMat.colorNode = mix(col.mul(turb).mul(0.95), uEdge.mul(0.3), isHaze);
    flameMat.opacityNode = mix(smoothstep(0.0, 0.5, v).mul(mix(float(0.5), float(0.95), isCore)), smoothstep(0, 0.7, v).mul(float(1).sub(v).mul(4).min(1)).mul(sin(v.mul(19).add(time.mul(27)).add(seed)).mul(0.5).add(0.6)).mul(sin(v.mul(7).sub(time.mul(9)).add(seed.mul(2))).mul(0.4).add(0.8)).mul(0.06), isHaze);
    // (no positionNode: on an InstancedMesh it would run after the instance transform; the haze shimmers in opacity)
  }
  const layers: [THREE.BufferGeometry, number][] = [
    [new THREE.ConeGeometry(0.1, 1, 12, 6, true).translate(0, -0.5, 0), 0],
    [new THREE.ConeGeometry(0.05, 0.6, 10, 4, true).translate(0, -0.3, 0), 1],
    [new THREE.CylinderGeometry(0.13, 0.05, 1.3, 10, 6, true).translate(0, -0.65, 0), 2],
  ];
  const merged = new THREE.BufferGeometry();
  { const pos: number[] = [], u: number[] = [], ly: number[] = [], idx: number[] = [];
    for (const [g, l] of layers) { const o = pos.length / 3; pos.push(...(g.attributes.position.array as Float32Array)); u.push(...(g.attributes.uv.array as Float32Array));
      for (let i = 0; i < g.attributes.position.count; i++) ly.push(l); for (const i of g.index!.array) idx.push(i + o); g.dispose(); }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    merged.setAttribute('layer', new THREE.Float32BufferAttribute(ly, 1)); merged.setIndex(idx); }
  const flames = new THREE.InstancedMesh(merged, flameMat, MAXN); flames.frustumCulled = false; flames.renderOrder = 5; flames.count = 0; scene.add(flames);
  flames.name = 'thrust:flames';
  // ---- Glitch plume: tiny emissive voxel cubes shed from the nozzles, drift, shrink, fade (additive, steady; GPU positions)
  const CN = 420, uNoz = uniformArray(Array.from({ length: MAXN }, () => new THREE.Vector3()), 'vec3'), uDir = uniformArray(Array.from({ length: MAXN }, () => new THREE.Vector3(0, -1, 0)), 'vec3');
  const uPlume = uniform(0), uPLen = uniform(1), uPVel = uniform(new THREE.Vector3()), uVio = uniform(new THREE.Color('#8a3cff')), uMag = uniform(new THREE.Color('#ff2fb0'));
  const cubeSeed = new Float32Array(CN), cubeNoz = new Float32Array(CN);
  for (let i = 0; i < CN; i++) { cubeSeed[i] = Math.random(); cubeNoz[i] = i % 2; }
  const plumeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  {
    const aS: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(cubeSeed, 1), 'float'), aN: any = instancedBufferAttribute(new THREE.InstancedBufferAttribute(cubeNoz, 1), 'float');
    const hs = (k: number) => fract(sin(aS.add(k).mul(12.9898)).mul(43758.5453));
    const ph = fract(time.mul(hs(1).mul(0.9).add(1.1)).add(hs(2).mul(7)));
    const size = smoothstep(0, 0.04, ph).mul(float(1).sub(ph).pow(1.3)).mul(hs(3).mul(0.8).add(0.5)).mul(0.04).mul(uPlume);
    plumeMat.positionNode = Fn(() => {
      const ni = aN.toInt(), base: any = (uNoz as any).element(ni), dir: any = (uDir as any).element(ni);
      const spread = vec3(hs(4).sub(0.5), hs(5).sub(0.5).mul(0.4), hs(6).sub(0.5)).mul(ph.mul(0.7).add(0.06));
      const p = base.add(dir.mul(ph.mul(hs(7).mul(0.5).add(0.75)).mul(uPLen))).add(spread).sub((uPVel as any).mul(ph.mul(0.025))).add(vec3(0, ph.mul(0.12), 0));
      return (positionLocal as any).mul(size).add(p);
    })();
    plumeMat.colorNode = mix(uVio, uMag, step(0.55, hs(8))).mul(float(1).sub(ph.mul(0.8))).mul(2.4).mul(hs(9).mul(0.5).add(0.75));
  }
  const plume = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plumeMat, CN); plume.name = 'thrust:cubes'; plume.frustumCulled = false; plume.renderOrder = 5;
  { const id = new THREE.Matrix4(); for (let i = 0; i < CN; i++) plume.setMatrixAt(i, id); } scene.add(plume);
  let src: THREE.Object3D[] = [];
  const light = new THREE.PointLight(0xff8a30, 0, 14, 2); const lc0 = new THREE.Color(0xff8a30), lc1 = new THREE.Color(0xbfe4ff); scene.add(light);

  const N = 220, puffGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const puffMat = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.38, depthWrite: false });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, N); puffs.frustumCulled = false; puffs.count = N;
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.3, g: 1 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) { puffs.setMatrixAt(i, m4.makeScale(0, 0, 0)); puffs.setColorAt(i, c.set(0x222222)); }
  scene.add(puffs);
  // sparks: stretched additive boxes aligned to their velocity
  const SN = 200, sparkMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), sparkMat, SN); sparks.frustumCulled = false; sparks.name = 'thrust:sparks';
  const S = Array.from({ length: SN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, ember: false }));
  for (let i = 0; i < SN; i++) { sparks.setMatrixAt(i, m4.makeScale(0, 0, 0)); sparks.setColorAt(i, c.set(0xffffff)); }
  scene.add(sparks);
  let tAbs = 0, wasOn = false;
  let next = 0, sNext = 0, acc = 0, sAcc = 0, pulseT = 0, pulseV = 0;
  const emit = (p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, col: number | THREE.Color) => {
    const i = next, o = P[i]; next = (next + 1) % N; o.p.copy(p); o.v.copy(v); o.life = o.max = life; o.s = size; o.g = grow; puffs.setColorAt(i, typeof col === 'number' ? c.set(col) : c.copy(col));
  };
  const ringV = new THREE.Vector3(), ringP = new THREE.Vector3();
  const puffRing = (at: THREE.Vector3, ground: number, k: number, water: boolean) => {
    const n = Math.round(26 * k * Math.min(1.8, 0.6 + F.dust * 0.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = (3 + Math.random() * 3.5) * Math.sqrt(Math.max(0.4, F.dust)) * k;
      ringP.set(at.x + Math.cos(a) * 0.3, ground + 0.12, at.z + Math.sin(a) * 0.3); ringV.set(Math.cos(a) * sp, 0.5 + Math.random() * 0.8, Math.sin(a) * sp);
      emit(ringP, ringV, 1.1 + Math.random() * 0.5, (water ? 0.16 : 0.26) * Math.sqrt(Math.max(0.5, F.dust)), water ? 1.4 : 3, water ? 0xc8d4e0 : (i % 3 === 0 ? 0x16161a : dustC)); // every 3rd puff is dark scorch
    }
  };
  const jit = new THREE.Vector3(), tmp = new THREE.Vector3(), dir = new THREE.Vector3(), rv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), fp = new THREE.Vector3(), fq = new THREE.Quaternion();
  const fpos: THREE.Vector3[] = [], fdir: THREE.Vector3[] = [], flen: number[] = []; for (let i = 0; i < MAXN; i++) { fpos.push(new THREE.Vector3()); fdir.push(new THREE.Vector3()); flen.push(0); }
  const midC = new THREE.Color(), dustC = new THREE.Color(0x6b6152);
  return {
    configure(f: FlightProfile) {
      F = f; uCore.value.set(f.core); uMid.value.set(f.mid); uEdge.value.set(f.edge); lc0.set(f.mid).lerp(new THREE.Color(f.edge), 0.4);
      uHot.value.set(f.hot ?? '#b8d8ff'); uSoft.value = f.soft ?? 0; uVio.value.set(f.mid); uMag.value.set(f.edge);
      if (f.plume === 'cubes') { lc0.set(f.mid).lerp(new THREE.Color(f.edge), 0.35); lc1.copy(lc0); } else lc1.set(0xbfe4ff);
    },
    /** power 0..1 per frame (0 hides), burst 0..1; ground = height under the robot, water = it's over sea. */
    update(dt: number, power: number, burst: number, vel: THREE.Vector3, ground: number | null, water: boolean) {
      const cubes = F.plume === 'cubes', fire = F.flame > 0 && !cubes, on = (fire || cubes) && power > 0.02;
      uBurst.value = burst; uPow.value = power; tAbs += dt;
      // take-off / landing: a radial dust + scorch puff when the jets light or cut within ~2 m of the ground
      const near = ground !== null && src[0] && src[0].getWorldPosition(fp).y - ground < 2.2;
      if (near && on && !wasOn) puffRing(fp, ground!, 1, water); else if (near && !on && wasOn && vel.y < 1) puffRing(fp, ground!, 0.7, water);
      wasOn = on;
      // Scout: quick throttle bursts (short spikes every ~0.2 s)
      pulseT -= dt; if (pulseT < 0) { pulseT = 0.12 + Math.random() * 0.22; pulseV = 1; } pulseV *= Math.exp(-dt * 14);
      let lx = 0, ly = 0, lz = 0, n = 0;
      for (let i = 0; i < Math.min(MAXN, src.length); i++) {
        const nz = src[i]; if (!on || !nz) continue;
        nz.getWorldPosition(fp); nz.getWorldQuaternion(fq); const k = (nz.userData.k as number) ?? 1;
        const fl = 1 + Math.sin(tAbs * 38 + i * 2.1) * 0.07 * (1 - (F.soft ?? 0) * 0.7) + Math.sin(tAbs * 91 + i) * 0.05;
        const len = (0.22 + power * 0.6 + burst * 1.45) * (1 + F.pulse * pulseV * 0.45) * F.flame * k * fl * (0.9 + Math.random() * (0.2 - (F.soft ?? 0) * 0.12));
        const wd = (1 + burst * 0.6 + power * 0.25) * F.width * Math.sqrt(k);
        flames.setMatrixAt(n, m4.compose(fp, fq, sc.set(wd, len, wd)));
        fpos[n].copy(fp); fdir[n].set(0, -1, 0).applyQuaternion(fq); flen[n] = len; n++;
        lx += fp.x; ly += fp.y; lz += fp.z;
      }
      flames.count = fire ? n : 0; flames.instanceMatrix.needsUpdate = true;
      if (cubes) { // steady plume: nozzle positions / directions go to the cube shader uniforms
        const nn = Math.min(MAXN, src.length);
        for (let i = 0; i < nn; i++) { const nz = src[i]; nz.getWorldPosition(fp); nz.getWorldQuaternion(fq); (uNoz.array[i] as THREE.Vector3).copy(fp); (uDir.array[i] as THREE.Vector3).set(0, -1, 0).applyQuaternion(fq); fpos[i].copy(fp); fdir[i].copy(uDir.array[i] as THREE.Vector3); lx += fp.x; ly += fp.y; lz += fp.z; n++; }
        uPlume.value += ((on ? 1 : 0) - uPlume.value) * (1 - Math.exp(-dt * 10)); uPLen.value = 0.9 + power * 0.5 + burst * 0.7; uPVel.value.copy(vel);
      } else uPlume.value = 0;
      if (n) light.position.set(lx / n, ly / n - 0.3, lz / n);
      light.color.copy(lc0).lerp(lc1, burst);
      light.intensity = on ? (cubes ? 4 + burst * 4 : (6 + burst * 10) * power * F.flame * (0.8 + Math.random() * 0.4) * (1 + F.pulse * pulseV * 0.5)) : 0;
      // emit smoke / trail / dust per jet, sparks scaled by throttle
      acc += dt * (on && fire ? (70 + burst * 90) * Math.min(1.6, F.smoke) : 0);
      sAcc += dt * (on && fire ? (25 + power * 70 + burst * 60) * Math.min(1.5, F.flame) : 0);
      midC.set(F.mid);
      const dustH = 6 * Math.sqrt(Math.max(0.3, F.dust));
      while (acc >= 1) { acc -= 1;
        for (let i = 0; i < n; i++) {
          dir.copy(fdir[i]); tmp.copy(fpos[i]).addScaledVector(dir, flen[i] * 0.9);
          rv.copy(vel).multiplyScalar(0.15).addScaledVector(dir, 2.5).add(jit.set((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6));
          if (burst > 0.2 && Math.random() < 0.5) emit(tmp, rv, 0.35, 0.18, 1.5, 0xdff1ff); // white-hot trail
          else if (Math.random() < F.smoke) emit(tmp, rv, 0.7 + Math.random() * 0.4, 0.12 * Math.sqrt(F.flame), 2.2, F.style === 'medic' ? 0x3a4a40 : 0x1c1c1e);
          if (ground !== null && fpos[i].y - ground < dustH && dir.y < -0.5 && Math.random() < 0.6 * Math.min(1.5, F.dust)) { // dust / spray where the jet hits
            const near = 1 - (fpos[i].y - ground) / dustH;
            for (let d = 0; d < (F.dust > 1.5 ? 2 : 1); d++) {
              const a = Math.random() * Math.PI * 2, s = (3 + Math.random() * 3) * (0.6 + near * 0.6) * Math.sqrt(F.dust);
              tmp.set(fpos[i].x, ground + 0.1, fpos[i].z); rv.set(Math.cos(a) * s, water ? 2.5 + Math.random() * 2 : 0.6 + F.dust * 0.4 * Math.random(), Math.sin(a) * s);
              emit(tmp, rv, 0.9 + F.dust * 0.25, (water ? 0.12 : 0.2) * Math.sqrt(F.dust), water ? 1.2 : 2.5 + F.dust * 0.5, water ? 0xc8d4e0 : dustC);
            }
          }
        }
      }
      while (sAcc >= 1 && n) { sAcc -= 1;
        const i = (Math.random() * n) | 0, si = sNext, o = S[si]; sNext = (sNext + 1) % SN;
        o.p.copy(fpos[i]).addScaledVector(fdir[i], flen[i] * (0.2 + Math.random() * 0.5));
        o.v.copy(fdir[i]).multiplyScalar(6 + Math.random() * 8 * (0.5 + power)).add(rv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5)).addScaledVector(vel, 0.6);
        const ember = Math.random() < 0.3; o.ember = ember; if (ember) o.v.multiplyScalar(0.35).y += 1.5;
        o.life = o.max = ember ? 0.9 + Math.random() * 0.9 : 0.18 + Math.random() * 0.3;
        sparks.setColorAt(si, c.copy(midC).lerp(new THREE.Color(F.core), Math.random() * 0.6).multiplyScalar(2.5));
      }
      for (let i = 0; i < N; i++) {
        const o = P[i]; if (o.life <= 0) { puffs.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        o.life -= dt; o.v.multiplyScalar(Math.exp(-dt * 2.5)); o.v.y += dt * 0.6; o.p.addScaledVector(o.v, dt);
        const k = 1 - o.life / o.max, s = Math.max(0, o.s * (1 + k * o.g) * (1 - k * k));
        puffs.setMatrixAt(i, m4.compose(o.p, q, sc.setScalar(s)));
      }
      for (let i = 0; i < SN; i++) {
        const o = S[i]; if (o.life <= 0) { sparks.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        o.life -= dt; o.v.y -= dt * (o.ember ? 1.2 : 9); o.v.multiplyScalar(Math.exp(-dt * 1.5)); o.p.addScaledVector(o.v, dt);
        const f = o.life / o.max, sp = o.v.length();
        q.setFromUnitVectors(Y, tmp.copy(o.v).normalize());
        sparks.setMatrixAt(i, m4.compose(o.p, q, o.ember ? sc.setScalar(0.014 * f + 0.003) : sc.set(0.012 * f + 0.004, Math.min(0.4, sp * 0.02) * f + 0.01, 0.012 * f + 0.004)));
      }
      q.identity();
      puffs.instanceMatrix.needsUpdate = true; if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
      sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    },
    attach(nozzles: THREE.Object3D[]) { src = nozzles.slice(0, MAXN); },
    setVisible(v: boolean) { puffs.visible = v; sparks.visible = v; flames.visible = v; plume.visible = v; if (!v) { flames.count = 0; light.intensity = 0; } },
  };
}
export type Thrust = ReturnType<typeof createThrust>;
