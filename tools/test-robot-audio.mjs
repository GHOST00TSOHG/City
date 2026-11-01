// Robot audio wiring test: BROWSER=webkit node tools/test-robot-audio.mjs [port=5180]  (expects `npx vite --port <port>`)
// Drives each robot and checks that the right Echo v3 slots start (window.__sfx.log), loop rates / gains follow docs/AUDIO-SLOTS.md, nothing idles, no missing-file requests, 0 console errors.
import { chromium, webkit } from '@playwright/test';
const port = process.argv[2] || '5180', WK = (process.env.BROWSER || 'webkit') === 'webkit';
const b = await (WK ? webkit.launch({ headless: false }) : chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = [], reqs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); if (/audio\/robots\/.*\.(ogg|m4a)/.test(r.url())) reqs.push(r.url()); });
await p.goto(`http://localhost:${port}/?area=keywest&join=0`, { waitUntil: 'load', timeout: 240000 }); await p.waitForFunction(() => window.__city?.ready, null, { timeout: 240000 });
console.log('browser', WK ? 'WebKit' : 'Chrome', b.version());
await p.mouse.click(640, 400); await p.waitForTimeout(500); // user gesture: unlocks the AudioContext
const fail = []; const check = (ok, msg) => { console.log(ok ? 'PASS' : 'FAIL', msg); if (!ok) fail.push(msg); };
const log = () => p.evaluate(() => ({ ...window.__sfx.log })), loops = () => p.evaluate(() => window.__sfx.loopState);
const press = (c, d) => p.evaluate(([c, d]) => window.__robot.ctl.press(c, d), [c, d]); const n = (L, k) => L[k] ?? 0;
const start = async (t) => { await p.evaluate((t) => window.__robot.setType(t), t); await p.waitForFunction((t) => window.__robot.model.type === t, t, { timeout: 60000 }); await p.evaluate(() => { const r = window.__robot; r.hangar(false); r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); }); await p.waitForTimeout(2500); };
const fpsSamples = []; const fps = async () => { fpsSamples.push(await p.evaluate(() => window.__city.fps)); };
for (const t of ['scout', 'heavy', 'worker', 'glitch']) {
  await start(t); const L0 = await log();
  // walk: footsteps (walk set, no repeat within a row is enforced in code), no idle slot
  await press('KeyW', true); await p.waitForTimeout(1800); await press('KeyW', false); await p.waitForTimeout(400); const L1 = await log();
  check(['01', '02', '03'].some((i) => n(L1, `${t}-footstep_${i}`) > n(L0, `${t}-footstep_${i}`)), `${t} footsteps play while walking`);
  check(!Object.keys(L1).some((k) => /idle/.test(k)), `${t} has no idle sound`);
  // run: type specific
  await press('KeyW', true); await press('ShiftLeft', true); await p.waitForTimeout(3200); await fps(); const L2 = await log(), LP = await loops(), v = await p.evaluate(() => Math.hypot(window.__robot.ctl.vel.x, window.__robot.ctl.vel.z));
  if (t === 'scout') check(n(L2, 'scout-transform') > 0 && !!LP['hover-sprint'], `scout run: transform + hover-sprint loop ${JSON.stringify(LP)}`);
  if (t === 'heavy') { check(n(L2, 'heavy-transform') > 0 && !!LP.roll, `heavy ball: transform + roll loop ${JSON.stringify(LP)} at ${v.toFixed(1)} m/s`); check(v > 24 && Math.abs(LP.roll.rate - 1.2) < 0.02 && Math.abs(LP.roll.gain - 1) < 0.03, `heavy roll map at ${v.toFixed(1)} m/s: rate ${LP.roll?.rate} (1.2) gain ${LP.roll?.gain} (1.0)`); }
  if (t === 'worker') { check(n(L2, 'worker-tread-transform') > 0 && !!LP['tread-growl'] && !!LP['tread-clatter'], `worker tread: transform + growl + clatter ${JSON.stringify(LP)}`); const u = v / 7.5; check(Math.abs(LP['tread-growl'].rate - (0.85 + 0.5 * Math.min(1, u))) < 0.03 && Math.abs(LP['tread-clatter'].rate - (0.6 + 0.9 * Math.min(1, u))) < 0.04, `worker tread rates at ${v.toFixed(1)} m/s (u ${u.toFixed(2)}): growl ${LP['tread-growl']?.rate}, clatter ${LP['tread-clatter']?.rate}`); }
  if (t === 'glitch') check(n(L2, 'glitch-dissolve') > 0 && ['01', '02', '03'].some((i) => n(L2, `glitch-teleport-snap_${i}`) > 0) && !LP.cloud, `glitch run: dissolve + teleport snaps, no cloud loop ${JSON.stringify(L2)}`);
  if (t === 'scout' || t === 'worker') { // run-step_01..03 = jog/run plants: check with the transformation disabled (otherwise they fold away and run silently on the loops)
    await press('KeyW', false); await press('ShiftLeft', false); await p.waitForTimeout(3000);
    await p.evaluate(() => window.__robot.ctl.setGait('none')); const R0 = await log(); await press('KeyW', true); await press('ShiftLeft', true); await p.waitForTimeout(1800); const R1 = await log();
    check(['01', '02', '03'].some((i) => n(R1, `${t}-run-step_${i}`) > n(R0, `${t}-run-step_${i}`)), `${t} run-step_01..03 play at run speed`);
    await p.evaluate((g) => window.__robot.ctl.setGait(g), t === 'scout' ? 'sprint' : 'tread');
  }
  await press('KeyW', false); await press('ShiftLeft', false); await p.waitForTimeout(3200); const L3 = await log(), LQ = await loops();
  if (t === 'heavy') check(n(L3, 'heavy-unfold') > 0 && !LQ.roll, 'heavy unfold plays, roll loop stops');
  if (t === 'worker') check(n(L3, 'worker-tread-unfold') > 0 && !LQ['tread-growl'] && !LQ['tread-clatter'], 'worker tread unfold plays, loops stop');
  if (t === 'scout') check(n(L3, 'scout-unfold') > 0 && n(L3, 'scout-stop-skid') > 0 && !LQ['hover-sprint'], 'scout unfold + stop-skid, hover loop stops');
  if (t === 'glitch') check(n(L3, 'glitch-reform') > 0, 'glitch reform plays when he stops');
  // landing: heavy variant (30 m fall, strength 0.83) and light variant (short fall)
  const land = (h) => p.evaluate((h) => { const r = window.__robot; r.dropIn(h); }, h);
  const LA = { heavy: 'land-slam', scout: 'land-knee', worker: 'land-hiss', glitch: 'land-reform' }[t];
  await land(30); await p.waitForTimeout(3600); const L4 = await log(); check(n(L4, `${t}-${LA}_heavy`) > n(L3, `${t}-${LA}_heavy`), `${t} heavy landing variant after a 30 m fall`);
  await land(2.2); await p.waitForTimeout(2500); const L5 = await log(); check(n(L5, `${t}-${LA}_light`) > n(L4, `${t}-${LA}_light`), `${t} light landing variant after a short fall`);
  // flight: charge -> ignite -> burn loop (hum for glitch) -> boost -> cutoff; hum only while flying
  await p.evaluate(() => { const r = window.__robot; r.dropIn(0); for (let i = 0; i < 60; i++) r.ctl.update(1 / 30); }); await p.waitForTimeout(1200);
  const LB = await log(), burn = t === 'glitch' ? 'thrust-hum' : 'thrust-burn'; const before = await loops(); check(!before[burn], `${t} no ${burn} on the ground`);
  await press('KeyF', true); await press('KeyF', false); await p.waitForTimeout(250);
  const LC0 = await log(); check(n(LC0, `${t}-takeoff-charge`) > n(LB, `${t}-takeoff-charge`) && n(LC0, `${t}-thrust-ignite`) === n(LB, `${t}-thrust-ignite`), `${t} takeoff-charge starts with the crouch (whole 1.5 s clip), ignite not yet`);
  await p.waitForTimeout(1900); await press('Space', true); await p.waitForTimeout(2300); await press('Space', false);
  const LC = await log(), LF = await loops(); check(n(LC, `${t}-takeoff-charge`) > n(LB, `${t}-takeoff-charge`) && n(LC, `${t}-thrust-ignite`) > n(LB, `${t}-thrust-ignite`) && !!LF[burn], `${t} flight: takeoff-charge + thrust-ignite + ${burn} loop ${JSON.stringify(LF)}`);
  await press('ShiftLeft', true); await press('KeyW', true); await p.waitForTimeout(1500); const LD = await log(); check(n(LD, `${t}-boost`) > n(LC, `${t}-boost`), `${t} boost one-shot on the BURST kick`);
  if (t === 'scout') { await p.evaluate(() => { const r = window.__robot; r.sfxFly = 1; }); }
  await press('ShiftLeft', false); await press('KeyW', false); await press('KeyF', true); await press('KeyF', false); await p.waitForTimeout(700);
  await p.evaluate(() => { const r = window.__robot; r.ctl.pos.y = r.ctl.floor.y + 1; }); await p.waitForTimeout(2500); const LE = await log(), LG = await loops();
  check(n(LE, `${t}-thrust-cutoff`) > n(LD, `${t}-thrust-cutoff`) && !LG[burn], `${t} thrust-cutoff plays and ${burn} stops`);
  await fps();
}
// Glitch teleport snaps: at most 2 overlapping voices
await p.evaluate(() => window.__robot.setType('glitch')); await p.waitForFunction(() => window.__robot.model.type === 'glitch'); await p.waitForTimeout(800);
{ const b0 = await log(); const c0 = ['01', '02', '03'].reduce((a, i) => a + n(b0, `glitch-teleport-snap_${i}`), 0); await p.evaluate(() => { for (let i = 0; i < 6; i++) window.__sfx.snap(); }); await p.waitForTimeout(400);
  const b1 = await log(), c1 = ['01', '02', '03'].reduce((a, i) => a + n(b1, `glitch-teleport-snap_${i}`), 0); check(c1 - c0 <= 2 && c1 - c0 >= 1, `6 snaps in one frame start ${c1 - c0} voices (cap 2)`); }
