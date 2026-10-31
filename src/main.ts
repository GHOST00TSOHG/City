import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three';
import { createScene, START } from './scene';

// Phase 0 reset: Google 3D Tiles removed (no key, no Google data). Phase 1 renders the baked open-data areas.
const canvas = document.getElementById('city') as HTMLCanvasElement;
const app = createScene(canvas);
const statsEl = document.getElementById('stats')!;
const showStats = new URLSearchParams(location.search).has('stats') || import.meta.env.DEV;
statsEl.hidden = !showStats;

let frames = 0, last = performance.now(), fps = 0;
const clock = new THREE.Clock();
function frame() {
  app.update(clock.getDelta());
  app.renderer.render(app.scene, app.camera);
  frames++;
  const now = performance.now();
  if (now - last > 1000) {
    fps = (frames * 1000) / (now - last); frames = 0; last = now;
    const r = app.renderer.info.render;
    if (showStats) statsEl.textContent = `${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris`;
    (window as any).__city = { fps, calls: r.calls, start: START.name };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
