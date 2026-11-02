// Tree cost profile on the real GPU: Playwright WebKit, headless:false (never trust headless fps).
//   npx vite preview --port 5199 --strictPort   (or any server on that port, serving a build with window.__renderer)
//   PLAYWRIGHT_BROWSERS_PATH=~/builds/.pw-browsers node tools/perf/trees-profile.mjs [port=5199] [out=tools/perf/out/trees-before.json] [area,area,..]
// Per area: tree instances, draw calls / triangles with trees on and off at a ground view and an aerial view, GPU/geometry
// memory estimate (buffers we hand to the GPU + tree textures), JS heap (WebKit has no performance.memory, so the host-side
// typed arrays are counted instead), and fps with trees on vs off: real rAF fps (vsync capped at 60 on this Mac) and an
// uncapped number (N renders back to back, then wait for the GPU) which is the one that shows the tree cost.
import fs from 'node:fs';
import os from 'node:os';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= `${os.homedir()}/builds/.pw-browsers`;
const { webkit } = await import('@playwright/test');
const [port = '5199', OUT = 'tools/perf/out/trees-before.json', only = ''] = process.argv.slice(2);
const AREAS = (only ? only.split(',') : ['keywest', 'bayshore', 'sandyhook', 'newark', 'passaic']);
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true });

