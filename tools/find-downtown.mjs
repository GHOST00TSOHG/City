#!/usr/bin/env node
// Finds a street-level downtown vantage that stays inside the Newark tile (outside Passaic's overlap-owner bounds): clusters Newark's tallest buildings, then walks the nearest long, wide
// street so the camera looks down the avenue toward the towers. Prints a registry `downtown` view line.   CITY_URL=http://localhost:4191 node tools/find-downtown.mjs
import { chromium } from 'playwright';
const base = process.env.CITY_URL ?? 'http://localhost:4191';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader'] }), page = await b.newPage();
await page.goto(`${base}/?gl=1&join=0&mp=0&mode=free&area=newark&towns=0`);
await page.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const reg = window.__registry, nb = reg.get('newark').bounds, pb = reg.get('passaic').bounds, a = window.__app.auditInput().area;
  const inP = (x, z) => x >= pb.minX - 40 && x <= pb.maxX + 40 && z >= pb.minZ - 40 && z <= pb.maxZ + 40;
  const tall = a.buildings.filter((q) => q.h >= 40 && !inP(q.o[0] / 10, q.o[1] / 10)).map((q) => ({ x: q.o[0] / 10, z: q.o[1] / 10, h: q.h }));
  let best = null; // densest cluster of tall buildings within 160 m
  for (const t of tall) { const n = tall.filter((u) => Math.hypot(u.x - t.x, u.z - t.z) < 160); const sc = n.reduce((s, u) => s + u.h, 0); if (!best || sc > best.sc) best = { sc, n: n.length, x: n.reduce((s, u) => s + u.x, 0) / n.length, z: n.reduce((s, u) => s + u.z, 0) / n.length, hMax: Math.max(...n.map((u) => u.h)) }; }
  if (!best) return { nb, pb, tall: tall.length };
  // a long wide street that points at the cluster, standing 90-160 m back from it
  let pick = null;
  for (const r of a.roads) {
    if (r.c > 1 || r.w < 8) continue;
    const p = []; for (let i = 0; i + 1 < r.p.length; i += 2) p.push([r.p[i] / 10, r.p[i + 1] / 10]);
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 25) continue;
      for (const [sx, sz, ex, ez] of [[x0, z0, x1, z1], [x1, z1, x0, z0]]) {
        const hx = (ex - sx) / L, hz = (ez - sz) / L, dx = best.x - sx, dz = best.z - sz, D = Math.hypot(dx, dz), along = (dx * hx + dz * hz) / D;
        if (D < 90 || D > 190 || along < 0.93) continue; // heading toward the towers
        if (sx < nb.minX || sx > nb.maxX || sz < nb.minZ || sz > nb.maxZ || inP(sx, sz)) continue;
        const sc = along * 100 - Math.abs(D - 130) * 0.3 + r.w; if (!pick || sc > pick.sc) pick = { sc, sx, sz, hx, hz, w: r.w, D };
      }
    }
  }
  return { nb, pb, tall: tall.length, cluster: best, pick };
});
console.log(JSON.stringify(r));
await b.close();