// spatial flyby
await p.evaluate(() => { const r = window.__robot, c = r.ctl; window.__sfx.flyby({ x: c.pos.x + 20, y: c.pos.y + 5, z: c.pos.z }); }); await p.waitForTimeout(300);
check(await p.evaluate(() => window.__sfx.flybyActive), 'flyby-mono plays through a positional (HRTF) panner');
// garage: power-up on select
await p.evaluate(() => window.__robot.hangar(true)); await p.evaluate(() => window.__robot.setType('heavy')); await p.waitForTimeout(800); const LH = await log();
check(n(LH, 'heavy-power-up') > 0, 'power-up plays on spawn / garage select');
// requests: only slots listed in the manifest were fetched (a missing file never causes a request)
const man = await (await p.request.get(`http://localhost:${port}/audio/robots/manifest.json`)).json(); const bad = reqs.filter((u) => { const m = /robots\/(\w+)\/\1-(.+)\.(ogg|m4a)$/.exec(u); return !m || !man[m[1]].includes(m[2]); });
console.log(`codec: ${reqs.filter((u) => u.endsWith('.ogg')).length} .ogg requests, ${reqs.filter((u) => u.endsWith('.m4a')).length} .m4a fallback requests`);
check(bad.length === 0, `every audio request is a listed slot (${reqs.length} requests, ${bad.length} unlisted)`);
check(errs.length === 0, `console errors: ${errs.length}${errs.length ? '\n' + errs.slice(0, 8).join('\n') : ''}`);
console.log('fps samples', fpsSamples.map((f) => +f.toFixed(1)).join(' ')); await b.close(); process.exit(fail.length ? 1 : 0);
