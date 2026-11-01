import * as THREE from 'three/webgpu';
import { uniform, uniformArray, instancedBufferAttribute, positionLocal, vec3, vec4, float, sin, cos, time, step, mix, max, fract, floor, smoothstep, cross, normalize, Fn } from 'three/tsl';
import type { RobotLook, PoseInput } from './model';

/**
 * shards.json (Glitch v5): bone-local voxel skin cubes in game frame: [x, y, z, hx, hy(blender z), hz(blender y), qx, qy, qz, qw, cat]
 * (cat 0 white skin = shell, 1 grey skin = shorts), plus `emit`: [bone, x, y, z] points on the head / neck / shoulders
 * that feed the drifting cube cloud.
 */
export interface ShardData {
  version: 2; shard?: 'cube' | 'octa'; tris_total: number; cube_head?: number;
  parts: { slot: string; opt: string; bone: string; shards: number[][] }[]; emit?: [string, number, number, number][];
}

const BOX = new THREE.BoxGeometry(2, 2, 2);
const hash = (x: any) => fract(sin(x.mul(12.9898)).mul(43758.5453));
const CLOUD = 520;

/**
 * The Glitch v5 body: the voxel skin (~2.2k cubes, ONE instanced draw) over the kit's dark machinery, a drifting cube cloud
 * that peels off the head and shoulders (ONE instanced draw, fully GPU: each cube rises, drifts outward, shrinks and
 * respawns), and a CPU particle pool for the blink-dash afterimage and reassembly burst: 3 draw calls.
 * Colours are garage slots: shell (white skin), shorts (grey skin), decalColor (cloud / burst), visor (dash glow).
 */
