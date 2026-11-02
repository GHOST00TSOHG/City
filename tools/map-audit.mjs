#!/usr/bin/env node
// Map audit (no network): loads every baked area (public/areas/<id>) plus its landmark placements, builds the SAME runtime geometry the game builds
// (real src/area modules, bundled with vite for node), and COUNTS defects per area and per class.
//   node tools/map-audit.mjs <label> [area ...]      -> tools/map-audit.out/<label>.json + printed table
// Classes: a floating buildings | b sunk buildings | c floating/sunk roads | d buildings in water | e overlapping buildings |
//          f shoreline/dock defects | g ground void (camera-reachable rays that see dark skirt / nothing) | h non-solid meshes (open edges)
// Model notes: terrain = decodeTerrain (blurred) + flattenUnderLandmarks (exactly like scene.ts); buildings = cullUnderLandmarks + buildBuildings per building.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/map-audit.out');
const label = process.argv[2] ?? 'run';
const ALL = process.argv.includes('--all'), DBG = (process.argv.find((a) => a.startsWith('--dbg=')) ?? '').slice(6), only = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const T = { // thresholds (metres)
  floatBase: 0.15,      // wall bottom above terrain at a footprint sample
  buriedWall: 1.0,      // terrain above the floor line by more than this at a boundary sample
  buriedRoof: 0.5,      // terrain within this of the eave
  deepSkirt: 1.0,       // wall bottom deeper than this under the lowest terrain sample
  water: 0.10,          // fraction of footprint samples under the sea plane (y < 0)
  overlapArea: 1.0, overlapY: 1.0,
  roadFloat: 0.10, roadSunk: -0.005,
  shoreStep: 1.0, flatWaterline: 0.05,
  weld: 0.002, embed: 0.02,
};

// ---------------------------------------------------------------- bundle the real src modules
await build({
  configFile: false, logLevel: 'error', publicDir: false,
  build: { ssr: path.join(ROOT, 'tools/map-audit-src.ts'), outDir: path.join(OUT, '.build'), emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'src.mjs' } } },
  ssr: { noExternal: true }, root: ROOT,
  define: { __HAS_TREE_SPECIES__: 'false', __HAS_ROBOT_GLB__: 'false', 'import.meta.env.BASE_URL': '"/"' },
});
const S = await import(pathToFileURL(path.join(OUT, '.build/src.mjs')).href);
let foundation = null; try { foundation = S.foundation ?? null; } catch { /* only exists after the fix */ }

const areaDefs = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/bake/areas.json'), 'utf8'));
const ids = Object.keys(areaDefs).filter((k) => !k.startsWith('_') && fs.existsSync(path.join(ROOT, 'public/areas', k, 'area.json')) && (!only.length || only.includes(k)));

