import * as THREE from 'three/webgpu';
import { sin, cos, attribute, uniform, vec3, mod, normalize, cross, step, smoothstep, distance, positionLocal, varying, uv, float } from 'three/tsl';

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
/** GPU snow: one instanced draw of soft round flakes drifting and swaying around the camera. */
export function createSnow(count = 7000, box = 50) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seed[i] = Math.random();
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.instanceCount = count;
  const uTime = uniform(0), uCam = uniform(new THREE.Vector3()), uInt = uniform(0.5), B = float(box);
  const sd = attribute('seed', 'vec3');
  const sway = vec3(sin(uTime.mul(0.7).add(sd.y.mul(40))).mul(0.8), 0, cos(uTime.mul(0.55).add(sd.x.mul(30))).mul(0.8));
  const p0 = sd.mul(B).sub(vec3(-0.4, 1, -0.2).mul(uTime.mul(sd.z.mul(0.6).add(0.9)))).add(sway);
  const p = mod(p0.sub(uCam).add(B.mul(0.5)), B).add(uCam).sub(B.mul(0.5));
  const on = step(sd.x.mul(0.999), uInt);
  const toCam = normalize(uCam.sub(p)), side = normalize(cross(vec3(0, 1, 0), toCam)), up = cross(toCam, side);
  const size = sd.y.mul(0.05).add(0.04).mul(on);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  mat.positionNode = p.add(side.mul(positionLocal.x.mul(size))).add(up.mul(positionLocal.y.mul(size)));
  const a = varying(on.mul(float(1).sub(smoothstep(B.mul(0.25), B.mul(0.5), distance(p, uCam)))));
  mat.colorNode = vec3(0.85, 0.87, 0.9);
  mat.opacityNode = a.mul(smoothstep(0.5, 0.2, distance(uv(), vec3(0.5, 0.5, 0).xy))).mul(0.85);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
  return {
    mesh,
    setIntensity(v: number) { uInt.value = v; },
    update(t: number, camPos: THREE.Vector3) { uTime.value = t; uCam.value.copy(camPos); },
  };
}

/** Minimal weather picker: Clear, Rain, Snow, Fog buttons and an intensity slider (shown when not Clear). No helper text. */
export function createWeatherUI(onChange: (kind: WeatherKind, intensity: number) => void) {
  const el = document.createElement('div');
  el.id = 'weather';
  el.innerHTML = (['clear', 'rain', 'snow', 'fog'] as const).map((k) => `<button data-k="${k}" aria-pressed="${k === 'clear'}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('') +
    `<input type="range" min="0.1" max="1" step="0.05" value="0.6" aria-label="Intensity" hidden>`;
  document.body.appendChild(el);
  const slider = el.querySelector('input')!;
  let kind: WeatherKind = 'clear';
  const emit = () => onChange(kind, Number(slider.value));
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.k as WeatherKind;
    el.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    slider.hidden = kind === 'clear';
    emit();
  }));
  slider.addEventListener('input', emit);
  return { set(k: WeatherKind, i?: number) { if (i !== undefined) slider.value = String(i); (el.querySelector(`[data-k="${k}"]`) as HTMLButtonElement | null)?.click(); } };
}
