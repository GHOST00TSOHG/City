// Run F seam probe: Newark/Passaic overlap. Real WebKit, all tiles built. Reports (1) Newark landmarks and whether any sit inside Passaic's rect, (2) Passaic vs Newark
// buildings whose footprints overlap (doubled), (3) terrain height difference of the two height grids on the overlap edge, (4) Newark ground meshes drawn inside Passaic's rect.
//   node tools/perf/overlap-probe.mjs [port]
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const port = process.argv[2] ?? '5190';
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { if (/\[City\] (overlap|landmarks of)/.test(m.text())) console.log('  [page]', m.text()); });
await p.goto(`http://localhost:${port}/?join=0&area=newark`, { waitUntil: 'load', timeout: 300000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 300000 });
await p.evaluate(() => window.__app.loadAll());
await p.evaluate(() => { window.__app.stream.enabled = false; });
await p.waitForTimeout(8000);
const r = await p.evaluate(() => {
  const R = window.__registry, N = R.get('newark'), P = R.get('passaic'), T = window.__THREE;
  const pb = P.bounds, nb = N.bounds, inP = (x, z) => x >= pb.minX && x <= pb.maxX && z >= pb.minZ && z <= pb.maxZ;
  const ov = { minX: Math.max(pb.minX, nb.minX), maxX: Math.min(pb.maxX, nb.maxX), minZ: Math.max(pb.minZ, nb.minZ), maxZ: Math.min(pb.maxZ, nb.maxZ) };
  // landmarks: GLB roots under the newark group (named by id)
  const lm = [];
  window.__cityScene.traverse((o) => { if (o.parent?.name === 'landmarks' || o.userData?.landmark) { const bx = new T.Box3().setFromObject(o); lm.push({ name: o.name, min: bx.min.toArray().map(Math.round), max: bx.max.toArray().map(Math.round), inPassaic: inP((bx.min.x + bx.max.x) / 2, (bx.min.z + bx.max.z) / 2) }); } });
  // buildings (world coords, decoded): footprint polygon ring p, centre o (decimetres)
  const nbld = N.bundle.area.buildings.filter((q) => !inP(q.o[0] / 10, q.o[1] / 10)), pbld = P.bundle.area.buildings.filter((q) => q.o[0] / 10 >= ov.minX - 50 && q.o[0] / 10 <= ov.maxX + 50 && q.o[1] / 10 >= ov.minZ - 50 && q.o[1] / 10 <= ov.maxZ + 50);
  const near = [];
  for (const a of nbld) { const ax = a.o[0] / 10, az = a.o[1] / 10; if (ax < ov.minX - 80 || ax > ov.maxX + 80 || az < ov.minZ - 80 || az > ov.maxZ + 80) continue; for (const q of pbld) { const d = Math.hypot(q.o[0] / 10 - ax, q.o[1] / 10 - az); if (d < 6) near.push({ n: [Math.round(ax), Math.round(az)], p: [Math.round(q.o[0] / 10), Math.round(q.o[1] / 10)], d: +d.toFixed(1) }); } }
  // terrain: sample both grids along the overlap rectangle's inner edges
  const hN = N.bundle.terrain, hP = P.bundle.terrain, at = (t, x, z) => { const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell, ix = Math.floor(fx), iz = Math.floor(fz); if (ix < 0 || iz < 0 || ix >= t.nx - 1 || iz >= t.nz - 1) return null; const u = fx - ix, v = fz - iz, g = (i, j) => t.h[(iz + j) * t.nx + ix + i]; return g(0, 0) * (1 - u) * (1 - v) + g(1, 0) * u * (1 - v) + g(0, 1) * (1 - u) * v + g(1, 1) * u * v; };
  let maxDiff = 0, n = 0, worst = null; const diffs = [];
  for (let x = ov.minX + 20; x < ov.maxX - 20; x += 40) for (const z of [ov.minZ + 6, ov.maxZ - 6, (ov.minZ + ov.maxZ) / 2]) { const a = at(hN, x, z), c = at(hP, x, z); if (a == null || c == null) continue; n++; const d = Math.abs(a - c); diffs.push(d); if (d > maxDiff) { maxDiff = d; worst = [Math.round(x), Math.round(z), +a.toFixed(2), +c.toFixed(2)]; } }
  for (let z = ov.minZ + 20; z < ov.maxZ - 20; z += 40) for (const x of [ov.minX + 6, ov.maxX - 6]) { const a = at(hN, x, z), c = at(hP, x, z); if (a == null || c == null) continue; n++; const d = Math.abs(a - c); diffs.push(d); if (d > maxDiff) { maxDiff = d; worst = [Math.round(x), Math.round(z), +a.toFixed(2), +c.toFixed(2)]; } }
  diffs.sort((x, y) => x - y);
  return { ov, pb, nb, landmarks: lm, nearDup: near.length, nearSample: near.slice(0, 8), nNewarkBld: nbld.length, nPassaicBld: pbld.length, terrain: { samples: n, maxDiff: +maxDiff.toFixed(2), p50: +diffs[diffs.length >> 1]?.toFixed(2), p95: +diffs[Math.floor(diffs.length * 0.95)]?.toFixed(2), worst } };
});
console.log('landmarks inside Passaic rect:', JSON.stringify(r.landmarks.filter((l) => l.inPassaic).map((l) => l.name)), 'of', r.landmarks.length);
console.log('same-footprint buildings drawn by both tiles (centres < 6 m apart):', r.nearDup, JSON.stringify(r.nearSample.slice(0, 4)));
console.log('buildings Newark (outside Passaic rect) / Passaic (near overlap):', r.nNewarkBld, r.nPassaicBld);
console.log('terrain height difference on the overlap (m):', JSON.stringify(r.terrain));
await b.close();
