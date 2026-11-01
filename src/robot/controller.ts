import * as THREE from 'three/webgpu';
import { A6 } from '../perf/frame';
import type { RobotModel, RobotAnim, LandKind } from './model';

export type RobotMode = 'GROUND' | 'ROCKETS' | 'SKYDIVING' | 'ROLL' | 'LAND';
const BODY_H = 1.45; // robot height for deck-underside collision (m)
export interface World { floorAt(x: number, z: number, y: number): { y: number; water: boolean; roof: boolean }; blocked(x: number, z: number, y: number): boolean; ceilingAt(x: number, z: number, y: number): number }

/** Worker tread-mode thresholds (ground speed, m/s): treads deploy above TREAD_ON while running, retract below TREAD_OFF (hysteresis band 1.4 m/s). */
const TREAD_ON = 5.0, TREAD_OFF = 3.6;
/** Heavy's closed ball rolls up to this speed (m/s); Echo's roll loop is mapped over 16..25 m/s (docs/AUDIO-SLOTS.md). */
export const BALL_TOP = 25;
const G = 22, BASE = { walk: 3.4, run: 7.5, cruise: 90, burst: 140, jump: 7.2, turn: 1, accel: 1 }; // m/s; 90 m/s ≈ 200 mph
/** Live movement constants; `setTuning` scales them per robot type (types.ts TYPES[type].tune). */
let WALK = BASE.walk, RUN = BASE.run, CRUISE = BASE.cruise, BURST = BASE.burst, JUMP = BASE.jump, TURN = 1, ACCEL = 1;
export const MPH = 2.23694;

/**
 * Player robot: walk/run/jump on the ground, rocket flight with auto-hover, skydive, landing (knee bend or tumbling roll),
 * plus a chase camera that pulls back with a wider FOV at speed. Input via the shared key set; mouse drag orbits the camera.
 */