// ---------------------------------------------------------------- small geometry helpers (xz plane)
const ring = (r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push([r[i] / 10, r[i + 1] / 10]); return o; };
const area2 = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
const inPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inRings = (rs, x, z) => inPoly(rs[0], x, z) && !rs.slice(1).some((h) => inPoly(h, x, z));
function sampleRings(rs, step = 1.0) { // boundary samples (every <= step along each edge) and interior grid samples
  const boundary = [], interior = [];
  for (const r of rs) for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) boundary.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const [x, z] of rs[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const gs = Math.max(2, Math.min(5, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 400)));
  for (let x = minX + gs / 2; x < maxX; x += gs) for (let z = minZ + gs / 2; z < maxZ; z += gs) if (inRings(rs, x, z)) interior.push([x, z]);
  return { boundary, interior };
}
// polygon-polygon intersection area via triangulation + convex clipping
function tris(rs) {
  const c = rs[0].map(([x, z]) => new THREE.Vector2(x, z)), hs = rs.slice(1).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))), all = [...c, ...hs.flat()];
  let idx; try { idx = THREE.ShapeUtils.triangulateShape(c, hs); } catch { return []; }
  return idx.map(([a, b, d]) => [[all[a].x, all[a].y], [all[b].x, all[b].y], [all[d].x, all[d].y]]);
}
function clip(subject, clipper) { // Sutherland-Hodgman, clipper convex
  const ccw = area2(clipper) > 0; let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length], inp = out; out = [];
    const side = (p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (ccw ? 1 : -1);
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
const interArea = (ta, tb) => { let s = 0; for (const a of ta) for (const b of tb) { const c = clip(a, b); if (c.length >= 3) s += Math.abs(area2(c)); } return s; };

// ---------------------------------------------------------------- landmarks (placement replicated from src/area/landmarks.ts, GLB bounds from accessor min/max)
const R = 6378137;
function readGLB(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + jl).toString());
  return { json, buf: b };
}
function nodeMatrix(n) { const m = new THREE.Matrix4(); if (n.matrix) m.fromArray(n.matrix); else m.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1]))); return m; }
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
function lodBox(json, name) { // AABB of a LOD node subtree (excluding _COL meshes), in model space
  const nodes = json.nodes, scene = json.scenes[json.scene ?? 0], box = new THREE.Box3();
  const visit = (i, parent) => {
    const n = nodes[i], m = new THREE.Matrix4().multiplyMatrices(parent, nodeMatrix(n));
    if (/_COL$/.test(n.name ?? '')) return;
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION]; if (!a.min || !a.max) continue; const k = a.normalized ? 1 / NORM[a.componentType] : 1;
      const lo = a.min.map((v) => v * k), hi = a.max.map((v) => v * k);
      for (let c = 0; c < 8; c++) box.expandByPoint(new THREE.Vector3(c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]).applyMatrix4(m));
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  for (const i of scene.nodes) if (new RegExp(`${name}$`).test(nodes[i].name ?? '')) visit(i, new THREE.Matrix4());
  return box;
}
function placeLandmarks(id, origin, terrain0) {
  const out = { pads: [], footprints: [], boxes: [], list: [] };
  const idxFile = path.join(ROOT, 'public/landmarks/index.json'); if (!fs.existsSync(idxFile)) return out;
  const slugs = JSON.parse(fs.readFileSync(idxFile, 'utf8'))[id] ?? [];
  const k = (Math.PI / 180) * R, c = Math.cos((origin.lat * Math.PI) / 180);
  for (const slug of slugs) {
    const dir = path.join(ROOT, 'public/landmarks', id, slug), mf = path.join(dir, 'manifest.json'); if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')), { json } = readGLB(path.join(dir, m.file));
    const local = lodBox(json, '_LOD0'); if (local.isEmpty()) continue;
    const mat = new THREE.Matrix4().compose(new THREE.Vector3((m.lon - origin.lon) * k * c, 0, -(m.lat - origin.lat) * k), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(m.headingDeg ?? 0)), new THREE.Vector3().setScalar(m.scale ?? 1));
    const box = local.clone().applyMatrix4(mat);
    let groundY = Infinity; for (let sx = box.min.x; sx <= box.max.x + 0.01; sx += 4) for (let sz = box.min.z; sz <= box.max.z + 0.01; sz += 4) groundY = Math.min(groundY, terrain0.heightAt(sx, sz));
    const baseY = m.elevationM ?? Math.max(groundY, 0); mat.setPosition(mat.elements[12], baseY, mat.elements[14]);
    const pts = m.footprint?.length >= 3 ? m.footprint.map(([la, lo]) => [(lo - origin.lon) * k * c, -(la - origin.lat) * k]) : null;
    const boxPts = [[local.min.x, local.min.z], [local.max.x, local.min.z], [local.max.x, local.max.z], [local.min.x, local.max.z]].map(([px, pz]) => { const v = new THREE.Vector3(px, 0, pz).applyMatrix4(mat); return [v.x, v.z]; });
    const ext = (p) => ({ minX: Math.min(...p.map((q) => q[0])), maxX: Math.max(...p.map((q) => q[0])), minZ: Math.min(...p.map((q) => q[1])), maxZ: Math.max(...p.map((q) => q[1])) });
    const f = ext(pts ?? boxPts), fb = ext(boxPts);
    out.pads.push({ id: m.id, pts: boxPts, y: baseY, minX: Math.min(f.minX, fb.minX), maxX: Math.max(f.maxX, fb.maxX), minZ: Math.min(f.minZ, fb.minZ), maxZ: Math.max(f.maxZ, fb.maxZ) });
    const margin = m.cullMarginM === false ? null : Math.max(0, m.cullMarginM ?? 4);
    if (margin !== null) out.footprints.push({ id: m.id, pts: pts ?? boxPts, margin, ...ext(pts ?? boxPts) });
    out.list.push({ id: m.id, slug, dir, file: m.file, plan: pts ?? boxPts, boxPts, baseY, top: baseY + local.max.y * (m.scale ?? 1) });
  }
  return out;
}

