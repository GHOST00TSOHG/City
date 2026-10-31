import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three';
import { createScene, START } from './scene';
import { createBackdrop } from './backdrop';

const canvas = document.getElementById('city') as HTMLCanvasElement;
const app = createScene(canvas);
const key = (import.meta.env.VITE_GOOGLE_TILES_KEY ?? '').trim();
const backdrop = key ? createBackdrop(key, app.camera, app.renderer, app.scene) : null;
if (!backdrop) {
  console.info('[City] VITE_GOOGLE_TILES_KEY not set: running with the night fallback ground (no Google 3D Tiles).');
}
app.fallback.visible = !backdrop;

const googleEl = document.getElementById('google')!;
const copyEl = document.getElementById('gcopy')!;
const statsEl = document.getElementById('stats')!;
const showStats = new URLSearchParams(location.search).has('stats') || import.meta.env.DEV;
statsEl.hidden = !showStats;

let frames = 0, last = performance.now(), fps = 0, attrTimer = 0;
const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  app.update(dt);
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
  app.renderer.render(app.scene, app.camera);
  frames++;
  const now = performance.now();
  if (now - last > 1000) {
    fps = (frames * 1000) / (now - last); frames = 0; last = now;
    if (showStats) {
      const r = app.renderer.info.render;
      statsEl.textContent = `${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris`;
    }
    (window as any).__city = { fps, calls: app.renderer.info.render.calls, tiles: !!backdrop, start: START.name };
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
