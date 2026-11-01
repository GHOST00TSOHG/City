import type { RobotType } from './types';

/**
 * Per-type robot SFX. Files: public/audio/robots/<type>/<type>_<slot>.{ogg,m4a}; docs/AUDIO-SLOTS.md lists every slot with its exact trigger timing.
 * One master gain; every clip plays at 1.0 (levels are mastered in the files). Robots are SILENT standing still (no idle loop).
 * Only slots listed in public/audio/robots/manifest.json (tools/audio-manifest.mjs) are ever fetched, so a slot whose file Echo has not
 * delivered yet is simply silent: no request, no 404, no console error. Looping slots: thruster_burn_loop, roll_loop, thrust_hum, cloud_loop.
 * Lazy: nothing is fetched until the first user gesture unlocks audio.
 */
const EXT = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
const STEPS = ['footstep_01', 'footstep_02', 'footstep_03'];
const LOOPS = new Set(['thruster_burn_loop', 'roll_loop', 'thrust_hum', 'cloud_loop', 'tread_growl', 'tread_clatter']);
/** Every slot name the game can play (documentation + preload list). */
export const SLOTS = ['footstep_01', 'footstep_02', 'footstep_03', 'power_up', 'boost', 'hit', 'land_light', 'land_heavy', 'transform', 'unfold', 'thruster_ignite', 'thruster_burn_loop', 'thruster_cutoff',
  'roll_loop', 'tread_transform', 'tread_unfold', 'tread_growl', 'tread_clatter', 'land_hiss', 'thrust_hum', 'thrust_crackle', 'dissolve', 'cloud_loop', 'reform', 'special_groundpound', 'special_blinkdash'] as const;
/** The landing strength (0..1) at or above which the _heavy variant plays. */
export const LAND_HEAVY_AT = 0.5;