// ---------------------------------------------------------------- mesh solidity (open edges that are not embedded in another surface)
function openEdgeReport(P, index) { // P: Float32Array xyz triples (triangle soup) or indexed
  const key = (x, y, z) => `${Math.round(x / T.weld)},${Math.round(y / T.weld)},${Math.round(z / T.weld)}`;
  const ids = new Map(), vid = (i) => { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); let v = ids.get(k); if (v === undefined) ids.set(k, (v = ids.size)); return v; };
  const nT = index ? index.length / 3 : P.length / 9, tri = (t) => (index ? [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2]);
  const edges = new Map(), V = [];
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = tri(t); const w = [vid(a), vid(b), vid(c)]; V.push([a, b, c]);
    if (w[0] === w[1] || w[1] === w[2] || w[0] === w[2]) continue;
    for (let e = 0; e < 3; e++) { const p = w[e], q = w[(e + 1) % 3], k = p < q ? `${p}_${q}` : `${q}_${p}`; const o = edges.get(k); if (o) o.n++; else edges.set(k, { n: 1, t, a: V[t][e], b: V[t][(e + 1) % 3] }); }
  }
  const open = [...edges.values()].filter((e) => e.n === 1);
  if (!open.length) return { open: 0, free: 0, tris: nT };
  // spatial hash of triangles for the embedded test
  const cs = 4, grid = new Map(), tb = [];
  for (let t = 0; t < nT; t++) {
    const [a, b, c] = V[t]; const xs = [P[a * 3], P[b * 3], P[c * 3]], ys = [P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]], zs = [P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]];
    const lo = [Math.min(...xs), Math.min(...ys), Math.min(...zs)], hi = [Math.max(...xs), Math.max(...ys), Math.max(...zs)]; tb.push([lo, hi]);
    for (let i = Math.floor(lo[0] / cs); i <= Math.floor(hi[0] / cs); i++) for (let j = Math.floor(lo[2] / cs); j <= Math.floor(hi[2] / cs); j++) { const k = i * 100003 + j; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(t); }
  }
  const cover = (x, y, z, skip) => {
    const l = grid.get(Math.floor(x / cs) * 100003 + Math.floor(z / cs)); if (!l) return false;
    for (const t of l) {
      if (t === skip) continue; const [lo, hi] = tb[t]; if (x < lo[0] - T.embed || x > hi[0] + T.embed || y < lo[1] - T.embed || y > hi[1] + T.embed || z < lo[2] - T.embed || z > hi[2] + T.embed) continue;
      const [a, b, c] = V[t], ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue; nx /= nl; ny /= nl; nz /= nl;
      if (Math.abs((x - ax) * nx + (y - ay) * ny + (z - az) * nz) > T.embed) continue;
      const wx = x - ax, wy = y - ay, wz = z - az, d00 = ux * ux + uy * uy + uz * uz, d01 = ux * vx + uy * vy + uz * vz, d11 = vx * vx + vy * vy + vz * vz, d20 = wx * ux + wy * uy + wz * uz, d21 = wx * vx + wy * vy + wz * vz;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-12) continue; const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, e = 0.03;
      if (v >= -e && w >= -e && v + w <= 1 + e) return true;
    }
    return false;
  };
  let free = 0; const freeEdges = [];
  for (const e of open) {
    const ax = P[e.a * 3], ay = P[e.a * 3 + 1], az = P[e.a * 3 + 2], bx = P[e.b * 3], by = P[e.b * 3 + 1], bz = P[e.b * 3 + 2];
    if (Math.hypot(bx - ax, by - ay, bz - az) < 0.01) continue;
    let covered = true; for (const f of [0.2, 0.5, 0.8]) if (!cover(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f, e.t)) { covered = false; break; }
    if (!covered) { free++; if (freeEdges.length < 3) freeEdges.push([+ax.toFixed(2), +ay.toFixed(2), +az.toFixed(2)]); if (DBG && P.dbg) console.log('FREE', [ax, ay, az].map((v) => +v.toFixed(2)).join(','), '->', [bx, by, bz].map((v) => +v.toFixed(2)).join(',')); }
  }
  return { open: open.length, free, tris: nT, sample: freeEdges };
}

// rays from points inside the solid: every ray must hit the shell (two-sided); an escaping ray is a see-through hole
const LEAK_DIRS = (() => { const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) { const l = Math.hypot(x, y, z); d.push([x / l, y / l, z / l]); } return d; })();
function leaks(P, pts) {
  let n = 0;
  for (const [ox, oy, oz] of pts) for (const [dx, dy, dz] of LEAK_DIRS) {
    let hit = false;
    for (let t = 0; t < P.length && !hit; t += 9) {
      const e1x = P[t + 3] - P[t], e1y = P[t + 4] - P[t + 1], e1z = P[t + 5] - P[t + 2], e2x = P[t + 6] - P[t], e2y = P[t + 7] - P[t + 1], e2z = P[t + 8] - P[t + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const tx = ox - P[t], ty = oy - P[t + 1], tz = oz - P[t + 2], u = (tx * px + ty * py + tz * pz) / det; if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) / det; if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      if ((e2x * qx + e2y * qy + e2z * qz) / det > 1e-6) hit = true;
    }
    if (!hit) { n++; if (DBG && P.dbg) console.log('ESCAPE from', [ox, oy, oz].map((v) => +v.toFixed(2)).join(','), 'dir', [dx, dy, dz].map((v) => +v.toFixed(2)).join(',')); }
  }
  return n;
}

