import * as THREE from 'three/webgpu';
import { attribute, uniform, vec3, mod, normalize, cross, step, smoothstep, distance, positionLocal, varying, uv, float } from 'three/tsl';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog';

/** GPU rain (TSL): one instanced draw call of thin streaks, animated in the vertex stage around the camera. */
export function createRain(count = 6000, box = 60) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seed[i] = Math.random();
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.instanceCount = count;
  const uTime = uniform(0), uCam = uniform(new THREE.Vector3()), uInt = uniform(0.5), B = float(box);
  const sd = attribute('seed', 'vec3');
  const p0 = sd.mul(B).sub(vec3(0, uTime.mul(sd.z.mul(6).add(16)), 0));
  const p = mod(p0.sub(uCam).add(B.mul(0.5)), B).add(uCam).sub(B.mul(0.5));
  const on = step(sd.x.mul(0.999), uInt);
  const side = normalize(cross(vec3(0, 1, 0), normalize(uCam.sub(p))));
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  mat.positionNode = p.add(side.mul(positionLocal.x.mul(0.025).mul(on))).add(vec3(0, positionLocal.y.mul(0.9).mul(on), 0));
  const a = varying(on.mul(float(1).sub(smoothstep(B.mul(0.25), B.mul(0.5), distance(p, uCam)))));
  mat.colorNode = vec3(0.55, 0.57, 0.6).mul(a).mul(uv().y).mul(0.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
  return {
    mesh,
    setIntensity(v: number) { uInt.value = v; },
    update(t: number, camPos: THREE.Vector3) { uTime.value = t; uCam.value.copy(camPos); },
  };
}
/** Minimal Clear / Rain toggle + intensity slider. Snow and fog are code hooks only (no UI yet). */
export function createWeatherUI(onChange: (kind: WeatherKind, intensity: number) => void) {
  const el = document.createElement('div');
  el.id = 'weather';
  el.innerHTML = `<button data-k="clear" aria-pressed="true">Clear</button><button data-k="rain" aria-pressed="false">Rain</button>
    <input type="range" min="0.1" max="1" step="0.05" value="0.6" aria-label="Rain intensity" hidden>`;
  document.body.appendChild(el);
  const slider = el.querySelector('input')!;
  let kind: WeatherKind = 'clear';
  const emit = () => onChange(kind, Number(slider.value));
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.k as WeatherKind;
    el.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    slider.hidden = kind !== 'rain';
    emit();
  }));
  slider.addEventListener('input', emit);
  return { set(k: WeatherKind) { (el.querySelector(`[data-k="${k}"]`) as HTMLButtonElement | null)?.click(); } };
}
