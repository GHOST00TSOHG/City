import * as THREE from 'three/webgpu';
import { positionLocal, normalize, max, smoothstep, mix, vec3, vec2, uniform, pow, dot, uv, length, exp, attribute, select, float, color } from 'three/tsl';

/** Night sky (TSL, runs on WebGPU and the WebGL2 fallback): gradient dome + star quads + moon disc. 3 draw calls, follows the camera. */
export function createSky(moonDir: THREE.Vector3) {
  const group = new THREE.Group(); group.name = 'sky';
  const R = 30000;
  const uMoon = uniform(moonDir.clone().normalize()), uHaze = uniform(0), uVis = uniform(1);
  const zenith = color(0x040817), mid = color(0x0c142a);
  const warm = color(0x3a3440), cool = color(0x26334a);
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const d = normalize(positionLocal), h = max(d.y, 0);
  const nw = smoothstep(-0.3, 1, dot(normalize(vec2(d.x, d.z).add(1e-5)), normalize(vec2(-1, -1))));
  const horizon = mix(cool, warm, nw);
  let c = mix(horizon, mid, smoothstep(0, 0.18, h));
  c = mix(c, zenith, smoothstep(0.12, 0.7, h));
  c = c.add(vec3(0.1, 0.11, 0.13).mul(pow(max(dot(d, uMoon), 0), 12)));
  c = mix(c, horizon.mul(0.8), uHaze.mul(0.6));
  domeMat.colorNode = select(d.y.lessThan(0), horizon.mul(0.9), c);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), domeMat);
  dome.renderOrder = -3; dome.frustumCulled = false; group.add(dome);

  // Stars as tiny camera-centred quads (WebGPU has no point sizes): one merged mesh.
  const N = 2200, pos: number[] = [], uvs: number[] = [], mags: number[] = [], idx: number[] = [];
  let s = 1234567; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const v = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 0.05 + rnd() * 0.95, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y), m = Math.pow(rnd(), 3);
    v.set(Math.cos(a) * r, y, Math.sin(a) * r);
    t1.set(0, 1, 0).cross(v).normalize(); t2.crossVectors(v, t1).normalize();
    const size = R * 0.95 * (0.0009 + 0.0014 * m);
    const ctr = v.clone().multiplyScalar(R * 0.95), b = pos.length / 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = ctr.clone().addScaledVector(t1, sx * size).addScaledVector(t2, sy * size);
      pos.push(p.x, p.y, p.z); uvs.push((sx + 1) / 2, (sy + 1) / 2); mags.push(m * 0.65 + 0.35);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sg.setAttribute('mag', new THREE.Float32BufferAttribute(mags, 1));
  sg.setIndex(idx);
  const starMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const fade = smoothstep(0.03, 0.25, normalize(positionLocal).y);
  starMat.colorNode = vec3(0.92, 0.94, 1).mul(attribute('mag', 'float')).mul(fade).mul(uVis).mul(smoothstep(0.5, 0.1, length(uv().sub(0.5))));
  const stars = new THREE.Mesh(sg, starMat); stars.renderOrder = -2; stars.frustumCulled = false; group.add(stars);

  const uMoonVis = uniform(1);
  const moonMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const mr = length(uv().sub(0.5)).mul(2);
  moonMat.colorNode = vec3(1, 0.98, 0.93).mul(smoothstep(0.17, 0.155, mr).mul(1.6).add(exp(mr.mul(-6)).mul(0.45))).mul(uMoonVis);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), moonMat);
  moon.position.copy(moonDir).normalize().multiplyScalar(R * 0.9); moon.lookAt(0, 0, 0);
  moon.renderOrder = -1; moon.frustumCulled = false; group.add(moon);
  void float;
  return {
    group,
    /** 0 = clear, 1 = overcast (rain): hides stars/moon, hazes the dome. */
    setOvercast(k: number) { uVis.value = 1 - k; uMoonVis.value = 1 - 0.85 * k; uHaze.value = k; },
    follow(cam: THREE.Camera) { group.position.copy(cam.position); },
  };
}