// ---------------------------------------------------------------- landmark GLB solidity via gltf-transform (decodes meshopt)
async function landmarkSolidity(lm) {
  const { NodeIO } = await import('@gltf-transform/core'); const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions'); const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path.join(lm.dir, lm.file)), res = {};
  for (const node of doc.getRoot().listScenes()[0].listChildren()) {
    const mm = /_LOD(\d)$/.exec(node.getName()); if (!mm) continue; const P = [];
    node.traverse((n) => {
      if (/_COL$/.test(n.getName()) || !n.getMesh()) return; const w = n.getWorldMatrix();
      for (const prim of n.getMesh().listPrimitives()) {
        const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(); if (!pos) continue;
        const get = (i) => { const v = pos.getElement(i, [0, 0, 0]); const x = w[0] * v[0] + w[4] * v[1] + w[8] * v[2] + w[12], y = w[1] * v[0] + w[5] * v[1] + w[9] * v[2] + w[13], z = w[2] * v[0] + w[6] * v[1] + w[10] * v[2] + w[14]; return [x, y, z]; };
        const n3 = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < n3; i++) P.push(...get(idx ? idx.getScalar(i) : i));
      }
    });
    res[`LOD${mm[1]}`] = openEdgeReport(Float32Array.from(P));
  }
  return res;
}

