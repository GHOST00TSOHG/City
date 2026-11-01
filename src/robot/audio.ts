import type { RobotType } from './types';

/**
 * Robot SFX, Echo's v3 set (docs/audio-robots-v3/README.md): public/audio/robots/<type>/<type>-<slot>.{ogg,m4a}. docs/AUDIO-SLOTS.md lists every
 * slot with its trigger time in seconds and 60 fps frames. Rules implemented here:
 *  - robots are silent standing still (no idle sound);
 *  - every LOOP is played from the .ogg (sample-seamless 4.00 s); one-shots use .ogg and fall back to .m4a only when the ogg cannot be decoded;
 *  - only slots listed in public/audio/robots/manifest.json (tools/audio-manifest.mjs) are fetched: a missing file is silent, never a 404 or console error;
 *  - flyby-mono is spatialised with a PannerNode (HRTF) driven by the robot position and the camera as listener.
 * Lazy: nothing is fetched until the first user gesture unlocks audio.
 */
const LOOPS = new Set(['moto-engine', 'thrust-burn', 'thrust-hum', 'hover-sprint', 'roll', 'tread-growl', 'tread-clatter', 'water-skim']);
const LAND: Record<RobotType, string> = { heavy: 'land-slam', scout: 'land-knee', worker: 'land-hiss', glitch: 'land-reform' };
/** The landing strength (0..1) at or above which the _heavy variant plays (below: _light). */
export const LAND_HEAVY_AT = 0.5;
/** Timings from the files (README): transform 0.8 s with its lock snap at 0.75 s (the fold clip is started 0.05 s late so the snap lands on the game's lock at 0.80 s), takeoff-charge 1.5 s, thrust-ignite 1.3 s, burn loop enters 0.95 s into the ignite with a 0.3 s fade-in, cutoff fades the burn over 0.15 s, flyby 2.6 s with the closest approach at 1.3 s. */
/** Glitch teleport snaps: at most this many overlapping voices (a new snap is dropped while 2 are still sounding). */
export const SNAP_VOICES = 2;
export const AUDIO_TIMING = { transform: 0.8, lock: 0.75, charge: 1.5, ignite: 1.3, burnDelay: 0.95, burnFade: 0.3, cutoffFade: 0.15, flyby: 2.6, flybyPeak: 1.3 } as const;
/** Heavy ball speed map (README): rate 0.8 + 0.4 x clamp((v - 16) / 9) over 16..25 m/s, gain -4 dB at 16 m/s up to 0 dB at 25 m/s. */
export const ROLL = { lo: 16, hi: 25 } as const;
const db = (x: number) => Math.pow(10, x / 20);