export function createRobotController(model: RobotModel, camera: THREE.PerspectiveCamera, dom: HTMLElement, world: World) {
  const keys = new Set<string>();
  const pos = new THREE.Vector3(), vel = new THREE.Vector3();
  let heading = 0, mode: RobotMode = 'SKYDIVING', burst = 1, rollT = 0, landT = 0, airT = 0, phase = 0, t = 0;
  let lean = 0, bank = 0, yawRate = 0, power = 0, burstOn = 0, enabled = true, charging = false, hero = false;
  // per-type take-off: launchT = s into the crouch wind-up (-1 idle), launchDur from TYPES[t].flight.launch; flyT = s on rockets
  let launchT = -1, launchDur = 0, flyT = 0;
  let onImpact: ((p: THREE.Vector3, strength: number) => void) | null = null;
  // Z special: per-type move (ground-pound, blink-dash, ...); specialT = seconds since trigger, -1 = idle
  let specialKind = 'none', specialDur = 0.8, specialT = -1;
  let onSpecial: ((kind: string, phase: 'start' | 'hit' | 'end', p: THREE.Vector3) => void) | null = null;
  let camYaw = 0, camPitch = 0.22, camDist = 5, fov = 55, dragging = false, lx = 0, ly = 0, lastDrag = -10;
  const camPos = new THREE.Vector3(), camWant = new THREE.Vector3(), camOff = new THREE.Vector3(0, 3, -8), look = new THREE.Vector3();
  let anim: RobotAnim = 'fall', floor = { y: 0, water: false, roof: false };
  const k = (c: string) => keys.has(c);
  const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT';
  addEventListener('keydown', (e) => {
    if (!enabled || isTyping(e)) return; keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) {
      if (mode === 'GROUND') { vel.y = JUMP; mode = 'SKYDIVING'; airT = 0; anim = 'jump'; }
      else if (mode === 'SKYDIVING') mode = 'ROCKETS';
    }
    if (e.code === 'KeyF' && !e.repeat) { if (mode === 'ROCKETS') mode = 'SKYDIVING'; else if (mode === 'SKYDIVING') mode = 'ROCKETS'; else if (mode === 'GROUND' && launchT < 0) { if (launchDur > 0) { launchT = 0; onLaunch?.(launchDur); } else { vel.y = 9; mode = 'ROCKETS'; } } }
    if (e.code === 'KeyZ' && !e.repeat && specialT < 0 && (mode === 'GROUND' || specialKind === 'blinkdash')) { specialT = 0; onSpecial?.(specialKind, 'start', pos); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  dom.addEventListener('pointerdown', (e) => { if (!enabled) return; dragging = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('pointerup', () => (dragging = false));
  dom.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    const dx = document.pointerLockElement === dom ? e.movementX : dragging ? e.clientX - lx : 0, dy = document.pointerLockElement === dom ? e.movementY : dragging ? e.clientY - ly : 0;
    lx = e.clientX; ly = e.clientY; if (!dx && !dy) return;
    camYaw -= dx * 0.004; camPitch = Math.max(-0.35, Math.min(1.3, camPitch + dy * 0.003)); lastDrag = t;
  });
  dom.addEventListener('wheel', (e) => { if (enabled) camDist = Math.max(2.5, Math.min(30, camDist * Math.exp(e.deltaY * 0.001))); }, { passive: true });

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion(), qLean = new THREE.Quaternion(), qBank = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
  // ---- per-type run style + landing (types.ts TYPES[t].run / .land)
  let gaitKind: 'none' | 'ball' | 'sprint' | 'tread' | 'cloud' = 'none', landKind: LandKind = 'none';
  let ballT = 0, ballAng = 0, cloudW = 0, treadOn = false, slideT = -1, slideW = 0, prevVh = 0, vox = 0, landPuff = 0, landDur = 0.5, landS = 0, landActive: LandKind = 'none', scrapeAcc = 0;
  let onLandFx: ((kind: LandKind, p: THREE.Vector3, s: number) => void) | null = null;
  let onBall: ((phase: 'fold' | 'closed' | 'unfold' | 'open') => void) | null = null;
  let onLaunch: ((dur: number) => void) | null = null, onBump: (() => void) | null = null, onSlide: (() => void) | null = null;
  let onScrape: ((p: THREE.Vector3, v: THREE.Vector3, k: number) => void) | null = null;
  const qBall = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1), camF = new THREE.Vector3();
  const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  function touchDown() {
    const impact = -vel.y, vh = Math.hypot(vel.x, vel.z), s = Math.max(0, Math.min(1, (impact - 6) / 34)); // fall speed -> 0..1
    const typed = landKind !== 'none' && (hero || (impact > 6 && vh <= 16));
    if (typed) { // per-type landing (Heavy slam, Scout one-knee, Worker quad, Glitch voxel reform): length and depth scale with the fall
      const S = hero ? 1 : Math.max(0.25, s); mode = 'LAND'; landT = 0; landActive = landKind; landS = S; landDur = (landKind === 'slam' ? 0.75 : landKind === 'knee' ? 0.85 : landKind === 'quad' ? 0.8 : 0.7) + 0.55 * S; anim = 'land';
      hero = false; vel.set(0, 0, 0); pos.y = floor.y; onLandFx?.(landKind, pos, S); if (landKind === 'knee') landPuff = 1; return;
    }
    if (impact > 6) onLandFx?.('none', pos, s); // plain landings still get the light / heavy landing sound
    if (hero) { hero = false; mode = 'LAND'; landT = -0.45; landActive = 'none'; anim = 'land'; const s2 = Math.min(1.4, 0.6 + -vel.y / 60); vel.set(0, 0, 0); pos.y = floor.y; onImpact?.(pos, s2); return; } // superhero landing
    if (-vel.y > 18) onImpact?.(pos, Math.min(0.8, -vel.y / 60));
    if (vh > 16 || impact > 24) { mode = 'ROLL'; rollT = 0; anim = 'roll'; } // tumbling forward roll at speed (reference 0:32)
    else { mode = 'LAND'; landT = 0; landActive = 'none'; anim = 'land'; vel.x *= 0.3; vel.z *= 0.3; } // knee bend (0:42)
    vel.y = 0; pos.y = floor.y;
  }

  const STEP = 1 / 120, pPos = new THREE.Vector3(), ipos = new THREE.Vector3();
  let acc = 0, pHead = 0, pLean = 0, pBank = 0;
  const api = {
    /** Per-type movement multipliers (1 = the original tuning). */
    setTuning(m: Partial<typeof BASE>) { WALK = BASE.walk * (m.walk ?? 1); RUN = BASE.run * (m.run ?? 1); CRUISE = BASE.cruise * (m.cruise ?? 1); BURST = BASE.burst * (m.burst ?? 1); JUMP = BASE.jump * (m.jump ?? 1); TURN = m.turn ?? 1; ACCEL = m.accel ?? 1; },
    get tuning() { return { walk: WALK, run: RUN, cruise: CRUISE, burst: BURST, jump: JUMP, turn: TURN, accel: ACCEL }; },
    get pos() { return pos; }, get vel() { return vel; }, get mode() { return mode; }, get burst() { return burst; }, get heading() { return heading; },
    get thrust() { return Math.max(power, landPuff * 0.7, slideW * 0.55, gaitKind === 'sprint' ? ballT * 0.5 : 0); },
    setGait(k: typeof gaitKind) { gaitKind = k; }, setLand(k: LandKind) { landKind = k; },
    set onLandFx(f: typeof onLandFx) { onLandFx = f; }, set onScrape(f: typeof onScrape) { onScrape = f; }, set onBall(f: typeof onBall) { onBall = f; }, set onLaunch(f: typeof onLaunch) { onLaunch = f; }, set onBump(f: typeof onBump) { onBump = f; }, set onSlide(f: typeof onSlide) { onSlide = f; },
    /** test hook: orbit the chase camera (radians) */
    get camYaw() { return camYaw; }, set camYaw(v: number) { camYaw = v; },
    get ball() { return ballT; }, get slide() { return slideW; }, get cloud() { return cloudW; }, get form() { return ballT; }, get vox() { return vox; }, get landing() { return mode === 'LAND' ? { kind: landActive, t: landT, dur: landDur, s: landS } : null; }, get burstOn() { return burstOn; }, get floor() { return floor; }, get anim() { return anim; },
    get enabled() { return enabled; },
    setEnabled(v: boolean) { enabled = v; keys.clear(); model.root.visible = v; },
    /** Drop-in spawn: start high above (x, z) facing `h`, skydiving into the superman pose. */
    /** Hero drop: straight down fast, ends in a crouched superhero landing with an impact callback. */
    heroDrop(x: number, y: number, z: number, h = 0) { this.spawn(x, y, z, h); vel.set(0, -45, 0); hero = true; airT = 1; },
    /** Per-type Z special (types.ts motion.special / specialDur). */
    setFlight(launch: number) { launchDur = launch; launchT = -1; },
    get flyT() { return flyT; },
    setSpecial(kind: string, dur: number) { specialKind = kind; specialDur = dur; specialT = -1; },
    get special() { return specialT; }, get phase() { return phase; },
    set onSpecial(f: ((kind: string, phase: 'start' | 'hit' | 'end', p: THREE.Vector3) => void) | null) { onSpecial = f; },
    set onImpact(f: ((p: THREE.Vector3, s: number) => void) | null) { onImpact = f; },
    /** Power-up stance: hold to charge (ground: crouch in place; air: hover). Refills BURST faster. */
    set charging(v: boolean) { charging = v; }, get charging() { return charging && enabled; },
    spawn(x: number, y: number, z: number, h = 0) { hero = false; pos.set(x, y, z); vel.set(Math.sin(h) * 6, 0, Math.cos(h) * 6); heading = h; camYaw = h; mode = 'SKYDIVING'; airT = 1; anim = 'fall'; camOff.set(-Math.sin(h) * 8, 3, -Math.cos(h) * 8); pPos.copy(pos); pHead = h; acc = 0; },
    /** Test hook: set the held keys directly. */
    press(code: string, down: boolean) { if (down) { keys.add(code); dispatchEvent(new KeyboardEvent('keydown', { code })); } else keys.delete(code); },
    /** A6: physics runs at a fixed 120 Hz; the pose and camera are drawn interpolated between the last two steps. */
    update(dt0: number) {
      const fdt = Math.min(dt0, 1 / 20);
      if (!A6) { step(fdt); present(1, fdt); return; }
      acc = Math.min(acc + fdt, STEP * 8);
      while (acc >= STEP) { pPos.copy(pos); pHead = heading; pLean = lean; pBank = bank; step(STEP); acc -= STEP; }
      present(acc / STEP, fdt);
    },
  };
  function step(dt: number) {
      t += dt;
      // camera-relative input basis (ground) / heading basis (air)
      camF.set(Math.sin(camYaw), 0, Math.cos(camYaw)); // reused: no per-frame allocation (A6)
      right.crossVectors(camF, up).normalize();
      const iF = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0), iR = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      const iUp = k('Space') || k('KeyE') ? 1 : 0, iDown = k('KeyC') || k('KeyQ') || k('ControlLeft') ? 1 : 0, iBurst = k('ShiftLeft') || k('ShiftRight');
      if (launchT >= 0) { // crouch-and-launch: jets spool up on the ground, then kick off
        launchT += dt; vel.x *= Math.exp(-dt * 8); vel.z *= Math.exp(-dt * 8);
        if (mode !== 'GROUND') launchT = -1;
        else if (launchT >= launchDur) { vel.y = 9 + launchDur * 10; mode = 'ROCKETS'; launchT = -1; }
      }
      flyT = mode === 'ROCKETS' ? flyT + dt : 0;
      const spool = launchT >= 0 ? 0.25 + 0.6 * Math.min(1, launchT / launchDur) : 0;
      const kick = mode === 'ROCKETS' ? Math.max(0, 1 - flyT / 0.6) : 0; // full throttle off the pad
      const flare = mode === 'ROCKETS' && pos.y - floor.y < 3 && vel.y < -0.5 ? 0.85 : 0; // landing burn
      power += (Math.max(spool, kick, flare, mode === 'ROCKETS' ? 0.35 + 0.65 * Math.max(iUp, Math.abs(iF) * 0.8, Math.hypot(vel.x, vel.z) / CRUISE) : 0) - power) * (1 - Math.exp(-dt * 10));
      burstOn += ((mode === 'ROCKETS' && iBurst && burst > 0.02 ? 1 : 0) - burstOn) * (1 - Math.exp(-dt * 8));
      burst = Math.max(0, Math.min(1, burst + dt * (burstOn > 0.5 ? -0.22 : charging ? 0.55 : 0.1)));

      if (mode === 'GROUND' || mode === 'LAND') {
        want.set(0, 0, 0).addScaledVector(camF, iF).addScaledVector(right, iR); if (charging) want.set(0, 0, 0);
        const moving = want.lengthSq() > 0 && mode === 'GROUND';
        const sp = (gaitKind === 'ball' && iBurst && ballT >= 0.97 ? BALL_TOP : (iBurst ? RUN : WALK)) * ((gaitKind === 'ball' || gaitKind === 'sprint') && iBurst && ballT < 0.97 ? (gaitKind === 'sprint' ? 0.6 : 0.4) : 1); // slows while the armour reconfigures
        if (moving) { want.normalize(); heading += angDiff(Math.atan2(want.x, want.z), heading) * (1 - Math.exp(-dt * 12 * TURN)); want.multiplyScalar(sp); } else want.set(0, 0, 0);
        const runFrac = Math.hypot(vel.x, vel.z) / Math.max(1, RUN);
        // Scout: after a sprint, letting go of the keys starts a thruster-assisted slide (friction instead of the usual quick stop)
        if (gaitKind === 'sprint' && mode === 'GROUND') {
          if (slideT < 0 && !moving && prevVh > 0.62 * RUN) { slideT = 0; onSlide?.(); }
          if (slideT >= 0) { slideT += dt; if (moving && slideT > 0.2) slideT = -1; else if (slideT > 0.85 || Math.hypot(vel.x, vel.z) < 1.2) slideT = -1; }
        }
        if (slideT >= 0) { vel.x *= Math.exp(-dt * 2.8); vel.z *= Math.exp(-dt * 2.8); }
        else { const ac = ACCEL * (treadOn ? 0.4 : gaitKind === 'ball' && iBurst && ballT > 0.9 ? 0.35 : 1); /* a tank has momentum */ vel.x += (want.x - vel.x) * (1 - Math.exp(-dt * 10 * ac)); vel.z += (want.z - vel.z) * (1 - Math.exp(-dt * 10 * ac)); }
        vel.y = 0;
        // Glitch: running turns him into a calm cloud of floating voxels (no transformation); he re-forms solid when he stops
        cloudW += ((gaitKind === 'cloud' && mode === 'GROUND' && moving && iBurst ? 1 : 0) - cloudW) * (1 - Math.exp(-dt * (moving && iBurst ? 3.2 : 4.5)));
        // On-foot transformations (Heavy ball / Scout hover-sprint / Worker tread mode): progress ballT 0..1 over FOLD s, reverse over UNFOLD s, with staggered plate waves
        // (transform.ts) and staged bone folds (model.ts). Heavy only rolls once closed; when he stops the roll eases upright, then it unfolds. Scout stays folded through the slide.
        const formKind = gaitKind === 'ball' || gaitKind === 'sprint' || gaitKind === 'tread', FOLD = 0.8, UNF = 0.8; // all three transformations: 0.8 s (48 frames) both ways, matching Echo's transform / unfold clips
        // Worker tread mode: latched with hysteresis so it cannot flicker: on above TREAD_ON m/s while running, off below TREAD_OFF m/s (or when airborne)
        if (gaitKind === 'tread') { const v0 = Math.hypot(vel.x, vel.z); if (!treadOn && moving && iBurst && v0 > TREAD_ON) treadOn = true; else if (treadOn && (v0 < TREAD_OFF || mode !== 'GROUND')) treadOn = false; } else treadOn = false;
        const ballWant = formKind && mode === 'GROUND' && (gaitKind === 'tread' ? treadOn : ((moving && iBurst) || (gaitKind === 'sprint' && slideT >= 0))) ? 1 : 0, prevB = ballT, TWO = Math.PI * 2, snap = Math.round(ballAng / TWO) * TWO;
        if (ballWant) ballT = Math.min(1, ballT + dt / FOLD);
        else if (ballT > 0) { if (ballT < 0.999 || Math.abs(ballAng - snap) < 0.06) ballT = Math.max(0, ballT - dt / UNF); else ballAng += (snap - ballAng) * (1 - Math.exp(-dt * 9)); }
        if (gaitKind === 'ball' && ballWant && ballT >= 0.97) ballAng += Math.hypot(vel.x, vel.z) * dt / 0.95;
        if (ballT === 0) ballAng = 0; else if (!ballWant && ballT < 0.999) ballAng += (snap - ballAng) * (1 - Math.exp(-dt * 9));
        if (prevB === 0 && ballT > 0) onBall?.('fold'); else if (prevB < 1 && ballT >= 1) onBall?.('closed'); else if (prevB >= 1 && ballT < 1) onBall?.('unfold'); else if (prevB > 0 && ballT === 0) onBall?.('open');
        if (gaitKind === 'ball' && ballT >= 0.97 && Math.hypot(vel.x, vel.z) > 3) { scrapeAcc += dt; if (scrapeAcc > 0.045) { scrapeAcc = 0; onScrape?.(pos, vel, ballT); } }
        if (gaitKind === 'tread' && ballT >= 0.97 && Math.hypot(vel.x, vel.z) > 3) { scrapeAcc += dt; if (scrapeAcc > 0.04) { scrapeAcc = 0; onScrape?.(pos, vel, 0.7); } } // sparks + dust kicked up by the treads
        slideW += ((slideT >= 0 ? Math.sin(Math.min(1, slideT / 0.85) * Math.PI) * 1.4 : 0) - slideW) * (1 - Math.exp(-dt * 9)); slideW = Math.min(1, slideW);
        if (slideT >= 0 && slideW > 0.3) { scrapeAcc += dt; if (scrapeAcc > 0.06) { scrapeAcc = 0; onScrape?.(pos, vel, 0.5); } }
        landPuff *= Math.exp(-dt * 3.2);
        const vh = Math.hypot(vel.x, vel.z); prevVh = Math.max(vh, prevVh - dt * 30 * (slideT >= 0 ? 0 : 1)); if (vh < 0.5) prevVh = 0; phase += dt * vh * (vh > 5 ? 1.5 : 2.6);
        anim = mode === 'LAND' ? 'land' : vh > 5 ? 'run' : vh > 0.4 ? 'walk' : 'idle';
        if (mode === 'LAND') { landT += dt; if (landT > (landActive !== 'none' ? landDur : 0.38)) { mode = 'GROUND'; landActive = 'none'; } }
        if (charging && mode === 'GROUND') anim = 'land';
        lean += ((gaitKind === 'sprint' && anim === 'run' ? 0.2 * Math.min(1, vh / RUN) : 0) - lean) * (1 - Math.exp(-dt * 10)); bank += (0 - bank) * (1 - Math.exp(-dt * 10));
      } else if (mode === 'ROLL') {
        rollT += dt; vel.multiplyScalar(Math.exp(-dt * 2.6)); vel.y = 0; anim = 'roll';
        if (rollT > 0.95) { mode = 'GROUND'; anim = 'idle'; }
      } else if (mode === 'ROCKETS') {
        // A/D turn (bank), W/S speed along heading, Space/C climb/descend, no input = hover holds altitude.
        // Releasing a camera drag lets the heading follow the camera, so you can steer with the mouse too.
        if (t - lastDrag < 0.05 && Math.hypot(vel.x, vel.z) > 8) yawRate += (angDiff(camYaw, heading) * 4 - yawRate) * (1 - Math.exp(-dt * 40));
        else yawRate += (-iR * TURN * (1.9 - Math.min(1, Math.hypot(vel.x, vel.z) / BURST) * 0.9) - yawRate) * (1 - Math.exp(-dt * 6));
        heading += yawRate * dt; fwd.set(Math.sin(heading), 0, Math.cos(heading));
        const top = burstOn > 0.5 ? BURST : CRUISE, cur = vel.x * fwd.x + vel.z * fwd.z;
        const target = iF > 0 ? top : iF < 0 ? 0 : Math.max(0, cur - dt * 6);
        const acc = (iF > 0 ? (burstOn > 0.5 ? 70 : 28) : 40) * ACCEL;
        const ns = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), acc * dt);
        const side = vel.x * fwd.z - vel.z * fwd.x; // lateral slip decays fast so turns carve
        const sd = side * Math.exp(-dt * 4);
        vel.x = fwd.x * ns + fwd.z * sd; vel.z = fwd.z * ns - fwd.x * sd;
        const vyT = iUp ? 16 + ns * 0.12 : iDown ? -22 : 0;
        vel.y += (vyT - vel.y) * (1 - Math.exp(-dt * 3));
        const sf = Math.min(1, ns / 40);
        lean += (sf * 1.35 - lean) * (1 - Math.exp(-dt * 5)); bank += (-yawRate * Math.min(1, ns / 25) * 0.55 - bank) * (1 - Math.exp(-dt * 6));
        anim = ns > 12 ? 'fly' : 'hover';
        // auto-landing: descending near the ground, slow → set down
        if (floor.y > -Infinity && pos.y - floor.y < 0.6 && vel.y <= 0.1 && ns < 6 && !iUp) { mode = 'SKYDIVING'; }
      } else { // SKYDIVING / falling: gravity + drag, W glides forward, A/D steer
        airT += dt; heading += -iR * 1.4 * dt; fwd.set(Math.sin(heading), 0, Math.cos(heading));
        vel.y -= G * dt; const drag = 0.004 * vel.length(); vel.multiplyScalar(Math.exp(-dt * drag));
        if (iF > 0) vel.addScaledVector(fwd, 9 * dt);
        const vh = Math.hypot(vel.x, vel.z);
        if (vh > 2) { const h = Math.atan2(vel.x, vel.z); heading += angDiff(h, heading) * (1 - Math.exp(-dt * 2)); }
        const dive = airT > 0.4 ? 1 : 0; // after a short drop it snaps into the forward-leaning superman pose (reference 0:01)
        lean += ((dive ? 1.2 : 0.1) - lean) * (1 - Math.exp(-dt * 4)); bank += (iR * -0.5 - bank) * (1 - Math.exp(-dt * 4));
        if (anim !== 'jump' || airT > 0.5) anim = dive ? 'fall' : 'jump';
      }

      // integrate + collide
      const nx = pos.x + vel.x * dt, nz = pos.z + vel.z * dt, ny = pos.y + vel.y * dt;
      if ((mode === 'ROCKETS' || mode === 'SKYDIVING') && world.blocked(nx, nz, ny + 0.3) && !world.blocked(pos.x, pos.z, pos.y + 0.3)) {
        const sp = Math.hypot(vel.x, vel.z); vel.x *= -0.2; vel.z *= -0.2; onBump?.(); // bonk off the wall
        if (sp > 30) { mode = 'SKYDIVING'; airT = 0; anim = 'stumble'; }
      } else if (mode === 'GROUND' && (anim === 'run' || ballT > 0.2 || slideT >= 0) && world.blocked(nx, nz, pos.y + 0.6) && !world.blocked(pos.x, pos.z, pos.y + 0.6)) {
        // running into a wall: slide along it instead of passing through (walking still enters buildings, phase 6)
        if (!world.blocked(nx, pos.z, pos.y + 0.6)) { pos.x = nx; vel.z *= 0.2; } else if (!world.blocked(pos.x, nz, pos.y + 0.6)) { pos.z = nz; vel.x *= 0.2; } else { vel.x *= 0.1; vel.z *= 0.1; }
        if (Math.hypot(vel.x, vel.z) > 3) onBump?.(); if (ballT > 0.5 && Math.hypot(vel.x, vel.z) < 0.5 * RUN) onImpact?.(pos, 0.25);
      } else if (world.ceilingAt(nx, nz, pos.y) - Math.max(pos.y, floor.y) < BODY_H && world.ceilingAt(pos.x, pos.z, pos.y) - Math.max(pos.y, floor.y) >= BODY_H) {
        vel.x *= -0.1; vel.z *= -0.1; // too low to fit under the deck ahead: solid, like a wall
      } else { pos.x = nx; pos.z = nz; }
      pos.y = ny;
      { const ce = world.ceilingAt(pos.x, pos.z, pos.y - vel.y * dt); // bridge / overpass undersides are solid: no passing up through a deck from below
        if (pos.y + BODY_H > ce) { pos.y = Math.max(ce - BODY_H, floor.y); if (vel.y > 0) vel.y = 0; } }
      if (mode !== 'GROUND' && mode !== 'LAND') { ballT *= Math.exp(-dt * 6); cloudW *= Math.exp(-dt * 6); treadOn = false; slideW *= Math.exp(-dt * 6); slideT = -1; }
      floor = world.floorAt(pos.x, pos.z, pos.y + 0.6);
      if (mode === 'GROUND' || mode === 'LAND' || mode === 'ROLL') {
        if (pos.y - floor.y > 0.5) { mode = 'SKYDIVING'; airT = 0; anim = 'jump'; } // walked off a ledge
        else pos.y = floor.y;
      } else if (pos.y <= floor.y) {
        if (mode === 'ROCKETS' && (vel.y > -3 || iUp)) { pos.y = floor.y; vel.y = Math.max(vel.y, 0); }
        else touchDown();
      }
      pos.y = Math.min(pos.y, 3000);
  }
  function present(a: number, dt: number) {
      ipos.lerpVectors(pPos, pos, a); const iHead = pHead + angDiff(heading, pHead) * a, iLean = pLean + (lean - pLean) * a, iBank = pBank + (bank - pBank) * a;
      // pose the model
      const r = model.root; r.position.copy(ipos);
      qYaw.setFromAxisAngle(up, iHead); qLean.setFromAxisAngle(X, iLean); qBank.setFromAxisAngle(Z, iBank);
      r.quaternion.copy(qYaw).multiply(qBank).multiply(qLean);
      if (mode === 'LAND' || mode === 'ROLL') {
        if (mode === 'ROLL') { const a = Math.min(1, rollT / 0.8) * Math.PI * 2; qRoll.setFromAxisAngle(X, a); r.quaternion.copy(qYaw).multiply(qRoll); r.position.y += Math.sin(Math.min(1, rollT / 0.8) * Math.PI) * 0.35 + 0.3 * (rollT < 0.8 ? 1 : 0); }
      }
      // lean pivots around the hips so the flying body stays centred
      if (iLean > 0.01 && mode !== 'ROLL') r.position.y += Math.sin(iLean) * 0.55;
      if (ballT > 0.02) { // rolling ball: rotate about the body centre, not the feet
        qBall.setFromAxisAngle(X, ballAng); r.quaternion.copy(qYaw).multiply(qBall); const bs = Math.max(0, Math.min(1, (ballT - 0.3) / 0.7)), rc = 0.62 * bs * bs * (3 - 2 * bs); tmpV.set(0, rc, 0).applyQuaternion(r.quaternion); r.position.set(ipos.x, ipos.y + rc, ipos.z).sub(tmpV);
      }
      const hAbove = pos.y - floor.y, voxT = landKind === 'voxel' && ((mode === 'SKYDIVING' && hAbove < 1.7 && vel.y < -3) || (mode === 'LAND' && landActive === 'voxel' && landT < 0.18)) ? 1 : 0;
      vox += (voxT - vox) * (1 - Math.exp(-dt * (voxT > vox ? 16 : 6)));
      const crouch = mode === 'LAND' ? (landT < 0 ? 1 : Math.sin(Math.min(1, Math.max(0.5, landT / 0.38)) * Math.PI)) : charging && mode === 'GROUND' ? 0.55 : 0;
      if (specialT >= 0) {
        const p0 = specialT; specialT += dt;
        if (specialKind === 'groundpound') { vel.x *= 0.5; vel.z *= 0.5; if (p0 < 0.47 && specialT >= 0.47) { onSpecial?.(specialKind, 'hit', pos); onImpact?.(pos, 1.2); } }
        if (specialKind === 'blinkdash' && specialT > 0.12 && p0 < 0.3) { // ~7 m blink along the heading, stopped by walls
          const step = 40 * Math.min(dt, 0.3 - Math.max(p0, 0.12)), nx = pos.x + Math.sin(heading) * step, nz = pos.z + Math.cos(heading) * step;
          if (!world.blocked(nx, nz, pos.y + 1)) { pos.x = nx; pos.z = nz; r.position.copy(pos); }
        }
        if (specialKind === 'blinkdash' && p0 < 0.42 && specialT >= 0.42) onSpecial?.(specialKind, 'hit', pos);
        if (specialT > specialDur) { specialT = -1; onSpecial?.(specialKind, 'end', pos); }
      }
      model.animate({ anim, phase, speed: Math.min(1, vel.length() / CRUISE), lean, bank, crouch, t, special: specialT > 0 ? specialT : 0, fist: burstOn,
        launch: launchT >= 0 ? Math.min(1, launchT / Math.max(0.01, launchDur)) : 0, flyT, thrust: power,
        gs: Math.hypot(vel.x, vel.z), form: ballT, cloud: cloudW, slide: slideW, vox,
        landKind: mode === 'LAND' && landActive !== 'none' ? landActive : undefined, landT: Math.max(0, landT), landS, landDur }, dt);

      // chase camera: behind and above; pulls back with a wider FOV at speed, closer and narrower on foot
      const spd = vel.length(), sf = Math.min(1, spd / CRUISE);
      const air = mode === 'ROCKETS' || mode === 'SKYDIVING';
      if (air && t - lastDrag > 1.2 && spd > 4) { camYaw += angDiff(heading, camYaw) * (1 - Math.exp(-dt * 2.5)); camPitch += (0.18 - camPitch) * (1 - Math.exp(-dt * 1.5)); }
      const dist = camDist * (1 + sf * 0.9) + (air ? 1 : 0);
      fov += ((air ? 62 : 52) + sf * 26 + burstOn * 8 - fov) * (1 - Math.exp(-dt * 3));
      look.set(ipos.x, ipos.y + 1.0 + (air ? Math.sin(iLean) * 0.4 : 0), ipos.z);
      const cw = camWant.set(look.x - Math.sin(camYaw) * Math.cos(camPitch) * dist, look.y + Math.sin(camPitch) * dist, look.z - Math.cos(camYaw) * Math.cos(camPitch) * dist);
      // smooth the offset from the robot, not the absolute position, so the camera never lags behind at 300 mph
      cw.sub(look); camOff.lerp(cw, 1 - Math.exp(-dt * (air ? 5 : 10))); camPos.copy(look).add(camOff);
      const cf = world.floorAt(camPos.x, camPos.z, camPos.y).y; if (camPos.y < cf + 0.6) camPos.y = cf + 0.6;
      camera.position.copy(camPos); camera.lookAt(look);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  return api;
}
export type RobotController = ReturnType<typeof createRobotController>;
