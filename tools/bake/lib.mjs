// Shared helpers for the offline area bake. Pure functions, no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const UA = 'City-bake/0.1 (+https://github.com/GHOST00TSOHG/City)';
export const R = 6378137;

export function loadArea(id) {
  const areas = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/bake/areas.json'), 'utf8'));
  const a = areas[id];
  if (!a) throw new Error(`unknown area "${id}". Known: ${Object.keys(areas).filter((k) => !k.startsWith('_')).join(', ')}`);
  return { id, ...a };
}
export const cacheDir = (id) => { const d = path.join(ROOT, 'tools/cache', id); fs.mkdirSync(d, { recursive: true }); return d; };
export const outDir = (id) => { const d = path.join(ROOT, 'public/areas', id); fs.mkdirSync(d, { recursive: true }); return d; };

/** Local ENU (metres): x east, z south (three.js: -z north), around the area origin. */
export function projector(origin) {
  const k = (Math.PI / 180) * R, c = Math.cos((origin.lat * Math.PI) / 180);
  return {
    fwd: (lon, lat) => [(lon - origin.lon) * k * c, -(lat - origin.lat) * k],
    inv: (x, z) => [origin.lon + x / (k * c), origin.lat - z / k],
  };
}

/** Private masks (e.g. the home area) from gitignored config.private.json. Never logged or written out. */
export function loadMasks(id) {
  const f = path.join(ROOT, 'config.private.json');
  if (!fs.existsSync(f)) return [];
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  return (cfg.masks ?? []).filter((m) => m.area === id);
}

export function hash32(str) { // FNV-1a, deterministic per feature id
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function ringArea(r) { // signed, x/z pairs flat
  let a = 0; for (let i = 0, n = r.length / 2; i < n; i++) { const j = (i + 1) % n; a += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1]; } return a / 2;
}
export function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function centroid(r) {
  let x = 0, z = 0, n = r.length / 2; for (let i = 0; i < n; i++) { x += r[2 * i]; z += r[2 * i + 1]; } return [x / n, z / n];
}
/** Douglas-Peucker on a closed ring (flat x/z), keeps shape crisp while dropping scan noise. */
export function simplifyRing(r, tol) {
  const n = r.length / 2; if (n <= 4) return r;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = r[2 * a], az = r[2 * a + 1], bx = r[2 * b], bz = r[2 * b + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((r[2 * i] - ax) * dz - (r[2 * i + 1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
  return out.length >= 6 ? out : r;
}
export const q = (v) => Math.round(v * 10); // decimetres