export function createRobotAudio(base = `${import.meta.env.BASE_URL}audio/robots/`) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, type: RobotType | null = null, volume = 1, crackT = 0;
  let have: Record<string, string[]> | null = null; const haveP = fetch(`${base}manifest.json`).then((r) => (r.ok ? r.json() : {})).then((j) => (have = j)).catch(() => (have = {}));
  const log: Record<string, number> = {}; // started sources per slot (tests)
  const bufs = new Map<string, Promise<AudioBuffer | null>>(), last = new Map<string, number>();
  const loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; t0: number; delay: number; fade: number }>(), busy = new Set<string>();
  const exists = (t: RobotType, n: string) => !!have?.[t]?.includes(n);
  const decode = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return ctx!.decodeAudioData(await r.arrayBuffer()); };
  const load = (t: RobotType, n: string) => {
    const k = `${t}/${n}`;
    if (!exists(t, n)) return Promise.resolve(null); // missing slot: silent, never fetched
    if (!bufs.has(k)) bufs.set(k, decode(`${base}${t}/${t}-${n}.ogg`).catch(() => (LOOPS.has(n) ? null : decode(`${base}${t}/${t}-${n}.m4a`).catch(() => null)))); // loops: ogg only; one-shots: m4a only if the ogg cannot be decoded
    return bufs.get(k)!;
  };
  const play = async (n: string, o: { gain?: number | GainNode; rate?: number; offset?: number; delay?: number; to?: AudioNode } = {}) => {
    if (!ctx || !master || !type) return null;
    const t = type, b = await load(t, n); if (!b || t !== type || !ctx) return null;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = LOOPS.has(n); if (o.rate) s.playbackRate.value = o.rate;
    let out: AudioNode = o.to ?? master; if (typeof o.gain === 'number' && o.gain !== 1) { const g = ctx.createGain(); g.gain.value = o.gain; g.connect(out); out = g; } else if (o.gain && typeof o.gain !== 'number') out = o.gain;
    s.connect(out); s.start(ctx.currentTime + (o.delay ?? 0), o.offset ?? 0); log[`${t}-${n}`] = (log[`${t}-${n}`] ?? 0) + 1; return s;
  };
  /** round-robin with no immediate repeat: names `<base>_01..03` */
  const pick = (b: string) => { const p = last.get(b) ?? -1; let i = Math.floor(Math.random() * 3); if (i === p) i = (i + 1 + Math.floor(Math.random() * 2)) % 3; last.set(b, i); return `${b}_0${i + 1}`; };
  /** Start / retarget a loop: gain = level x fade-in ramp (after `delay` s), playback rate. level <= 0.001 fades it out over `out` s and stops it. */
  const loop = (n: string, level: number, rate = 1, o: { delay?: number; fade?: number; out?: number } = {}) => {
    if (!ctx || !master || !type) return;
    const L = loops.get(n), now = ctx.currentTime;
    if (level > 0.001 && !L && !busy.has(n) && exists(type, n)) {
      busy.add(n); const g = ctx.createGain(); g.gain.value = 0; g.connect(master); const d = o.delay ?? 0, f = o.fade ?? 0.05;
      void play(n, { gain: g, rate }).then((src) => { busy.delete(n); if (src && ctx) loops.set(n, { src, gain: g, t0: ctx.currentTime, delay: d, fade: f }); else g.disconnect(); });
    } else if (L) {
      if (level <= 0.001) { const f = o.out ?? 0.1; L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(L.gain.gain.value, now); L.gain.gain.linearRampToValueAtTime(0, now + f); L.src.stop(now + f + 0.02); loops.delete(n); }
      else { const ramp = Math.max(0, Math.min(1, (now - L.t0 - L.delay) / L.fade)); L.gain.gain.value = level * ramp; L.src.playbackRate.value = rate; }
    }
  };
  const stopLoops = () => { for (const n of [...loops.keys()]) loop(n, 0, 1, { out: 0.05 }); };
  const unlock = () => { if (ctx) { void ctx.resume(); return; } ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); };
  addEventListener('pointerdown', unlock, { once: false, passive: true }); addEventListener('keydown', unlock, { passive: true });
  let snaps: { until: number }[] = [];
  let flying = false, fly: { panner: PannerNode; until: number } | null = null, coolSkid = 0;
  const P = (x: number, y: number, z: number, p: PannerNode) => { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; };
  return {
    setType(t: RobotType) { if (t === type) return; stopLoops(); type = t; flying = false; if (ctx) void haveP.then(() => { for (const n of ['footstep_01', 'footstep_02', 'footstep_03', 'power-up', 'boost', `${LAND[t]}_light`, `${LAND[t]}_heavy`]) void load(t, n); }); },
    set volume(v: number) { volume = v; if (master) master.gain.value = v; },
    /** Footsteps: kind 'walk' = footstep_01..03, 'run' = run-step_01..03; random, never the same file twice in a row. */
    step(kind: 'walk' | 'run' = 'walk') { void play(pick(kind === 'run' ? 'run-step' : 'footstep')); },
    /** One-shot when the robot spawns or is selected in the garage. */
    powerUp() { void haveP.then(() => play('power-up')); },
    /** Garage opened from the world / shutdown. */
    powerDown() { void play('power-down'); },
    /** Landing by strength 0..1: _light below LAND_HEAVY_AT, _heavy at or above it (heavy-land-slam, scout-land-knee, worker-land-hiss, glitch-land-reform). */
    land(strength: number) { if (type) void play(`${LAND[type]}_${strength >= LAND_HEAVY_AT ? 'heavy' : 'light'}`); },
    /** Transformation: Heavy / Scout 'transform' + 'unfold'; Worker 'tread-transform' + 'tread-unfold'. */
    transform(phase: 'fold' | 'unfold') {
      const w = type === 'worker', moto = type === 'scout' && type !== null && exists('scout', phase === 'fold' ? 'moto-transform' : 'moto-unfold'); // Scout: motorcycle mode clips when Echo has delivered them, else the generic transform / unfold
      void play(phase === 'fold' ? (moto ? 'moto-transform' : w ? 'tread-transform' : 'transform') : moto ? 'moto-unfold' : w ? 'tread-unfold' : 'unfold', { delay: phase === 'fold' ? AUDIO_TIMING.transform - AUDIO_TIMING.lock : 0 });
    },
    /** Big surge + roar on the super-fast rocket kick (BURST start), layered over the burn loop. */
    boost() { void play('boost'); },
    /** Take-off charge-up (1.5 s clip). The take-off crouch is shorter, so the clip starts that far into itself and its end meets the ignite. */
    charge(launchSeconds: number) { void play('takeoff-charge', { offset: Math.max(0, AUDIO_TIMING.charge - Math.max(0.05, launchSeconds)) }); },
    /**
     * Thrusters (flying only): rockets light -> thrust-ignite one-shot, burn loop (Glitch: thrust-hum) enters 0.95 s in with a 0.3 s fade, rate 0.9..1.15 with throttle;
     * rockets stop -> burn fades over 0.15 s + thrust-cutoff one-shot. water-skim crossfades in below 8 m over water. Glitch adds crackle accents.
     */
    thrusters(fl: boolean, level: number, dt: number, alt = 99, water = false) {
      if (!type) return;
      const burn = type === 'glitch' ? 'thrust-hum' : 'thrust-burn';
      if (fl && !flying) { flying = true; void play('thrust-ignite'); } else if (!fl && flying) { flying = false; void play('thrust-cutoff'); loop(burn, 0, 1, { out: AUDIO_TIMING.cutoffFade }); loop('water-skim', 0, 1, { out: AUDIO_TIMING.cutoffFade }); }
      if (!fl) return;
      const skim = water ? Math.max(0, Math.min(1, 1 - alt / 8)) : 0;
      loop(burn, (0.6 + 0.4 * level) * (1 - 0.6 * skim), 0.9 + 0.25 * Math.min(1, level), { delay: AUDIO_TIMING.burnDelay, fade: AUDIO_TIMING.burnFade });
      loop('water-skim', skim > 0.02 ? skim : 0, 1, { fade: 0.2, out: 0.2 });
      if (type === 'glitch' && level > 0.05) { crackT -= dt; if (crackT < 0) { crackT = 0.15 + Math.random() * 0.4; void play('thrust-crackle'); } }
    },
    /** Heavy rolling ball (loop `roll`): v = ground speed m/s. rate = 0.8 + 0.4 x clamp((v-16)/9, 0, 1); gain = -4 dB at 16 m/s rising to 0 dB at 25 m/s. null = not rolling. */
    roll(v: number | null) { if (v === null) { loop('roll', 0, 1, { out: 0.15 }); return; } const k = Math.max(0, Math.min(1, (v - ROLL.lo) / (ROLL.hi - ROLL.lo))); loop('roll', db(-4 + 4 * k), 0.8 + 0.4 * k, { fade: 0.1, out: 0.15 }); },
    /** Worker tread mode (loops `tread-growl`, `tread-clatter`): u = speed / vmax. growl rate 0.85 + 0.5 u; clatter rate 0.6 + 0.9 u; gain -12 dB (crawl) to 0 dB (vmax). null = off. */
    tread(u: number | null) {
      if (u === null) { loop('tread-growl', 0, 1, { out: 0.15 }); loop('tread-clatter', 0, 1, { out: 0.15 }); return; }
      const k = Math.max(0, Math.min(1, u)), g = db(-12 * (1 - k)); loop('tread-growl', g, 0.85 + 0.5 * k, { fade: 0.15, out: 0.15 }); loop('tread-clatter', g, 0.6 + 0.9 * k, { fade: 0.15, out: 0.15 });
    },
    /** Scout hover-sprint form / thruster slide (loop `hover-sprint`), gain follows speed. */
    hover(on: boolean, u: number) { const k = Math.min(1, u); if (type && exists(type, 'moto-engine')) { loop('moto-engine', on ? 0.5 + 0.5 * k : 0, 0.8 + 0.6 * k, { fade: 0.15, out: 0.15 }); loop('hover-sprint', 0, 1, { out: 0.15 }); } else loop('hover-sprint', on ? 0.55 + 0.45 * k : 0, 1, { fade: 0.15, out: 0.15 }); },
    stopSkid(now: number) { if (now - coolSkid > 0.8) { coolSkid = now; void play('stop-skid'); } },
    turnServo() { void play('turn-servo'); }, treadSparks() { void play('tread-turn-sparks'); }, bump() { void play('bump-clang'); }, hit() { void play('hit'); }, steamVent() { void play('steam-vent'); },
    /** crouch / stand, arm lift, any piston move (X power-up hold). */
    hydraulic(phase: 'push' | 'release') { void play(phase === 'push' ? 'hydraulic-push' : 'hydraulic-release'); },
    /** Glitch on foot (Luis's pick): `teleport-snap_01..03` while running as a cloud, `dissolve` when it starts, `reform` when he re-forms. */
    snap() { const now = ctx?.currentTime ?? 0; snaps = snaps.filter((s) => s.until > now); if (snaps.length >= SNAP_VOICES) return; const v = { until: now + 0.6 }; snaps.push(v); void play(pick('teleport-snap')).then((src) => { if (src && ctx) v.until = ctx.currentTime + (src.buffer?.duration ?? 0.5); else v.until = 0; }); }, // reserves a voice synchronously: at most SNAP_VOICES (2) overlapping
    glitch(phase: 'dissolve' | 'reform') { void play(phase); },
    /** Spatial flyby (mono file through an HRTF PannerNode; the clip peaks 1.3 s in = closest approach). Call updateSpatial every frame afterwards. */
    flyby(at: { x: number; y: number; z: number }) {
      if (!ctx || !master || !type || !exists(type, 'flyby-mono')) return; const c = ctx, p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 12; p.rolloffFactor = 1; p.connect(master); P(at.x, at.y, at.z, p); fly = { panner: p, until: c.currentTime + AUDIO_TIMING.flyby + 0.2 };
      void play('flyby-mono', { to: p });
    },
    updateSpatial(cam: { x: number; y: number; z: number }, fwd: { x: number; y: number; z: number }, src?: { x: number; y: number; z: number }) {
      if (!ctx) return; const L = ctx.listener; if (L.positionX) { L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      if (fly) { if (ctx.currentTime > fly.until) { fly.panner.disconnect(); fly = null; } else if (src) P(src.x, src.y, src.z, fly.panner); }
    },
    get log() { return log; },
    /** live loop gain / rate (tests) */
    get loopState() { return Object.fromEntries([...loops].map(([n, L]) => [n, { gain: +L.gain.gain.value.toFixed(3), rate: +L.src.playbackRate.value.toFixed(3) }])); },
    get flybyActive() { return !!fly; },
    /** Heavy ground-pound special: lands as the heavy slam. Glitch blink-dash: a teleport snap. */
    special(kind: string) { if (kind === 'groundpound') void play(`${LAND.heavy}_heavy`); else if (kind === 'blinkdash') void play(pick('teleport-snap')); },
  };
}
