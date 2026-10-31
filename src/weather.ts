import * as THREE from 'three';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog';

/** GPU rain: one instanced draw call of thin streaks, animated entirely in the vertex shader around the camera. */
export function createRain(count = 6000, box = 60) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) seed[i] = Math.random();
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: box }, intensity: { value: 0.5 } },
    vertexShader: `attribute vec3 seed; uniform float time, box, intensity; uniform vec3 cam; varying float a; varying float vy;
      void main(){
        vec3 p = seed * box;
        p.y -= time * (16.0 + seed.z * 6.0);
        p = mod(p - cam + box * 0.5, box) + cam - box * 0.5; // wrap around the camera
        float on = step(seed.x * 0.999, intensity) ; // fewer streaks at low intensity
        vec3 toCam = normalize(cam - p); vec3 side = normalize(cross(vec3(0.0,1.0,0.0), toCam));
        vec3 wp = p + side * position.x * 0.025 * on + vec3(0.0, position.y * 0.9 * on, 0.0);
        a = on * (1.0 - smoothstep(box * 0.25, box * 0.5, distance(p, cam))); vy = position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `varying float a; varying float vy; void main(){ gl_FragColor = vec4(vec3(0.55, 0.57, 0.6) * a * vy * 0.5, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
  return {
    mesh,
    setIntensity(v: number) { mat.uniforms.intensity.value = v; },
    update(t: number, camPos: THREE.Vector3) { mat.uniforms.time.value = t; mat.uniforms.cam.value.copy(camPos); },
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
