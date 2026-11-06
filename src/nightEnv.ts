import * as THREE from 'three/webgpu';
import { positionLocal, normalize, vec3, float, smoothstep, mix, pow, max, dot, atan, floor, fract, hash, mx_noise_float, uniform } from 'three/tsl';

/** Procedural night-city environment (PMREM-filtered) used for reflections on glass, wet roads and metal:
 *  deep night zenith, steel-blue horizon haze, warm amber and cool cyan skyline window bands, a crisp moon lobe. Same path on WebGPU and WebGL2. */
export function buildNightEnv(renderer: THREE.WebGPURenderer, moonDir: THREE.Vector3) {
  const env = new THREE.Scene();
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  const d = normalize(positionLocal), h = d.y;
  const zenith = vec3(0.012, 0.022, 0.06), mid = vec3(0.035, 0.06, 0.12), haze = vec3(0.16, 0.22, 0.32);
  let c: any = mix(haze, mid, smoothstep(0.0, 0.22, h));
  c = mix(c, zenith, smoothstep(0.15, 0.85, h));
  // skyline: windows as hashed cells along the azimuth, a ragged roof line, warm amber / cool cyan
  const az = atan(d.x, d.z).mul(1 / (Math.PI * 2)).add(0.5);
  const col = floor(az.mul(220)), row = floor(h.mul(90));
  const roof = mx_noise_float(vec3(az.mul(38), 0.7, 0.3)).mul(0.5).add(0.5).mul(0.11).add(0.025); // ragged skyline height
  const inSky = float(1).sub(smoothstep(roof.sub(0.004), roof, h)).mul(smoothstep(-0.02, 0.005, h));
  const lit = hash(col.mul(7.1).add(row.mul(13.7))).lessThan(0.34).select(float(1), float(0));
  const warmCool = hash(col.mul(3.3).add(1.7)).lessThan(0.62).select(vec3(1.0, 0.62, 0.28), vec3(0.45, 0.85, 1.0));
  const cell = fract(az.mul(220)).sub(0.5).abs().lessThan(0.32).select(float(1), float(0)).mul(fract(h.mul(90)).sub(0.5).abs().lessThan(0.3).select(float(1), float(0)));
  c = mix(c, vec3(0.02, 0.025, 0.04), inSky.mul(0.9)); // dark towers
  c = c.add(warmCool.mul(lit).mul(cell).mul(inSky).mul(1.6));
  c = c.add(vec3(0.25, 0.16, 0.08).mul(float(1).sub(smoothstep(0.0, 0.1, h.abs()))).mul(0.5)); // sodium glow on the horizon
  // ground below the horizon: dark wet asphalt with lamp glow
  c = mix(c, vec3(0.03, 0.03, 0.04).add(vec3(0.12, 0.07, 0.03).mul(smoothstep(0.35, 0.0, h.negate()))), smoothstep(0.0, -0.05, h));
  const u = uniform(moonDir.clone().normalize());
  c = c.add(vec3(1.0, 0.98, 0.92).mul(pow(max(dot(d, u), 0), 220)).mul(30)).add(vec3(0.07, 0.08, 0.11).mul(pow(max(dot(d, u), 0), 8)));
  mat.colorNode = c;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02, 0.1, 100);
  pm.dispose();
  env.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return rt.texture;
}