export function createRobotAudio(base = `${import.meta.env.BASE_URL}audio/robots/`) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, type: RobotType | null = null, rr = 0, volume = 1, crackT = 0;
  let have: Record<string, string[]> | null = null; const haveP = fetch(`${base}manifest.json`).then((r) => (r.ok ? r.json() : {})).then((j) => (have = j)).catch(() => (have = {}));
  const bufs = new Map<string, Promise<AudioBuffer | null>>();
  const loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>(), loopBusy = new Set<string>();
  const exists = (t: RobotType, n: string) => !!have?.[t]?.includes(n);
  const load = (t: RobotType, n: string) => {
    const k = `${t}/${n}`;
    if (!exists(t, n)) return Promise.resolve(null); // missing slot: silent, never fetched
    if (!bufs.has(k)) bufs.set(k, fetch(`${base}${t}/${t}_${n}.${EXT}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((a) => ctx!.decodeAudioData(a)).catch(() => null));
    return bufs.get(k)!;
  };
  const play = async (n: string, opts: { loop?: boolean; gain?: GainNode; rate?: number } = {}) => {
    if (!ctx || !master || !type) return null;
    const t = type, b = await load(t, n); if (!b || t !== type) return null;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = !!opts.loop && LOOPS.has(n); if (opts.rate) s.playbackRate.value = opts.rate; s.connect(opts.gain ?? master); s.start(); return s;
  };
  /** Start / retarget / stop a looping slot (gain 0..1, optional playback rate); stops cleanly when level <= 0.02. */
  const loop = (n: string, level: number, rate = 1) => {
    if (!ctx || !master || !type) return;
    const L = loops.get(n);
    if (level > 0.02 && !L && !loopBusy.has(n) && exists(type, n)) { loopBusy.add(n); const g = ctx.createGain(); g.gain.value = level; g.connect(master); void play(n, { loop: true, gain: g, rate }).then((src) => { loopBusy.delete(n); if (src) loops.set(n, { src, gain: g }); else g.disconnect(); }); }
    else if (L) { if (level <= 0.02) { L.src.stop(); L.gain.disconnect(); loops.delete(n); } else { L.gain.gain.value = level; L.src.playbackRate.value = rate; } }
  };
  const stopLoops = () => { for (const [, L] of loops) { L.src.stop(); L.gain.disconnect(); } loops.clear(); };
  const unlock = () => { if (ctx) { void ctx.resume(); return; } ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination); };
  addEventListener('pointerdown', unlock, { once: false, passive: true }); addEventListener('keydown', unlock, { passive: true });
  let thrOn = false, rollAt = 0;
  return {
    setType(t: RobotType) { if (t === type) return; stopLoops(); type = t; thrOn = false; if (ctx) void haveP.then(() => { for (const n of [...STEPS, 'boost', 'hit', 'power_up', 'land_light', 'land_heavy']) void load(t, n); }); },
    set volume(v: number) { volume = v; if (master) master.gain.value = v; },
    step() { void play(STEPS[rr++ % 3]); },
    /** Big surge + roar on the super-fast rocket kick (BURST start). */
    boost() { void play('boost'); },
    hit() { void play('hit'); },
    /** One-shot when the robot spawns or is selected / activated in the garage. */
    powerUp() { void haveP.then(() => play('power_up')); },
    /** Landing by strength 0..1: _light below LAND_HEAVY_AT, _heavy at or above it. */
    land(strength: number) { void play(strength >= LAND_HEAVY_AT ? 'land_heavy' : 'land_light'); },
    /** Transformation: 'fold' start (the clip carries the clunks and the lock), 'unfold' start. */
    transform(phase: 'fold' | 'unfold') { const w = type === 'worker'; void play(phase === 'fold' ? (w ? 'tread_transform' : 'transform') : w ? 'tread_unfold' : 'unfold'); },
    /** Worker tread mode (treads out and locked): diesel growl (pitch follows speed) + track clatter (rate follows speed). speed01 = ground speed / run speed. */
    tread(on: boolean, speed01: number) { const v = Math.min(1.2, speed01); loop('tread_growl', on ? Math.min(1, 0.35 + 0.65 * v) : 0, 0.75 + 0.5 * v); loop('tread_clatter', on ? Math.min(1, 0.3 + 0.7 * v) : 0, 0.6 + 0.9 * v); },
    /** Thrusters (flying only): ignite one-shot when the rockets light, burn loop follows the throttle, cutoff one-shot when they stop. Glitch: hum + crackle instead. */
    thrusters(flying: boolean, level: number, dt: number) {
      if (!type) return;
      if (flying && !thrOn) { thrOn = true; if (type !== 'glitch') void play('thruster_ignite'); } else if (!flying && thrOn) { thrOn = false; if (type !== 'glitch') void play('thruster_cutoff'); }
      if (type === 'glitch') { loop('thrust_hum', flying ? Math.max(0.15, level) : 0); if (flying && level > 0.05) { crackT -= dt; if (crackT < 0) { crackT = 0.15 + Math.random() * 0.4; void play('thrust_crackle'); } } }
      else loop('thruster_burn_loop', flying ? 0.3 + 0.7 * level : 0);
    },
    /** Heavy: rolling loop while the ball moves, pitch follows speed (speed01 = ground speed / run speed; ~0.8..1.2 playback rate). */
    roll(on: boolean, speed01: number) { loop('roll_loop', on ? Math.min(1, 0.3 + speed01) : 0, 0.8 + 0.4 * Math.min(1.2, speed01)); rollAt = on ? 1 : 0; },
    /** Worker: hydraulic steam hiss on the four-limb landing. */
    steam() { void play('land_hiss'); },
    /** Glitch voxel states: 'dissolve' when the cloud starts, 'reform' when it re-forms solid; cloud_loop while it runs as a cloud. */
    glitch(phase: 'dissolve' | 'reform') { void play(phase); },
    cloud(on: boolean) { loop('cloud_loop', on ? 0.7 : 0); },
    special(kind: string) { if (kind !== 'none') void play(`special_${kind}`); },
    get rolling() { return rollAt > 0; },
  };
}
