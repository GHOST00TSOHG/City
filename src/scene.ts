import * as THREE from 'three/webgpu';
import { createSky } from './sky';
import { createFlyControls } from './flyControls';
import { loadArea } from './area/data';
import { buildTerrain, buildRoads, buildPoolsPiers } from './area/ground';
import { buildBuildings } from './area/buildings';
import { createFacadeMaterial } from './area/facade';
import { buildLamps } from './area/lamps';
import { buildTrees } from './area/trees';
import { buildOcean } from './area/water';
import { buildGrass, parseGroundMask } from './area/grass';
import { buildFerryDock } from './area/ferry';
import { createInteriors } from './area/interiors';
import { vertexColor, uniform as tslUniform } from 'three/tsl';
import { positionWorld, vec3, time, normalize, smoothstep, mix, float, pow, max, cameraPosition, normalWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import type { WeatherKind } from './weather';

export interface View { name: string; pos: [number, number, number]; look: [number, number, number]; snap?: boolean }
/** Start views per area (public places only). Key West origin = Southernmost Point Buoy. */
export const VIEWS: Record<string, View[]> = {
  keywest: [
    { name: 'aerial', pos: [650, 420, 700], look: [-900, 0, -1300] },
    { name: 'oldtown', pos: [-520, 140, -760], look: [-1050, 0, -1350] },
    { name: 'duval', pos: [-905, 1.7, -1180], look: [-1060, 3, -1520], snap: true },
  ],
  // Origins: Twin Lights (Highlands), Sandy Hook Lighthouse, Newark Schools Stadium, Riverfront Park (Newark). Public places only.
  bayshore: [
    { name: 'aerial', pos: [500, 260, 300], look: [-700, 0, -1300] },
    { name: 'street', pos: [-700, 1.7, -1450], look: [-1300, 3, -1500], snap: true },
  ],
  sandyhook: [
    { name: 'aerial', pos: [900, 420, 1300], look: [-200, 0, -600] },
    { name: 'street', pos: [60, 1.7, 80], look: [60, 3, -400], snap: true },
  ],
  newark: [
    { name: 'aerial', pos: [650, 360, 650], look: [0, 0, 0] },
    { name: 'street', pos: [200, 1.7, 120], look: [700, 3, 120], snap: true },
  ],
  passaic: [
    { name: 'aerial', pos: [-600, 320, 800], look: [150, 0, -150] },
    { name: 'dock', pos: [0, 30, 0], look: [0, 0, 0] },
  ],
};

export async function createScene(canvas: HTMLCanvasElement, areaId: string) {
  const qs = new URLSearchParams(location.search);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: qs.get('gl') === '1', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps hues true at low light (ACES shifted night colours toward grey-orange)
  renderer.toneMappingExposure = 1.0;
  await renderer.init();
  const backend = (renderer.backend as any).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070c1a);
  scene.fog = new THREE.FogExp2(0x0d1426, 0.00016);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 40000);

  // Night lighting that keeps material colours honest: neutral moonlight key + soft sky/ground fill.
  const moonDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  const moon = new THREE.DirectionalLight(0xe4e9f5, 1.25); moon.position.copy(moonDir).multiplyScalar(1000);
  scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight(0xb2b8c6, 0x50483c, 1.15));
  const sky = createSky(moonDir); scene.add(sky.group);

  const facade = createFacadeMaterial(); const lambert = facade.material;
  const groundMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: 0 });
  const roadMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uWet = tslUniform(0), uSnow = tslUniform(0), uSkyRefl = tslUniform(new THREE.Color(0x1a2438));
  { // wet look: darker albedo, puddles (noise mask) that turn mirror-smooth and pick up the sky + lamp glints; snow cover on top
    const p = positionWorld, above = smoothstep(0.02, 0.25, p.y);
    const puddleN = mx_fractal_noise_float(vec3(p.x.mul(0.09), p.z.mul(0.09), 3.1), 3).mul(0.5).add(0.5);
    const ripple = mx_noise_float(vec3(p.x.mul(2.2), p.z.mul(2.2), time.mul(3))).mul(0.06);
    const mk = (puddleAt: number, dark: number, wetRough: number, snowAmt: number, gain: number) => {
      const puddle = smoothstep(puddleAt, puddleAt + 0.08, puddleN).mul(uWet).mul(above);
      const V = normalize(cameraPosition.sub(p)), fres = pow(float(1).sub(max(V.y, 0)), 4);
      const snowK = uSnow.mul(snowAmt).mul(above).mul(smoothstep(0.25, 0.55, puddleN.add(uSnow.mul(0.6))));
      const base = vertexColor().mul(gain).mul(float(1).sub(uWet.mul(dark))).mul(float(1).sub(puddle.mul(0.35)));
      return {
        color: mix(base, vec3(0.95, 0.96, 1), snowK),
        rough: mix(mix(float(0.95), float(wetRough), uWet), float(0.04), puddle).add(ripple.mul(puddle)).mul(float(1).sub(snowK.mul(0.1))),
        emissive: uSkyRefl.mul(fres.mul(1.6).add(0.35)).mul(puddle.add(uWet.mul(0.18))).mul(float(1).sub(snowK)).add(vec3(0.075, 0.08, 0.095).mul(snowK)), // snow glows faintly: it reflects the skyglow
      };
    };
    const g = mk(0.62, 0.3, 0.55, 1, 1.15), r = mk(0.52, 0.5, 0.3, 0.75, 1.5); // gain: Standard is darker than the old Lambert
    groundMat.colorNode = g.color; groundMat.roughnessNode = g.rough; groundMat.emissiveNode = g.emissive;
    roadMat.colorNode = r.color; roadMat.roughnessNode = r.rough; roadMat.emissiveNode = r.emissive;
  }
  { // snow settles on roofs and other up-facing building surfaces
    const fm = facade.material as any, base = fm.colorNode;
    const roof = uSnow.mul(smoothstep(0.55, 0.85, normalWorld.y));
    fm.colorNode = mix(base, vec3(0.95, 0.96, 1), roof);
    if (fm.emissiveNode) fm.emissiveNode = fm.emissiveNode.add(vec3(0.075, 0.08, 0.095).mul(roof));
  }
  const shared = new Set<THREE.Material>([groundMat, roadMat, lambert]);
  /** Builds one area's meshes into a group (not yet in the scene). Data comes from the preload cache when warm. */
  async function buildContent(id: string) {
    const { area, terrain, mask } = await loadArea(id);
    const group = new THREE.Group(); group.name = 'area:' + id;
    const blds = buildBuildings(area.buildings, terrain, lambert);
    const inland = !!(area as any).inland, ocean = buildOcean(terrain, inland), lamps = buildLamps(area.lamps, terrain);
    const trees = await buildTrees(area.trees as number[], terrain);
    const grass = buildGrass(terrain, mask ? parseGroundMask(mask) : null);
    const ferry = area.dock ? buildFerryDock(area.dock, terrain) : null;
    group.add(buildTerrain(terrain, groundMat), buildRoads(area, terrain, roadMat), buildPoolsPiers(area, terrain, roadMat), blds.group, ocean.mesh, lamps.posts, lamps.pools, trees.group, grass.mesh);
    if (ferry) group.add(ferry.group);
    const interiors = createInteriors(area.buildings, terrain); group.add(interiors.group);
    if (inland) { // land skirt beyond the bake so an inland city doesn't float in a void; fog hides the seam
      const { nx, nz, h, cell, x0, z0 } = terrain; const edge: number[] = [];
      for (let i = 0; i < nx; i++) edge.push(h[i], h[(nz - 1) * nx + i]); for (let j = 0; j < nz; j++) edge.push(h[j * nx], h[j * nx + nx - 1]);
      edge.sort((a, b) => a - b); const y = Math.max(edge[edge.length >> 1], 0) - 0.6;
      const W = cell * (nx - 1), H = cell * (nz - 1), ring = new THREE.Shape([new THREE.Vector2(-30000, -30000), new THREE.Vector2(30000, -30000), new THREE.Vector2(30000, 30000), new THREE.Vector2(-30000, 30000)]);
      ring.holes.push(new THREE.Path([new THREE.Vector2(x0 + 2, -(z0 + 2)), new THREE.Vector2(x0 + 2, -(z0 + H - 2)), new THREE.Vector2(x0 + W - 2, -(z0 + H - 2)), new THREE.Vector2(x0 + W - 2, -(z0 + 2))]));
      const skirt = new THREE.Mesh(new THREE.ShapeGeometry(ring).rotateX(-Math.PI / 2), new THREE.MeshLambertNodeMaterial({ color: 0x2b2a22 }));
      skirt.position.y = y; skirt.name = 'skirt'; group.add(skirt);
    }
    return { id, area, terrain, group, ocean, lamps, trees, grass, ferry, blds, interiors,
      dispose() { group.traverse((o: any) => { o.geometry?.dispose?.(); for (const m of [o.material].flat()) if (m && !shared.has(m)) m.dispose?.(); }); } };
  }
  let cur = await buildContent(areaId);
  scene.add(cur.group);

  const ground = (x: number, z: number) => cur.interiors.floorAt(x, z) ?? Math.max(cur.terrain.heightAt(x, z), 0);
  const controls = createFlyControls(camera, canvas, ground);
  const setView = (v0: View) => {
    let v = v0.snap ? snapToStreet(v0) : v0;
    const d = cur.area.dock;
    if (v0.name === 'dock' && d) { const x = d.x / 10, z = d.z / 10, a = d.a / 1000, c = Math.cos(a), s = Math.sin(a);
      v = { ...v0, pos: [x - c * 45 + s * 45, 22, z - s * 45 - c * 45], look: [x + c * 45, 1, z + s * 45] }; }
    camera.position.set(...v.pos); camera.lookAt(...v.look); controls.syncAngles();
    if (v0.snap || v.pos[1] < 3) controls.setWalk(true); else controls.setWalk(false);
  };
  // Street views snap to the nearest major/minor road so the camera stands on the street, looking along it.
  function snapToStreet(v: View): View {
    let best = Infinity, out = v;
    for (const r of cur.area.roads) {
      if (r.c > 1) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i] / 10, az = r.p[i + 1] / 10, bx = r.p[i + 2] / 10, bz = r.p[i + 3] / 10;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((v.pos[0] - ax) * dx + (v.pos[2] - az) * dz) / L2));
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - v.pos[0], pz - v.pos[2]);
        if (d < best) {
          best = d; const L = Math.sqrt(L2), ux = dx / L, uz = dz / L;
          const s = Math.sign((v.look[0] - px) * ux + (v.look[2] - pz) * uz) || 1, off = r.w / 2 - 1.2;
          const x = px - uz * off, z = pz + ux * off;
          out = { ...v, pos: [x, ground(x, z) + 1.7, z], look: [x + ux * s * 150, ground(x, z) + 4, z + uz * s * 150] };
        }
      }
    }
    return out;
  }
  const viewsOf = (id: string) => VIEWS[id] ?? [{ name: 'aerial', pos: [0, 400, 600], look: [0, 0, 0] }];
  setView(viewsOf(areaId).find((v) => v.name === qs.get('view')) ?? viewsOf(areaId)[0]);
  let weather: [WeatherKind, number] = ['clear', 0.6];

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyG') controls.setWalk(!controls.walk); });

  return {
    renderer, scene, camera, controls, sky, backend, setView,
    get areaId() { return cur.id; }, get area() { return cur.area; }, get views() { return viewsOf(cur.id); },
    get stats() { const a = cur.area; return { buildings: cur.blds.count, trees: a.trees.length / 5, lamps: a.lamps.length, chunks: cur.blds.group.children.length, interiorCands: cur.interiors.count, interior: cur.interiors.current, roads: a.roads.length }; },
    /** Warm the fetch cache for an area (data only; cheap, run when idle). */
    preload(id: string) { return loadArea(id).then(() => undefined, () => undefined); },
    /** Build the next area off-scene, compile its shaders, then swap in one frame and drop the old one. */
    async switchArea(id: string, viewName?: string) {
      if (id === cur.id) return;
      const next = await buildContent(id);
      next.group.visible = true;
      const tmp = new THREE.Scene(); tmp.add(next.group);
      try { await renderer.compileAsync(tmp, camera); } catch { /* compile is a warm-up only */ }
      const old = cur; scene.remove(old.group); scene.add(next.group); cur = next;
      const vs = viewsOf(id); setView(vs.find((v) => v.name === viewName) ?? vs[0]);
      this.setWeather(...weather);
      old.dispose();
    },
    update(dt: number, t = 0) { controls.update(dt); sky.follow(camera); cur.trees.update(camera.position); cur.grass.update(camera.position); cur.ferry?.update(t); cur.interiors.update(camera.position, ground(camera.position.x, camera.position.z), dt); },
    /** Stand outside (or inside) a generated interior near the area origin; loads it immediately. */
    enterBuilding(inside = false) { const e = cur.interiors.entry(); if (!e) return null; e.show(); const p = inside ? e.in : e.out; camera.position.set(p[0], p[1] + 1.7, p[2]); camera.lookAt(...e.look); if (inside) { const d = new THREE.Vector3(...e.look).sub(camera.position).setY(0).normalize(); camera.lookAt(camera.position.x + d.x, camera.position.y, camera.position.z + d.z); } controls.syncAngles(); controls.setWalk(true); return e.i; },
    /** One place that sets every weather-driven uniform. k = intensity 0..1. */
    setWeather(kind: WeatherKind, k: number) {
      weather = [kind, k]; const { ocean, trees, grass, lamps } = cur;
      const rain = kind === 'rain' ? k : 0, snow = kind === 'snow' ? k : 0, fog = kind === 'fog' ? k : 0;
      const fogCol = new THREE.Color(kind === 'fog' ? 0x3b4352 : kind === 'snow' ? 0x30374a : 0x0d1426);
      const f = scene.fog as THREE.FogExp2; f.color.copy(fogCol);
      f.density = 0.00016 + rain * 0.0012 + snow * 0.0022 + fog * 0.016;
      sky.setOvercast(Math.min(1, rain + snow + fog * 0.9));
      sky.setClouds(kind === 'clear' ? 0.22 : 0.55 + 0.45 * k, kind === 'fog' ? 0x2a3140 : kind === 'snow' ? 0x2a303c : 0x26334a);
      ocean.uRough.value = rain + snow * 0.4; uSkyRefl.value.set(kind === 'rain' ? 0x2e3c58 : 0x1a2438); ocean.uSky.value.set(kind === 'clear' ? 0x1a2438 : 0x141a24);
      trees.uWind.value = 1 + rain * 1.8 + snow * 0.6 - fog * 0.6; grass.uWind.value = 1 + rain * 1.5 + snow * 0.4 - fog * 0.6;
      grass.uWet.value = rain; grass.uSnow.value = snow; uWet.value = rain; uSnow.value = snow;
      lamps.uWet.value = rain; lamps.uFog.value = fog;
    },
  };
}
