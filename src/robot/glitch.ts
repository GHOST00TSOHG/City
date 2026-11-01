import * as THREE from 'three/webgpu';
import { uniform, uniformArray, instancedBufferAttribute, positionLocal, vec3, vec4, float, sin, cos, time, step, mix, max, fract, floor, smoothstep, cross, normalize, Fn } from 'three/tsl';
import type { RobotLook, PoseInput } from './model';

/** shards.json: bone-local plate shards in game frame: [x, y, z, hx, hy, hz, qx, qy, qz, qw, cat] (cat 0 shell, 1 dark, 2 glow). */
export interface ShardData { version: 2; tris_total: number; parts: { slot: string; opt: string; bone: string; shards: number[][] }[] }

const OCTA = (() => {
  const g = new THREE.BufferGeometry();
  const v = [0, 1, 0, 0, -1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1];
  const f = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 4, 2, 1, 3, 4, 1, 5, 3, 1, 2, 5];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(f);
  return g.toNonIndexed();
})();
const hash = (x: any) => fract(sin(x.mul(12.9898)).mul(43758.5453));

/**
 * The Glitch body: ~3.4k plate shards in ONE instanced draw, plus two additive chromatic ghosts (cyan / magenta) and an
 * additive particle pool for trails and the reassembly burst: 4 draw calls. All shard motion is in the vertex shader:
 * bone skinning (mat4 uniform array), orbit-and-snap for a few percent of shards, scanline slip + datamosh block jitter,
 * dissolve / reassemble for the blink-dash. Particles are a CPU ring buffer (world space).
 */
