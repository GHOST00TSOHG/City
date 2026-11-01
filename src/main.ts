import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three/webgpu';
import { createScene } from './scene';
import { type RobotLook } from './robot/model';
import { createRobotSwitch } from './robot/typed';
import { TYPES, TYPE_KEYS, type RobotType } from './robot/types';
import { createCustomizer } from './robot/customizer';
import { createRobotFx } from './robot/fx';
import { loadSave, writeSave, lookOf, storeLook } from './save';
import { createRobotController } from './robot/controller';
import { createThrust } from './robot/thrust';
import { createRobotHud } from './robot/hud';
import { A6, budget } from './perf/frame';
import { gpu, installGpuHooks, resetGpuFrame } from './perf/gpuHooks';
import { createPerfOverlay } from './perf/overlay';
import { createBench } from './perf/bench';
import { diag } from './perf/diag';
import { pacing } from './perf/pacing';
import { quality, warmupTier, dynres, qualityLabel } from './perf/quality';
import { prewarm } from './perf/prewarm';
import { createRobotAudio } from './robot/audio';
import { createSnow, createRain, createWeatherUI, WEATHER_PRESETS, type WeatherKind } from './weather';

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

createScene(canvas, areaId).then(async (app) => {
  loading?.remove();
  installGpuHooks((app.renderer as any).backend); // per-frame upload bytes + pipeline compiles for the perf overlay / bench
  const rain = createRain(), snow = createSnow(); app.scene.add(rain.mesh, snow.mesh);
  const setWeather = (kind: WeatherKind, intensity = 0.6) => {
    app.setWeather(kind, intensity); // particles follow the eased mix in the frame loop, so they fade in/out with the sky
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
    try { await app.switchArea(id, view); setTitle(id); if (robotMode) { if (cust.open) placeHangar(); else dropIn(); } const u = new URL(location.href); u.searchParams.set('area', id); u.searchParams.delete('view'); history.replaceState(null, '', u); }
    catch (e) { console.warn('[City] area switch failed', e); bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === app.areaId))); }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    fade.classList.remove('on'); bar.querySelectorAll('button').forEach((b) => (b.disabled = false)); busy = false;
  };
  bar.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b?.dataset.a) switchTo(b.dataset.a); });
  // Preload the other areas' data one at a time once the first frame is up, so switching never waits on the network.
  const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
  idle(async () => { for (const [id] of AREAS) if (id !== areaId) await app.preload(id); });
  const hint = document.createElement('div'); hint.id = 'hint';
  hint.textContent = 'Free cam: WASD move · drag look · E/Q up/down · Shift fast · G walk · V robot';
  document.body.appendChild(hint); hint.classList.add('gone');

  // Player robot. Type, per-type build, paint + battle damage live in the versioned save (city.save.v2); the garage
  // opens on every entry. The robot is a switch host: changing type swaps the body under a stable root.
  const save = loadSave();
  const look: RobotLook = lookOf(save);
  const robot = await createRobotSwitch(save.robot.type, look); app.scene.add(robot.root);
  const parts = robot; // uniforms (energy / damage / sweep) live on the switch, shared by every type
  const fx = createRobotFx(app.scene, app.camera); fx.setColor(look.visor);
  let joints: THREE.Object3D[] = robot.joints;
  let damage = save.robot.damage, repairT = -1;
  const setDamage = (d: number) => { damage = Math.min(1, Math.max(0, d)); parts.uniforms.damage.value = damage; save.robot.damage = damage; writeSave(save); };
  setDamage(damage);
  const thrust = createThrust(app.scene, robot.nozzles.length); thrust.attach(robot.nozzles);
  const ctl = createRobotController(robot, app.camera, canvas, app.world);
  const sfx = createRobotAudio();
  const applyType = (t: RobotType) => { const d = TYPES[t]; ctl.setTuning(d.tune); ctl.setSpecial(d.motion.special, d.specialDur); ctl.setFlight(d.flight.launch); thrust.configure(d.flight); sfx.setType(t); };
  applyType(save.robot.type);
  robot.onSwap = () => { thrust.attach(robot.nozzles); joints = robot.joints; };
  idle(() => TYPE_KEYS.forEach((t) => robot.preload(t)));
  const switchType = (t: RobotType): RobotLook => {
    storeLook(save, cust.look); save.robot.type = t; writeSave(save);
    const l = lookOf(save); void robot.setType(t, l); applyType(t); fx.setColor(l.visor); return l;
  };
  const hud = createRobotHud();
  const dropIn = (height = 90) => { const s = app.spawnPoint(); ctl.spawn(s.x, s.ground + height, s.z, s.heading); };
  const heroDrop = () => { const s = app.spawnPoint(); ctl.heroDrop(s.x, s.ground + 160, s.z, s.heading); };
  ctl.onImpact = (p, k) => { fx.impact(p, k); sfx.hit(); };
  ctl.onSpecial = (kind, phase) => { if (phase === 'start') sfx.special(kind); if (phase === 'hit') fx.kick(kind === 'groundpound' ? 1 : 0.35); };
  let lastStep = 0, lastBurst = 0;
  const stepFx = () => { // footfalls every half gait cycle; heavier types shake the camera
    const n = Math.floor(ctl.phase / Math.PI), a = ctl.anim;
    if (n !== lastStep && (a === 'walk' || a === 'run') && ctl.mode === 'GROUND') { sfx.step(); const m = TYPES[save.robot.type].motion.mass; if (m > 1.5) fx.kick(0.12 * m); }
    lastStep = n; if (ctl.burstOn > 0.5 && lastBurst <= 0.5) sfx.boost(); lastBurst = ctl.burstOn;
  };
  let robotMode = qs.get('mode') !== 'free';
  const setRobotMode = (on: boolean) => {
    robotMode = on; ctl.setEnabled(on); app.controls.setEnabled(!on); hud.setVisible(on); thrust.setVisible(on);
    app.setFocus(on ? ctl.pos : null);
    if (!on) { app.camera.fov = 55; app.camera.updateProjectionMatrix(); app.controls.syncAngles(); hint.classList.remove('gone'); setTimeout(() => hint.classList.add('gone'), 5000); }
  };
  // Hangar (join screen): robot stands on the street start on a turntable; pick a look, then Drop in.
  const hangar = { x: 0, y: 0, z: 0, h: 0, yaw: 0, spin: 0.35, t: 0 };
  const placeHangar = () => { const s = app.spawnPoint(); hangar.x = s.x; hangar.z = s.z; hangar.h = s.heading; hangar.y = app.world.floorAt(s.x, s.z, s.ground + 1.5).y; hangar.yaw = s.heading + Math.PI * 0.85; ctl.pos.set(s.x, hangar.y, s.z); };
  const cust = createCustomizer(save.robot.type, look, () => damage, (l) => { robot.setLook(l); fx.setColor(l.visor); storeLook(save, l); writeSave(save); },
    (t) => switchType(t), () => setHangar(false), () => { if (damage > 0 && repairT < 0) repairT = 0; });
  const setHangar = (on: boolean) => {
    cust.setOpen(on); hud.setVisible(!on && robotMode); thrust.setVisible(!on && robotMode); ctl.setEnabled(!on && robotMode);
    if (on) { placeHangar(); robot.root.visible = true; robot.root.quaternion.identity(); app.setFocus(ctl.pos); } else if (robotMode) heroDrop();
  };
  let hdrag = false, hx = 0;
  canvas.addEventListener('pointerdown', (e) => { if (cust.open) { hdrag = true; hx = e.clientX; } });
  addEventListener('pointerup', () => (hdrag = false));
  canvas.addEventListener('pointermove', (e) => { if (cust.open && hdrag) { hangar.yaw += (e.clientX - hx) * 0.01; hx = e.clientX; hangar.spin = 0; } });
  const updateHangar = (dt: number) => {
    hangar.t += dt; hangar.yaw += hangar.spin * dt; const r = robot.root;
    r.position.set(hangar.x, hangar.y, hangar.z); r.quaternion.identity(); r.rotation.set(0, hangar.yaw, 0);
    robot.animate({ anim: 'idle', phase: 0, speed: 0, lean: 0, bank: 0, crouch: 0, t: hangar.t }, dt);
    // Camera in front of the street heading, robot framed right of the panel.
    // Framing scales with the type's height (2.0 m glitch .. 2.6 m heavy).
    const H = robot.height, fx = Math.sin(hangar.h), fz = Math.cos(hangar.h), d = 2.75 * H, cam = app.camera;
    cam.position.set(hangar.x + fx * d, hangar.y + 0.62 * H, hangar.z + fz * d);
    if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
    cam.lookAt(hangar.x - fz * 0.5 * H, hangar.y + 0.5 * H, hangar.z + fx * 0.5 * H);
  };
  const benchKind = (['walk', 'flight', 'all'] as const).find((k) => k === qs.get('bench')) ?? null, benchMode = !!benchKind;
  const joinScreen = robotMode && qs.get('join') !== '0' && !benchMode;
  setRobotMode(robotMode);
  if (joinScreen) setHangar(true); else if (robotMode) dropIn();
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (cust.open) return;
    if (e.code === 'KeyV' && !e.repeat) { if (!robotMode) dropIn(40); setRobotMode(!robotMode); }
    if (e.code === 'KeyR' && !e.repeat && robotMode) dropIn();
    if (e.code === 'KeyB' && !e.repeat && robotMode) setHangar(true);
    if (e.code === 'KeyX' && robotMode) ctl.charging = true;
    if (e.code === 'KeyK' && !e.repeat && robotMode) setDamage(damage + 0.25); // debug damage source until zombies exist
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyX') ctl.charging = false; });
  addEventListener('blur', () => (ctl.charging = false));
  // Near-miss slow-mo: at BURST speed, a wall within ~7 m to the side (but not ahead) dips time briefly.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let slowT = 0, slowCd = 0;
  const nearMiss = (dt: number) => {
    slowCd = Math.max(0, slowCd - dt); slowT = Math.max(0, slowT - dt);
    if (slowCd > 0 || reduced.matches || ctl.mode !== 'ROCKETS' || ctl.burstOn < 0.5) return;
    const v = ctl.vel, sp = Math.hypot(v.x, v.z); if (sp < 60) return;
    const fx0 = v.x / sp, fz0 = v.z / sp, p = ctl.pos, y = p.y + 0.4;
    if (app.world.blocked(p.x + fx0 * 8, p.z + fz0 * 8, y)) return;
    for (const side of [1, -1]) for (const d of [3, 5, 7]) if (app.world.blocked(p.x + fz0 * side * d, p.z - fx0 * side * d, y)) { slowT = 0.55; slowCd = 3; fx.kick(0.3); return; }
  };

  const statsEl = document.getElementById('stats')!;
  const showStats = qs.get('perf') === '1';
  statsEl.hidden = !showStats;
  const w = window as any;
  w.__setWeather = (k: WeatherKind, i = 0.6) => weatherUI.set(k, i);
  { const qw = new URLSearchParams(location.search).get('weather') as WeatherKind | null; if (qw && qw in WEATHER_PRESETS) { weatherUI.set(qw, 0.8); app.setWeather(qw, 0.8, true); } }
  w.__weather = () => ({ ...app.weatherMix });
  w.__cityCam = app.camera; w.__cityControls = app.controls; w.__cityScene = app.scene;
  w.__switchArea = (id: string, view?: string) => switchTo(id, view);
  w.__stats = () => app.stats;
  w.__enterBuilding = (inside = false) => app.enterBuilding(inside);
  w.__ground = (x: number, z: number, y = 1e9) => ({ floor: app.world.floorAt(x, z, y), spawn: app.spawnPoint() }); // tests: walkable height
  w.__robot = { ctl, model: robot, parts, fx, save, setDamage, heroDrop, nearMissState: () => ({ slowT, slowCd }), setMode: setRobotMode, dropIn, setLook: (l: Partial<RobotLook>) => cust.set(l), hangar: setHangar, customizer: cust, setType: (t: RobotType) => cust.setType(t), hangarState: hangar };
  w.__setCam = (pos: [number, number, number], look: [number, number, number]) => app.setView({ name: 'custom', pos, look }); // tests
  w.__setView = (name: string) => { const v = app.views.find((x) => x.name === name); if (v) app.setView(v); };

  // A6: compile every pipeline the flight can need (hidden rockets, crater, weather, empty LOD buckets) while the
  // garage is up, so nothing compiles on first sight mid-flight.
  if (A6) { const ms = await prewarm(app.renderer, app.scene, app.camera); console.info(`[City] prewarm ${ms.toFixed(0)} ms, ${gpu.totalCompiles} pipelines`); }
  const setPR = (pr: number) => { app.renderer.setPixelRatio(pr); app.renderer.setSize(innerWidth, innerHeight, false); };
  // Measure the display refresh (first second of rAFs) and pick the auto quality tier, still behind the garage/loading.
  await new Promise<void>((done) => { const f = (t: number) => { pacing.tick(t); if (pacing.hz) done(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await warmupTier(() => app.renderer.render(app.scene, app.camera), setPR, pacing.intervalMs);
  console.info(`[City] ${pacing.label()} · quality ${qualityLabel()}`, quality.warmup ?? '');
  const adapter = (() => { try { const i = (app.renderer.backend as any).adapter?.info; if (i) return [i.vendor, i.architecture, i.description].filter(Boolean).join(' '); const gl = (app.renderer.backend as any).gl as WebGL2RenderingContext | undefined; const x = gl?.getExtension('WEBGL_debug_renderer_info'); return x ? gl!.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; } })();
  const overlay = createPerfOverlay(() => `${app.backend} ${(app.renderer.info.render as any).drawCalls ?? app.renderer.info.render.calls} calls\n${pacing.label()} · ${qualityLabel()}`);
  if (showStats || qs.get('hud') === '1') overlay.setVisible(true);
  const bench = benchKind ? createBench(benchKind, { ctl, canvas,
    start: (walk) => { if (cust.open) setHangar(false); if (!robotMode) setRobotMode(true); dropIn(walk ? 1.5 : 40); },
    interiorEntry: () => app.interiorEntry(ctl.pos.x, ctl.pos.z), teleport: (x, y, z, h) => ctl.spawn(x, y, z, h),
    info: () => ({ backend: app.backend, adapter, area: app.areaId, budgetMs: budget.ms }) }) : null;
  if (bench) { overlay.setVisible(true); w.__benchRun = bench; }

  const fixedDt = +(qs.get('fixeddt') ?? 0); // capture hook: step the sim a fixed dt per rendered frame (slow renderers)
  let frames = 0, last = performance.now(), t = 0, cpuMs = 0, heap0 = 0;
  const mem = (performance as any).memory;
  const sec = (name: string, t: number) => { const n = performance.now(); diag.section(name, n - t); return n; };
  app.renderer.setAnimationLoop((now0: number) => {
    const frameMs = pacing.tick(now0); if (frameMs === null) return; // capped: skip this rAF (alternate frames at 120 Hz)
    const t0 = performance.now();
    const rec = diag.take(), heap = mem ? mem.usedJSHeapSize : 0;
    bench?.frame({ dt: frameMs, work: cpuMs, rec, compiles: gpu.compiles, texCalls: gpu.texCalls, texBytes: gpu.texBytes, geoBytes: gpu.geoBytes, heap }); heap0 = heap;
    overlay.frame(frameMs, cpuMs); resetGpuFrame(); budget.begin();
    if (dynres(frameMs, pacing.targetMs, setPR)) diag.event(`dynres -> ${quality.scale}`);
    // real rAF delta (never assumes 60 Hz); clamped so a stall doesn't fast-forward the world (physics also caps catch-up steps)
    const rdt = fixedDt ? ((w as any).__steps === undefined || (w as any).__steps-- > 0 ? fixedDt : 1e-6) : Math.min(frameMs, 100) / 1000; t += rdt;
    const dt = rdt * (slowT > 0 ? 0.3 + 0.7 * (1 - Math.sin((slowT / 0.55) * Math.PI)) : 1);
    let ts = t0;
    if (cust.open) {
      updateHangar(rdt); cust.tick();
      if (repairT >= 0) { // repair: scan band sweeps up each part while damage drains
        repairT += rdt; parts.uniforms.sweep.value = -0.35 + ((repairT * 0.9) % 0.8);
        damage = Math.max(0, damage - rdt * 0.6); parts.uniforms.damage.value = damage;
        if (damage <= 0 && repairT > 1) { repairT = -1; parts.uniforms.sweep.value = -1; setDamage(0); }
      }
    } else if (robotMode) { nearMiss(rdt); ctl.update(dt); ts = sec('physics+ground', ts); thrust.update(dt, ctl.thrust, ctl.burstOn, ctl.vel, ctl.floor.y, ctl.floor.water); hud.update(dt, ctl); stepFx(); }
    const energy = fx.update(dt, robot.root, ctl.vel, cust.open ? 0 : ctl.burstOn, ctl.charging, damage, joints, robotMode && !cust.open);
    if (parts) { parts.uniforms.energy.value = cust.open ? 1.2 : energy;
      const u = parts.uniforms; u.squint.value += ((cust.open ? 0 : ctl.burstOn) - u.squint.value) * Math.min(1, rdt * 8); u.xeyes.value = damage > 0.7 ? 1 : 0; }
    ts = sec('fx', ts);
    app.update(dt, t); const wm = app.weatherMix;
    rain.mesh.visible = wm.rain > 0.01; rain.setIntensity(wm.rain); snow.mesh.visible = wm.snow > 0.01; snow.setIntensity(wm.snow);
    rain.update(t, app.camera.position); snow.update(t, app.camera.position);
    ts = sec('world update (trees/grass/interiors)', ts);
    budget.run(); ts = sec('queued jobs', ts);
    app.renderer.render(app.scene, app.camera); sec('render submit', ts);
    cpuMs = performance.now() - t0;
    frames++;
    const now = performance.now();
    if (now - last > 1000) {
      const fps = (frames * 1000) / (now - last); frames = 0; last = now;
      const r = app.renderer.info.render;
      if (showStats) statsEl.textContent = `${fps.toFixed(0)} fps · ${r.drawCalls ?? r.calls} calls · ${(r.triangles / 1e3).toFixed(0)}k tris · ${app.backend}`;
      w.__city = { fps, quality: qualityLabel(), pacing: pacing.label(), heap0, calls: r.drawCalls ?? r.calls, triangles: r.triangles, backend: app.backend, area: app.areaId, ...app.stats, walk: app.controls.walk, hangar: cust.open, damage: +damage.toFixed(2), slowmo: slowT > 0, robot: robotMode && !cust.open ? { mode: ctl.mode, anim: ctl.anim, pos: ctl.pos.toArray().map((v: number) => +v.toFixed(1)), mph: +(ctl.vel.length() * 2.237).toFixed(0), burst: +ctl.burst.toFixed(2), charge: +fx.charge.toFixed(2) } : null, ready: true };
      w.__scene = app.scene;
    }
  });
}).catch((e) => {
  console.error('[City] failed to start', e);
  if (loading) loading.textContent = 'Could not load the city. Your browser needs WebGPU or WebGL2.';
});