const b = await webkit.launch({ headless: false });
const result = { when: new Date().toISOString(), note: 'WebKit headless:false, real GPU; fpsCapped = rAF over 2.5 s, fpsUncapped = median of 5 x (40 back-to-back renders + GPU wait)', areas: {} };
const errors = [];
for (const area of AREAS) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errors.push(`[${area}] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`[${area}] ${m.text()}`));
  await p.goto(`http://localhost:${port}/?area=${area}&mode=free&join=0`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
  await p.addStyleTag({ content: '.hud,#hud,#areas,#robothud{display:none!important}' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const R = window.__renderer, S = window.__scene, C = window.__cityCam;
    const treeMeshes = []; S.traverse((o) => { if (o.isMesh && o.name?.startsWith('trees ')) treeMeshes.push(o); });
    const groups = [...new Set(treeMeshes.map((m) => m.parent))];
    const setTrees = (on) => groups.forEach((g) => (g.visible = on));
    const sp = window.__ground(0, 0).spawn; // street start (public landmark area)
    const pin = (pos, look) => { window.__lockCam = { pos, look }; if (!window.__pin) { window.__pin = true; const tick = () => { const L = window.__lockCam; C.position.set(...L.pos); C.lookAt(...L.look); requestAnimationFrame(tick); }; tick(); } };
    const nextFrames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const sync = async () => { const be = R.backend; if (be.isWebGPUBackend) await be.device.queue.onSubmittedWorkDone(); else be.gl.finish(); };
    const sample = async () => {
      await nextFrames(8);
      const i = R.info.render; const calls = i.drawCalls ?? i.calls, tris = i.triangles;
      let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = (t) => { n++; if (t - t0 < 2500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const fpsCapped = (n * 1000) / (performance.now() - t0);
      const runs = []; for (let rep = 0; rep < 5; rep++) { await sync(); const N = 40, t1 = performance.now(); for (let k = 0; k < N; k++) R.render(S, C); await sync(); runs.push((performance.now() - t1) / N); }
      const ms = runs.sort((x, y) => x - y)[2]; // median of 5 (the machine is shared; single runs jump)
      return { calls, tris, fpsCapped: +fpsCapped.toFixed(1), msUncapped: +ms.toFixed(2), fpsUncapped: +(1000 / ms).toFixed(1) };
    };
    // ---- memory estimate for everything the tree meshes hand to the GPU
    const seen = new Set(); let geoBytes = 0, instBytes = 0, texBytes = 0, triPerLod = {}, instances = 0, drawnInstances = 0, meshesWithInstances = 0;
    const texSeen = new Set();
    const scanTex = (node, depth = 0, vis = new Set()) => {
      if (!node || typeof node !== 'object' || vis.has(node) || depth > 14) return; vis.add(node);
      if (node.isTexture && !texSeen.has(node)) { texSeen.add(node); const im = node.image; const w = im?.width || im?.naturalWidth || 0, h = im?.height || im?.naturalHeight || 0; texBytes += w * h * 4 * 1.34; return; }
      for (const k of ['value', 'colorNode', 'opacityNode', 'positionNode', 'aNode', 'bNode', 'cNode', 'node', 'uvNode', 'textureNode', 'map']) if (node[k]) scanTex(node[k], depth + 1, vis);
      if (node.inputNodes) for (const v of Object.values(node.inputNodes)) scanTex(v, depth + 1, vis);
    };
    const mats = new Set();
    for (const m of treeMeshes) {
      const g = m.geometry;
      for (const a of Object.values(g.attributes)) { const arr = a.array; if (!seen.has(arr)) { seen.add(arr); (a.isInstancedBufferAttribute ? (instBytes += arr.byteLength) : (geoBytes += arr.byteLength)); } }
      if (g.index && !seen.has(g.index.array)) { seen.add(g.index.array); geoBytes += g.index.array.byteLength; }
      for (const a of [m.instanceMatrix, m.instanceColor]) if (a && !seen.has(a.array)) { seen.add(a.array); instBytes += a.array.byteLength; }
      const tri = (g.index?.count ?? g.attributes.position.count) / 3; triPerLod[m.name] = (triPerLod[m.name] ?? 0) + tri;
      instances += m.instanceMatrix.count; drawnInstances += m.count; if (m.count > 0) meshesWithInstances++;
      mats.add(m.material);
    }
    mats.forEach((mt) => scanTex(mt));
    const stats = window.__stats();
    const out = { treesInBake: stats.trees, palms: stats.palms, treeMeshes: treeMeshes.length, treeMeshesDrawing: meshesWithInstances, instanceSlots: instances, instancesDrawn: drawnInstances,
      geoKB: +(geoBytes / 1024).toFixed(0), instanceKB: +(instBytes / 1024).toFixed(0), textureKB: +(texBytes / 1024).toFixed(0), gpuTreeMB: +((geoBytes + instBytes + texBytes) / 1048576).toFixed(2), trisPerLod: triPerLod };
    // host-side typed arrays kept by the tree closure (mats, cols, xz, order): 21 floats + a few ints per tree
    out.hostArraysMB = +((stats.trees * (16 + 3 + 2) * 4 + stats.trees * 5) / 1048576).toFixed(2);
    out.rendererMemory = { ...R.info.memory };
    out.heapPerformanceMemory = performance.memory ? performance.memory.usedJSHeapSize : null;
    out.views = {};
    const views = { ground: [[sp.x, window.__ground(sp.x, sp.z).floor.y + 1.7, sp.z], [sp.x + Math.sin(sp.heading) * 100, window.__ground(sp.x, sp.z).floor.y + 6, sp.z + Math.cos(sp.heading) * 100]],
      aerial: [[sp.x + 500, 330, sp.z + 700], [sp.x - 100, 0, sp.z - 200]] };
    for (const [name, [pos, look]] of Object.entries(views)) {
      pin(pos, look); await nextFrames(20);
      setTrees(true); const on = await sample();
      setTrees(false); const off = await sample(); setTrees(true);
      out.views[name] = { on, off, treeCalls: on.calls - off.calls, treeTris: on.tris - off.tris, treeMsUncapped: +(on.msUncapped - off.msUncapped).toFixed(2) };
    }
    return out;
  });
  result.areas[area] = r;
  console.log(area, JSON.stringify({ trees: r.treesInBake, gpuTreeMB: r.gpuTreeMB, ground: r.views.ground, aerial: r.views.aerial }));
  await p.close();
}
result.consoleErrors = errors;
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('errors', errors.length, errors.slice(0, 6)); await b.close();
