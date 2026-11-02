import { quality } from './perf/quality';
import { diag } from './perf/diag';
import * as THREE from 'three/webgpu';
import { createSky } from './sky';
import { createFlyControls } from './flyControls';
import { registry, AREA_IDS, PRIORITY, OVERLAP_OWNERS, type AreaView, type AreaId, type Bounds } from './world/registry';
import { LINKS, buildLink, type Link } from './world/links';
import { buildFlightPath } from './world/flightpath';
import { player } from './world/player';
import { buildTerrain, buildRoads, buildPoolsPiers } from './area/ground';
import { buildBuildings, buildBuildingsFar } from './area/buildings';
import { createFacadeMaterial } from './area/facade';
import { loadMaterialTextures, styleFor, GROUND_GAIN, GROUND_SCALE } from './area/textures';
import { buildLamps } from './area/lamps';
import { buildTrees } from './area/trees';
import { A6 } from './perf/frame';
import { prewarm } from './perf/prewarm';
import { buildOcean } from './area/water';
import { buildFarGround } from './area/farGround';
import { buildGrass, parseGroundMask } from './area/grass';
import { buildFerryDock } from './area/ferry';
import { createInteriors } from './area/interiors';
import { createCollision } from './robot/collision';
import { buildLandmarks, cullUnderLandmarks, cullTreesUnderLandmarks, flattenUnderLandmarks, treesOutsideLandmarks, blockGrassUnderLandmarks } from './area/landmarks';
import { vertexColor, uniform as tslUniform, attribute, texture as tslTexture } from 'three/tsl';
import { positionWorld, vec3, time, normalize, smoothstep, mix, float, pow, max, cameraPosition, normalWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { createWeatherState, type WeatherKind } from './weather';

/** Night haze: the fog colour. Lifted from 0x15171d (which tone-mapped to near black) so the far ground reads as a hazy blue-grey and meets the horizon glow. */
const FOG_NIGHT = 0x1e2638;

export type View = AreaView;

export async function createScene(canvas: HTMLCanvasElement, areaId: string) {
  const qs = new URLSearchParams(location.search);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: qs.get('gl') === '1' || qs.get('backend') === 'webgl2', powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.basePR()); // tier pixel ratio (Air 1.25); the canvas is CSS-sized, so this upscales
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps hues true at low light (ACES shifted night colours toward grey-orange)
  renderer.toneMappingExposure = 1.0;
  await renderer.init();
  const backend = (renderer.backend as any).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  const eye = new THREE.Vector3(); // reused per frame (A6: no per-frame allocations)
  scene.background = new THREE.Color(0x070c1a);
  scene.fog = new THREE.FogExp2(FOG_NIGHT, 0.00016);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 40000);

  // Night lighting that keeps material colours honest: neutral moonlight key + soft sky/ground fill.
  const moonDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  const moon = new THREE.DirectionalLight(0xeceef2, 1.25); moon.position.copy(moonDir).multiplyScalar(1000);
  scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight(0xbcbcc0, 0x4c4842, 1.15));
  const sky = createSky(moonDir); scene.add(sky.group);

  const tex = await loadMaterialTextures(renderer);
  const facade = createFacadeMaterial(tex); const lambert = facade.material;
  const groundMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: 0 });
  const roadMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const uWet = tslUniform(0), uSnow = tslUniform(0), uSkyRefl = tslUniform(new THREE.Color(0x1a2438));
  { // wet look: darker albedo, puddles (noise mask) that turn mirror-smooth and pick up the sky + lamp glints; snow cover on top
    const p = positionWorld, above = smoothstep(0.02, 0.25, p.y);
    const puddleN = mx_fractal_noise_float(vec3(p.x.mul(0.09), p.z.mul(0.09), 3.1), 3).mul(0.5).add(0.5);
    const ripple = mx_noise_float(vec3(p.x.mul(2.2), p.z.mul(2.2), time.mul(3))).mul(0.06);
    // Ground albedo: CC0 texture layers blended by the per-vertex `gmat` weights; a low-frequency second grass sample
    // breaks up tiling. Under water (weights 0) the vertex colour (seabed) is used as before.
    const gw = attribute('gmat', 'vec4'), gws = gw.x.add(gw.y).add(gw.z).add(gw.w);
    const L = (i: number) => tslTexture(tex.ground, p.xz.div(GROUND_SCALE[i])).depth(float(i)).rgb.mul(GROUND_GAIN[i]).mul(i === 0 ? vec3(0.72, 1.0, 1.9) : vec3(1)); // grass: shift the yellow CC0 grass to a natural green
    const macro = tslTexture(tex.ground, p.xz.div(41)).depth(float(2)).rgb.mul(1.6).add(0.45).clamp(0.6, 1.25);
    const texMix = L(0).mul(gw.x).add(L(1).mul(gw.y)).add(L(2).mul(gw.z)).add(L(3).mul(gw.w)).div(gws.max(0.001)).mul(macro);
    const groundAlbedo = mix(vertexColor(), texMix.mul(vertexColor()), gws.clamp(0, 1));
    const mk = (puddleAt: number, dark: number, wetRough: number, snowAmt: number, gain: number, albedo: any = vertexColor()) => {
      const puddle = smoothstep(puddleAt, puddleAt + 0.08, puddleN).mul(uWet).mul(above);
      const V = normalize(cameraPosition.sub(p)), fres = pow(float(1).sub(max(V.y, 0)), 4);
      const snowK = uSnow.mul(snowAmt).mul(above).mul(smoothstep(0.25, 0.55, puddleN.add(uSnow.mul(0.6))));
      const base = albedo.mul(gain).mul(float(1).sub(uWet.mul(dark))).mul(float(1).sub(puddle.mul(0.35)));
      return {
        color: mix(base, vec3(0.95, 0.96, 1), snowK),
        rough: mix(mix(float(0.95), float(wetRough), uWet), float(0.04), puddle).add(ripple.mul(puddle)).mul(float(1).sub(snowK.mul(0.1))),
        emissive: uSkyRefl.mul(fres.mul(1.6).add(0.35)).mul(puddle.add(uWet.mul(0.18))).mul(float(1).sub(snowK)).add(vec3(0.075, 0.08, 0.095).mul(snowK)), // snow glows faintly: it reflects the skyglow
      };
    };
    const g = mk(0.62, 0.3, 0.55, 1, 1.0, groundAlbedo), r = mk(0.52, 0.5, 0.3, 0.75, 1.5); // gain: Standard is darker than the old Lambert
    groundMat.colorNode = g.color; groundMat.roughnessNode = g.rough; groundMat.emissiveNode = g.emissive;
    roadMat.colorNode = r.color.mul(mx_noise_float(positionWorld.mul(2.7)).mul(0.12).add(mx_noise_float(positionWorld.mul(0.35)).mul(0.08)).add(1)); // asphalt grain + patching
    roadMat.roughnessNode = r.rough; roadMat.emissiveNode = r.emissive;
  }
  { // snow settles on roofs and other up-facing building surfaces
    const fm = facade.material as any, base = fm.colorNode;
    const roof = uSnow.mul(smoothstep(0.55, 0.85, normalWorld.y));
    fm.colorNode = mix(base, vec3(0.95, 0.96, 1), roof);
    if (fm.emissiveNode) fm.emissiveNode = fm.emissiveNode.add(vec3(0.075, 0.08, 0.095).mul(roof));
  }
  const shared = new Set<THREE.Material>([groundMat, roadMat, lambert]);
  const farMat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  shared.add(farMat);
  const nextTask = () => new Promise<void>((r) => setTimeout(r, 0)); // let a frame render between the heavy stages of a tile build
  const inRect = (b: Bounds, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  const inAny = (rs: Bounds[], x: number, z: number) => rs.some((r) => inRect(r, x, z));
  /** Builds one tile's meshes into a group (not yet in the scene). Data (already in the shared world frame) comes from the registry cache. */
  async function buildContent(id: string) {
    const entry = registry.get(id), off = entry.worldOffset;
    const owners = (OVERLAP_OWNERS[id as AreaId] ?? []);
    for (const o of owners) await registry.loadData(o); // exact bounds of the tiles that own the overlap
    const skip = owners.map((o) => registry.get(o).bounds);
    const { area: area0, terrain, mask } = await registry.loadData(id);
    // where a higher-priority tile overlaps this one it owns the ground: drop our buildings, trees and lamps there (their terrain cells are skipped below)
    const area = skip.length ? { ...area0,
      buildings: area0.buildings.filter((b) => !inAny(skip, b.o[0] / 10, b.o[1] / 10)),
      trees: (() => { const o: number[] = []; for (let i = 0; i < area0.trees.length; i += 5) if (!inAny(skip, area0.trees[i] / 10, area0.trees[i + 1] / 10)) o.push(area0.trees[i], area0.trees[i + 1], area0.trees[i + 2], area0.trees[i + 3], area0.trees[i + 4]); return o; })(),
      lamps: area0.lamps.filter((l) => !inAny(skip, l[0] / 10, l[1] / 10)) } : area0;
    const group = new THREE.Group(); group.name = 'area:' + id;
    // Landmarks first: their footprints decide which generated buildings are never built (once per area load).
    const origin = entry.origin;
    const landmarks = qs.get('landmarks') === '0' ? { group: new THREE.Group(), colliders: [], footprints: [], pads: [] } : await buildLandmarks(id, origin, terrain, renderer, off);
    // Seat each landmark: level the ground under its pad to its base height (before the terrain mesh, roads, trees and grass sample it),
    // and keep trees and grass out of the pad.
    const grassMask = mask ? parseGroundMask(mask) : null;
    const lmTrees = treesOutsideLandmarks(area.trees as number[], landmarks.pads);
    if (landmarks.pads.length) console.info('[City] landmark pads', { flattened: flattenUnderLandmarks(terrain, landmarks.pads), treesRemoved: lmTrees.removed, grassCellsBlocked: grassMask ? blockGrassUnderLandmarks(grassMask, landmarks.pads) : 0 });
    const { kept: buildings, culled: landmarkCull } = cullUnderLandmarks(area.buildings, landmarks.footprints);
    if (Object.keys(landmarkCull).length) console.info('[City] buildings culled under landmarks', landmarkCull);
    await nextTask();
    const style = styleFor(id); const blds = buildBuildings(buildings, terrain, lambert, style);
    const farBlds = buildBuildingsFar(buildings, terrain, farMat); farBlds.visible = false;
    const inland = !!(area as any).inland, ocean = buildOcean(terrain, inland), lamps = buildLamps(area.lamps, terrain);
    await nextTask();
    const trees = await buildTrees(cullTreesUnderLandmarks(lmTrees.flat, landmarks.footprints), terrain, id === 'keywest'); // palms only in Key West
    trees.materials.forEach((m) => shared.add(m)); // species materials + textures are built once and reused by every area
    const grass = buildGrass(terrain, grassMask);
    const ferry = area.dock ? buildFerryDock(area.dock, terrain) : null;
    await nextTask();
    const roads = buildRoads(area, terrain, roadMat, landmarks.pads);
    group.add(buildTerrain(terrain, groundMat, style, skip), roads, buildPoolsPiers(area, terrain, roadMat), blds.group, farBlds, ocean.mesh, lamps.posts, lamps.pools, trees.group, grass.mesh);
    if (ferry) group.add(ferry.group);
    group.add(landmarks.group);
    await nextTask();
    const interiors = createInteriors(buildings, terrain); group.add(interiors.group);
    const collision = createCollision(buildings, terrain, landmarks.colliders);
    const ring = buildFarGround(terrain, inland); group.add(ring); // low-detail ring past the tile edge (matches the edge exactly, fades into the fog)
    const treeMeshes = trees.group.children.map((o) => ({ o: o as THREE.InstancedMesh, lo: (o as any).userData.lo as number, hi: (o as any).userData.hi as number }));
    let far = false;
    /** Simple detail (far tile, or high/fast flight): merged flat-top buildings, no lamps/grass/interiors/ferry, trees only as their far impostor. */
    const setFar = (f: boolean) => {
      if (f === far) return; far = f;
      blds.group.visible = !f; farBlds.visible = f; lamps.posts.visible = !f; lamps.pools.visible = !f; grass.mesh.visible = !f; interiors.group.visible = !f; if (ferry) ferry.group.visible = !f;
      const maxHi = Math.max(...treeMeshes.map((t) => t.hi));
      for (const t of treeMeshes) { t.o.visible = !f || t.hi >= maxHi; (t.o as any).userData.lo = f && t.hi >= maxHi ? 0 : t.lo; }
    };
    return { id, area, terrain, roads: roads.surface, landmarkCull, group, ocean, lamps, trees, grass, ferry, blds, interiors, collision, ring, farBlds, setFar, get far() { return far; },
      get bounds() { return registry.get(id).bounds; }, builtAt: performance.now(),
      dispose() { grass.dispose(); group.traverse((o: any) => { o.geometry?.dispose?.(); if (o.isInstancedMesh) o.dispose(); // instance buffers (matrix/colour) are not freed by geometry.dispose
        for (const m of [o.material].flat()) if (m && !shared.has(m)) m.dispose?.(); }); } };
  }
  type Content = Awaited<ReturnType<typeof buildContent>>;

  // ---- the world: every built tile lives in the one scene (data is already in world coordinates); links and rings are re-derived when the set changes ----
  const tiles = new Map<string, Content>(), links = new Map<string, Link>(), building = new Map<string, Promise<Content | null>>();
  const openSea = buildOcean(null); scene.add(openSea.mesh); shared.add(openSea.mesh.material as THREE.Material);
  const bay = registry.get('bayshore');
  const kwLook = registry.worldViews('keywest')[1].look; // old town
  const flight = buildFlightPath({ x: (bay.bounds.minX + bay.bounds.maxX) / 2, z: bay.bounds.maxZ + 40 }, { x: kwLook[0], z: kwLook[2] });
  scene.add(flight.group);
  const priorityTile = (x: number, z: number) => { for (const id of PRIORITY) { const t = tiles.get(id); if (t && inRect(t.bounds, x, z)) return t; } return null; };
  const linkAt = (x: number, z: number) => { for (const l of links.values()) if (inRect(l.rect, x, z)) return l; return null; };
  const nearestTile = (x: number, z: number) => { let b: Content | null = null, bd = Infinity; for (const t of tiles.values()) { const d = registry.distTo(t.id, x, z); if (d < bd) { bd = d; b = t; } } return b; };
  const tileRects = () => [...tiles.values()].map((t) => t.bounds);
  /** Re-own rings, cut sea planes and (de)build links after tiles were added or removed. */
  function refreshWorld() {
    for (const def of LINKS) {
      const have = links.get(def.id), A = tiles.get(def.a), B = tiles.get(def.b);
      if (have && !(A && B)) { scene.remove(have.group); have.dispose(); links.delete(def.id); }
      else if (!have && A && B) {
        try { const l = buildLink(def, registry.get(def.a).bundle!, registry.get(def.b).bundle!, groundMat, roadMat); links.set(def.id, l); scene.add(l.group); }
        catch (e) { console.warn('[City] link failed', def.id, e); }
      }
    }
    const lr = [...links.values()].map((l) => l.rect);
    for (const t of tiles.values()) {
      const others = [...[...tiles.values()].filter((o) => o !== t).map((o) => o.bounds), ...lr];
      t.ring.cull(t.bounds, others);
      t.ocean.setHoles((OVERLAP_OWNERS[t.id as AreaId] ?? []).filter((o) => tiles.has(o)).map((o) => tiles.get(o)!.bounds));
    }
    openSea.setHoles(tileRects());
    applyWeather();
  }
  const WANT_DEPS = (id: string): string[] => (OVERLAP_OWNERS[id as AreaId] ?? []).flatMap((o) => [...WANT_DEPS(o), o]);
  let fastHigh = false; // world-wide simple-detail switch: high or fast flight
  const farWanted = (t: Content) => fastHigh || registry.distTo(t.id, camera.position.x, camera.position.z) > (t.far ? 2200 : 2500);
  /** Builds a tile (owners first), compiles it off-scene, then adds it in one go. Concurrent calls for one id share the work. */
  function ensureTile(id: string): Promise<Content | null> {
    if (tiles.has(id)) return Promise.resolve(tiles.get(id)!);
    if (building.has(id)) return building.get(id)!;
    const run = async () => {
      for (const d of WANT_DEPS(id)) await ensureTile(d);
      const tb = performance.now(); const next = await buildContent(id); diag.event('area build', performance.now() - tb);
      const tmp = new THREE.Scene(); next.group.visible = true; tmp.add(next.group);
      if (A6) await prewarm(renderer, tmp, camera, scene); else try { await renderer.compileAsync(tmp, camera); } catch { /* warm-up only */ }
      tmp.remove(next.group);
      next.setFar(farWanted(next)); scene.add(next.group); tiles.set(id, next); registry.setTile(id, next);
      refreshWorld();
      console.info(`[City] tile ${id} built in ${(performance.now() - tb).toFixed(0)} ms`);
      return next;
    };
    const p = run().catch((e) => { console.warn('[City] tile build failed', id, e); return null; }).finally(() => building.delete(id));
    building.set(id, p); return p;
  }
  function dropTile(id: string) {
    const t = tiles.get(id); if (!t) return;
    scene.remove(t.group); tiles.delete(id); registry.setTile(id, null); t.dispose(); refreshWorld();
    console.info(`[City] tile ${id} unloaded`);
  }

  const wx = createWeatherState();
  const cRain = new THREE.Color(), cTmp = new THREE.Color();
  const act0 = await ensureTile(areaId); if (!act0) throw new Error('could not build area ' + areaId);
  let act: Content = act0;
  const setActive = (t: Content) => { if (act === t && registry.activeId === t.id) return; act = t; registry.setActive(t.id); player.area = t.id; };
  setActive(act);

  const ground = (x: number, z: number) => {
    const t = priorityTile(x, z);
    if (t) return t.interiors.floorAt(x, z) ?? Math.max(t.roads.surfaceAt(x, z), 0); // road/sidewalk top, not the terrain under it
    const l = linkAt(x, z); if (l) return l.floorAt(x, z) ?? 0;
    const n = nearestTile(x, z); return n ? Math.max(n.terrain.heightAt(x, z), 0) : 0; // outside every tile: the ring continues the nearest edge; sea is 0
  };
  const controls = createFlyControls(camera, canvas, ground);
  const setView = (v0: View) => {
    let v = v0.snap ? snapToStreet(v0) : v0;
    const d = act.area.dock;
    if (v0.name === 'dock' && d) { const x = d.x / 10, z = d.z / 10, a = d.a / 1000, c = Math.cos(a), s = Math.sin(a);
      v = { ...v0, pos: [x - c * 45 + s * 45, 22, z - s * 45 - c * 45], look: [x + c * 45, 1, z + s * 45] }; }
    camera.position.set(...v.pos); camera.lookAt(...v.look); controls.syncAngles();
    if (v0.snap || v.pos[1] < 3) controls.setWalk(true); else controls.setWalk(false);
  };
  // Street views snap to the nearest major/minor road so the camera stands on the street, looking along it.
  function snapToStreet(v: View): View {
    let best = Infinity, out = v;
    for (const r of act.area.roads) {
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
  const viewsOf = (id: string) => registry.worldViews(id);
  setView(viewsOf(areaId).find((v) => v.name === qs.get('view')) ?? viewsOf(areaId)[0]);
  /** One place that writes every weather-driven uniform from the eased mix (all built tiles share it). */
  function applyWeather() {
    const { rain, snow, fog, wet, snowCover } = wx.mix;
    const f = scene.fog as THREE.FogExp2;
    f.color.set(FOG_NIGHT).lerp(cTmp.set(0x34373e), Math.min(1, snow * 1.4)).lerp(cTmp.set(0x3e4148), Math.min(1, fog));
    sky.setFog(f.color);
    f.density = 0.00016 + rain * 0.0012 + snow * 0.0022 + fog * 0.016;
    const cover = Math.min(1, rain + snow + fog * 0.9); sky.setOvercast(cover);
    sky.setClouds(0.22 + cover * 0.78, cRain.set(0x26334a).lerp(cTmp.set(0x2a303c), snow).lerp(cTmp.set(0x2a3140), Math.min(1, fog)));
    uSkyRefl.value.set(0x1a2438).lerp(cTmp.set(0x2e3c58), Math.min(1, rain * 1.5));
    for (const ocean of [openSea, ...[...tiles.values()].map((t) => t.ocean)]) { ocean.uRough.value = rain + snow * 0.4; ocean.uSky.value.set(0x1a2438).lerp(cTmp.set(0x141a24), Math.min(1, cover * 1.5)); }
    for (const { trees, grass, lamps } of tiles.values()) {
      trees.uWind.value = 1 + rain * 1.8 + snow * 0.6 - fog * 0.6; grass.uWind.value = 1 + rain * 1.5 + snow * 0.4 - fog * 0.6;
      grass.uWet.value = wet; grass.uSnow.value = snowCover; lamps.uWet.value = wet; lamps.uFog.value = fog;
    }
    uWet.value = wet; uSnow.value = snowCover;
  }
  applyWeather();

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyG' && controls.enabled) controls.setWalk(!controls.walk); });
  /** Robot world queries: walkable floor (interior slab, roof when above it, ground, sea level) and wall blocking, for whichever tile is under (x, z). */
  const world = {
    floorAt(x: number, z: number, y: number) {
      const t = priorityTile(x, z);
      if (!t) { const th = ground(x, z); return { y: th, water: th <= 0 && !linkAt(x, z), roof: false }; }
      const fl = t.interiors.floorAt(x, z), th = t.roads.surfaceAt(x, z), roof = t.collision.roofAt(x, z);
      if (roof !== null && y >= roof) return { y: roof, water: false, roof: true };
      if (fl !== null) return { y: fl, water: false, roof: false };
      return { y: Math.max(th, 0), water: th < 0, roof: false };
    },
    blocked(x: number, z: number, y: number) { const t = priorityTile(x, z); if (!t) return false; const r = t.collision.roofAt(x, z); return r !== null && y < r && t.interiors.floorAt(x, z) === null; },
  };

  // ---- streaming: rings around the player, flight-aware ----
  const TICK = 0.25;
  const stream = { radius: 0, lead: 0, want: [] as string[], aim: {} as Record<string, number>, builds: 0, unloads: 0, lastTick: 0, ring0: 1500, base: Number(qs.get('ring') ?? 4000), enabled: qs.get('stream') !== '0' };
  const dirV = new THREE.Vector3();
  function streamTick(dt: number) {
    const p = player.pos, v = player.vel, speed = v.length(), alt = player.altitude;
    // simple detail when high or fast (hysteresis)
    fastHigh = fastHigh ? !(alt < 200 && speed < 55) : (alt > 250 || speed > 70);
    for (const t of tiles.values()) t.setFar(farWanted(t));
    const T = Math.min(6, Math.max(1, 0.5 + alt / 200));
    const R = stream.base + speed * T + 1.5 * alt; // design note: 1.5 km + speed*T + 1.5*alt; base raised to 4 km because tiles are small and fog allows ~10 km of view
    stream.radius = R; stream.lead = speed * T;
    if (speed > 1) dirV.copy(v).divideScalar(speed);
    const wanted = new Set<string>();
    for (const id of AREA_IDS) {
      const d = registry.distTo(id, p.x, p.z), e = registry.get(id);
      if (d < 3 * R) void registry.loadData(id).catch(() => {}); // ring 2: data only
      let aimed = d < stream.ring0 * 2 || d < stream.base * 0.6;
      if (!aimed && d < R && speed > 20) { // ring 1 ahead of us: the cone must point at it for ~1 s
        const cx = (e.bounds.minX + e.bounds.maxX) / 2 - p.x, cz = (e.bounds.minZ + e.bounds.maxZ) / 2 - p.z, cl = Math.hypot(cx, cz) || 1;
        const dot = (dirV.x * cx + dirV.z * cz) / cl;
        stream.aim[id] = dot > 0.5 ? (stream.aim[id] ?? 0) + dt : 0; aimed = stream.aim[id] >= 1;
      } else if (!aimed) stream.aim[id] = 0;
      if (aimed) wanted.add(id);
    }
    for (const id of [...wanted]) for (const dep of WANT_DEPS(id)) wanted.add(dep);
    stream.want = [...wanted];
    // one build at a time, nearest first
    if (stream.enabled && !building.size) {
      const todo = [...wanted].filter((id) => !tiles.has(id)).sort((a, b) => registry.distTo(a, p.x, p.z) - registry.distTo(b, p.x, p.z));
      if (todo.length) { stream.builds++; void ensureTile(todo[0]); }
    }
    // unload what left ring 1 (hysteresis, a dwell time, never the tile we are in, never an owner someone built on)
    if (stream.enabled) for (const t of [...tiles.values()]) {
      if (t === act || wanted.has(t.id) || performance.now() - t.builtAt < 8000) continue;
      if ([...tiles.values()].some((o) => o !== t && WANT_DEPS(o.id).includes(t.id))) continue;
      if (registry.distTo(t.id, p.x, p.z) > R * 1.5 + 2500) { stream.unloads++; dropTile(t.id); }
    }
  }

  return {
    renderer, scene, camera, controls, sky, backend, setView, world, flight, stream,
    /** Drop-in point: the street start view (on a road) if the area has one, else the first view's look target. World coordinates. */
    spawnPoint() { const vs = viewsOf(act.id); const v = vs.find((x) => x.snap); const s = v ? snapToStreet(v) : null; const p = s ? s.pos : vs[0].look; const l = s ? s.look : [0, 0, 0]; return { x: p[0], z: p[2], ground: ground(p[0], p[2]), heading: Math.atan2(l[0] - p[0], l[2] - p[2]) }; },
    get areaId() { return registry.activeId!; }, get area() { return act.area; }, get views() { return viewsOf(act.id); },
    get stats() { const a = act.area; return { buildings: act.blds.count, trees: a.trees.length / 5, palms: act.trees.palms, lamps: a.lamps.length, chunks: act.blds.group.children.length, landmarkCull: act.landmarkCull, interiorCands: act.interiors.count, interior: act.interiors.current, roads: a.roads.length }; },
    /** world state for tests / HUD: built tiles, links, detail mode, streaming ring */
    worldState() { return { tiles: [...tiles.values()].map((t) => ({ id: t.id, far: t.far, bounds: t.bounds })), building: [...building.keys()], links: [...links.values()].map((l) => ({ id: l.def.id, rect: l.rect, path: l.path, tris: l.triangles })), fastHigh, active: act.id,
      stream: { radius: stream.radius, lead: stream.lead, want: stream.want, builds: stream.builds, unloads: stream.unloads }, flight: { gates: flight.gates, length: flight.length, end: flight.end } }; },
    interiorEntry(x: number, z: number) { return act.interiors.entry(x, z); },
    /** Warm the data cache for an area (cheap, run when idle). */
    preload(id: string) { return registry.loadData(id).then(() => undefined, () => undefined); },
    /** Make sure the area's tile is built (streaming would do it as we approach), then view it. Other tiles stream in/out around the new position. */
    async switchArea(id: string, viewName?: string) {
      if (id === act.id) return;
      const t = await ensureTile(id); if (!t) throw new Error('area build failed: ' + id);
      setActive(t); t.setFar(false);
      const vs = viewsOf(id); setView(vs.find((v) => v.name === viewName) ?? vs[0]);
      applyWeather();
    },
    update(dt: number, t = 0) {
      if (wx.tick(Math.min(dt, 0.1))) applyWeather();
      if (controls.enabled) controls.update(dt);
      const f = player.pos;
      const here = priorityTile(f.x, f.z) ?? nearestTile(f.x, f.z); if (here && here !== act) setActive(here);
      stream.lastTick += dt; if (stream.lastTick >= TICK) { streamTick(stream.lastTick); stream.lastTick = 0; }
      sky.follow(camera);
      for (const tl of tiles.values()) {
        if (tl.far) continue;
        const d = registry.distTo(tl.id, camera.position.x, camera.position.z);
        if (d < 600) tl.trees.update(camera.position);
        if (tl === act) { tl.grass.update(d === 0 ? camera.position : eye.set(camera.position.x, 1e5, camera.position.z)); tl.ferry?.update(t); tl.interiors.update(player.avatar ? eye.set(f.x, f.y + 1.6, f.z) : f, ground(f.x, f.z), dt); }
      }
    },
    /** Stand outside (or inside) a generated interior near the area origin; loads it immediately. */
    enterBuilding(inside = false) { const e = act.interiors.entry(); if (!e) return null; e.show(); const p = inside ? e.in : e.out; camera.position.set(p[0], p[1] + 1.7, p[2]); camera.lookAt(...e.look); if (inside) { const d = new THREE.Vector3(...e.look).sub(camera.position).setY(0).normalize(); camera.lookAt(camera.position.x + d.x, camera.position.y, camera.position.z + d.z); } controls.syncAngles(); controls.setWalk(true); return e.i; },
    /** Set the weather target; the live mix eases toward it in update() (see WeatherState). */
    setWeather(kind: WeatherKind, k: number, instant = false) { wx.set(kind, k); if (instant) wx.snap(); applyWeather(); },
    /** Live eased weather weights (rain/snow particles read these so they fade with the sky). */
    get weatherMix() { return wx.mix; },
    tileCount: () => tiles.size,
    /** Build every tile now (memory / worst-case measurements; streaming normally keeps ~2-4 of them). */
    async loadAll() { for (const id of AREA_IDS) await ensureTile(id); },
  };
}
