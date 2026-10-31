import * as THREE from 'three/webgpu';
import { createSky } from './sky';
import { createFlyControls } from './flyControls';
import { loadArea } from './area/data';
import { buildTerrain, buildRoads, buildPoolsPiers } from './area/ground';
import { buildBuildings } from './area/buildings';

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
  const lambert = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  const groundMat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  const roadMat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const tMesh = buildTerrain(terrain, groundMat);
  const roads = buildRoads(area, terrain, roadMat);
  const pools = buildPoolsPiers(area, terrain, roadMat);
  const blds = buildBuildings(area.buildings, terrain, lambert);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardNodeMaterial({ color: 0x16404a, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false }));
  sea.name = 'sea'; sea.position.y = 0; sea.renderOrder = 1;
  scene.add(tMesh, roads, pools, blds.group, sea);

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
    stats: { buildings: blds.count, chunks: blds.group.children.length, roads: area.roads.length },
    update(dt: number) { controls.update(dt); sky.follow(camera); },
    setRainLook(k: number) { sky.setOvercast(k); (scene.fog as THREE.FogExp2).density = 0.00016 + k * 0.0012; },
  };
}
