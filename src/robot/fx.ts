import * as THREE from 'three/webgpu';
import { uniform, uv, positionLocal, normalView, positionView, dot, abs, pow, float, vec3, smoothstep, sin, time, length, mix, mx_noise_float, attribute } from 'three/tsl';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Robot hero effects, all cheap (≈7 draws, no lights, no new shaders after start):
 * aura shell (charge + burst), shockwave ring + sonic-boom cone, afterimage ghosts (one instanced draw),
 * hero-landing crater decal + dust ring, charge debris (instanced), joint sparks from battle damage,
 * screen-space speed lines (CSS) and a camera shake / FOV punch layer. Respects prefers-reduced-motion.
 */
export function createRobotFx(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const uAura = uniform(0), uAuraCol = uniform(new THREE.Color('#3df2ff'));
  // Aura: fresnel capsule around the body, flame-like noise rising upward.
  const auraMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  { const f = pow(float(1).sub(abs(dot(normalView, positionView.normalize().negate()))), 4.0).mul(0.6);
    // flame tongues: stretched noise scrolling upward, thresholded so it reads as spiky licks rather than a glass shell
    const lick = smoothstep(0.5, 0.85, mx_noise_float(positionLocal.mul(vec3(7, 2.2, 7)).sub(vec3(0, time.mul(4.5), 0))).mul(0.5).add(0.5));
    const top = smoothstep(-0.9, 0.2, positionLocal.y); // fade toward the feet
    auraMat.colorNode = mix(uAuraCol, vec3(1, 1, 1), f.mul(0.6)).mul(f.mul(0.7).add(lick.mul(f.add(0.25)).mul(1.4)).mul(top).mul(uAura));
    auraMat.opacityNode = float(1); }
  const aura = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.75, 4, 16), auraMat); aura.renderOrder = 6; aura.visible = false; scene.add(aura);

  // Rings: shockwave (ground or body plane) and sonic boom (perpendicular to velocity). Shared ring material with per-mesh uniform.
  const ringMat = (col: string) => { const u = uniform(0), m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const r = length(uv().sub(0.5)).mul(2); const band = smoothstep(0.62, 0.9, r).mul(smoothstep(1.0, 0.92, r));
    m.colorNode = vec3(new THREE.Color(col).r, new THREE.Color(col).g, new THREE.Color(col).b).mul(band).mul(u).mul(2.2); m.userData.u = u; return m; };
  const ring = (col: string) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat(col)); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return { m, t: 9, dur: 0.5, max: 10 }; };
  const shock = ring('#bff6ff'), boom = ring('#ffffff'), dust = ring('#b9a98d');

  // Afterimages: ghost capsules at past positions in the aura colour, fading (one instanced draw).
  const GH = 7, ghostMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  { const fade = attribute('ghostFade', 'float'); const f = pow(float(1).sub(abs(dot(normalView, positionView.normalize().negate()))), 1.5);
    ghostMat.colorNode = uAuraCol.mul(fade).mul(f.add(0.15)).mul(1.2); }
  const ghostGeo = new THREE.CapsuleGeometry(0.2, 0.9, 3, 10); const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(GH), 1); ghostGeo.setAttribute('ghostFade', fadeAttr);
  const ghosts = new THREE.InstancedMesh(ghostGeo, ghostMat, GH); ghosts.frustumCulled = false; ghosts.count = GH; scene.add(ghosts);
  const hist: { p: THREE.Vector3; q: THREE.Quaternion }[] = Array.from({ length: GH * 3 }, () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() })); let hi = 0;

  // Crater decal (stays for a while) with a scorched rim.
  const crMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const uCr = uniform(0);
  { const r = length(uv().sub(0.5)).mul(2); const cracks = smoothstep(0.75, 0.8, mx_noise_float(uv().mul(18)).mul(0.5).add(0.5).add(r.mul(0.15)));
    const heat = uniform(0); crMat.userData.heat = heat;
    const glowCr = smoothstep(0.62, 0.66, mx_noise_float(uv().mul(9)).mul(0.5).add(0.5).add(float(0.25).sub(r.mul(0.3)))).mul(smoothstep(0.95, 0.4, r));
    crMat.colorNode = mix(vec3(0.05, 0.045, 0.04), vec3(0.22, 0.19, 0.15), smoothstep(0.3, 0.85, r)).add(vec3(1.0, 0.45, 0.12).mul(glowCr).mul(heat).mul(3));
    crMat.opacityNode = smoothstep(1.0, 0.7, r).mul(float(0.9).sub(cracks.mul(0.3))).mul(uCr); }
  const crater = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), crMat); crater.visible = false; crater.renderOrder = 5; scene.add(crater); let crT = 99;

  // Particles: charge debris (rises), sparks (fall, bright). One instanced pool, per-instance colour.
  const N = 90, pGeo = new THREE.IcosahedronGeometry(1, 0), pMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const parts = new THREE.InstancedMesh(pGeo, pMat, N); parts.frustumCulled = false; scene.add(parts);
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0.05, g: 0, spin: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) { parts.setMatrixAt(i, m4.makeScale(0, 0, 0)); parts.setColorAt(i, c.set(0)); }
  let nextP = 0;
  const emit = (p: THREE.Vector3, v: THREE.Vector3, life: number, s: number, g: number, col: number) => { const i = nextP, o = P[i]; nextP = (nextP + 1) % N; o.p.copy(p); o.v.copy(v); o.life = o.max = life; o.s = s; o.g = g; o.spin = Math.random() * 6; parts.setColorAt(i, c.set(col)); };

  // Speed lines overlay.
  const lines = document.createElement('div'); lines.id = 'speedlines'; document.body.appendChild(lines);

  let shake = 0, punch = 0, auraT = 0, charge = 0, ghostAcc = 0, prevBurst = 0, chargeT = 0, sparkAcc = 0;
  const tmp = new THREE.Vector3(), tv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const fire = (r: { m: THREE.Mesh; t: number; dur: number; max: number }, pos: THREE.Vector3, normal: THREE.Vector3, max: number, dur: number) => {
    r.t = 0; r.dur = dur; r.max = max; r.m.position.copy(pos); r.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); r.m.visible = true; };
  const tickRing = (r: { m: THREE.Mesh; t: number; dur: number; max: number }, dt: number) => {
    if (!r.m.visible) return; r.t += dt; const k = r.t / r.dur; if (k >= 1) { r.m.visible = false; return; }
    r.m.scale.setScalar(0.5 + r.max * (1 - Math.pow(1 - k, 3))); (r.m.material as any).userData.u.value = (1 - k) * (1 - k); };

  return {
    setColor(hex: string) { uAuraCol.value.set(hex); },
    /** Hero landing: crater, dust ring, shake. */
    impact(pos: THREE.Vector3, strength = 1) {
      crater.position.set(pos.x, pos.y + 0.22, pos.z); // above the lifted road decks (ground.ts LIFT up to 0.16 m) crater.scale.setScalar(4.5 * strength); crater.visible = true; crT = 0;
      fire(dust, tmp.set(pos.x, pos.y + 0.15, pos.z), up, 16 * strength, 0.9); fire(shock, tmp.set(pos.x, pos.y + 0.3, pos.z), up, 9 * strength, 0.45);
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 6; emit(tmp.set(pos.x, pos.y + 0.1, pos.z), tv.set(Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s), 0.9, 0.04 + Math.random() * 0.05, -14, 0x6b6152); }
      if (!reduced()) shake = Math.max(shake, 0.9 * strength);
    },
    /** Pulse the shake from elsewhere (e.g. near miss). */
    kick(a: number) { if (!reduced()) shake = Math.max(shake, a); },
    get charge() { return charge; },
    /**
     * Per-frame. `root` = robot root, `burstOn` 0..1 from the controller, `charging` key held, `speed` m/s, `damage` 0..1,
     * `joints` = robot bones to spark from. Returns the visor/energy multiplier for the part shader.
     */
    update(dt: number, root: THREE.Object3D, vel: THREE.Vector3, burstOn: number, charging: boolean, damage: number, joints: THREE.Object3D[], active: boolean): number {
      const rm = reduced();
      charge += ((charging && active ? 1 : 0) - charge) * (1 - Math.exp(-dt * (charging ? 1.6 : 5)));
      chargeT = charging ? chargeT + dt : 0;
      const burstStart = active && burstOn > 0.5 && prevBurst <= 0.5; prevBurst = burstOn;
      if (burstStart) {
        auraT = 0.6; tv.copy(vel).normalize(); if (tv.lengthSq() < 0.5) tv.set(0, 0, 1);
        fire(boom, tmp.copy(root.position).addScaledVector(tv, 1.2), tv, 7, 0.35); fire(shock, tmp.copy(root.position), tv, 4, 0.25);
        punch = rm ? 4 : 12; if (!rm) shake = Math.max(shake, 0.45);
      }
      auraT = Math.max(0, auraT - dt);
      const auraK = active ? Math.max(charge * (0.6 + 0.4 * Math.sin(chargeT * 12) * 0.3), burstOn * 0.55, auraT / 0.6) : 0;
      uAura.value += (auraK - uAura.value) * (1 - Math.exp(-dt * 12)); aura.visible = uAura.value > 0.02;
      if (aura.visible) { aura.position.copy(root.position).add(tmp.set(0, 0.62, 0).applyQuaternion(root.quaternion)); aura.quaternion.copy(root.quaternion); aura.scale.setScalar(1 + charge * 0.25 + Math.sin(performance.now() * 0.02) * 0.02 * uAura.value); }
      // charge-up squash at burst start (brief crouch), and a hunched stance while charging
      const squash = auraT > 0.45 ? (auraT - 0.45) / 0.15 : 0;
      root.scale.set(1 + squash * 0.06, 1 - squash * 0.12, 1 + squash * 0.06);
      // debris lifting while charging
      if (charge > 0.3 && active) { sparkAcc += dt * 30 * charge; while (sparkAcc > 1) { sparkAcc--; const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.4;
        emit(tmp.set(root.position.x + Math.cos(a) * r, root.position.y + 0.05, root.position.z + Math.sin(a) * r), tv.set(0, 0.8 + Math.random() * 1.6, 0), 1.4, 0.025 + Math.random() * 0.04, 0.6, Math.random() < 0.3 ? 0x8fd3ff : 0x5d5448); } }
      // sparks from damaged joints
      if (damage > 0.35 && active && joints.length && Math.random() < dt * 6 * damage) {
        const j = joints[Math.floor(Math.random() * joints.length)]; j.getWorldPosition(tmp);
        for (let i = 0; i < 6; i++) emit(tmp, tv.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.35, 0.012, -9, 0xffe08a);
      }
      // afterimages during burst
      ghostAcc += dt; if (ghostAcc > 0.03) { ghostAcc = 0; hi = (hi + 1) % hist.length; hist[hi].p.copy(root.position).add(tmp.set(0, 0.62, 0).applyQuaternion(root.quaternion)); hist[hi].q.copy(root.quaternion); }
      const gk = active ? burstOn : 0;
      for (let i = 0; i < GH; i++) {
        const h = hist[(hi - (i + 1) * 3 + hist.length * 4) % hist.length];
        if (gk < 0.05) { ghosts.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        ghosts.setMatrixAt(i, m4.compose(h.p, h.q, sc.set(1, 1, 1))); fadeAttr.setX(i, gk * 0.5 * (1 - i / GH));
      }
      ghosts.instanceMatrix.needsUpdate = true; fadeAttr.needsUpdate = true;
      tickRing(shock, dt); tickRing(boom, dt); tickRing(dust, dt);
      if (crater.visible) { crT += dt; crMat.userData.heat.value = Math.max(0, 1 - crT / 4); uCr.value = Math.min(1, crT * 8) * Math.max(0, 1 - Math.max(0, crT - 18) / 4); if (crT > 22) crater.visible = false; }
      for (let i = 0; i < N; i++) {
        const o = P[i]; if (o.life <= 0) { parts.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
        o.life -= dt; o.v.y += o.g * dt; o.p.addScaledVector(o.v, dt); const k = o.life / o.max;
        parts.setMatrixAt(i, m4.compose(o.p, q.setFromEuler(e.set(o.spin * k, o.spin, 0)), sc.setScalar(o.s * Math.min(1, k * 3))));
      }
      parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
      // speed lines + camera layer
      const lk = rm || !active ? 0 : Math.max(0, burstOn - 0.2) * 0.8; lines.style.opacity = lk.toFixed(2);
      punch *= Math.exp(-dt * 4);
      if (active && (punch > 0.05 || charge > 0.05)) { camera.fov += punch - charge * 4; camera.updateProjectionMatrix(); }
      if (shake > 0.01 && !rm) { const a = shake * shake * 0.25; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a; }
      shake *= Math.exp(-dt * 5);
      return 1 + charge * 1.8 + burstOn * 1.2 + auraT * 2;
    },
    setVisible(v: boolean) { if (!v) { aura.visible = false; lines.style.opacity = '0'; } },
  };
}
