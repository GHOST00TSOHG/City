import { quality } from './perf/quality';
import { diag } from './perf/diag';
import * as THREE from 'three/webgpu';
import { createSky } from './sky';
import { createFlyControls } from './flyControls';
import { registry, AREA_IDS, PRIORITY, OVERLAP_OWNERS, type AreaView, type AreaId, type Bounds } from './world/registry';
import { LINKS, buildLink, type Link } from './world/links';
import { buildFlightPath } from './world/flightpath';
import { player } from './world/player';
import { buildTerrain, buildPoolsPiers } from './area/ground';
import { buildTileGeo } from './area/geoClient';
import { freeCpuAfterFirstDraw } from './area/geom';
import { buildBuildings, buildBuildingsFar } from './area/buildings';
import { createFacadeMaterial } from './area/facade';
import { loadMaterialTextures, styleFor, GROUND_GAIN, GROUND_SCALE } from './area/textures';
import { buildLamps } from './area/lamps';
import { buildClearance, placeLamps, placeTrees } from './area/clearance';
import { buildTrees } from './area/trees';
import { A6 } from './perf/frame';
import { prewarm } from './perf/prewarm';
import { buildOcean } from './area/water';
import { buildFarGround } from './area/farGround';
import { createLodFade, nearMask, farMask } from './area/lodFade';
import { buildGrass, parseGroundMask } from './area/grass';
import { buildFerryDock } from './area/ferry';
import { createInteriors } from './area/interiors';
import { createCollision } from './robot/collision';
import { buildLandmarks, cullUnderLandmarks, cullTreesUnderLandmarks, flattenUnderLandmarks, treesOutsideLandmarks, blockGrassUnderLandmarks } from './area/landmarks';
import { vertexColor, uniform as tslUniform, attribute, texture as tslTexture } from 'three/tsl';
import { positionWorld, vec3, time, normalize, smoothstep, mix, float, pow, max, cameraPosition, normalWorld, mx_noise_float, mx_fractal_noise_float } from 'three/tsl';
import { createWeatherState, type WeatherKind } from './weather';
import { buildNightEnv } from './nightEnv';
import { initPackLibrary, usedPaths } from './area/packLibrary';
import { planTowns, carveRoads, buildTowns, packMaterial, TOWN_META, type TownSite } from './area/packTowns';
import { buildPackCity, buildRealistic } from './area/packCity';
import { uLampGain } from './area/lamps';
import { TUNE_DEFAULTS, type Tune } from './devPanel';

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
  initPackLibrary(renderer);
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
  // Night-city reflection environment (PMREM): glass towers, wet roads and metal pick up skyline bands and the moon.
  try { scene.environment = buildNightEnv(renderer, moonDir); scene.environmentIntensity = 1.2; } catch (e) { console.warn('[City] environment map skipped', e); }
  const tune: Tune = { ...TUNE_DEFAULTS };

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
    // Road surfaces: the vertex alpha tags the kind (255 asphalt, ~200 sidewalk, ~150 curb face). Asphalt gets multi-frequency aggregate grain, patching and
    // polished/oily wear streaks; sidewalks get expansion joints; wet roads turn glossy so the lamps and skyline reflect.
    const kindA = vertexColor().a, isWalk = smoothstep(0.7, 0.75, kindA).mul(float(1).sub(smoothstep(0.85, 0.9, kindA))), isCurb = float(1).sub(smoothstep(0.55, 0.62, kindA));
    const isAsph = float(1).sub(isWalk).sub(isCurb);
    const grain = mx_noise_float(p.mul(2.7)).mul(0.1).add(mx_noise_float(p.mul(9.5)).mul(0.07)).add(mx_noise_float(p.mul(31)).mul(0.05)).add(mx_noise_float(p.mul(0.35)).mul(0.08)).add(1);
    const streak = smoothstep(0.1, 0.5, mx_noise_float(vec3(p.x.mul(0.35), p.y, p.z.mul(0.35)).mul(vec3(1, 1, 1)))).mul(0.5); // polished, darker wear lanes
    const jx = p.x.div(1.6).fract().sub(0.5).abs(), jz = p.z.div(1.6).fract().sub(0.5).abs();
    const joint = smoothstep(0.485, 0.498, max(jx, jz)); // expansion joints every 1.6 m
    const walkTone = vec3(1).sub(joint.mul(0.22)).mul(mx_noise_float(p.mul(5)).mul(0.05).add(1));
    roadMat.colorNode = mix(r.color.mul(grain).mul(float(1).sub(streak.mul(0.14))), r.color.mul(walkTone), isWalk.add(isCurb));
    roadMat.metalnessNode = float(0);
    roadMat.roughnessNode = r.rough.mul(mix(float(1).sub(streak.mul(0.25).mul(isAsph)), float(1.05), isWalk.add(isCurb))).clamp(0.03, 1); roadMat.emissiveNode = r.emissive.mul(float(1).sub(isCurb.mul(0.7)));
  }
  { // snow settles on roofs and other up-facing building surfaces
    const fm = facade.material as any, base = fm.colorNode;
    const roof = uSnow.mul(smoothstep(0.55, 0.85, normalWorld.y));
    fm.colorNode = mix(base, vec3(0.95, 0.96, 1), roof);
    if (fm.emissiveNode) fm.emissiveNode = fm.emissiveNode.add(vec3(0.075, 0.08, 0.095).mul(roof));
  }
  const shared = new Set<THREE.Material>([groundMat, roadMat, lambert, packMaterial()]);
  const farMat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  shared.add(farMat);
  (lambert as any).maskNode = nearMask(); (farMat as any).maskNode = farMask(); // near <-> far building detail cross-fade (lodFade.ts)
  const SEA_SIDES: Record<string, string[]> = { passaic: ['s'] }; // inland tiles whose far ring faces open water on that side (see farGround.ts)
  const SK = new Set((qs.get('skipstage') ?? '').split(',')); // debug: ?skipstage=int,col,trees,grass builds that stage empty (RSS attribution)
  const TILELOG =qs.get('tilelog') === '1';
  const nextTask = () => new Promise<void>((r) => setTimeout(r, 0)); // let a frame render between the heavy stages of a tile build
  const inRect = (b: Bounds, x: number, z: number) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  const inAny = (rs: Bounds[], x: number, z: number) => rs.some((r) => inRect(r, x, z));
  /** Builds one tile's meshes into a group (not yet in the scene). Data (already in the shared world frame) comes from the registry cache. */
  async function buildContent(id: string) {
    const entry = registry.get(id), off = entry.worldOffset;
    let lap = performance.now(); const mark = (n: string) => { const t = performance.now(); if (TILELOG && t - lap > 10) console.info(`[City] stage ${id} ${n} ${(t - lap).toFixed(0)} ms`); lap = performance.now(); };
    const owners = (OVERLAP_OWNERS[id as AreaId] ?? []);
    for (const o of owners) await registry.loadData(o); // exact bounds of the tiles that own the overlap
    const skip = owners.map((o) => registry.get(o).bounds);
    const { area: area0, terrain, mask } = await registry.loadData(id); mark('data');
    // where a higher-priority tile overlaps this one it owns the ground: drop our buildings, trees and lamps there (their terrain cells are skipped below)
    // ...and drop any building the owner already has at the same spot (its bake covers a little more than its terrain rect, so along the cut the same OSM building was drawn twice: 15 found in run F)
    const ownerHas = (() => { const g = new Map<string, number[]>(); for (const o of owners) for (const b of registry.get(o).bundle?.area.buildings ?? []) { const k = Math.round(b.o[0] / 30) + ',' + Math.round(b.o[1] / 30); (g.get(k) ?? g.set(k, []).get(k)!).push(b.o[0], b.o[1]); }
      return (x: number, z: number) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = g.get((Math.round(x / 30) + i) + ',' + (Math.round(z / 30) + j)); if (a) for (let q = 0; q < a.length; q += 2) if (Math.abs(a[q] - x) < 30 && Math.abs(a[q + 1] - z) < 30) return true; } return false; }; })();
    const areaBase = skip.length ? { ...area0,
      buildings: area0.buildings.filter((b) => !inAny(skip, b.o[0] / 10, b.o[1] / 10) && (qs.get('ovl') === '0' || !ownerHas(b.o[0], b.o[1]))),
      trees: (() => { const o: number[] = []; for (let i = 0; i < area0.trees.length; i += 5) if (!inAny(skip, area0.trees[i] / 10, area0.trees[i + 1] / 10)) o.push(area0.trees[i], area0.trees[i + 1], area0.trees[i + 2], area0.trees[i + 3], area0.trees[i + 4]); return o; })(),
      lamps: area0.lamps.filter((l) => !inAny(skip, l[0] / 10, l[1] / 10)) } : area0;
    if (skip.length) console.info('[City] overlap', id, 'buildings dropped (owner rect / same footprint at owner):', area0.buildings.length - areaBase.buildings.length, 'of', area0.buildings.length);
    const group = new THREE.Group(); group.name = 'area:' + id;
    // Landmarks first: their footprints decide which generated buildings are never built (once per area load).
    const origin = entry.origin;
    const landmarks = qs.get('landmarks') === '0' ? { group: new THREE.Group(), colliders: [], footprints: [], pads: [] } : await buildLandmarks(id, origin, terrain, renderer, off);
    // Landmarks of a tile whose overlap THIS tile owns (Newark's Penn Station, Military Park and Wars of America stand on Passaic's ground): their pads, footprints and
    // colliders apply here too, so the ground is levelled under them, our buildings under them are culled and the robot collides with them (run F, overlap seam).
    for (const [other, os] of Object.entries(OVERLAP_OWNERS)) {
      if (!os?.includes(id as AreaId) || qs.get('landmarks') === '0' || qs.get('ovl') === '0') continue; // ?ovl=0: run F overlap fixes off (before/after shots)
      const od = await registry.loadData(other), oe = registry.get(other);
      const lm = await buildLandmarks(other, oe.origin, od.terrain, renderer, oe.worldOffset, { padsOnly: true, within: entry.bounds });
      landmarks.pads.push(...lm.pads); landmarks.footprints.push(...lm.footprints); landmarks.colliders.push(...lm.colliders);
      if (lm.pads.length) console.info('[City] landmarks of', other, 'seated on', id, lm.pads.map((p) => p.id));
    }
    // Seat each landmark: level the ground under its pad to its base height (before the terrain mesh, roads, trees and grass sample it),
    // and keep trees and grass out of the pad.
    // Custom small towns: choose each site and register its pad + footprint like a landmark, so the ground is levelled and nothing else is built there.
    const wv = registry.worldViews(id), cpos = (v: [number, number, number]) => ({ x: v[0], z: v[2] });
    const avoidZones = [...landmarks.pads.map((q) => ({ x: (q.minX + q.maxX) / 2, z: (q.minZ + q.maxZ) / 2, r: Math.max(q.maxX - q.minX, q.maxZ - q.minZ) / 2 + 24 })),
      ...wv.filter((v) => v.snap).flatMap((v) => [{ ...cpos(v.pos), r: 130 }, { ...cpos(v.look), r: 90 }]), ...wv.map((v) => ({ ...cpos(v.look), r: 50 }))];
    const anchors: Record<string, [number, number]> = { edo: [wv[0].look[0], wv[0].look[2]], cyber: [wv[0].look[0], wv[0].look[2]], paris: [wv[wv.length - 1].look[0], wv[wv.length - 1].look[2]], harbor: [wv[1].look[0], wv[1].look[2]], outpost: [wv[0].look[0], wv[0].look[2]] };
    const sites: TownSite[] = qs.get('towns') === '0' ? [] : planTowns(id, areaBase, terrain, avoidZones, anchors);
    for (const st of sites) { landmarks.pads.push(st.pad); landmarks.footprints.push(st.footprint); }
    if (sites.length) console.info('[City] towns', id, sites.map((q) => `${q.id}@${q.cx.toFixed(0)},${q.cz.toFixed(0)} y${q.y}`));
    const area = sites.length ? { ...areaBase, roads: carveRoads(areaBase.roads, sites) } : areaBase;
    const lmTreesInput = area.trees as number[];
    const grassMask = mask ? parseGroundMask(mask) : null; mark('mask');
    const lmTrees = treesOutsideLandmarks(lmTreesInput, landmarks.pads);
    if (landmarks.pads.length) console.info('[City] landmark pads', { flattened: flattenUnderLandmarks(terrain, landmarks.pads), treesRemoved: lmTrees.removed, grassCellsBlocked: grassMask ? blockGrassUnderLandmarks(grassMask, landmarks.pads) : 0 });
    mark('landmarks+flatten');
    const { kept: buildings0, culled: landmarkCull } = cullUnderLandmarks(area.buildings, landmarks.footprints); mark('cull');
    // Pack content: towns, then city-wide building replacement + street life. Replaced buildings leave the procedural list so they are never double-drawn.
    // shared clearance index: every street segment + junction + footprint + town rect; lamps, trees, street life and pack buildings obey it (clearance.ts)
    const ck = buildClearance(id, { roads: area.roads, buildings: buildings0 });
    const towns = sites.length ? await buildTowns(sites, terrain) : null; if (towns) landmarks.colliders.push(...towns.colliders); mark('towns');
    const cc = wv[0].look, city = qs.get('packcity') === '0' ? null : await buildPackCity(id, buildings0, area, terrain, [cc[0], cc[2]], ck);
    const buildings = (city ? city.rest : buildings0).filter((b) => { const r = ck.nearestRoad(b.o[0] / 10, b.o[1] / 10); return !r || r.gap > 0.5; }); // a footprint centred on street asphalt is a data error if (city) landmarks.colliders.push(...city.colliders); mark('pack city');
    const real = towns?.real.length ? await buildRealistic(towns.real, 14) : null;
    const packGroups: THREE.Object3D[] = [towns?.group, city?.group, real?.group].filter(Boolean) as THREE.Object3D[];
    if (towns || city) console.info(`[City] pack ${id}: towns ${towns ? towns.placed + ' items ' + (towns.tris / 1000).toFixed(0) + 'k tris' : '-'}, city ${city ? city.replaced + ' buildings, ' + city.furniture + ' street props, ' + city.roofProps + ' roof props, ' + (city.tris / 1000).toFixed(0) + 'k tris' : '-'}, realistic ${real ? real.draws + ' draws' : '-'}`);
    if (Object.keys(landmarkCull).length) console.info('[City] buildings culled under landmarks', landmarkCull);
    await nextTask();
    const style = styleFor(id); const tg = await buildTileGeo(terrain, buildings, area.roads, style, roadMat, lambert, farMat, groundMat, skip); // roads + building meshes: built in a short-lived worker
    const blds = tg.blds, farBlds = tg.far; farBlds.visible = false; mark('geo-worker');
    const inland = !!(area as any).inland, ocean = buildOcean(terrain, inland), lampList = placeLamps(area.lamps, ck), lamps = buildLamps(lampList, terrain); mark('ocean+lamps');
    await nextTask();
    const treeList = SK.has('trees') ? [] : placeTrees(cullTreesUnderLandmarks(lmTrees.flat, landmarks.footprints), ck), trees = await buildTrees(treeList, terrain, id === 'keywest'); // palms only in Key West
    trees.materials.forEach((m) => shared.add(m)); // species materials + textures are built once and reused by every area
    const grass = buildGrass(terrain, SK.has('grass') ? null : grassMask); mark('trees+grass');
    const ferry = area.dock ? buildFerryDock(area.dock, terrain) : null;
    await nextTask();
    const roads = tg.roads;
    mark('ferry'); await nextTask(); lap = performance.now();
    const poolsPiers = buildPoolsPiers(area, terrain, roadMat); mark('pools+piers'); await nextTask(); lap = performance.now();
    group.add(tg.ground, roads, poolsPiers, blds.group, farBlds, ocean.mesh, lamps.posts, lamps.pools, trees.group, grass.mesh);
    if (ferry) group.add(ferry.group);
    group.add(landmarks.group, ...packGroups); mark('terrain+roads+pools');
    await nextTask(); lap = performance.now();
    const interiors = await createInteriors(SK.has('int') ? [] : buildings, terrain); group.add(interiors.group);
    const collision = await createCollision(SK.has('col') ? [] : buildings, terrain, landmarks.colliders); mark('interiors+collision');
    const ring = buildFarGround(terrain, inland, SEA_SIDES[id] ?? []); group.add(ring); mark('far ring'); // low-detail ring past the tile edge (matches the edge exactly, fades into the fog)
    group.traverse((o: any) => { if (o.isMesh && !o.isInstancedMesh && /^(roads|terrain|pools\+piers|buildings-far|bld )/.test(o.name)) freeCpuAfterFirstDraw(o); });
    const treeMeshes = trees.group.children.map((o) => ({ o: o as THREE.InstancedMesh, lo: (o as any).userData.lo as number, hi: (o as any).userData.hi as number }));
    let far = false, ready = false;
    /** Simple detail (far tile, or high/fast flight): merged flat-top buildings, no lamps/grass/interiors/ferry, trees only as their far impostor. */
    let tiny = false; // trees are sub-pixel (very high, or the tile is > 5 km away): no tree meshes at all
    const lod = createLodFade();
    /** Cross-fade of near buildings <-> far mesh: both draw while `lod.near` is between 0 and 1 (one extra draw call for ~0.4 s). */
    const applyFade = () => { const a = lod.near; blds.group.userData.fade = a; farBlds.userData.fade = 1 - a; blds.group.visible = a > 0; farBlds.visible = a < 1; };
    const fadeStep = (dt: number) => { if (lod.step(dt)) applyFade(); };
    const setFar = (f: boolean, vh = false, instant = false) => {
      if (!ready || (f === far && vh === tiny)) return; far = f; tiny = vh;
      lod.set(f, instant); applyFade(); lamps.posts.visible = !f; lamps.pools.visible = !f; grass.mesh.visible = !f; interiors.group.visible = !f; if (ferry) ferry.group.visible = !f; for (const g of packGroups) g.visible = !f;
      const maxHi = Math.max(...treeMeshes.map((t) => t.hi));
      for (const t of treeMeshes) { t.o.visible = !tiny && (!f || t.hi >= maxHi); (t.o as any).userData.lo = f && t.hi >= maxHi ? 0 : t.lo; }
    };
    const roadChunks = roads.children as THREE.Mesh[];
    // Point lights (stadium flood banks) must not come and go with a tile: a changed light count re-lights, i.e. recompiles, EVERY lit material (an 80-330 ms frame on
    // Newark load/unload, run G). They are lifted out of the group and drawn by a fixed pool of scene lights (floodPool) that exists from boot.
    group.updateMatrixWorld(true);
    const floods: Flood[] = [];
    group.traverse((o) => { const l = o as THREE.PointLight; if (l.isPointLight) floods.push({ parent: l.parent!, pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: l.intensity, distance: l.distance, decay: l.decay }); });
    for (const f of floods) for (const l of f.parent.children.filter((c) => (c as any).isPointLight)) f.parent.remove(l);
    if (floods.length) console.info(`[City] ${id}: ${floods.length} flood point lights moved to the scene pool`);
    return { id, floods, sites, packGroups, audit: { ck, lampList, treeList, towns, city, buildings }, area, terrain, roads: roads.surface, roadChunks, landmarkCull, group, ocean, lamps, trees, grass, ferry, blds, interiors, collision, ring, farBlds, setFar, fadeStep, get far() { return far; }, get ready() { return ready; }, setReady(v: boolean) { ready = v; },
      get bounds() { return registry.get(id).bounds; }, builtAt: performance.now(),
      dispose() { grass.dispose(); group.traverse((o: any) => { o.geometry?.dispose?.(); if (o.isInstancedMesh) o.dispose(); // instance buffers (matrix/colour) are not freed by geometry.dispose
        for (const m of [o.material].flat()) if (m && !shared.has(m)) m.dispose?.(); }); } };
  }
  type Content = Awaited<ReturnType<typeof buildContent>>;
  interface Flood { parent: THREE.Object3D; pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; decay: number }
  const FLOOD_POOL = Number(qs.get('pool') ?? 4);
  const floodPool = Array.from({ length: FLOOD_POOL }, () => { const l = new THREE.PointLight(0xfff1dc, 0, 160, 1.6); l.position.set(0, -1e5, 0); scene.add(l); return l; });
  /** Hands the tiles' flood lights to the fixed pool (visible ones only). Cheap; changes intensity/position, never the light count. */
  function assignFloods() {
    let n = 0;
    for (const t of tiles.values()) for (const f of t.floods) {
      if (n >= FLOOD_POOL) break;
      let vis = (t as any).ready !== false; for (let o: THREE.Object3D | null = f.parent; o && vis; o = o.parent) if (!o.visible) vis = false;
      if (!vis) continue;
      const l = floodPool[n++]; l.position.copy(f.pos); l.color.copy(f.color); l.intensity = f.intensity; l.distance = f.distance; l.decay = f.decay;
    }
    for (; n < FLOOD_POOL; n++) { floodPool[n].intensity = 0; floodPool[n].position.set(0, -1e5, 0); }
  }

  // ---- the world: every built tile lives in the one scene (data is already in world coordinates); links and rings are re-derived when the set changes ----
  const tiles = new Map<string, Content>(), links = new Map<string, Link>(), building = new Map<string, Promise<Content | null>>();
  const openSea = buildOcean(null); scene.add(openSea.mesh); shared.add(openSea.mesh.material as THREE.Material);
  const bay = registry.get('bayshore');
  const kwLook = registry.worldViews('keywest')[1].look; // old town
  const flight = buildFlightPath({ x: (bay.bounds.minX + bay.bounds.maxX) / 2, z: bay.bounds.maxZ + 40 }, { x: kwLook[0], z: kwLook[2] });
  scene.add(flight.group);
  const priorityTile = (x: number, z: number) => { for (const id of PRIORITY) { const t = tiles.get(id); if (t && inRect(t.bounds, x, z)) return t; } return null; };
  const linkAt = (x: number, z: number) => { for (const l of links.values()) if (inRect(l.rect, x, z)) return l; return null; };
  let townTick = 0; // frame counter for the throttled per-town distance cull
  const nearestTile = (x: number, z: number) => { let b: Content | null = null, bd = Infinity; for (const t of tiles.values()) { const d = registry.distTo(t.id, x, z); if (d < bd) { bd = d; b = t; } } return b; };
  const tileRects = () => [...tiles.values()].map((t) => t.bounds);
  /** Re-own rings, cut sea planes and (de)build links after tiles were added or removed. */
  function refreshWorld() {
    const t0 = performance.now(); const lapW = (n: string) => { const t = performance.now(); if (TILELOG && t - t0 > 8) console.info(`[City] refreshWorld ${n} at ${(t - t0).toFixed(0)} ms`); };
    for (const def of LINKS) {
      const have = links.get(def.id), A = tiles.get(def.a), B = tiles.get(def.b);
      if (have && !(A && B)) { scene.remove(have.group); have.dispose(); links.delete(def.id); }
      else if (!have && A && B) {
        try { const l = buildLink(def, registry.get(def.a).bundle!, registry.get(def.b).bundle!, groundMat, roadMat); links.set(def.id, l); scene.add(l.group); }
        catch (e) { console.warn('[City] link failed', def.id, e); }
      }
    }
    lapW('links');
    const lr = [...links.values()].map((l) => l.rect);
    for (const t of tiles.values()) {
      const others = [...[...tiles.values()].filter((o) => o !== t).map((o) => o.bounds), ...lr];
      t.ring.cull(t.bounds, others);
      t.ocean.setHoles((OVERLAP_OWNERS[t.id as AreaId] ?? []).filter((o) => tiles.has(o)).map((o) => tiles.get(o)!.bounds));
    }
    lapW('rings'); openSea.setHoles(tileRects()); lapW('sea');
    applyWeather(); lapW('weather');
  }
  const WANT_DEPS = (id: string): string[] => (OVERLAP_OWNERS[id as AreaId] ?? []).flatMap((o) => [...WANT_DEPS(o), o]);
  let veryHigh = false; // above ~1.2 km: no trees
  let fastHigh = false; // world-wide simple-detail switch: high or fast flight
  const farWanted = (t: Content) => fastHigh || registry.distTo(t.id, camera.position.x, camera.position.z) > (t.far ? 2200 : 2500);
  /** Builds a tile (owners first), compiles it off-scene, then adds it in one go. Concurrent calls for one id share the work. */
  function ensureTile(id: string): Promise<Content | null> {
    if (tiles.has(id)) return Promise.resolve(tiles.get(id)!);
    if (building.has(id)) return building.get(id)!;
    const run = async () => {
      for (const d of WANT_DEPS(id)) await ensureTile(d);
      const tb = performance.now(); const next = await buildContent(id); diag.event('area build', performance.now() - tb);
      const tc = performance.now(); const tmp = new THREE.Scene(); next.group.visible = true; tmp.add(next.group);
      if (A6) await prewarm(renderer, tmp, camera, scene); else try { await renderer.compileAsync(tmp, camera); } catch { /* warm-up only */ }
      tmp.remove(next.group);
      const tr = performance.now(); next.setReady(true); next.setFar(farWanted(next), veryHigh, true); next.setReady(false);
      // Staged reveal: the group goes in with every child hidden, then one child per frame is shown, so the first draw of a tile uploads its
      // buffers a mesh at a time instead of ~100-250 MB in one frame (that was a 0.5-1.9 s hitch).
      const kids = next.group.children.slice(), want = kids.map((k) => k.visible);
      kids.forEach((k) => (k.visible = false)); scene.add(next.group); tiles.set(id, next); registry.setTile(id, next);
      refreshWorld();
      kids.sort((a, b) => ((a as any).geometry?.attributes?.position?.count ?? 0) - ((b as any).geometry?.attributes?.position?.count ?? 0));
      let tprev = performance.now(); for (const k of kids) { await new Promise<void>((r) => requestAnimationFrame(() => r())); const dtk = performance.now() - tprev; if (TILELOG && dtk > 33) console.info(`[City] reveal ${id} frame ${dtk.toFixed(0)} ms before showing ${k.name || k.type} (${(k as any).geometry?.attributes?.position?.count ?? 0} verts)`); k.visible = want[next.group.children.indexOf(k)] ?? true; tprev = performance.now(); }
      next.setReady(true);
      console.info(`[City] tile ${id} built in ${(performance.now() - tb).toFixed(0)} ms (build ${(tc - tb).toFixed(0)}, compile ${(tr - tc).toFixed(0)}, reveal ${(performance.now() - tr).toFixed(0)})`);
      return next;
    };
    const p = run().catch((e) => { console.warn('[City] tile build failed', id, e); return null; }).finally(() => building.delete(id));
    building.set(id, p); return p;
  }
  function dropTile(id: string) {
    const t = tiles.get(id); if (!t) return;
    const td0 = performance.now(); scene.remove(t.group); tiles.delete(id); registry.setTile(id, null); refreshWorld();
    if (TILELOG) console.info(`[City] dropTile ${id} sync part ${(performance.now() - td0).toFixed(0)} ms`);
    // free it a few objects per tick (one dispose of a whole city is a 0.5-0.8 s stall)
    const objs: any[] = []; t.group.traverse((o) => objs.push(o)); t.grass.dispose();
    const DISP = qs.get('disp') ?? 'default'; // debug: ?disp=none keeps the GPU buffers (A/B for the unload hitch)
    const step = () => { if (DISP === 'none') return; const ts0 = performance.now(); for (let i = 0; i < 6 && objs.length; i++) { const o = objs.pop(); o.geometry?.dispose?.(); if (o.isInstancedMesh) o.dispose(); for (const m of [o.material].flat()) if (m && !shared.has(m)) m.dispose?.(); } if (TILELOG && performance.now() - ts0 > 8) console.info(`[City] dispose step ${id} ${(performance.now() - ts0).toFixed(0)} ms, ${objs.length} left`); if (objs.length) setTimeout(step, 4); };
    setTimeout(step, 50);
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
    const n = nearestTile(x, z); if (!n) return 0;
    const h = Math.max(n.terrain.heightAt(x, z), 0); // outside every tile: an inland tile's ring continues its edge level; a coastal one's ring falls to the seabed (farGround.ts), so past it the floor is sea level
    if ((n.area as { inland?: number }).inland || h <= 0) return h;
    const k = Math.min(1, registry.distTo(n.id, x, z) / (280 + 12 * h)); return h * (1 - k * k * (3 - 2 * k));
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
          const eye = v.eye ?? 1.7; out = { ...v, pos: [x, ground(x, z) + eye, z], look: [x + ux * s * 150, ground(x, z) + eye + 2.3, z + uz * s * 150] };
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
    f.density = (0.00016 + rain * 0.0012 + snow * 0.0022 + fog * 0.016) * tune.fog;
    const cover = Math.min(1, rain + snow + fog * 0.9); sky.setOvercast(cover);
    sky.setClouds(0.22 + cover * 0.78, cRain.set(0x26334a).lerp(cTmp.set(0x2a303c), snow).lerp(cTmp.set(0x2a3140), Math.min(1, fog)));
    uSkyRefl.value.set(0x1a2438).lerp(cTmp.set(0x2e3c58), Math.min(1, rain * 1.5));
    for (const ocean of [openSea, ...[...tiles.values()].map((t) => t.ocean)]) { ocean.uRough.value = rain + snow * 0.4; ocean.uSky.value.set(0x1a2438).lerp(cTmp.set(0x141a24), Math.min(1, cover * 1.5)); }
    for (const { trees, grass, lamps } of tiles.values()) {
      trees.uWind.value = 1 + rain * 1.8 + snow * 0.6 - fog * 0.6; grass.uWind.value = 1 + rain * 1.5 + snow * 0.4 - fog * 0.6;
      grass.uWet.value = wet; grass.uSnow.value = snowCover; lamps.uWet.value = wet; lamps.uFog.value = fog;
    }
    uWet.value = Math.min(1, wet + tune.wet); uSnow.value = snowCover;
  }
  /** Dev panel: push the tuning values into the shared uniforms and lights. */
  function applyTune() {
    facade.uGlass.value = tune.glass; facade.uWindow.value = tune.window; uLampGain.value = tune.lamp; renderer.toneMappingExposure = tune.exposure;
    moon.intensity = 1.25 * tune.moon; if (camera.fov !== tune.fov) { camera.fov = tune.fov; camera.updateProjectionMatrix(); }
    applyWeather();
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
  const TICK = 0.25, MAX_TILES = Number(qs.get('maxtiles') ?? 3);
  const stream = { radius: 0, lead: 0, want: [] as string[], aim: {} as Record<string, number>, builds: 0, unloads: 0, lastTick: 0, ring0: 1500, base: Number(qs.get('ring') ?? 8000), enabled: qs.get('stream') !== '0' };
  const dirV = new THREE.Vector3();
  function streamTick(dt: number) {
    assignFloods();
    const p = player.pos, v = player.vel, speed = v.length(), alt = player.altitude;
    // simple detail when high or fast (hysteresis)
    fastHigh = fastHigh ? !(alt < 320 && speed < 72) : (alt > 400 || speed > 88); // thresholds raised (was 250 m / 70 m/s) so the full -> flat-top building switch happens where it is harder to see; real-GPU headroom allows it
    veryHigh = veryHigh ? alt > 900 : alt > 1200;
    for (const t of tiles.values()) t.setFar(farWanted(t), veryHigh || registry.distTo(t.id, camera.position.x, camera.position.z) > 5000);
    // road chunks (1280 m, one draw each) beyond the fog-visible range are hidden: keeps the draw calls of a four-tile flight inside the 150 budget
    const roadRange = fastHigh ? 2500 : 4000, cp = camera.position;
    for (const t of tiles.values()) for (const m of t.roadChunks) { const b = m.geometry.boundingBox; if (b) m.visible = b.distanceToPoint(cp) < roadRange; }
    const T = Math.min(6, Math.max(1, 0.5 + alt / 200));
    const R = stream.base + speed * T + 1.5 * alt; // design note: 1.5 km + speed*T + 1.5*alt; base raised to 8 km because tiles are small and the night fog (density 0.00016) still shows ~30% at 8 km; far tiles use simple detail, so they are cheap
    stream.radius = R; stream.lead = speed * T;
    if (speed > 1) dirV.copy(v).divideScalar(speed);
    const wanted = new Set<string>();
    for (const id of AREA_IDS) {
      const d = registry.distTo(id, p.x, p.z), e = registry.get(id);
      if (d < 3 * R) void registry.loadData(id).catch(() => {}); // ring 2: data only
      let aimed = d < stream.base; // everything inside the base ring (about the fog's view distance); beyond it only what we are flying toward
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
      if (registry.distTo(t.id, p.x, p.z) > R + 1500) { stream.unloads++; dropTile(t.id); }
    }
    // hard cap on built tiles (memory): beyond MAX_TILES the farthest tile that is not the active one, not wanted for the current ring and not an owner in use goes
    if (stream.enabled && tiles.size > MAX_TILES) {
      const cand = [...tiles.values()].filter((t) => t !== act && !wanted.has(t.id) && performance.now() - t.builtAt > 8000 && ![...tiles.values()].some((o) => o !== t && WANT_DEPS(o.id).includes(t.id)))
        .sort((a, b) => registry.distTo(b.id, p.x, p.z) - registry.distTo(a.id, p.x, p.z));
      if (cand.length) { stream.unloads++; dropTile(cand[0].id); }
    }
  }

  return {
    renderer, scene, camera, controls, sky, backend, tune, applyTune, setView, world, flight, stream, dropTile,
    /** Drop-in point: the street start view (on a road) if the area has one, else the first view's look target. World coordinates. */
    spawnPoint() { const tf = (this as any).townFocus && [...tiles.values()].flatMap((t) => t.sites).find((z) => z.id === (this as any).townFocus); if (tf) return { x: tf.stand[0], z: tf.stand[2], ground: tf.y + 0.03, heading: Math.atan2(tf.look[0] - tf.stand[0], tf.look[2] - tf.stand[2]) }; const vs = viewsOf(act.id); const v = vs.find((x) => x.snap); const s = v ? snapToStreet(v) : null; const p = s ? s.pos : vs[0].look; const l = s ? s.look : [0, 0, 0]; return { x: p[0], z: p[2], ground: ground(p[0], p[2]), heading: Math.atan2(l[0] - p[0], l[2] - p[2]) }; },
    get areaId() { return registry.activeId!; }, get area() { return act.area; }, get views() { return viewsOf(act.id); },
    get stats() { const a = act.area; return { buildings: act.blds.count, trees: a.trees.length / 5, palms: act.trees.palms, lamps: a.lamps.length, chunks: act.blds.group.children.length, landmarkCull: act.landmarkCull, interiorCands: act.interiors.count, interior: act.interiors.current, roads: a.roads.length, towns: act.sites.map((q) => q.id) }; },
    /** world state for tests / HUD: built tiles, links, detail mode, streaming ring */
    worldState() { return { tiles: [...tiles.values()].map((t) => ({ id: t.id, far: t.far, fade: t.farBlds.userData.fade ?? 0, bounds: t.bounds })), building: [...building.keys()], links: [...links.values()].map((l) => ({ id: l.def.id, rect: l.rect, path: l.path, tris: l.triangles })), fastHigh, active: act.id,
      stream: { radius: stream.radius, lead: stream.lead, want: stream.want, builds: stream.builds, unloads: stream.unloads }, flight: { gates: flight.gates, length: flight.length, end: flight.end } }; },
    /** Town sites of the built tiles, with the stand point and look target of each. */
    auditInput() { return { id: act.id, ck: act.audit.ck, lampList: act.audit.lampList, treeList: act.audit.treeList, towns: act.audit.towns, city: act.audit.city, sites: act.sites, area: act.area }; },
    towns() { return [...tiles.values()].flatMap((t) => t.sites).map((q) => ({ id: q.id, name: q.name, area: q.area, x: +q.stand[0].toFixed(1), y: +q.stand[1].toFixed(2), z: +q.stand[2].toFixed(1), look: q.look.map((v) => +v.toFixed(1)) })); },
    townMeta: TOWN_META, usedPaths,
    townFocus: null as string | null,
    /** Stand in front of a town's centrepiece looking at its architecture (builds and switches to the town's area first). Free camera or robot spawn use this point. */
    async focusTown(id: string) {
      const meta = TOWN_META.find((m) => m.id === id); if (!meta) return null;
      await (this as any).switchArea(meta.area); await ensureTile(meta.area);
      const q = [...tiles.values()].flatMap((t) => t.sites).find((z) => z.id === id); if (!q) return null;
      (this as any).townFocus = id; camera.position.set(q.stand[0], q.stand[1] + 1.8, q.stand[2]); camera.lookAt(q.look[0], q.look[1], q.look[2]); controls.syncAngles(); controls.setWalk(true);
      return q;
    },
    interiorEntry(x: number, z: number) { return act.interiors.entry(x, z); },
    /** Warm the data cache for an area (cheap, run when idle). */
    preload(id: string) { return registry.loadData(id).then(() => undefined, () => undefined); },
    /** Make sure the area's tile is built (streaming would do it as we approach), then view it. Other tiles stream in/out around the new position. */
    async switchArea(id: string, viewName?: string) {
      if (id === act.id) return;
      const t = await ensureTile(id); if (!t) throw new Error('area build failed: ' + id);
      setActive(t); t.setFar(false, false, true);
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
      townTick = (townTick + 1) % 10;
      for (const tl of tiles.values()) {
        tl.fadeStep(dt);
        if (tl.far) continue;
        const d = registry.distTo(tl.id, camera.position.x, camera.position.z);
        for (const g of tl.packGroups) g.visible = d < 1100; // pack towns / street life only draw when the player is in or near the area
        if (townTick === 0 && d < 1100) { // per-town cull: a town mesh only draws within 650 m of the camera (checked every 10th frame)
          const tg = tl.packGroups.find((g) => g.name === 'towns');
          if (tg) for (const m of tg.children) { const s = tl.sites.find((q) => 'town ' + q.id === m.name); if (s) m.visible = Math.hypot(camera.position.x - s.cx, camera.position.z - s.cz) < 650; }
        }
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