// ---------------------------------------------------------------- per-area audit
const report = {};
for (const id of ids) {
  const t0 = Date.now(), dir = path.join(ROOT, 'public/areas', id), area = JSON.parse(fs.readFileSync(path.join(dir, 'area.json'), 'utf8'));
  const tb = fs.readFileSync(path.join(dir, 'terrain.bin')), grid = S.decodeTerrain(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength));
  const origin = areaDefs[id].origin, lm = placeLandmarks(id, origin, S.makeTerrain(grid));
  if (lm.pads.length) S.flattenUnderLandmarks(grid, lm.pads);
  const terrain = S.makeTerrain(grid), { kept: bl, culled } = S.cullUnderLandmarks(area.buildings, lm.footprints);
  const style = S.styleFor(id), dummy = new THREE.MeshBasicMaterial();
  const C = { buildings: bl.length, landmarks: lm.list.length };
  const cls = { a_floating: 0, b_sunk: 0, c_road_floating: 0, c_road_sunk: 0, d_in_water: 0, e_overlap_buildings: 0, f_shore_steps: 0, f_waterline_flat_tris: 0, f_pier_floating: 0, f_pier_sunk: 0, f_pier_unconnected: 0, f_pier_open_shells: 0, f_edge_steps: 0, g_void_rays: 0, h_nonsolid_buildings: 0, h_leaking_buildings: 0 };
  const ex = {}; const note = (k, v) => { (ex[k] ??= []).length < (ALL ? 1e6 : 8) && ex[k].push(v); };

  // ---- buildings: a, b, d, h, and collect volumes for e
  const vol = [];
  bl.forEach((b, bi) => {
    const rs = b.r.map(ring).filter((r) => r.length >= 3); if (!rs.length) return;
    const g = S.buildBuildings([b], terrain, dummy, style); let mesh = null; g.group.traverse((o) => { if (o.isMesh) mesh = o; }); if (!mesh) return;
    const P = mesh.geometry.attributes.position.array, F = mesh.geometry.attributes.facade.array;
    let yMin = 1e9, yMax = -1e9; for (let i = 1; i < P.length; i += 3) { yMin = Math.min(yMin, P[i]); yMax = Math.max(yMax, P[i]); }
    const floor = F[0], eave = F[1];
    const { boundary, interior } = sampleRings(rs, 1.0), all = boundary.concat(interior);
    let minT = 1e9, maxB = -1e9, minB = 1e9, wet = 0; for (const [x, z] of boundary) { const h = terrain.heightAt(x, z); maxB = Math.max(maxB, h); minB = Math.min(minB, h); }
    for (const [x, z] of all) { const h = terrain.heightAt(x, z); minT = Math.min(minT, h); if (h < 0) wet++; }
    const part = b.m > 0;
    let flt = false, sunk = false;
    if (!part) {
      if (yMin - minB > T.floatBase) flt = true;                                   // a: gap under the wall at some boundary sample (sample-exact)
      for (const [x, z] of boundary) if (yMin - terrain.heightAt(x, z) > T.floatBase) { flt = true; break; }
      if (maxB - floor > T.buriedWall || maxB > eave - T.buriedRoof || yMin < minT - T.deepSkirt) sunk = true; // b
      if (wet / all.length >= T.water) { cls.d_in_water++; note('d', { i: bi, wet: +(wet / all.length).toFixed(2), at: [Math.round(b.o[0] / 10), Math.round(b.o[1] / 10)] }); }
    }
    if (flt) { cls.a_floating++; note('a', { i: bi, gap: +(yMin - minB).toFixed(2), at: [Math.round(b.o[0] / 10), Math.round(b.o[1] / 10)] }); }
    if (sunk) { cls.b_sunk++; note('b', { i: bi, buried: +(maxB - floor).toFixed(2), at: [Math.round(b.o[0] / 10), Math.round(b.o[1] / 10)] }); }
    if (DBG && String(bi) === DBG) { P.dbg = true; const F0 = [...F].slice(0, 4); console.log('DBG building', bi, JSON.stringify({ b: { h: b.h, m: b.m, s: b.s, rh: b.rh, o: b.o, ring: b.r[0].length / 2 }, floor, eave, yMin, yMax, F0 })); }
    const rep = openEdgeReport(P);
    if (rep.free > 0) { cls.h_nonsolid_buildings++; note('h', { i: bi, free: rep.free, open: rep.open, s: b.s, m: b.m, at: [Math.round(b.o[0] / 10), Math.round(b.o[1] / 10)], e: rep.sample }); }
    if (interior.length) { // up to 3 inside points at mid wall height
      const clear = ([x, z]) => { let d = 1e9; for (const r of rs) for (let i = 0; i < r.length; i++) { const [ax, az] = r[i], [bx2, bz2] = r[(i + 1) % r.length], dx = bx2 - ax, dz = bz2 - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return d; };
      const ranked = interior.map((p) => [clear(p), p]).filter(([c]) => c >= 0.4).sort((p, q) => q[0] - p[0]); // points well inside only (not on a wall)
      const pick = (ranked.length ? [ranked[0][1], ranked[ranked.length >> 1][1]] : []).filter((p, i, a) => a.indexOf(p) === i).map(([x, z]) => [x, floor + Math.min(1.2, Math.max(0.3, (eave - floor) * 0.4)), z]);
      const lk = leaks(P, pick); if (lk > 0) { cls.h_leaking_buildings++; note('h_leak', { i: bi, escapedRays: lk, s: b.s, at: [Math.round(b.o[0] / 10), Math.round(b.o[1] / 10)] }); }
    }
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const [x, z] of rs[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    vol.push({ bi, rs, y0: part ? yMin : floor, y1: yMax, minX, maxX, minZ, maxZ, tr: null, part });
  });
  // ---- e: overlaps (plan intersection > 1 m2 and vertical overlap > 1 m), buildings vs buildings and landmark plan vs remaining buildings
  const hash = new Map(), cs = 32;
  vol.forEach((v, i) => { for (let x = Math.floor(v.minX / cs); x <= Math.floor(v.maxX / cs); x++) for (let z = Math.floor(v.minZ / cs); z <= Math.floor(v.maxZ / cs); z++) { const k = x * 100003 + z; let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(i); } });
  const bad = new Set(), seen = new Set(); let pairs = 0;
  for (const [, l] of hash) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const A = vol[l[i]], B = vol[l[j]], pk = l[i] < l[j] ? l[i] * 1e6 + l[j] : l[j] * 1e6 + l[i]; if (seen.has(pk)) continue; seen.add(pk);
    if (A.maxX < B.minX || B.maxX < A.minX || A.maxZ < B.minZ || B.maxZ < A.minZ) continue;
    if (Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) < T.overlapY) continue;
    A.tr ??= tris(A.rs); B.tr ??= tris(B.rs); const ia = interArea(A.tr, B.tr);
    if (ia > T.overlapArea) { pairs++; bad.add(A.bi); bad.add(B.bi); note('e', { a: A.bi, b: B.bi, m2: +ia.toFixed(1), at: [Math.round((A.minX + A.maxX) / 2), Math.round((A.minZ + A.maxZ) / 2)] }); }
  }
  cls.e_overlap_buildings = bad.size; C.overlapPairs = pairs;
  let lmOver = 0;
  for (const L of lm.list) { const lt = tris([L.plan]); for (const v of vol) { if (v.maxX < Math.min(...L.plan.map((p) => p[0])) || v.minX > Math.max(...L.plan.map((p) => p[0])) || v.maxZ < Math.min(...L.plan.map((p) => p[1])) || v.minZ > Math.max(...L.plan.map((p) => p[1]))) continue; v.tr ??= tris(v.rs); const ia = interArea(lt, v.tr); if (ia > T.overlapArea && v.y1 > L.baseY + T.overlapY) { lmOver++; bad.add('lm:' + L.id + ':' + v.bi); note('e_landmark', { landmark: L.id, building: v.bi, m2: +ia.toFixed(1) }); } } }
  cls.e_overlap_buildings += lmOver; C.landmarkOverlaps = lmOver;

  // ---- c: roads (real mesh): sample triangle centroid + edge midpoints against the terrain
  const roads = S.buildRoads(area, terrain, dummy, lm.pads), RP = roads.geometry.attributes.position.array;
  let rf = 0, rs = 0, rw = 0; const nTri = RP.length / 9;
  for (let t = 0; t < nTri; t++) {
    const v = [0, 1, 2].map((k) => [RP[t * 9 + k * 3], RP[t * 9 + k * 3 + 1], RP[t * 9 + k * 3 + 2]]);
    const smp = [[(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3], ...[[0, 1], [1, 2], [2, 0]].map(([a, b]) => [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])];
    let flt = false, snk = false, wat = false;
    for (const [x, y, z] of smp) { const h = terrain.heightAt(x, z), d = y - Math.max(h, 0.05); if (h < -0.3) wat = true; else if (d > T.roadFloat) flt = true; if (d < T.roadSunk && h >= 0.05) snk = true; }
    if (wat) rw++; else { if (flt) { rf++; if (ex.c?.length < 5 || !ex.c) note('c', { t, at: [Math.round(smp[0][0]), Math.round(smp[0][2])], d: +(smp[0][1] - terrain.heightAt(smp[0][0], smp[0][2])).toFixed(2) }); } if (snk) rs++; }
  }
  cls.c_road_floating = rf; cls.c_road_sunk = rs; C.roadTris = nTri; C.roadTrisOverWater = rw;

  // ---- f: shoreline steps, waterline flats, pier/dock seating, edge steps
  const { nx, nz, h, cell } = grid; let steps = 0, flat = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    for (const j of [ix + 1 < nx ? i + 1 : -1, iz + 1 < nz ? i + nx : -1]) if (j >= 0 && (h[i] < 0) !== (h[j] < 0) && Math.abs(h[i] - h[j]) > T.shoreStep) steps++;
    if (ix + 1 < nx && iz + 1 < nz && Math.abs(h[i]) < T.flatWaterline && Math.abs(h[i + 1]) < T.flatWaterline && Math.abs(h[i + nx]) < T.flatWaterline && Math.abs(h[i + nx + 1]) < T.flatWaterline) flat++;
  }
  cls.f_shore_steps = steps; cls.f_waterline_flat_tris = flat;
  { // piers/docks: build each pier ALONE with the runtime builder (buildPoolsPiers), then measure the real geometry: deck top vs terrain, solidity, land contact
    const landNear = (x, z, r) => { for (let dx = -r; dx <= r; dx += 1) for (let dz = -r; dz <= r; dz += 1) if (dx * dx + dz * dz <= r * r && terrain.heightAt(x + dx, z + dz) > 0.05) return true; return false; };
    let open = 0, unconnected = 0, thin = 0;
    for (let pi = 0; pi < area.piers.length; pi++) {
      const p = area.piers[pi], pts = ring(p.poly ?? p.line), dense = []; const n = pts.length;
      for (let i = 0; i < (p.poly ? n : n - 1); i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n], L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(L / 2)); for (let s = 0; s < k; s++) dense.push([x0 + ((x1 - x0) * s) / k, z0 + ((z1 - z0) * s) / k]); }
      if (!dense.length) continue;
      const m = S.buildPoolsPiers({ ...area, pools: [], piers: [p] }, terrain, dummy), P = m.geometry.attributes.position.array, nT = P.length / 9;
      if (nT === 0) { thin++; continue; }
      const up = []; // up-facing triangles (deck tops), for the deck height under a sample
      for (let t = 0; t < nT; t++) { const o = t * 9, e1 = [P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]], e2 = [P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]]; const ny = e1[2] * e2[0] - e1[0] * e2[2], nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]); if (nl > 1e-9 && ny / nl > 0.9) up.push(t); }
      const deckAt = (x, z) => { let best = null; for (const t of up) { const o = t * 9, ax = P[o], az = P[o + 2], bx = P[o + 3], bz = P[o + 5], cx = P[o + 6], cz = P[o + 8], d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-12) continue; const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, e = 0.02; if (u >= -e && v >= -e && u + v <= 1 + e) { const y = u * P[o + 1] + v * P[o + 4] + (1 - u - v) * P[o + 7]; if (best === null || y > best) best = y; } } return best; };
      let sunkN = 0, land = 0, hover = 0, tot = 0;
      for (const [x, z] of dense) { const dy = deckAt(x, z); if (dy === null) continue; tot++; const hh = terrain.heightAt(x, z); if (hh > dy - 0.05) sunkN++; if (hh > 0.3) { land++; if (dy - hh > 0.8) hover++; } }
      if (!tot) { thin++; continue; }
      if (sunkN / tot > 0.25) { cls.f_pier_sunk++; note('f_pier_sunk', { pier: pi, at: [Math.round(dense[0][0]), Math.round(dense[0][1])] }); }
      if (land / tot > 0.9 && hover / tot > 0.5) { cls.f_pier_floating++; note('f_pier_floating', { pier: pi, at: [Math.round(dense[0][0]), Math.round(dense[0][1])] }); }
      let linked = false; for (let i = 0; i < P.length && !linked; i += 3) if (landNear(P[i], P[i + 2], 2)) linked = true; // any piece of the dock within 2 m of ground above the sea
      if (!linked) { unconnected++; note('f_pier_unconnected', { pier: pi, at: [Math.round(dense[0][0]), Math.round(dense[0][1])] }); }
      const sr = openEdgeReport(P); if (sr.free > 0) { open++; note('f_pier_open', { pier: pi, free: sr.free, at: [Math.round(dense[0][0]), Math.round(dense[0][1])] }); }
    }
    cls.f_pier_unconnected = unconnected; cls.f_pier_open_shells = open; C.pierNoGeometry = thin; C.piers = area.piers.length;
  }
  if (area.dock) { // ferry dock: deck 1.6 m, local +x out to water; sample the deck plan
    const x = area.dock.x / 10, z = area.dock.z / 10, a = area.dock.a / 1000, c = Math.cos(a), s = Math.sin(a); let buried = 0, n = 0;
    for (let u = -4; u <= 38; u += 2) for (const w of [-3, 0, 3]) { n++; if (terrain.heightAt(x + c * u - s * w, z + s * u + c * w) > 1.6 - 0.2 + 0.05) buried++; }
    if (buried / n > 0.15) { cls.f_pier_sunk++; note('f_pier_sunk', { ferryDock: true, buriedFraction: +(buried / n).toFixed(2) }); }
  }
  { // edge steps: tile edge vs what the runtime puts beyond it (coastal: sea plane y=0; inland: the dark skirt at median edge - 0.6 before the fix; after the fix: the far ground ring, continuous by construction)
    const edge = []; for (let i = 0; i < nx; i++) edge.push(h[i], h[(nz - 1) * nx + i]); for (let j = 0; j < nz; j++) edge.push(h[j * nx], h[j * nx + nx - 1]);
    const sorted = [...edge].sort((p, q) => p - q), beyond = S.farGround ? null : (area.inland ? Math.max(sorted[sorted.length >> 1], 0) - 0.6 : 0);
    let es = 0; if (beyond !== null) for (const e of edge) if (Math.abs(e - beyond) > 0.3) es++;
    cls.f_edge_steps = es; C.edgeVerts = edge.length;
  }

  // ---- g: void rays (see header). Layers modelled from the runtime: tile heightfield (front faces), far-ground/skirt/sea.
  const gv = voidScan(id, area, grid, terrain);
  cls.g_void_rays = gv.void; C.voidRaysTested = gv.tested; C.voidDetail = gv.by; if (gv.holes.length) ex.g_hole = gv.holes;

  // ---- h (landmarks): GLB solidity per LOD
  const lmRep = {};
  for (const L of lm.list) { try { const r = await landmarkSolidity(L); lmRep[L.id] = r; C.landmarkFreeEdgesLOD0 = (C.landmarkFreeEdgesLOD0 ?? 0) + (r.LOD0?.free ?? 0); } catch (e) { lmRep[L.id] = { error: String(e.message).slice(0, 120) }; } }
  report[id] = { counts: cls, context: { ...C, culledUnderLandmarks: culled }, landmarks: lmRep, examples: ex, ms: Date.now() - t0 };
  console.log(`${id}: ${Date.now() - t0} ms`);
}

