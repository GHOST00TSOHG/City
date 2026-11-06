import * as THREE from 'three/webgpu';
import type { MaterialTextures } from './textures';
import { FACADE_Y0, FACADE_YS, FACADE_KS } from './geom';
import { WALL_GAIN, WALL_PAINTED, WALL_MEAN, WALL_SCALE, ROOF_GAIN } from './textures';
import { reflect, pow as tpow, time, sin, texture, mod, luminance, attribute, normalize, step, dot, positionWorld, normalWorld, vec2, vec3, float, fract, floor, fwidth, smoothstep, select, mix, hash, abs, max, min, clamp, vertexColor, uniform, cameraPosition, distance } from 'three/tsl';

/** Procedural facades (TSL): window grid by inferred building type, lit / unlit windows, house shutters, storefronts.
 *  Reads the per-vertex `facade` attribute [baseY, wallTopY, kind, seed] written by buildings.ts. No textures. */
export function createFacadeMaterial(tex: MaterialTextures) {
  const uNight = uniform(1); // 0..1 how many windows are lit (scales with time of day later)
  const uGlass = uniform(1), uWindow = uniform(1); // dev panel: glass reflection and window glow gains
  const mat = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  const fa = attribute('facade', 'vec4');
  // fa.z packs kind (0 none, 1 house, 2 commercial) + 4 * wall material + 32 * roof material (see buildings.ts)
  // the attribute is snorm16 (geom.ts compactSoup): heights as (y - Y0) / YS, pack as k / KS
  const base = fa.x.mul(FACADE_YS).add(FACADE_Y0), top = fa.y.mul(FACADE_YS).add(FACADE_Y0), packed = floor(fa.z.mul(FACADE_KS).add(0.5)), kind = mod(packed, 4), seed = fa.w;
  const wallMat = mod(floor(packed.div(4)), 8), roofMat = floor(packed.div(32));
  const isHouse = kind.lessThan(1.5);
  const n = normalWorld;
  const along = positionWorld.x.mul(n.z.negate()).add(positionWorld.z.mul(n.x)); // horizontal coord along the wall
  const up = positionWorld.y.sub(base);
  const fh = select(isHouse, float(3.1), float(3.4)), sx = select(isHouse, float(3.3), float(3.0));
  const cell = vec2(along.div(sx).add(seed.mul(7)), up.sub(0.35).div(fh));
  const f = fract(cell), id = floor(cell);
  const w = max(fwidth(cell), vec2(0.0005));
  const band = (v: any, a: any, b: any, ww: any) => smoothstep(a.sub(ww), a.add(ww), v).mul(float(1).sub(smoothstep(b.sub(ww), b.add(ww), v)));
  const groundFloor = id.y.lessThan(0.5);
  // window rectangle per type; commercial ground floor = wide storefront
  const wx0 = select(isHouse, float(0.34), select(groundFloor, float(0.08), float(0.18)));
  const wy0 = select(isHouse, float(0.22), select(groundFloor, float(0.06), float(0.26)));
  const wy1 = select(isHouse, float(0.74), float(0.8));
  const win = band(f.x, wx0, float(1).sub(wx0), w.x).mul(band(f.y, wy0, wy1, w.y));
  // window detail (frames, mullions, fake depth) in window-local coords wu, wv ∈ 0..1
  const ww = float(1).sub(wx0.mul(2)), wh = wy1.sub(wy0);
  const wu = f.x.sub(wx0).div(ww), wv = f.y.sub(wy0).div(wh);
  const wwu = w.x.div(ww), wwv = w.y.div(wh);
  const glassIn = band(wu, float(0.07), float(0.93), wwu).mul(band(wv, float(0.07), float(0.93), wwv));
  const frame = win.mul(float(1).sub(glassIn)); // painted trim around the opening
  const vBar = select(isHouse, band(wu, float(0.48), float(0.52), wwu), select(groundFloor, band(wu, float(0.325), float(0.345), wwu).add(band(wu, float(0.655), float(0.675), wwu)), band(wu, float(0.485), float(0.515), wwu)));
  const hBar = select(isHouse, band(wv, float(0.48), float(0.52), wwv), band(wv, float(0.76), float(0.79), wwv));
  const mull = clamp(vBar.add(hBar), 0, 1).mul(glassIn);
  const reveal = clamp(smoothstep(0.93, 0.8, wv).oneMinus().add(smoothstep(0.07, 0.17, wu).oneMinus()), 0, 1).mul(glassIn); // shadow of the inset (top + left)
  const sill = band(f.y, wy0.sub(0.05), wy0, w.y).mul(band(f.x, wx0.sub(0.03), float(1).sub(wx0).add(0.03), w.x));
  const shutter = select(isHouse, band(f.x, float(0.2), float(0.32), w.x).add(band(f.x, float(0.68), float(0.8), w.x)).mul(band(f.y, wy0, wy1, w.y)), float(0));
  // only on real walls, inside the wall's height range, and fade the grid out where it would shimmer (tiny on screen)
  const inWall = smoothstep(0.2, 0.3, up).mul(float(1).sub(smoothstep(top.sub(base).sub(0.5), top.sub(base).sub(0.3), up)))
    .mul(select(kind.greaterThan(0.5), float(1), float(0))).mul(float(1).sub(smoothstep(0.85, 0.98, abs(n.y))));
  const crisp = float(1).sub(smoothstep(0.25, 0.6, max(w.x, w.y)));
  // Interior mapping: march the view ray into a box room behind each window cell (floor, ceiling, side walls, back wall).
  // Room = one window cell wide, one storey tall, `depth` metres deep. Fake rooms only; real ones load near the player (interiors.ts).
  const V = normalize(positionWorld.sub(cameraPosition));
  const tAx = vec3(n.z.negate(), 0, n.x);
  const depth = select(isHouse, float(3.6), float(4.8));
  const rd = vec3(dot(V, tAx).div(sx), V.y.div(fh), max(dot(V, n.negate()), float(0.02)).div(depth));
  const sgn = (v: any) => select(v.greaterThan(0), float(1), float(0));
  const eps = (v: any) => select(abs(v).lessThan(1e-4), float(1e-4), v);
  const tX = sgn(rd.x).sub(f.x).div(eps(rd.x)), tY = sgn(rd.y).sub(f.y).div(eps(rd.y)), tZ = float(1).div(rd.z);
  const tHit = min(min(tX, tY), tZ);
  const hp = vec3(f.x, f.y, 0).add(rd.mul(tHit));
  const onBack = step(tZ, min(tX, tY)), onY = step(tY, tX).mul(float(1).sub(onBack));
  const onFloor = onY.mul(float(1).sub(sgn(rd.y))), onCeil = onY.mul(sgn(rd.y));
  const rh = hash(id.x.mul(5).add(id.y.mul(29)).add(seed.mul(733)).add(1));
  const paint = mix(mix(vec3(0.78, 0.72, 0.62), vec3(0.62, 0.7, 0.72), step(0.5, rh)), vec3(0.74, 0.62, 0.55), step(0.82, rh));
  const floorCol = mix(vec3(0.42, 0.28, 0.17), vec3(0.32, 0.33, 0.35), step(0.6, hash(rh.add(2))));
  const side = paint.mul(0.82);
  let roomCol: any = mix(side, paint, onBack);
  roomCol = mix(roomCol, floorCol, onFloor); roomCol = mix(roomCol, vec3(0.9, 0.89, 0.86), onCeil);
  // simple furniture silhouette against the back wall (desk / sofa band) and light falloff from a ceiling lamp near the window
  const furn = onBack.mul(step(hp.y, float(0.3).add(rh.mul(0.12)))).mul(step(0.15, hp.x)).mul(step(hp.x, 0.85));
  roomCol = mix(roomCol, mix(vec3(0.3, 0.22, 0.16), vec3(0.24, 0.27, 0.34), step(0.5, hash(rh.add(5)))), furn);
  const lamp = clamp(float(1.15).sub(hp.z.mul(0.55)).sub(abs(hp.x.sub(0.5)).mul(0.5)), 0.25, 1).mul(mix(float(0.75), float(1.1), hp.y));
  const blind = step(0.55, hash(rh.add(7))).mul(step(float(1).sub(hash(rh.add(9)).mul(0.45)), wv)); // some blinds half-drawn
  const roomLit = mix(roomCol.mul(lamp), vec3(0.85, 0.8, 0.7), blind.mul(0.8));
  const m = win.mul(inWall);
  const h1 = hash(id.x.add(id.y.mul(131)).add(seed.mul(9973)));
  const h2 = hash(id.x.mul(17).add(id.y.mul(7)).add(seed.mul(4271)).add(3));
  const tall = smoothstep(18, 60, top.sub(base)); // 0 low-rise .. 1 tower
  const retail = isHouse.not().and(groundFloor);
  const litFrac = select(retail, float(0.72), select(isHouse, float(0.22), float(0.3).add(tall.mul(0.16)))).mul(uNight);
  const lit = select(h1.lessThan(litFrac), float(1), float(0));
  const warm = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.72, 0.42), h2); // tungsten apartments
  const office = mix(vec3(0.78, 0.92, 1.0), vec3(0.62, 0.86, 1.0), h2); // cool white / cyan office floors
  const isOffice = isHouse.not().and(hash(seed.mul(91).add(5)).lessThan(float(0.3).add(tall.mul(0.55))));
  const tintBase = select(isOffice, office, warm);
  const tint = select(retail, vec3(1.0, 0.86, 0.6), select(h2.greaterThan(0.9), vec3(0.75, 0.85, 1.0), tintBase));
  const glass = mix(vec3(0.07, 0.09, 0.12), roomCol.mul(lamp).mul(0.1), crisp.mul(0.7)); // dark room seen through unlit glass
  const shutterCol = mix(vec3(0.22, 0.42, 0.36), vec3(0.3, 0.42, 0.55), hash(seed.mul(311)));
  // Textured, painted walls and roofs (CC0 ambientCG, KTX2 arrays). Painted kinds take the texture's relief only, so the
  // vertex colour (area palette, see buildings.ts) is the paint; brick/concrete show their real colour. True colours: no tint.
  const byLayer = (idx: any, v: number[]) => v.slice(1).reduce((acc: any, x, i) => select(idx.greaterThan(i + 0.5), float(x), acc), float(v[0]));
  const isRoof = smoothstep(0.35, 0.55, n.y);
  const wScale = byLayer(wallMat, WALL_SCALE);
  const wTex = texture(tex.walls, vec2(along, up.add(seed.mul(13))).div(wScale)).depth(wallMat).rgb;
  const painted = byLayer(wallMat, WALL_PAINTED);
  const wallAlb = mix(wTex.mul(byLayer(wallMat, WALL_GAIN)), vec3(luminance(wTex).div(byLayer(wallMat, WALL_MEAN))).clamp(0.4, 1.6), painted).mul(vertexColor());
  // Shingles (layer 0) are painted: the near-black texture gives relief only, the vertex colour picks the shingle colour.
  const rRaw = texture(tex.roofs, positionWorld.xz.div(3.2)).depth(roofMat).rgb;
  const rTex = select(roofMat.lessThan(0.5), vec3(luminance(rRaw).div(0.027)).clamp(0.35, 1.7), rRaw.mul(byLayer(roofMat, ROOF_GAIN)));
  const wall = mix(wallAlb, rTex.mul(vertexColor()), isRoof);
  const frameDark = mix(float(1), float(0.82), clamp(win.mul(inWall).mul(3), 0, 1).mul(crisp));
  let col: any = wall.mul(frameDark);
  col = mix(col, shutterCol, shutter.mul(inWall).mul(crisp).mul(0.9));
  col = mix(col, glass, m.mul(mix(float(0.55), float(1), crisp)));
  const trim = mix(wall, vec3(0.86, 0.85, 0.8), 0.7);
  col = mix(col, trim, frame.add(mull.mul(float(1).sub(lit.mul(0.3)))).add(sill).mul(inWall).mul(crisp).clamp(0, 1));
  col = col.mul(float(1).sub(reveal.mul(inWall).mul(crisp).mul(0.45)));
  mat.colorNode = col;
  // lit glass emits; far away the averaged grid becomes a soft per-building glow instead of sparkle
  const dist = distance(cameraPosition, positionWorld);
  const farAvg = litFrac.mul(0.35).mul(inWall).mul(float(1).sub(crisp));
  const brightness = mix(float(0.25), float(0.7), hash(id.x.add(id.y.mul(57)).add(seed.mul(1031)).add(9)));
  const glassOnly = m.mul(float(1).sub(mull.mul(crisp))).mul(float(1).sub(frame.mul(crisp))).mul(float(1).sub(reveal.mul(0.5)));
  const retailBoost = select(retail, float(1.9), float(1));
  const winEmit = tint.mul(roomLit.mul(glassOnly.mul(lit).mul(crisp).mul(brightness).mul(1.5).mul(retailBoost)).add(farAvg.mul(0.8))).mul(min(float(1), float(2200).div(dist.add(1)).add(0.6)));
  // Glass: low roughness, curtain-wall metalness on towers, and a Fresnel sky / horizon / city-glow reflection on lit and unlit panes.
  const glassMask = m.mul(glassIn).mul(mix(float(0.4), float(1), crisp));
  mat.roughnessNode = mix(select(isHouse, float(0.9), float(0.82)).add(hash(seed.mul(5)).mul(0.08)), float(0.07), glassMask);
  mat.metalnessNode = glassMask.mul(select(isHouse, float(0.1), mix(float(0.25), float(0.55), tall)));
  const Vv = normalize(cameraPosition.sub(positionWorld)), Rr = reflect(Vv.negate(), n);
  const fres = tpow(float(1).sub(max(dot(n, Vv), 0)), 3).mul(0.85).add(0.06);
  const rY = Rr.y, azR = Rr.x.mul(3.1).add(Rr.z.mul(2.3));
  const skyRefl = mix(vec3(0.16, 0.22, 0.32), vec3(0.02, 0.035, 0.08), smoothstep(0.0, 0.7, rY)) // steel horizon -> night zenith
    .add(mix(vec3(0.35, 0.2, 0.08), vec3(0.1, 0.26, 0.34), step(0.5, hash(floor(azR.mul(9))))).mul(smoothstep(0.35, 0.0, abs(rY.sub(0.08)))).mul(0.55)) // city glow bands
    .add(vec3(1.0, 0.95, 0.85).mul(tpow(max(dot(Rr, normalize(vec3(0.45, 0.62, 0.35))), 0), 90)).mul(2.5)); // moon glint
  const reflGain = select(isHouse, float(0.35), mix(float(0.7), float(1.25), tall));
  const glassRefl = skyRefl.mul(fres).mul(reflGain).mul(glassMask).mul(uGlass);
  // aviation beacons: sparse blinking red lights on the roofs of towers over 38 m
  const roofN = smoothstep(0.7, 0.9, n.y), cellB = positionWorld.xz.div(20), fB = fract(cellB).sub(0.5), idB = floor(cellB);
  const beaconAt = float(1).sub(smoothstep(0.03, 0.06, fB.x.mul(fB.x).add(fB.y.mul(fB.y)))).mul(step(0.45, hash(idB.x.mul(3).add(idB.y.mul(17)).add(seed.mul(53)))));
  const tower = step(38, top.sub(base)), blink = sin(time.mul(2.2).add(seed.mul(40))).mul(0.5).add(0.5);
  const beacon = vec3(1.0, 0.1, 0.06).mul(beaconAt).mul(roofN).mul(tower).mul(blink.mul(3).add(0.4));
  mat.emissiveNode = winEmit.mul(uWindow).add(glassRefl).add(beacon);
  return { material: mat, uNight, uGlass, uWindow };
}