export function createGlitchBody(data: ShardData, boneNames: string[], root: THREE.Object3D, energy: any, damage: any) {
  const all = data.parts.flatMap((p, pi) => p.shards.map((s) => ({ s, pi, bi: Math.max(0, boneNames.indexOf(p.bone)) })));
  const n = all.length;
  const off = new Float32Array(n * 4), dim = new Float32Array(n * 4), quat = new Float32Array(n * 4), seeds = new Float32Array(n);
  all.forEach(({ s, pi, bi }, i) => {
    off.set([s[0], s[1], s[2], bi], i * 4); dim.set([s[3], s[5], s[4], s[10] + pi * 4], i * 4); quat.set([s[6], s[7], s[8], s[9]], i * 4);
    seeds[i] = Math.random();
  });
  const bOff = new THREE.InstancedBufferAttribute(off.slice(), 4), bDim = new THREE.InstancedBufferAttribute(dim.slice(), 4);
  const bQ = new THREE.InstancedBufferAttribute(quat.slice(), 4), bSeed = new THREE.InstancedBufferAttribute(seeds.slice(), 1);
  const aOff = instancedBufferAttribute(bOff, 'vec4') as any, aDim = instancedBufferAttribute(bDim, 'vec4') as any;
  const aQ = instancedBufferAttribute(bQ, 'vec4') as any, aSeed = instancedBufferAttribute(bSeed, 'float') as any;
  const boneMats = boneNames.map(() => new THREE.Matrix4()), uBones = uniformArray(boneMats, 'mat4');
  const vis = data.parts.map(() => 1), uVis = uniformArray(vis, 'float');
  const uFly = uniform(0), uDash = uniform(0), uBurst = uniform(0), uMosh = uniform(0), uCenter = uniform(new THREE.Vector3(0, 1.3, 0));
  const uWhite = uniform(new THREE.Color()), uGrey = uniform(new THREE.Color()), uGlow = uniform(new THREE.Color()), uPart = uniform(new THREE.Color());
  const cat = aDim.w.mod(4), part = floor(aDim.w.div(4)), seed = aSeed;

  // ---- voxel skin
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0 });
  mat.positionNode = Fn(() => {
    const q: any = aQ, lp0: any = (positionLocal as any).mul(aDim.xyz).mul(1.14).mul(uVis.element(part.toInt()));
    const fph0 = fract(time.mul(hash(seed.add(12)).mul(0.6).add(0.7)).add(seed.mul(7)));
    const lp: any = lp0.mul(float(1).sub(uFly.mul(step(0.25, hash(seed.add(13)))).mul(smoothstep(uCenter.y.add(0.15), uCenter.y.sub(0.55), (uBones.element(aOff.w.toInt()) as any).mul(vec4(aOff.xyz, 1)).y)).mul(fph0.mul(0.75))));
    const t: any = (cross as any)(q.xyz, lp).add(lp.mul(q.w)), rp: any = lp.add((cross as any)(q.xyz, t).mul(2));
    const home: any = (uBones.element(aOff.w.toInt()) as any).mul(vec4(rp.add(aOff.xyz), 1)).xyz.toVar();
    // flight: the lower body peels away as a looping stream of cubes trailing behind/below (root -Z / -Y), the rest stays whole
    const fph = fract(time.mul(hash(seed.add(12)).mul(0.6).add(0.7)).add(seed.mul(7))), lowB = smoothstep(uCenter.y.add(0.15), uCenter.y.sub(0.55), home.y);
    const fd = uFly.mul(lowB).mul(step(0.25, hash(seed.add(13)))).mul(step(0.05, fph));
    const p = home.add(vec3(hash(seed.add(14)).sub(0.5).mul(0.3), float(-1.1), float(-0.9).sub(hash(seed.add(15)).mul(0.6))).mul(fph.pow(1.4).mul(fd).mul(1.6))).toVar();
    // damage: a growing share of cubes hang loose and jitter
    const loose = step(float(1).sub(damage.mul(0.45)), hash(seed.add(3)));
    p.addAssign(normalize(home.sub(uCenter)).mul(loose.mul(sin(time.mul(3).add(seed.mul(30))).mul(0.03).add(0.05))));
    // blink-dash dissolve: cubes blow outward + swirl, reassemble when uDash falls
    const dir = normalize(home.sub(uCenter).add(vec3(hash(seed.add(4)).sub(0.5), hash(seed.add(5)).sub(0.5), hash(seed.add(6)).sub(0.5)).mul(1.2)));
    p.addAssign(dir.mul(uDash.mul(hash(seed.add(7)).mul(2.2).add(0.4))));
    p.addAssign(dir.mul(max(float(0), energy.sub(1.2)).mul(seed.mul(0.08).add(0.01))));
    // rare datamosh: small blocks of cubes step out and snap back
    const tq = floor(time.mul(12)), hm = hash(floor(seed.mul(60)).add(tq.mul(3.1)));
    p.addAssign(vec3(hash(hm.add(1)).sub(0.5), 0, hash(hm.add(2)).sub(0.5)).mul(step(float(0.992).sub(uMosh.mul(0.08)), hm).mul(0.06)));
    return p;
  })();
  const grey = cat.greaterThan(0.5), vary = hash(seed.add(9)).mul(0.14).add(0.9), dmg = float(1).sub(damage.mul(0.3));
  mat.colorNode = grey.select(uGrey, uWhite).mul(vary).mul(dmg);
  // night readability: a faint self-lit share of the skin colour keeps the solid body legible against dark streets
  mat.emissiveNode = (mat.colorNode as any).mul(0.3).add(uGlow.mul(uBurst.mul(2.5).add(uDash.mul(1.2)).add(uFly.mul(0.35))));
  Object.assign(mat.userData, { uWhite, uGrey, uGlow });
  const body = new THREE.InstancedMesh(BOX, mat, n); body.name = 'glitch:cubes';

  // ---- drifting cube cloud: one instanced draw, GPU-only lifecycle
  const emitPts = (data.emit ?? []).map(([b, x, y, z]) => [x, y, z, Math.max(0, boneNames.indexOf(b))]);
  if (!emitPts.length) emitPts.push([0, 0.1, 0, Math.max(0, boneNames.indexOf('Head'))]);
  const cE = new Float32Array(CLOUD * 4), cS = new Float32Array(CLOUD);
  for (let i = 0; i < CLOUD; i++) { cE.set(emitPts[(Math.random() * emitPts.length) | 0], i * 4); cS[i] = Math.random(); }
  const aE = instancedBufferAttribute(new THREE.InstancedBufferAttribute(cE, 4), 'vec4') as any;
  const aCS = instancedBufferAttribute(new THREE.InstancedBufferAttribute(cS, 1), 'float') as any;
  const ch = (data.cube_head ?? 0.0135) * 0.5, headI = Math.max(0, boneNames.indexOf('Head'));
  const cMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0 });
  cMat.positionNode = Fn(() => {
    const s: any = aCS, rate = hash(s.add(11)).mul(0.12).add(0.08);
    const ph = fract(time.mul(rate).add(s)), base: any = (uBones.element(aE.w.toInt()) as any).mul(vec4(aE.xyz, 1)).xyz;
    // drift away from the body axis (whole body sheds cubes), biased upward
    const ax: any = vec3(0, base.y, 0), hc: any = (uBones.element(headI) as any).mul(vec4(0, 0.1, 0, 1)).xyz;
    const from: any = mix(ax, hc, step(hc.y.sub(0.12), base.y));
    const out = normalize(base.sub(from).normalize().add(vec3(hash(s.add(1)).sub(0.5), hash(s.add(2)).mul(0.6).add(0.3), hash(s.add(3)).sub(0.5)).mul(1.3)));
    const dist = ph.pow(0.8).mul(hash(s.add(4)).mul(0.2).add(0.18)).mul(uDash.mul(3).add(1)).add(0.01);
    const size = smoothstep(0, 0.06, ph).mul(float(1).sub(ph.mul(0.75))).mul(hash(s.add(5)).mul(0.45).add(0.7)).mul(ch).mul(energy.mul(0.2).add(1));
    const a = ph.mul(2).add(s.mul(6.28)), ca = cos(a), sa = sin(a), l: any = (positionLocal as any).mul(size);
    const spun = vec3(l.x.mul(ca).sub(l.z.mul(sa)), l.y, l.x.mul(sa).add(l.z.mul(ca)));
    return spun.add(base).add(out.mul(dist)).add(vec3(sin(time.mul(0.7).add(s.mul(20))).mul(0.012), 0, 0));
  })();
  const cf = hash(aCS.add(8)).mul(0.25).add(0.8);
  cMat.colorNode = uPart.mul(cf); cMat.emissiveNode = uPart.mul(uDash.mul(0.8).add(uBurst.mul(1.5)).add(0.06));
  Object.assign(cMat.userData, { uPart });
  const cloud = new THREE.InstancedMesh(BOX, cMat, CLOUD); cloud.name = 'glitch:cloud';
  const id = new THREE.Matrix4();
  for (const m of [body, cloud]) { for (let k = 0; k < m.count; k++) m.setMatrixAt(k, id); m.frustumCulled = false; root.add(m); }

  // ---- burst particles (world space ring buffer)
  const PN = 256, pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
  const pMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.InstancedMesh(BOX, pMat, PN); particles.name = 'glitch:particles'; particles.frustumCulled = false;
  particles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PN * 3), 3);
  particles.matrixAutoUpdate = false; root.add(particles);
  let pHead = 0; const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), C = new THREE.Color();
  const W = new THREE.Vector3(), rootInv = new THREE.Matrix4();
  const cubeWorld = (k: number, out: THREE.Vector3) => { const o = bOff.array; return out.set(o[k * 4], o[k * 4 + 1], o[k * 4 + 2]).applyMatrix4(boneMats[o[k * 4 + 3]]).applyMatrix4(root.matrixWorld); };
  const emit = (count: number, speed: number, life: number) => {
    for (let c = 0; c < count; c++) {
      const k = (Math.random() * visN) | 0; cubeWorld(k, W); const i = pHead; pHead = (pHead + 1) % PN;
      pPos.set([W.x, W.y, W.z], i * 3);
      S3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      pVel.set([S3.x, S3.y, S3.z], i * 3); pLife[i] = pMax[i] = life * (0.6 + Math.random() * 0.6);
    }
  };
  let visN = n, dashPrev = 0, wasDash = false, moshT = 0, trailAcc = 0;
  const lastRoot = new THREE.Vector3(), curRoot = new THREE.Vector3();
  return {
    meshes: [body, cloud, particles], count: n, uniforms: { uDash, uBurst, uMosh, uFly },
    setLook(look: RobotLook) {
      data.parts.forEach((p, k) => (vis[k] = p.slot === 'body' || (look as any)[p.slot] === p.opt ? 1 : 0));
      const idx: number[] = []; all.forEach((a, i) => vis[a.pi] && idx.push(i));
      idx.forEach((src, d) => {
        for (let c = 0; c < 4; c++) { bOff.array[d * 4 + c] = off[src * 4 + c]; bDim.array[d * 4 + c] = dim[src * 4 + c]; bQ.array[d * 4 + c] = quat[src * 4 + c]; }
        bSeed.array[d] = seeds[src];
      });
      for (const b of [bOff, bDim, bQ, bSeed]) b.needsUpdate = true;
      visN = idx.length; body.count = visN;
      uWhite.value.set(look.shell); uGrey.value.set(look.shorts); uGlow.value.set(look.visor); uPart.value.set(look.decalColor ?? look.shell);
    },
    update(s: PoseInput, dt: number, bones: THREE.Object3D[]) {
      root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
      bones.forEach((b, k) => boneMats[k].multiplyMatrices(rootInv, b.matrixWorld));
      uCenter.value.set(0, 0, 0).applyMatrix4(boneMats[Math.max(0, boneNames.indexOf('Spine'))]);
      // blink-dash timeline (seconds since trigger): dissolve 0-0.12, travel, reassemble 0.3-0.5 with a burst at 0.42
      const sp = s.special ?? 0, dash = sp > 0 && sp < 0.6;
      const want = !dash ? 0 : sp < 0.12 ? sp / 0.12 : sp < 0.3 ? 1 : Math.max(0, 1 - (sp - 0.3) / 0.14);
      uDash.value = want;
      if (dash && !wasDash) emit(140, 2.5, 0.7);
      if (dash && sp >= 0.42 && dashPrev < 0.42) { emit(170, 5, 0.6); uBurst.value = 1; }
      wasDash = dash; dashPrev = sp;
      // flight dissolve: ramps in on take-off with throttle, re-forms on landing with a burst
      const air = (s.anim === 'hover' || s.anim === 'fly') && (s.flyT ?? 0) > 0, th = s.thrust ?? 0;
      const fw = air ? Math.min(1, (s.flyT ?? 0) / 0.35) * (0.55 + 0.45 * th) : (s.launch ?? 0) * 0.3;
      if (uFly.value > 0.4 && fw < 0.05 && !air) { emit(120, 3, 0.5); uBurst.value = Math.max(uBurst.value, 0.8); }
      uFly.value += (fw - uFly.value) * (1 - Math.exp(-dt * (fw > uFly.value ? 6 : 9)));
      // (the sole exhaust is the voxel-cube plume in thrust.ts)
      uBurst.value *= Math.exp(-dt * 6);
      moshT -= dt; if (moshT < 0) { moshT = 0.3 + Math.random() * 2; uMosh.value = Math.random() < 0.25 ? 0.5 + Math.random() * 0.5 : 0.02; }
      uMosh.value = Math.max(uMosh.value * Math.exp(-dt * 3), (s.damage ?? 0) * 0.5, want, uFly.value * 0.3);
      curRoot.setFromMatrixPosition(root.matrixWorld); const moved = curRoot.distanceTo(lastRoot); lastRoot.copy(curRoot);
      if (moved < 5) { trailAcc += moved * 10 + (dash ? dt * 400 : 0); }
      while (trailAcc > 1) { trailAcc -= 1; emit(1, 0.25, 0.45); }
      const pc = uPart.value as THREE.Color;
      for (let i = 0; i < PN; i++) {
        if (pLife[i] <= 0) { M4.makeScale(0, 0, 0); particles.setMatrixAt(i, M4); continue; }
        pLife[i] -= dt; const f = Math.max(0, pLife[i] / pMax[i]);
        for (let a = 0; a < 3; a++) { pPos[i * 3 + a] += pVel[i * 3 + a] * dt; pVel[i * 3 + a] *= Math.exp(-dt * 2.5); }
        P3.fromArray(pPos, i * 3); Q.setFromAxisAngle(S3.set(0.3, 1, 0.2).normalize(), i + f * 6);
        const sc = 0.012 * f + 0.003; M4.compose(P3, Q, S3.set(sc, sc, sc)); particles.setMatrixAt(i, M4);
        C.copy(pc).lerp(uGlow.value as THREE.Color, (i % 4) / 6).multiplyScalar(f * 1.6); particles.setColorAt(i, C);
      }
      particles.instanceMatrix.needsUpdate = true; particles.instanceColor!.needsUpdate = true;
      particles.matrix.copy(rootInv); particles.matrixWorldNeedsUpdate = true;
    },
    dispose() { mat.dispose(); cMat.dispose(); pMat.dispose(); },
  };
}
