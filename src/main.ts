import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three/webgpu';
import { createScene } from './scene';
import { createSnow, createRain, createWeatherUI, type WeatherKind } from './weather';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('city') as HTMLCanvasElement;
const loading = document.getElementById('loading');
/** Public area list for the switcher (ids match public/areas/<id>/). */
const AREAS: [string, string, string][] = [
  ['keywest', 'Key West', 'Key West, FL · Old Town'], ['bayshore', 'Highlands', 'Highlands, NJ · Bayshore'], ['sandyhook', 'Sandy Hook', 'Sandy Hook, NJ'],
  ['newark', 'Newark', 'Newark, NJ · Schools Stadium'], ['passaic', 'Passaic', 'Newark, NJ · Passaic waterfront'],
];
const areaId = AREAS.some((a) => a[0] === qs.get('area')) ? qs.get('area')! : 'keywest';
const titleEl = document.querySelector('#hud .title span');
const setTitle = (id: string) => { if (titleEl) titleEl.textContent = AREAS.find((a) => a[0] === id)?.[2] ?? id; };
setTitle(areaId);

createScene(canvas, areaId).then((app) => {
  loading?.remove();
  const rain = createRain(), snow = createSnow(); app.scene.add(rain.mesh, snow.mesh);
  const setWeather = (kind: WeatherKind, intensity = 0.6) => {
    rain.mesh.visible = kind === 'rain'; rain.setIntensity(intensity);
    snow.mesh.visible = kind === 'snow'; snow.setIntensity(intensity);
    app.setWeather(kind, intensity);
  };
  const weatherUI = createWeatherUI(setWeather);
  // Area switcher: fade to dark, build + compile the next area off-scene, swap, fade back in. No pop-in.
  const fade = document.createElement('div'); fade.id = 'fade'; document.body.appendChild(fade);
  const bar = document.createElement('div'); bar.id = 'areas';
  bar.innerHTML = AREAS.map(([id, label]) => `<button data-a="${id}" aria-pressed="${id === areaId}">${label}</button>`).join('');
  document.body.appendChild(bar);
  let busy = false;
  const switchTo = async (id: string, view?: string) => {
    if (busy || id === app.areaId) return; busy = true;
    bar.querySelectorAll('button').forEach((b) => { b.disabled = true; b.setAttribute('aria-pressed', String(b.dataset.a === id)); });
    fade.classList.add('on'); await new Promise((r) => setTimeout(r, 380));
    try { await app.switchArea(id, view); setTitle(id); const u = new URL(location.href); u.searchParams.set('area', id); u.searchParams.delete('view'); history.replaceState(null, '', u); }
    catch (e) { console.warn('[City] area switch failed', e); bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === app.areaId))); }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    fade.classList.remove('on'); bar.querySelectorAll('button').forEach((b) => (b.disabled = false)); busy = false;
  };
  bar.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b?.dataset.a) switchTo(b.dataset.a); });
  // Preload the other areas' data one at a time once the first frame is up, so switching never waits on the network.
  const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
  idle(async () => { for (const [id] of AREAS) if (id !== areaId) await app.preload(id); });
  const hint = document.createElement('div'); hint.id = 'hint';
  hint.textContent = 'WASD move · drag look · E/Q up/down · Shift fast · G walk';
  document.body.appendChild(hint); setTimeout(() => hint.classList.add('gone'), 6000);

  const statsEl = document.getElementById('stats')!;
  const showStats = qs.get('perf') === '1';
  statsEl.hidden = !showStats;
  const w = window as any;
  w.__setWeather = (k: WeatherKind, i = 0.6) => weatherUI.set(k, i);
  w.__cityCam = app.camera; w.__cityControls = app.controls;
  w.__switchArea = (id: string, view?: string) => switchTo(id, view);
  w.__enterBuilding = (inside = false) => app.enterBuilding(inside);
  w.__setView = (name: string) => { const v = app.views.find((x) => x.name === name); if (v) app.setView(v); };

  let frames = 0, last = performance.now(), t = 0;
  const timer = new THREE.Timer();
  app.renderer.setAnimationLoop(() => {
    timer.update(); const dt = timer.getDelta(); t += dt;
    app.update(dt, t); rain.update(t, app.camera.position); snow.update(t, app.camera.position);
    app.renderer.render(app.scene, app.camera);
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      const fps = (frames * 1000) / (now - last); frames = 0; last = now;
      const r = app.renderer.info.render;
      if (showStats) statsEl.textContent = `${fps.toFixed(0)} fps · ${r.drawCalls ?? r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris · ${app.backend}`;
      w.__city = { fps, calls: r.drawCalls ?? r.calls, triangles: r.triangles, backend: app.backend, area: app.areaId, ...app.stats, walk: app.controls.walk, ready: true };
    }
  });
}).catch((e) => {
  console.error('[City] failed to start', e);
  if (loading) loading.textContent = 'Could not load the city. Your browser needs WebGPU or WebGL2.';
});
