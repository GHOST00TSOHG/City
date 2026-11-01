// node close-lm.mjs <port> <outdir> <lodSub> <views.json>  views: [[name,[lx,ly,lz],[tx,ty,tz],lodIndex|null,lit]] in glTF local coords
import { webkit } from '@playwright/test';
import fs from 'fs';
const [port, OUT, ID, VJ] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const views = JSON.parse(fs.readFileSync(VJ, 'utf8'));
const b = await webkit.launch({ headless: false });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:${port}/?area=newark&mode=free&join=0`, { waitUntil: 'load', timeout: 240000 });
await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
await p.addStyleTag({ content: '.hud,#hud{display:none!important}' });
await p.waitForFunction((ID) => { let f = false; window.__cityScene?.traverse((o) => { if (o.isLOD && o.name.includes(ID)) f = true; }); return f; }, ID, { timeout: 90000 }).catch(() => {});
await p.waitForTimeout(4000);
const ok = await p.evaluate((ID) => { let l = null; window.__cityScene.traverse((o) => { if (!l && o.isLOD && o.name.includes(ID)) l = o; }); window.__lm = l; return !!l; }, ID);
const stats = {};
if (ok) for (const [n, lp, lt, lodI, lit] of views) {
  await p.evaluate(([lp, lt, lodI, lit]) => {
    const L = window.__lm, c = window.__cityCam; L.updateMatrixWorld(true);
    const P = L.localToWorld(L.position.clone().set(...lp)), T = L.localToWorld(L.position.clone().set(...lt));
    c.position.copy(P); c.lookAt(T); window.__cityControls?.syncAngles?.();
    if (lodI === null) L.autoUpdate = true; else { L.autoUpdate = false; L.levels.forEach((l, i) => (l.object.visible = i === lodI)); }
    if (!window.__lit) { let src = null; window.__cityScene.traverse((o) => { if (!src && o.isHemisphereLight) src = o; }); if (!src) window.__cityScene.traverse((o) => { if (!src && o.isAmbientLight) src = o; }); if (src) { window.__lit = src.clone(); window.__lit.intensity = 3.5; window.__lit.color?.set?.(0xffffff); if (window.__lit.groundColor) window.__lit.groundColor.set(0x888888); window.__cityScene.add(window.__lit); } }
    if (window.__lit) window.__lit.visible = !!lit;
  }, [lp, lt, lodI, lit]);
  await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/${n}.png` });
  stats[n] = await p.evaluate(() => ({ fps: window.__city.fps, calls: window.__city.calls, triangles: window.__city.triangles }));
}
fs.writeFileSync(`${OUT}/close-info.json`, JSON.stringify({ ok, stats, errs }, null, 1)); await b.close();
