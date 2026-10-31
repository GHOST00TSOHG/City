import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three/webgpu';
import { createScene } from './scene';
import { createRain, createWeatherUI, type WeatherKind } from './weather';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('city') as HTMLCanvasElement;
const loading = document.getElementById('loading');
const areaId = qs.get('area') ?? 'keywest';

createScene(canvas, areaId).then((app) => {
  loading?.remove();
  const rain = createRain(); app.scene.add(rain.mesh);
  const setWeather = (kind: WeatherKind, intensity = 0.6) => {
    rain.mesh.visible = kind === 'rain'; rain.setIntensity(intensity); app.setRainLook(kind === 'rain' ? intensity : 0);
  };
  const weatherUI = createWeatherUI(setWeather);
  const hint = document.createElement('div'); hint.id = 'hint';
  hint.textContent = 'WASD move · drag look · E/Q up/down · Shift fast · G walk';
  document.body.appendChild(hint); setTimeout(() => hint.classList.add('gone'), 6000);

  const statsEl = document.getElementById('stats')!;
  const showStats = qs.get('perf') === '1';
  statsEl.hidden = !showStats;
  const w = window as any;
  w.__setWeather = (k: WeatherKind, i?: number) => { if (k === 'clear' || k === 'rain') weatherUI.set(k); setWeather(k, i); };
  w.__cityCam = app.camera; w.__cityControls = app.controls;
  w.__setView = (name: string) => { const v = app.views.find((x) => x.name === name); if (v) app.setView(v); };

  let frames = 0, last = performance.now(), t = 0;
  const timer = new THREE.Timer();
  app.renderer.setAnimationLoop(() => {
    timer.update(); const dt = timer.getDelta(); t += dt;
    app.update(dt); rain.update(t, app.camera.position);
    app.renderer.render(app.scene, app.camera);
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      const fps = (frames * 1000) / (now - last); frames = 0; last = now;
      const r = app.renderer.info.render;
      if (showStats) statsEl.textContent = `${fps.toFixed(0)} fps · ${r.drawCalls ?? r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris · ${app.backend}`;
      w.__city = { fps, calls: r.drawCalls ?? r.calls, triangles: r.triangles, backend: app.backend, area: areaId, ...app.stats, walk: app.controls.walk, ready: true };
    }
  });
}).catch((e) => {
  console.error('[City] failed to start', e);
  if (loading) loading.textContent = 'Could not load the city. Your browser needs WebGPU or WebGL2.';
});