// ---------------------------------------------------------------- g: ground void model
function voidScan(id, area, grid, terrain) {
  const { nx, nz, cell, x0, z0, h } = grid, W = cell * (nx - 1), H = cell * (nz - 1), x1 = x0 + W, z1 = z0 + H, inland = !!area.inland;
  const edge = []; for (let i = 0; i < nx; i++) edge.push(h[i], h[(nz - 1) * nx + i]); for (let j = 0; j < nz; j++) edge.push(h[j * nx], h[j * nx + nx - 1]); edge.sort((p, q) => p - q);
  const skirtY = Math.max(edge[edge.length >> 1], 0) - 0.6, HALF = 30000, FAR = 40000;
  const far = S.farGround ? S.farGround(grid, inland) : null; // after the fix: real ring geometry from src/area/farGround.ts
  const ringTris = far ? far.triangles : null;
  const rects = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const heightHit = (ox, oy, oz, dx, dy, dz) => { // first front-face hit with the tile heightfield, marching 6 m; below-surface entry = back face (ignored, ray continues)
    let tEnter = 0; const tx = [(x0 - ox) / dx, (x1 - ox) / dx].sort((p, q) => p - q), tz = [(z0 - oz) / dz, (z1 - oz) / dz].sort((p, q) => p - q);
    const t0 = Math.max(0, tx[0], tz[0]), t1 = Math.min(tx[1], tz[1], FAR); if (!(t1 > t0)) return null; tEnter = t0;
    let prevAbove = oy + dy * t0 > terrain.heightAt(ox + dx * t0, oz + dz * t0);
    for (let t = t0 + 6; t <= t1 + 6; t += 6) { const tt = Math.min(t, t1), above = oy + dy * tt > terrain.heightAt(ox + dx * tt, oz + dz * tt); if (prevAbove && !above) return tt; prevAbove = above; if (tt >= t1) break; }
    return null;
  };
  const ringGround = (x, z) => { const t = rayTris(far, x, 1e5, z, 0, -1, 0); return Number.isFinite(t) ? 1e5 - t : 0; };
  const planeHit = (oy, dy, y) => { const t = (y - oy) / dy; return t > 0 ? t : null; };
  const holes = []; let tested = 0, bad = 0; const by = { skirt: 0, escape: 0, underTile: 0, hole: 0, horizonFog: 0 };
  const sides = [['W', x0, null], ['E', x1, null], ['N', null, z0], ['S', null, z1]];
  const offs = [-300, 0, 300, 3000, 12000], alts = [3, 40, 200, 800, 2500, 6000];
  const dirs = []; for (let az = 0; az < 24; az++) for (const p of [-70, -35, -15, -6, -2, -0.5]) { const a = (az / 24) * Math.PI * 2, pr = (p * Math.PI) / 180; dirs.push([Math.cos(pr) * Math.sin(a), Math.sin(pr), Math.cos(pr) * Math.cos(a)]); }
  for (const [, ex0, ez0] of sides) for (const f of [0.15, 0.5, 0.85]) for (const off of offs) for (const alt of alts) {
    const sign = ex0 !== null ? (ex0 === x0 ? -1 : 1) : (ez0 === z0 ? -1 : 1);
    const px = ex0 !== null ? ex0 + sign * off : x0 + W * f, pz = ez0 !== null ? ez0 + sign * off : z0 + H * f;
    const gy = rects(px, pz) ? terrain.heightAt(px, pz) : far ? ringGround(px, pz) : (inland ? skirtY : 0), py = Math.max(gy, 0) + alt;
    for (const [dx, dy, dz] of dirs) {
      tested++; let best = Infinity, kind = null;
      const th = heightHit(px, py, pz, dx, dy, dz); if (th !== null) { best = th; kind = 'tile'; }
      if (far) { const th2 = rayTris(far, px, py, pz, dx, dy, dz); if (th2 < best) { best = th2; kind = 'far'; } }
      else if (inland) { const t = planeHit(py, dy, skirtY); if (t !== null && t < best) { const hx = px + dx * t, hz = pz + dz * t; if (Math.abs(hx) <= HALF && Math.abs(hz) <= HALF && !(hx > x0 + 2 && hx < x1 - 2 && hz > z0 + 2 && hz < z1 - 2) && t <= FAR) { best = t; kind = 'skirt'; } } }
      else { const t = planeHit(py, dy, 0); if (t !== null && t < best) { const hx = px + dx * t, hz = pz + dz * t; if (Math.abs(hx) <= HALF && Math.abs(hz) <= HALF && t <= FAR) { best = t; kind = 'sea'; } } }
      if (kind === 'skirt') { bad++; by.skirt++; }                                     // lands on the dark unlit-looking skirt (the black void)
      else if (kind === null && far) {                                              // ring + tile cover the plane out to FAR_RADIUS: a downward ray that misses both
        const run = (Math.max(py - 60, 1) / -dy) * Math.hypot(dx, dz);                // runs off the ring's end before it could reach the ground: it lands on the dome
        if (run < S.FAR_RADIUS * 0.9) { bad++; by.hole++; (holes.length < 12) && holes.push([Math.round(px), Math.round(py), Math.round(pz), +dx.toFixed(2), +dy.toFixed(3), +dz.toFixed(2), +gy.toFixed(1)]); } else by.horizonFog++;     // below the horizon the dome is the fog colour (sky.ts), so that is not black
      }
      else if (kind === null) { bad++; if (heightEntersBelow(px, py, pz, dx, dy, dz)) by.underTile++; else by.escape++; } // sees nothing front-facing before the far plane
    }
  }
  return { void: bad, tested, by, holes };
  function heightEntersBelow(ox, oy, oz, dx, dy, dz) { const t = Math.max(0, Math.min(...[(x0 - ox) / dx, (x1 - ox) / dx].filter(Number.isFinite).map((v) => (v < 0 ? Infinity : v)))); return Number.isFinite(t) && t < FAR && oy + dy * t < terrain.heightAt(ox + dx * t, oz + dz * t); }
}
function rayTris(far, ox, oy, oz, dx, dy, dz) { // Moller-Trumbore, front faces only (CCW seen from the ray origin), indexed triangles
  const P = far.positions, I = far.indices; let best = Infinity;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; if (nx * dx + ny * dy + nz * dz >= 0) continue; // back face
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2], u = (tx * px + ty * py + tz * pz) / det; if (u < -1e-7 || u > 1 + 1e-7) continue; // slack: a ray exactly along a shared edge must not slip between two triangles
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) / det; if (v < -1e-7 || u + v > 1 + 1e-7) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) / det; if (tt > 0 && tt < best) best = tt;
  }
  return best;
}

// ---------------------------------------------------------------- output
fs.mkdirSync(OUT, { recursive: true });
const total = {}; for (const r of Object.values(report)) for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify({ label, at: new Date().toISOString(), thresholds: T, total, areas: report }, null, 1));
const keys = Object.keys(total), pad = (s, n) => String(s).padStart(n);
console.log('\nclass'.padEnd(26) + ids.map((i) => pad(i, 10)).join('') + pad('TOTAL', 10));
for (const k of keys) console.log(k.padEnd(25) + ' ' + ids.map((i) => pad(report[i].counts[k], 10)).join('') + pad(total[k], 10));
console.log(`\nwrote tools/map-audit.out/${label}.json`);
