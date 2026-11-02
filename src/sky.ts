import * as THREE from 'three/webgpu';
import { time, sin, mx_noise_float, mx_fractal_noise_float, clamp, abs, positionLocal, normalize, max, smoothstep, mix, vec3, vec2, uniform, pow, dot, uv, length, exp, attribute, select, float, color } from 'three/tsl';

/** Night sky (TSL, runs on WebGPU and the WebGL2 fallback): gradient dome with a faint Milky Way, coloured twinkling stars,
 *  a moon with maria and a halo, and a moving cloud layer lit by the moon. 4 draw calls, follows the camera. */
export function createSky(moonDir: THREE.Vector3) {
  const group = new THREE.Group(); group.name = 'sky';
  const R = 30000;
  const uMoon = uniform(moonDir.clone().normalize()), uHaze = uniform(0), uVis = uniform(1), uCloud = uniform(0.22), uHazeCol = uniform(new THREE.Color(0x26334a)), uFogCol = uniform(new THREE.Color(0x1e2638));
  const zenith = color(0x040817), mid = color(0x0c142a);
  const warm = color(0x3a3440), cool = color(0x26334a);
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const d = normalize(positionLocal), h = max(d.y, 0);
  const nw = smoothstep(-0.3, 1, dot(normalize(vec2(d.x, d.z).add(1e-5)), normalize(vec2(-1, -1))));
  const horizon = mix(cool, warm, nw);
  let c = mix(horizon, mid, smoothstep(0, 0.18, h));
  c = mix(c, zenith, smoothstep(0.12, 0.7, h));
  c = c.add(vec3(0.1, 0.11, 0.13).mul(pow(max(dot(d, uMoon), 0), 12)));
  const gal = normalize(vec3(0.35, 0.5, -0.79));
  const bandW = exp(pow(dot(d, gal), 2).mul(-38));
  const dust = mx_fractal_noise_float(d.mul(6), 4).mul(0.5).add(0.5);
  c = c.add(vec3(0.05, 0.055, 0.07).mul(bandW).mul(dust).mul(smoothstep(0.02, 0.3, h)).mul(uVis));
  c = mix(c, uHazeCol, uHaze.mul(0.85));
  // At and below the horizon the dome is exactly the scene fog colour (the far ground ring is fully fogged out there), so ground and sky meet
  // with no seam and there is never a black gap; the glow band fades in over the first ~6 degrees above the horizon.
  domeMat.colorNode = select(d.y.lessThan(0), uFogCol.mul(1), mix(uFogCol.mul(1), c, smoothstep(0, 0.1, h)));
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
  const temps: number[] = []; for (let i = 0; i < N; i++) { const k = rnd(); for (let j = 0; j < 4; j++) temps.push(k); }
  sg.setAttribute('temp', new THREE.Float32BufferAttribute(temps, 1));
  const starMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const fade = smoothstep(0.03, 0.25, normalize(positionLocal).y);
  const tk = attribute('temp', 'float');
  const starCol = mix(mix(vec3(1, 0.78, 0.6), vec3(1, 0.96, 0.9), smoothstep(0, 0.3, tk)), vec3(0.75, 0.85, 1), smoothstep(0.6, 1, tk));
  const twinkle = sin(time.mul(tk.mul(7).add(3)).add(tk.mul(91))).mul(0.18).add(0.86).mul(mix(float(1), float(0.6), smoothstep(0.35, 0.05, normalize(positionLocal).y)));
  starMat.colorNode = starCol.mul(twinkle).mul(attribute('mag', 'float')).mul(fade).mul(uVis).mul(smoothstep(0.5, 0.1, length(uv().sub(0.5))));
  const stars = new THREE.Mesh(sg, starMat); stars.renderOrder = -2; stars.frustumCulled = false; group.add(stars);

  const uMoonVis = uniform(1);
  const moonMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const mr = length(uv().sub(0.5)).mul(2);
  const maria = mx_fractal_noise_float(vec3(uv().mul(14), 1.7), 3).mul(0.5).add(0.5);
  moonMat.colorNode = vec3(1, 0.98, 0.93).mul(smoothstep(0.17, 0.155, mr).mul(mix(float(1.75), float(1.15), smoothstep(0.45, 0.7, maria))).add(exp(mr.mul(-6)).mul(0.45))).mul(uMoonVis);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), moonMat);
  moon.position.copy(moonDir).normalize().multiplyScalar(R * 0.9); moon.lookAt(0, 0, 0);
  moon.renderOrder = -1; moon.frustumCulled = false; group.add(moon);
  // cloud layer: a flat-ish dome, fbm advected by wind, coverage set by weather; moonlit rims, dark bellies
  const cloudMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
  const cd = normalize(positionLocal), cy = max(cd.y, 0.02);
  const cp = vec2(cd.x, cd.z).div(cy).mul(0.9).add(vec2(time.mul(0.004), time.mul(0.0015)));
  const fbm = mx_fractal_noise_float(vec3(cp.mul(1.6), time.mul(0.003)), 5).mul(0.5).add(0.5);
  const cov = smoothstep(float(1).sub(uCloud).mul(0.75).add(0.15), float(1).sub(uCloud).mul(0.75).add(0.42), fbm);
  const lit = pow(max(dot(cd, uMoon), 0), 6).mul(0.35).add(0.08);
  cloudMat.colorNode = mix(vec3(0.07, 0.08, 0.1), vec3(0.32, 0.34, 0.38), clamp(lit.add(fbm.mul(0.15)), 0, 1)).mul(mix(float(1), float(0.7), uHaze));
  cloudMat.opacityNode = cov.mul(smoothstep(0.02, 0.2, cd.y)).mul(0.92);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 0.8, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat);
  clouds.renderOrder = -0.5; clouds.frustumCulled = false; group.add(clouds);
  void float; void sin; void mx_noise_float; void abs;
  return {
    group,
    /** 0 = clear, 1 = overcast (rain): hides stars/moon, hazes the dome. */
    setOvercast(k: number) { uVis.value = 1 - k; uMoonVis.value = 1 - 0.85 * k; uHaze.value = k; },
    /** the scene fog colour: the dome shows it at and below the horizon */
    setFog(c: THREE.ColorRepresentation) { uFogCol.value.set(c); },
    /** cloud coverage 0..1 and the colour the haze/fog blends the sky toward */
    setClouds(c: number, haze?: THREE.ColorRepresentation) { uCloud.value = c; if (haze !== undefined) uHazeCol.value.set(haze); },
    follow(cam: THREE.Camera) { group.position.copy(cam.position); },
  };
}
