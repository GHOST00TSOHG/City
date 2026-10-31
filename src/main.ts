import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three';
import { createScene, START } from './scene';
import { createBackdrop } from './backdrop';
import { nightUniforms } from './nightShader';
import { createStreetGlow } from './streetGlow';
import { createRain, createWeatherUI, type WeatherKind } from './weather';

const canvas = document.getElementById('city') as HTMLCanvasElement;
let backdrop: ReturnType<typeof createBackdrop> | null = null;
const app = createScene(canvas, () => (backdrop ? backdrop.group : app.fallback));
const key = (import.meta.env.VITE_GOOGLE_TILES_KEY ?? '').trim();
backdrop = key ? createBackdrop(key, app.camera, app.renderer, app.scene) : null;
if (!backdrop) {
  console.info('[City] VITE_GOOGLE_TILES_KEY not set: running with the night fallback ground (no Google 3D Tiles).');
}
app.fallback.visible = !backdrop;
const streetGlow = backdrop ? createStreetGlow(() => backdrop!.group) : null;
if (streetGlow) app.scene.add(streetGlow.points);

// Weather: Clear / Rain (snow + fog are hooks for later, no UI yet).
const rain = createRain();
app.scene.add(rain.mesh);
function setWeather(kind: WeatherKind, intensity = 0.6) {
  const k = kind === 'rain' ? intensity : 0;
  rain.mesh.visible = kind === 'rain';
  rain.setIntensity(intensity);
  nightUniforms.uWet.value = kind === 'rain' ? 0.4 + 0.6 * intensity : 0;
  app.setRainLook(k);
  // TODO(snow): instanced flakes reusing createRain with slower fall + sideways drift; uWet ~0.2.
  // TODO(fog): raise FogExp2 density + lighter fog colour, hide stars.
}
const weatherUI = createWeatherUI(setWeather);
(window as any).__setWeather = (k: WeatherKind, i?: number) => { if (k === 'clear' || k === 'rain') weatherUI.set(k); setWeather(k, i); };
(window as any).__cityCam = app.camera; (window as any).__cityControls = app.controls;

// Tiny controls hint, fades after a few seconds.
const hint = document.createElement('div');
hint.id = 'hint';
hint.textContent = 'WASD move · drag look · E/Q up/down · Shift fast · G walk';
document.body.appendChild(hint);
setTimeout(() => hint.classList.add('gone'), 6000);

const moonWorld = app.moon.position.clone().normalize();
const viewMat3 = new THREE.Matrix3();
app.renderer.info.autoReset = false; // count all composer passes per frame

const googleEl = document.getElementById('google')!;
const copyEl = document.getElementById('gcopy')!;
const statsEl = document.getElementById('stats')!;
// fps + draw-call HUD only with ?perf=1 (hidden by default).
const showStats = new URLSearchParams(location.search).get('perf') === '1';
statsEl.hidden = !showStats;

let frames = 0, last = performance.now(), fps = 0, attrTimer = 0, t = 0;
const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta(); t += dt;
  app.renderer.info.reset();
  app.update(dt);
  rain.update(t, app.camera.position);
  streetGlow?.update(dt);
  if (backdrop) {
    backdrop.update();
    attrTimer += dt;
    if (attrTimer > 0.5) {
      attrTimer = 0;
      const line = backdrop.copyright();
      googleEl.hidden = false;
      if (copyEl.textContent !== line) copyEl.textContent = line;
    }
  }
  viewMat3.setFromMatrix4(app.camera.matrixWorldInverse);
  nightUniforms.uMoonDirView.value.copy(moonWorld).applyMatrix3(viewMat3).normalize();
  app.composer.render(dt);
  backdrop?.budget(app.renderer.info.render.calls);
  frames++;
  const now = performance.now();
  if (now - last > 1000) {
    fps = (frames * 1000) / (now - last); frames = 0; last = now;
    const r = app.renderer.info.render;
    if (showStats) statsEl.textContent = `${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris`;
    (window as any).__city = { fps, calls: r.calls, triangles: r.triangles, tiles: !!backdrop, start: START.name, walk: app.controls.walk };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