export function createGlitchBody(data: ShardData, boneNames: string[], root: THREE.Object3D, energy: any, damage: any) {
  const all = data.parts.flatMap((p, pi) => p.shards.map((s) => ({ s, pi, bi: Math.max(0, boneNames.indexOf(p.bone)) })));
  const n = all.length;
  const off = new Float32Array(n * 4), dim = new Float32Array(n * 4), quat = new Float32Array(n * 4);
  all.forEach(({ s, pi, bi }, i) => {
    off.set([s[0], s[1], s[2], bi], i * 4); dim.set([s[3], s[5], s[4], s[10] + pi * 4], i * 4); quat.set([s[6], s[7], s[8], s[9]], i * 4);
  });
  const seeds = new Float32Array(n); for (let i = 0; i < n; i++) seeds[i] = Math.random();
  // GPU copies are compacted on setLook: only the equipped parts' shards, shuffled, so instance count == drawn shards
  // and any prefix is a uniform sample (the ghosts draw just a prefix).
  const bOff = new THREE.InstancedBufferAttribute(off.slice(), 4), bDim = new THREE.InstancedBufferAttribute(dim.slice(), 4);
  const bQ = new THREE.InstancedBufferAttribute(quat.slice(), 4), bSeed = new THREE.InstancedBufferAttribute(seeds.slice(), 1);
  const aOff = instancedBufferAttribute(bOff, 'vec4') as any;
  const aDim = instancedBufferAttribute(bDim, 'vec4') as any;
  const aQ = instancedBufferAttribute(bQ, 'vec4') as any;
  const aSeed = instancedBufferAttribute(bSeed, 'float') as any;
  const GHOSTS = 260;
  const boneMats = boneNames.map(() => new THREE.Matrix4()), uBones = uniformArray(boneMats, 'mat4');
  const vis = data.parts.map(() => 1), uVis = uniformArray(vis, 'float');
  const uDash = uniform(0), uBurst = uniform(0), uMosh = uniform(0), uCenter = uniform(new THREE.Vector3(0, 1.3, 0)), uSplit = uniform(0.012);
  const uWhite = uniform(new THREE.Color()), uDark = uniform(new THREE.Color()), uGlow = uniform(new THREE.Color());
  const cat = aDim.w.mod(4), part = floor(aDim.w.div(4)), seed = aSeed;

  /** shared vertex path; `ghost` = 0 body, 1 cyan, -1 magenta */
  const place = (ghost: number) => {
    const q: any = aQ, lp: any = (positionLocal as any).mul(aDim.xyz).mul(uVis.element(part.toInt()));
    const t: any = (cross as any)(q.xyz, lp).add(lp.mul(q.w)), rp: any = lp.add((cross as any)(q.xyz, t).mul(2));
    const home: any = (uBones.element(aOff.w.toInt()) as any).mul(vec4(rp.add(aOff.xyz), 1)).xyz.toVar();
    // orbit-and-snap: 6% of shards peel off, circle the core, then snap home hard
    const ph = fract(time.mul(0.21).add(seed.mul(5.7)));
    const orb = step(0.94, seed).mul(smoothstep(0, 0.12, ph)).mul(float(1).sub(smoothstep(0.8, 0.84, ph)));
    const a = time.mul(1.9).add(seed.mul(40)), r = hash(seed.add(1)).mul(0.35).add(0.5);
    const op = uCenter.add(vec3(cos(a).mul(r), hash(seed.add(2)).sub(0.5).mul(1.1).add(sin(a.mul(1.7)).mul(0.08)), sin(a).mul(r)));
    const p = mix(home, op, orb).toVar();
    // damage: a growing share of shards hang loose and jitter
    const loose = step(float(1).sub(damage.mul(0.45)), hash(seed.add(3)));
    p.addAssign(normalize(home.sub(uCenter)).mul(loose.mul(sin(time.mul(3).add(seed.mul(30))).mul(0.04).add(0.07))));
    // blink-dash dissolve: shards blow outward + swirl, reassemble when uDash falls
    const dir = normalize(home.sub(uCenter).add(vec3(hash(seed.add(4)).sub(0.5), hash(seed.add(5)).sub(0.5), hash(seed.add(6)).sub(0.5)).mul(1.2)));
    p.addAssign(dir.mul(uDash.mul(hash(seed.add(7)).mul(2.2).add(0.4))));
    // energy (boost) scatter: shards breathe outward with thrust
    p.addAssign(dir.mul(max(float(0), energy.sub(1.2)).mul(seed.mul(0.12).add(0.02))));
    // scanline slip: horizontal bands step sideways on a 12 Hz clock
    const tq = floor(time.mul(12)), band = floor(p.y.mul(16));
    const hb = hash(band.add(tq.mul(7.13)));
    p.x.addAssign(step(float(0.93).sub(uMosh.mul(0.25)), hb).mul(hb.sub(0.5)).mul(uMosh.mul(0.18).add(0.05)));
    // datamosh: blocks of shards freeze-jump to a quantized offset
    const hm = hash(floor(seed.mul(40)).add(tq.mul(3.1)));
    p.addAssign(vec3(hash(hm.add(1)).sub(0.5), 0, hash(hm.add(2)).sub(0.5)).mul(step(float(0.985).sub(uMosh.mul(0.12)), hm).mul(0.12)));
    if (ghost) {
      p.x.addAssign(uSplit.mul(ghost));
      // ghosts show a flickering subset only (degenerate the rest so they cost no fragments)
      const keep = step(0.2, hash(seed.add(tq.mul(0.37)).add(ghost)));
      return p.add(vec3(0, float(1).sub(keep).mul(-50), 0));
    }
    return p;
  };
  const mat = new THREE.MeshStandardNodeMaterial({ flatShading: true, roughness: 0.3, metalness: 0.1 });
  mat.positionNode = Fn(() => place(0))();
  const glow = cat.greaterThan(1.5), dark = cat.greaterThan(0.5).and(glow.not());
  const dmg = float(1).sub(damage.mul(0.3));
  mat.colorNode = glow.select(uGlow.mul(0.25), dark.select(uDark, uWhite)).mul(dmg);
  mat.roughnessNode = dark.select(float(0.5), float(0.22));
  const flick = step(0.88, hash(seed.add(floor(time.mul(20))))).mul(0.9).add(0.55);
  mat.emissiveNode = glow.select(uGlow.mul(energy.mul(1.4).add(1).mul(flick)), vec3(0)).add(uGlow.mul(uBurst.mul(2.5))).add(uGlow.mul(uDash.mul(1.2)));
  const body = new THREE.InstancedMesh(OCTA, mat, n); body.name = 'glitch:shards'; body.frustumCulled = false;
  const ghostMat = (c: number, s: number) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.positionNode = Fn(() => place(s))();
    m.colorNode = vec3(...new THREE.Color(c).toArray() as [number, number, number]).mul(uMosh.mul(0.5).add(0.18).add(uDash.mul(0.6)));
    return m;
  };
  const gC = new THREE.InstancedMesh(OCTA, ghostMat(0x00e5ff, 1), n), gM = new THREE.InstancedMesh(OCTA, ghostMat(0xff1493, -1), n);
  gC.name = 'glitch:ghost-c'; gM.name = 'glitch:ghost-m';
  const id = new THREE.Matrix4();
  for (const m of [body, gC, gM]) { for (let k = 0; k < n; k++) m.setMatrixAt(k, id); m.frustumCulled = false; root.add(m); }
  gC.renderOrder = gM.renderOrder = 2;

  // ---- particles: trails + reassembly burst (world space ring buffer)
  const PN = 256, pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
  const pMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.InstancedMesh(OCTA, pMat, PN); particles.name = 'glitch:particles'; particles.frustumCulled = false;
  particles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PN * 3), 3);
  particles.matrixAutoUpdate = false; root.add(particles);
  let pHead = 0; const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), C = new THREE.Color(), C2 = new THREE.Color();
  const W = new THREE.Vector3(), rootInv = new THREE.Matrix4();
  const shardWorld = (k: number, out: THREE.Vector3) => { const o = bOff.array; return out.set(o[k * 4], o[k * 4 + 1], o[k * 4 + 2]).applyMatrix4(boneMats[o[k * 4 + 3]]).applyMatrix4(root.matrixWorld); };
  const emit = (count: number, speed: number, life: number) => {
    for (let c = 0; c < count; c++) {
      const k = (Math.random() * visN) | 0; shardWorld(k, W); const i = pHead; pHead = (pHead + 1) % PN;
      pPos.set([W.x, W.y, W.z], i * 3);
      S3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      pVel.set([S3.x, S3.y, S3.z], i * 3); pLife[i] = pMax[i] = life * (0.6 + Math.random() * 0.6);
    }
  };
  let visN = n, dashPrev = 0, wasDash = false, moshT = 0, trailAcc = 0;
  const lastRoot = new THREE.Vector3(), curRoot = new THREE.Vector3();
  return {
    meshes: [body, gC, gM, particles], count: n, uniforms: { uDash, uBurst, uMosh },
    setLook(look: RobotLook) {
      data.parts.forEach((p, k) => (vis[k] = p.slot === 'body' || (look as any)[p.slot] === p.opt ? 1 : 0));
      const idx: number[] = []; all.forEach((a, i) => vis[a.pi] && idx.push(i));
      for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.forEach((src, d) => {
        for (let c = 0; c < 4; c++) { bOff.array[d * 4 + c] = off[src * 4 + c]; bDim.array[d * 4 + c] = dim[src * 4 + c]; bQ.array[d * 4 + c] = quat[src * 4 + c]; }
        bSeed.array[d] = seeds[src];
      });
      for (const b of [bOff, bDim, bQ, bSeed]) b.needsUpdate = true;
      visN = idx.length; body.count = visN; gC.count = gM.count = Math.min(GHOSTS, visN);
      uWhite.value.set(look.shell); uDark.value.set(look.joints); uGlow.value.set(look.visor);
    },
    update(s: PoseInput, dt: number, bones: THREE.Object3D[]) {
      root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
      bones.forEach((b, k) => boneMats[k].multiplyMatrices(rootInv, b.matrixWorld));
      uCenter.value.set(0, 0, 0).applyMatrix4(boneMats[Math.max(0, boneNames.indexOf('Spine'))]);
      // blink-dash timeline (seconds since trigger): dissolve 0-0.12, travel, reassemble 0.3-0.5 with a burst at 0.42
      const sp = s.special ?? 0, dash = sp > 0 && sp < 0.6;
      const want = !dash ? 0 : sp < 0.12 ? sp / 0.12 : sp < 0.3 ? 1 : Math.max(0, 1 - (sp - 0.3) / 0.14);
      uDash.value = want;
      if (dash && !wasDash) emit(140, 2.5, 0.7);                        // afterimage at the departure point
      if (dash && sp >= 0.42 && dashPrev < 0.42) { emit(170, 5, 0.6); uBurst.value = 1; } // reassembly burst
      wasDash = dash; dashPrev = sp;
      uBurst.value *= Math.exp(-dt * 6);
      // datamosh flicker: random spikes, stronger when damaged / boosting / dashing
      moshT -= dt; if (moshT < 0) { moshT = 0.15 + Math.random() * 1.6; uMosh.value = Math.random() < 0.35 ? 0.6 + Math.random() * 0.4 : 0.05; }
      uMosh.value = Math.max(uMosh.value * Math.exp(-dt * 3), (s.damage ?? 0) * 0.5, want);
      uSplit.value = 0.008 + uMosh.value * 0.035;
      // trails: emit by distance travelled
      curRoot.setFromMatrixPosition(root.matrixWorld); const moved = curRoot.distanceTo(lastRoot); lastRoot.copy(curRoot);
      if (moved < 5) { trailAcc += moved * 18 + (dash ? dt * 400 : 0); }
      while (trailAcc > 1) { trailAcc -= 1; emit(1, 0.25, 0.45); }
      // integrate particles
      for (let i = 0; i < PN; i++) {
        if (pLife[i] <= 0) { M4.makeScale(0, 0, 0); particles.setMatrixAt(i, M4); continue; }
        pLife[i] -= dt; const f = Math.max(0, pLife[i] / pMax[i]);
        for (let a = 0; a < 3; a++) { pPos[i * 3 + a] += pVel[i * 3 + a] * dt; pVel[i * 3 + a] *= Math.exp(-dt * 2.5); }
        P3.fromArray(pPos, i * 3); Q.setFromAxisAngle(S3.set(0.3, 1, 0.2).normalize(), i + f * 6);
        const sc = 0.025 * f + 0.004; M4.compose(P3, Q, S3.set(sc, sc * 1.8, sc * 0.4)); particles.setMatrixAt(i, M4);
        C.copy(uGlow.value as THREE.Color).lerp(i % 3 ? C2.setRGB(0, 0.9, 1) : C2.setRGB(1, 0.1, 0.6), 0.35).multiplyScalar(f * 2);
        particles.setColorAt(i, C);
      }
      particles.instanceMatrix.needsUpdate = true; particles.instanceColor!.needsUpdate = true;
      particles.matrix.copy(rootInv); particles.matrixWorldNeedsUpdate = true;
    },
    dispose() { mat.dispose(); pMat.dispose(); (gC.material as THREE.Material).dispose(); (gM.material as THREE.Material).dispose(); },
  };
}
