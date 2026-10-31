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

  const { area, terrain } = await loadArea(areaId);
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
  const tMesh = buildTerrain(terrain, groundMat);
  const roads = buildRoads(area, terrain, roadMat);
  const pools = buildPoolsPiers(area, terrain, roadMat);
  const blds = buildBuildings(area.buildings, terrain, lambert);
  const ocean = buildOcean(terrain), sea = ocean.mesh;
  const lamps = buildLamps(area.lamps, terrain);
  const trees = await buildTrees(area.trees as number[], terrain);
  const mask = await fetch(`${import.meta.env.BASE_URL}areas/${areaId}/ground-mask.bin`).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? parseGroundMask(b) : null)).catch(() => null);
  const grass = buildGrass(terrain, mask);
  scene.add(tMesh, roads, pools, blds.group, sea, lamps.posts, lamps.pools, trees.group, grass.mesh);

  const ground = (x: number, z: number) => Math.max(terrain.heightAt(x, z), 0);
  const controls = createFlyControls(camera, canvas, ground);
  const setView = (v0: View) => {
    const v = v0.snap ? snapToStreet(v0) : v0;
    camera.position.set(...v.pos); camera.lookAt(...v.look); controls.syncAngles();
    if (v0.snap || v.pos[1] < 3) controls.setWalk(true); else controls.setWalk(false);
  };
  // Street views snap to the nearest major/minor road so the camera stands on the street, looking along it.
  function snapToStreet(v: View): View {
    let best = Infinity, out = v;
    for (const r of area.roads) {
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
  const views = VIEWS[areaId] ?? [{ name: 'aerial', pos: [0, 400, 600], look: [0, 0, 0] }];
  setView(views.find((v) => v.name === qs.get('view')) ?? views[0]);

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyG') controls.setWalk(!controls.walk); });

  return {
    renderer, scene, camera, controls, sky, backend, area, views, setView,
    stats: { buildings: blds.count, trees: area.trees.length / 5, lamps: area.lamps.length, chunks: blds.group.children.length, roads: area.roads.length },
    update(dt: number) { controls.update(dt); sky.follow(camera); trees.update(camera.position); grass.update(camera.position); },
    /** One place that sets every weather-driven uniform. k = intensity 0..1. */
    setWeather(kind: WeatherKind, k: number) {
      const rain = kind === 'rain' ? k : 0, snow = kind === 'snow' ? k : 0, fog = kind === 'fog' ? k : 0;
      const fogCol = new THREE.Color(kind === 'fog' ? 0x3b4352 : kind === 'snow' ? 0x30374a : 0x0d1426);
      const f = scene.fog as THREE.FogExp2; f.color.copy(fogCol);
      f.density = 0.00016 + rain * 0.0012 + snow * 0.0022 + fog * 0.011;
      sky.setOvercast(Math.min(1, rain + snow + fog * 0.9));
      sky.setClouds(kind === 'clear' ? 0.22 : 0.55 + 0.45 * k, kind === 'fog' ? 0x2a3140 : kind === 'snow' ? 0x2a303c : 0x26334a);
      ocean.uRough.value = rain + snow * 0.4; uSkyRefl.value.set(kind === 'rain' ? 0x2e3c58 : 0x1a2438); ocean.uSky.value.set(kind === 'clear' ? 0x1a2438 : 0x141a24);
      trees.uWind.value = 1 + rain * 1.8 + snow * 0.6 - fog * 0.6; grass.uWind.value = 1 + rain * 1.5 + snow * 0.4 - fog * 0.6;
      grass.uWet.value = rain; grass.uSnow.value = snow; uWet.value = rain; uSnow.value = snow;
      lamps.uWet.value = rain; lamps.uFog.value = fog;
    },
  };
}
