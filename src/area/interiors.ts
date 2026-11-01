import { quality } from '../perf/quality';
import { diag } from '../perf/diag';
import * as THREE from 'three/webgpu';
import { A6, budget } from '../perf/frame';
import { vertexColor, positionWorld, normalWorld, uniform, vec3, float, floor, clamp, max, dot, normalize, length, mix, hash, select } from 'three/tsl';
import type { Building, Terrain } from './data';
import { Soup, ringPts, signedArea, flatPoly } from './geom';

/**
 * Real ground-floor rooms, generated from a footprint only when the player is near (or inside) a building.
 * Inner shell walls line up with the facade's window grid (same maths as facade.ts), so the window holes match the
 * lit glass outside. Rectangular footprints are split into rooms along the long axis with door gaps; each room gets
 * a ceiling lamp (per-pixel falloff in TSL, no scene lights, so no shader recompiles) and a few furniture boxes.
 * One interior lives in the scene at a time; it's rebuilt when you walk to another building (a few ms).
 */
interface Cand { i: number; cx: number; cz: number; r: number; ring: [number, number][]; base: number; slab: number; ceil: number; house: boolean; seed: number; rect: boolean }

const NEAR = quality.interiorNear; // Air tier 14, High 18; // m from the footprint edge at which the interior loads
const INSET = 0.28; // inner shell sits inside the exterior wall

