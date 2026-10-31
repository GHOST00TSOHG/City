import { MPH, type RobotController } from './controller';

/** Flight panel (mode, mph, altitude, vertical speed, BURST meter), key legend and reticle with altitude. */
export function createRobotHud() {
  const el = document.createElement('div'); el.id = 'robothud';
  el.innerHTML = `<div id="flight"><div class="mode">—</div><div class="row"><b class="mph">0</b><span>mph</span></div>
<div class="row small"><span>ALT <b class="alt">0</b> ft</span><span>V/S <b class="vs">0</b> ft/s</span></div>
<div class="burst"><span>BURST</span><i><u></u></i></div></div>
<div id="reticle"><span></span><em class="ralt"></em></div>
<div id="legend">WASD move/fly · Space jump / rockets up · C down · Shift run / BURST · F rockets on/off · A/D bank · drag look · V free cam</div>`;
  document.body.appendChild(el);
  const q = (s: string) => el.querySelector(s) as HTMLElement;
  const mode = q('.mode'), mph = q('.mph'), alt = q('.alt'), vs = q('.vs'), bar = q('.burst u'), ralt = q('.ralt');
  let acc = 0;
  return {
    setVisible(v: boolean) { el.hidden = !v; },
    update(dt: number, r: RobotController) {
      acc += dt; if (acc < 0.08) return; acc = 0; // ~12 Hz text updates: cheap and readable
      const air = r.mode === 'ROCKETS' || r.mode === 'SKYDIVING';
      mode.textContent = r.mode === 'ROCKETS' ? (r.burstOn > 0.5 ? 'ROCKETS · BURST' : 'ROCKETS') : r.mode === 'SKYDIVING' ? 'SKYDIVING' : r.mode === 'ROLL' ? 'ROLL' : 'ON FOOT';
      mode.dataset.m = r.mode;
      mph.textContent = (Math.hypot(r.vel.x, r.vel.y, r.vel.z) * MPH).toFixed(0);
      const a = Math.max(0, (r.pos.y - r.floor.y) * 3.281); alt.textContent = a.toFixed(0); vs.textContent = (r.vel.y * 3.281).toFixed(0);
      bar.style.width = `${(r.burst * 100).toFixed(0)}%`; bar.classList.toggle('low', r.burst < 0.2);
      ralt.textContent = air ? `${a.toFixed(0)} ft` : '';
    },
  };
}
