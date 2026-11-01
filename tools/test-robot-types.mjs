// Robot types headless check: node tools/test-robot-types.mjs [port=5180]  (expects `npx vite --port <port>`)
// v1 save → v2 migration, each type in the garage then in the world (draw calls, robot tris, ground speed), type
// switch persistence across reload, zero console errors. Screenshots: /workspace/city-shots/types-final-*.png
import { chromium } from '@playwright/test';
const port = process.argv[2] || '5180', out = '/workspace/city-shots/types-final';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const ready = () => p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
const fail = []; const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) fail.push(msg); };
await p.goto(`http://localhost:${port}/?perf=1&area=keywest`, { waitUntil: 'load', timeout: 240000 });
// seed a v1 save (old part names) and no v2
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('city.save.v1', JSON.stringify({ v: 1, updatedAt: '2026-10-31T00:00:00Z', robot: { look: { shell: '#d7263d', visor: '#3df2ff', helmet: 'saiyan', arms: 'brawler' }, damage: 0.4 } })); });
await p.reload({ waitUntil: 'load', timeout: 240000 }); await ready();
const m = await p.evaluate(() => ({ v2: JSON.parse(localStorage.getItem('city.save.v2')), v1: localStorage.getItem('city.save.v1') }));
check(m.v2?.v === 2 && m.v2.robot.type === 'scout' && m.v2.robot.paint.scout.shell === '#d7263d' && m.v2.robot.slots.scout.helmet === 'crt' && m.v2.robot.damage === 0.4 && !!m.v1, `v1→v2 migration ${JSON.stringify(m.v2?.robot?.paint?.scout)} slots ${JSON.stringify(m.v2?.robot?.slots?.scout)} dmg ${m.v2?.robot?.damage}; v1 kept`);
await p.evaluate(() => window.__robot.setDamage(0));
const robotTris = () => p.evaluate(() => { let n = 0; window.__robot.model.root.traverse((o) => { if (!o.isMesh || !o.visible) return; const g = o.geometry, c = (g.index ? g.index.count : g.attributes.position.count) / 3; n += o.isInstancedMesh ? c * o.count : c; }); return n; });
const stats = {};
for (const t of (process.env.TYPES || 'scout,heavy,worker,glitch').split(',')) {
  await p.evaluate(() => window.__robot.hangar(true));
  await p.click(`#hangar .types button[data-t="${t}"]`).catch(() => p.evaluate((t) => window.__robot.setType(t), t));
  await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 });
  await p.evaluate(() => { window.__robot.hangarState.spin = 0; });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}-${t}.png`, timeout: 240000 });
  const g = await p.evaluate(() => ({ calls: window.__city.calls, pressed: document.querySelector('#hangar .types [aria-pressed="true"]')?.dataset.t, slots: document.querySelectorAll('#hangar .opts button').length }));
  const tris = await robotTris();
  check(g.pressed === t && g.slots === 18, `${t} garage: picker=${g.pressed} slot buttons=${g.slots} calls=${g.calls} robot tris=${tris}`);
  // every garage colour slot must visibly recolour the robot (material color/emissive or shader colour uniforms)
  const colRes = await p.evaluate(async () => {
    const seen = () => { const h = new Set(); window.__robot.model.root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { for (const k of ['color', 'emissive']) if (m[k]?.isColor) h.add('#' + m[k].getHexString()); for (const u of Object.values(m.uniforms || {})) if (u.value?.isColor) h.add('#' + u.value.getHexString()); for (const u of Object.values(m.userData || {})) if (u?.value?.isColor) h.add('#' + u.value.getHexString()); } }); return h; };
    const out = {};
    for (const col of document.querySelectorAll('#hangar .col')) {
      const k = col.dataset.k, cur = window.__robot.customizer.look[k];
      const sw = [...col.querySelectorAll('i[data-c]')].map((i) => i.dataset.c).filter((c) => c !== cur && !seen().has(c.toLowerCase()));
      if (!sw.length) { out[k] = 'noswatch'; continue; }
      col.querySelector(`i[data-c="${sw[0]}"]`).click(); await new Promise((r) => setTimeout(r, 300));
      out[k] = seen().has(sw[0].toLowerCase()) ? 'ok' : 'MISSING ' + sw[0];
    }
    return out;
  });
  check(Object.values(colRes).every((v) => v === 'ok'), `${t} garage colours: ${JSON.stringify(colRes)}`);
  // world: drop in, walk 2 s on the ground and measure speed
  await p.evaluate(() => window.__robot.hangar(false)); await p.waitForTimeout(500);
  const w = await p.evaluate(() => { const r = window.__robot; r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30);
    r.ctl.press('KeyW', true); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); const v = Math.hypot(r.ctl.vel.x, r.ctl.vel.z); r.ctl.press('KeyW', false);
    return { mode: r.ctl.mode, walk: +v.toFixed(2), tune: r.ctl.tuning }; });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}-${t}-world.png`, timeout: 240000 });
  const wc = await p.evaluate(() => window.__city.calls);
  stats[t] = { garageCalls: g.calls, worldCalls: wc, tris, walk: w.walk, run: w.tune.run };
  check(wc <= 150 && g.calls <= 150, `${t} world: mode=${w.mode} walk=${w.walk} m/s tune=${JSON.stringify(w.tune)} calls=${wc}`);
}
// switch back to scout restores its build; type persists across reload
await p.evaluate(() => window.__robot.hangar(true));
await p.click('#hangar .types button[data-t="heavy"]'); await p.waitForFunction(() => window.__robot.model.type === 'heavy', null, { timeout: 60000 });
await p.click('#hangar .opts[data-k="arms"] button[data-v="gatling"]'); await p.click('#hangar .col[data-k="shell"] i[data-c="#3fa34d"]');
await p.click('#hangar .types button[data-t="scout"]'); await p.waitForFunction(() => window.__robot.model.type === 'scout', null, { timeout: 60000 });
await p.click('#hangar .types button[data-t="heavy"]'); await p.waitForFunction(() => window.__robot.model.type === 'heavy', null, { timeout: 60000 });
const back = await p.evaluate(() => window.__robot.customizer.look);
check(back.arms === 'gatling' && back.shell === '#3fa34d', `heavy build restored after switching away: arms=${back.arms} shell=${back.shell}`);
await p.reload({ waitUntil: 'load', timeout: 240000 }); await ready();
const r = await p.evaluate(() => ({ type: window.__robot.model.type, arms: window.__robot.customizer.look.arms, save: JSON.parse(localStorage.getItem('city.save.v2')).robot.type }));
check(r.type === 'heavy' && r.arms === 'gatling' && r.save === 'heavy', `reload keeps type ${JSON.stringify(r)}`);
// bad / future save values fall back safely
await p.evaluate(() => localStorage.setItem('city.save.v2', JSON.stringify({ v: 2, robot: { type: 'tank', slots: { scout: { helmet: 'nope' } }, damage: 'x' } })));
await p.reload({ waitUntil: 'load', timeout: 240000 }); await ready();
const bad = await p.evaluate(() => ({ type: window.__robot.model.type, helmet: window.__robot.customizer.look.helmet }));
check(bad.type === 'scout' && bad.helmet === 'crt', `corrupt v2 sanitised ${JSON.stringify(bad)}`);
check(errs.length === 0, `console errors: ${errs.length}${errs.length ? '\n' + errs.slice(0, 10).join('\n') : ''}`);
console.log(JSON.stringify(stats));
await b.close(); process.exit(fail.length ? 1 : 0);