export function createInteriors(list: Building[], terrain: Terrain) {
  const cands: Cand[] = [];
  list.forEach((b, i) => {
    if (b.m > 0 || b.h < 3.2) return;
    const rings = b.r.map(ringPts).filter((r) => r.length >= 3); if (!rings.length || rings.length > 1) return;
    const ring = rings[0], area = Math.abs(signedArea(ring));
    if (area < 40 || area > 4000) return;
    let gmin = Infinity, gmax = -Infinity, cx = 0, cz = 0;
    for (const [x, z] of ring) { const g = terrain.heightAt(x, z); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); cx += x / ring.length; cz += z / ring.length; }
    gmin = b.pad ?? Math.max(gmin, 0.2); gmax = Math.max(gmax, 0.2);
    if (gmax - gmin > 0.9) return; // sloped lots: skip (floor would float)
    const pitched = b.s !== 'flat' && b.rh > 0.2, house = (pitched || b.h < 7.5) && area < 400;
    const base = gmin - 0.4, fh = house ? 3.1 : 3.4, ceil = base + 0.35 + fh;
    if (ceil > gmin + b.h - (pitched ? b.rh : 0) + 0.01) return;
    let r = 0; for (const [x, z] of ring) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const L = b.o[3] / 20, S = b.o[4] / 20, rect = ring.length <= 6 && area / Math.max(4 * L * S, 1) > 0.92;
    cands.push({ i, cx, cz, r, ring, base, slab: gmax + 0.06, ceil: ceil - 0.02, house, seed: ((((b.o[0] * 73856093) ^ (b.o[1] * 19349663)) >>> 0) % 997) / 997, rect });
  });

  // per-interior uniforms drive the lamp lighting: lamp row along the long axis of the footprint
  const uC = uniform(new THREE.Vector3()), uU = uniform(new THREE.Vector3(1, 0, 0)), uL = uniform(5), uRoom = uniform(5), uN = uniform(1);
  const mat = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  {
    const rel = positionWorld.sub(uC), u = dot(rel, uU);
    const idx = clamp(floor(u.add(uL).div(uRoom)), 0, uN.sub(1));
    const lampU = idx.add(0.5).mul(uRoom).sub(uL);
    const lp = uC.add(uU.mul(lampU)); // uC.y = ceiling - 0.15
    const toL = lp.sub(positionWorld), d = length(toL);
    const lambert = max(dot(normalWorld, normalize(toL)), 0).mul(0.75).add(0.25);
    const fall = float(1).div(d.mul(d).mul(0.045).add(1));
    const grain = hash(positionWorld.x.mul(40).floor().add(positionWorld.z.mul(40).floor().mul(131))).mul(0.03);
    const warm = vec3(1.0, 0.9, 0.76);
    mat.colorNode = vertexColor().mul(warm).mul(lambert.mul(fall).mul(1.25).add(0.12)).add(grain.mul(fall));
    mat.colorNode = mix(mat.colorNode, vertexColor(), select(vertexColor().r.greaterThan(1.5), float(1), float(0))); // emissive panels (colour > 1) stay bright
  }
  const group = new THREE.Group(); group.name = 'interior';
  let current: Cand | null = null, mesh: THREE.Mesh | null = null, timer = 0;

  function build(c: Cand) {
    const b = list[c.i], s = new Soup();
    const ang = b.o[2] / 1000, L = b.o[3] / 20, S = b.o[4] / 20, ox = b.o[0] / 10, oz = b.o[1] / 10;
    const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    const P = (u: number, v: number, y: number) => [ox + ux * u + vx * v, y, oz + uz * u + vz * v];
    const rnd = mulberry(Math.floor(c.seed * 1e6) + c.i);
    const wallCol = new THREE.Color().setHSL(0.08 + rnd() * 0.5, 0.12 + rnd() * 0.1, 0.72);
    const floorCol = new THREE.Color(rnd() < 0.5 ? 0x7a5234 : 0x8c8a84), ceilCol = new THREE.Color(0xe8e6e0), trimCol = new THREE.Color(0xd8d4ca);
    const fh = c.house ? 3.1 : 3.4, sx = c.house ? 3.3 : 3.0;
    const wx0 = c.house ? 0.34 : 0.08, wy0 = c.house ? 0.22 : 0.06, wy1 = c.house ? 0.74 : 0.8;
    const yw0 = c.base + 0.35 + fh * wy0, yw1 = c.base + 0.35 + fh * wy1, y0 = c.slab - 0.02, y1 = c.ceil;
    // floor + ceiling
    const inner = c.ring; // inset handled by walls; slab/ceiling hide under them
    flatPoly(s, inner, [], c.slab, floorCol);
    flatPoly(s, inner, [], y1, ceilCol, true);
    // inner shell with window holes, facing inward
    const sign = signedArea(c.ring) > 0 ? 1 : -1;
    for (let i = 0; i < c.ring.length; i++) {
      const [ax, az] = c.ring[i], [bx, bz] = c.ring[(i + 1) % c.ring.length];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); if (len < 0.05) continue;
      const nx = (dz / len) * sign, nz = (-dx / len) * sign; // outward
      const ix = -nx, iz = -nz, hint: [number, number, number] = [ix, 0, iz];
      const at = (t: number, y: number) => [ax + dx * (t / len) + ix * INSET, y, az + dz * (t / len) + iz * INSET];
      // facade grid coordinate along this wall (identical to facade.ts)
      const along = (x: number, z: number) => x * -nz + z * nx;
      const c0 = along(ax, az) / sx + c.seed * 7, c1 = along(bx, bz) / sx + c.seed * 7, dc = (c1 - c0) / len;
      const holes: [number, number][] = [];
      const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
      for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
        let t0 = (k + wx0 - c0) / dc, t1 = (k + 1 - wx0 - c0) / dc; if (t0 > t1) [t0, t1] = [t1, t0];
        t0 = Math.max(t0, 0.25); t1 = Math.min(t1, len - 0.25); if (t1 - t0 > 0.3) holes.push([t0, t1]);
      }
      holes.sort((p, q) => p[0] - q[0]);
      let t = 0;
      for (const [h0, h1] of holes) {
        if (h0 > t) s.quad(at(t, y0), at(h0, y0), at(h0, y1), at(t, y1), wallCol, hint);
        s.quad(at(h0, y0), at(h1, y0), at(h1, yw0), at(h0, yw0), wallCol, hint);
        s.quad(at(h0, yw1), at(h1, yw1), at(h1, y1), at(h0, y1), wallCol, hint);
        // reveals (jambs, sill, head) so the opening has thickness
        const o = (tt: number, y: number) => [ax + dx * (tt / len) + ix * 0.02, y, az + dz * (tt / len) + iz * 0.02];
        s.quad(at(h0, yw0), at(h1, yw0), o(h1, yw0), o(h0, yw0), trimCol, [0, 1, 0]);
        s.quad(at(h0, yw1), at(h1, yw1), o(h1, yw1), o(h0, yw1), trimCol, [0, -1, 0]);
        s.quad(at(h0, yw0), o(h0, yw0), o(h0, yw1), at(h0, yw1), trimCol, [dx, 0, dz]);
        s.quad(at(h1, yw0), o(h1, yw0), o(h1, yw1), at(h1, yw1), trimCol, [-dx, 0, -dz]);
        t = h1;
      }
      if (t < len) s.quad(at(t, y0), at(len, y0), at(len, y1), at(t, y1), wallCol, hint);
      // skirting board
      s.quad(at(0, y0), at(len, y0), at(len, y0 + 0.1), at(0, y0 + 0.1), trimCol.clone().multiplyScalar(0.8), hint);
    }
    // rooms along the long axis (rectangular footprints only); a door gap in each partition
    const nRooms = c.rect ? Math.max(1, Math.round((2 * L) / (c.house ? 4.5 : 6))) : 1, room = (2 * L) / nRooms;
    const Si = S - INSET;
    for (let k = 1; k < nRooms; k++) {
      { const u = -L + k * room, e0 = P(u, -Si + 0.3, 0), e1 = P(u, Si - 0.3, 0); if (!inside(c, e0[0], e0[2]) || !inside(c, e1[0], e1[2])) continue; }
      const u = -L + k * room, door = (rnd() - 0.5) * Math.max(Si * 2 - 2.4, 0) , dw = 0.5;
      for (const side of [-1, 1]) {
        const uu = u + side * 0.06, hint: [number, number, number] = [ux * side, 0, uz * side];
        s.quad(P(uu, -Si, y0), P(uu, door - dw, y0), P(uu, door - dw, y1), P(uu, -Si, y1), wallCol, hint);
        s.quad(P(uu, door + dw, y0), P(uu, Si, y0), P(uu, Si, y1), P(uu, door + dw, y1), wallCol, hint);
        s.quad(P(uu, door - dw, y0 + 2.1), P(uu, door + dw, y0 + 2.1), P(uu, door + dw, y1), P(uu, door - dw, y1), wallCol, hint);
      }
      s.quad(P(u - 0.06, door - dw, y0 + 2.1), P(u + 0.06, door - dw, y0 + 2.1), P(u + 0.06, door + dw, y0 + 2.1), P(u - 0.06, door + dw, y0 + 2.1), trimCol, [0, -1, 0]);
      s.quad(P(u - 0.06, door - dw, y0), P(u + 0.06, door - dw, y0), P(u + 0.06, door - dw, y0 + 2.1), P(u - 0.06, door - dw, y0 + 2.1), trimCol, [vx, 0, vz]);
      s.quad(P(u - 0.06, door + dw, y0), P(u + 0.06, door + dw, y0), P(u + 0.06, door + dw, y0 + 2.1), P(u - 0.06, door + dw, y0 + 2.1), trimCol, [-vx, 0, -vz]);
    }
    // per room: ceiling panel + furniture
    const box = (u: number, v: number, hu: number, hv: number, y: number, h: number, col: THREE.Color) => {
      const a = P(u - hu, v - hv, y), b2 = P(u + hu, v - hv, y), c2 = P(u + hu, v + hv, y), d2 = P(u - hu, v + hv, y);
      const up = (p: number[]) => [p[0], p[1] + h, p[2]];
      s.quad(up(a), up(b2), up(c2), up(d2), col, [0, 1, 0]);
      s.quad(a, b2, up(b2), up(a), col.clone().multiplyScalar(0.85), [-vx, 0, -vz]);
      s.quad(d2, c2, up(c2), up(d2), col.clone().multiplyScalar(0.85), [vx, 0, vz]);
      s.quad(a, d2, up(d2), up(a), col.clone().multiplyScalar(0.75), [-ux, 0, -uz]);
      s.quad(b2, c2, up(c2), up(b2), col.clone().multiplyScalar(0.75), [ux, 0, uz]);
    };
    const wood = new THREE.Color(0x6b4a2e), fabric = new THREE.Color().setHSL(rnd(), 0.35, 0.38), metal = new THREE.Color(0x5a5f66), panel = new THREE.Color(2.2, 2.1, 1.9);
    if (c.rect) for (let k = 0; k < nRooms; k++) {
      const mu = -L + (k + 0.5) * room, hr = room / 2 - INSET - 0.2, sv = Si - 0.2;
      if (hr < 0.8 || sv < 0.8) continue;
      // lamp panel
      const pa = P(mu - 0.5, -0.3, y1 - 0.01), pb = P(mu + 0.5, -0.3, y1 - 0.01), pc = P(mu + 0.5, 0.3, y1 - 0.01), pd = P(mu - 0.5, 0.3, y1 - 0.01);
      s.quad(pa, pb, pc, pd, panel, [0, -1, 0]);
      const kind = c.house ? (k % 3) : (k % 2 ? 3 : 4);
      const y = c.slab;
      if (kind === 0 || kind === 4) { // table + 4 chairs / desk row
        box(mu, 0, Math.min(0.9, hr * 0.5), 0.45, y + 0.7, 0.05, wood); for (const [a, bb] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) box(mu + a * Math.min(1.6, hr) * 0.7, bb, 0.03, 0.03, y, 0.7, wood);
        for (const sgn of [-1, 1]) box(mu + sgn * 0.35, sgn * 0.85, 0.22, 0.22, y, 0.45, fabric);
      }
      if (kind === 1) { box(mu, sv - 0.45, Math.min(1.1, hr * 0.8), 0.42, y, 0.42, fabric); box(mu, sv - 0.85, Math.min(1.1, hr * 0.8), 0.08, y + 0.42, 0.4, fabric); box(mu, sv - 1.6, 0.5, 0.3, y, 0.4, wood); }
      if (kind === 2) { box(mu, -sv + 1.1, Math.min(0.95, hr * 0.7), 1.0, y, 0.5, new THREE.Color(0xd9d4c8)); box(mu, -sv + 0.15, Math.min(0.95, hr * 0.7), 0.06, y, 0.95, wood); }
      if (kind === 3) { // shop: counter + shelves along the side walls
        box(mu - hr * 0.4, 0, 0.35, Math.min(1.4, sv * 0.6), y, 1.0, wood);
        for (const sgn of [-1, 1]) for (let q = -1; q <= 1; q++) box(mu + q * hr * 0.55, sgn * (sv - 0.25), Math.min(0.5, hr * 0.25), 0.22, y, 1.8, metal);
      }
      if (kind === 4 && k === 0) box(mu, sv - 0.3, Math.min(1.6, hr * 0.8), 0.3, y, 1.05, metal); // service counter near the street
    }
    if (!c.rect) { const pa = P(-0.6, -0.3, y1 - 0.01), pb = P(0.6, -0.3, y1 - 0.01), pc = P(0.6, 0.3, y1 - 0.01), pd = P(-0.6, 0.3, y1 - 0.01); s.quad(pa, pb, pc, pd, panel, [0, -1, 0]); }
    uC.value.set(ox, y1 - 0.15, oz); uU.value.set(ux, 0, uz); uL.value = c.rect ? L : 0.5; uRoom.value = c.rect ? room : 1; uN.value = c.rect ? nRooms : 1;
    const m = new THREE.Mesh(s.geometry(), mat); m.name = `interior ${c.i}`; m.frustumCulled = false; return m;
  }

  const inside = (c: Cand, x: number, z: number) => { let inR = false; const r = c.ring; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inR = !inR; } return inR; };
  function nearest(x: number, z: number) {
    let best: Cand | null = null, bd = NEAR;
    for (const c of cands) { const d = Math.hypot(c.cx - x, c.cz - z) - c.r; if (d < bd) { const di = inside(c, x, z) ? -1 : d; if (di < bd) { bd = di; best = c; } } }
    return best;
  }
  // A6: keep the last few built interiors (LRU) so flying back and forth doesn't rebuild them; uniforms re-applied on show.
  const cache = new Map<Cand, { m: THREE.Mesh; u: [THREE.Vector3, THREE.Vector3, number, number, number] }>();
  function show(c: Cand | null) {
    if (c === current) return;
    if (mesh) { group.remove(mesh); if (!A6) mesh.geometry.dispose(); mesh = null; }
    current = c; if (!c) return;
    const hit = A6 ? cache.get(c) : undefined;
    if (hit) { cache.delete(c); cache.set(c, hit); mesh = hit.m; uC.value.copy(hit.u[0]); uU.value.copy(hit.u[1]); uL.value = hit.u[2]; uRoom.value = hit.u[3]; uN.value = hit.u[4]; }
    else {
      { const t0 = performance.now(); mesh = build(c); diag.event('interior build', performance.now() - t0); }
      if (A6) { cache.set(c, { m: mesh, u: [uC.value.clone(), uU.value.clone(), uL.value, uRoom.value, uN.value] });
        if (cache.size > 4) { const [k, v] = cache.entries().next().value!; cache.delete(k); v.m.geometry.dispose(); } }
    }
    group.add(mesh);
  }
  const lastCam = new THREE.Vector3(1e9, 0, 0);
  // A6/Safari: one hidden pre-built interior so prewarm compiles its pipeline at load (walking into the first
  // building otherwise compiled a new pipeline mid-walk). Hidden; prewarm shows it only during compileAsync.
  const warm = A6 && cands.length ? build(cands[0]) : null;
  if (warm) { warm.visible = false; group.add(warm); }
  return {
    group, count: cands.length,
    get current() { return current ? current.i : -1; },
    /** Floor height when (x, z) is inside the loaded interior, else null (walk mode stands on the slab). */
    floorAt(x: number, z: number) { return current && inside(current, x, z) ? current.slab : null; },
    update(cam: THREE.Vector3, groundY: number, dt: number) {
      timer -= dt; if (timer > 0) return;
      const speed = lastCam.x < 1e8 ? Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) / (0.25 - timer) : 0; lastCam.copy(cam); timer = 0.25;
      if (cam.y - groundY > 25) { show(null); return; }
      const n = nearest(cam.x, cam.z);
      // A6: building one is a few ms of CPU + an upload; skip while flying fast past, and wait for a frame with budget room.
      if (A6 && n && n !== current && !cache.has(n)) { if (speed > 25) return; if (budget.left() < 2) { timer = 0; return; } }
      // hysteresis: keep the loaded one unless we stepped inside another or walked away from it
      if (current && n !== current && !(n && inside(n, cam.x, cam.z)) && Math.hypot(current.cx - cam.x, current.cz - cam.z) - current.r < NEAR) return;
      show(n);
    },
    /** A street-side standing spot just outside a good candidate near (x, z), looking in through the front (tests + view). */
    entry(x = 0, z = 0) {
      let best: Cand | null = null, bd = Infinity;
      for (const c of cands) { if (!c.rect || c.house || c.ring.length > 5) continue; const b = list[c.i], L = b.o[3] / 20, S = b.o[4] / 20; if (L < 6 || S < 4 || L > 25) continue; const d = Math.hypot(c.cx - x, c.cz - z); if (d < bd) { bd = d; best = c; } }
      if (!best) return null;
      const b = list[best.i], a = b.o[2] / 1000, S = b.o[4] / 20, vx = -Math.sin(a), vz = Math.cos(a);
      const ox = b.o[0] / 10, oz = b.o[1] / 10;
      return { i: best.i, out: [ox + vx * (S + 7), best.slab, oz + vz * (S + 7)] as [number, number, number], in: [ox + vx * (S * 0.55), best.slab, oz + vz * (S * 0.55)] as [number, number, number], look: [ox - vx * S, best.slab + 1.5, oz - vz * S] as [number, number, number], show: () => show(best) };
    },
    dispose() { show(null); warm?.geometry.dispose(); for (const v of cache.values()) v.m.geometry.dispose(); cache.clear(); mat.dispose(); },
  };
}

function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
