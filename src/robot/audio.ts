import type { RobotType } from './types';

/**
 * Per-type robot SFX (public/audio/robots/<type>/<type>_<name>.{ogg,m4a}, see LICENSES.md there).
 * One master gain; every clip plays at 1.0 (levels are mastered in the files). Only *_idle_loop loops.
 * Footsteps 01–03 are round-robin. Lazy: nothing is fetched until the first user gesture unlocks audio.
 */
const EXT = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
const STEPS = ['footstep_01', 'footstep_02', 'footstep_03'];
/**
 * Named hooks for Glitch's thruster (low hum loop + soft crackle one-shots). The files are Echo's and are NOT in the repo yet
 * (public/audio/robots/glitch/glitch_thrust_hum.{ogg,m4a}, glitch_thrust_crackle.{ogg,m4a}). The hooks are wired and silent until
 * the names are added to HAVE (so a missing file never costs a 404). Nothing is synthesised here.
 */
export const GLITCH_THRUST_HOOKS = { hum: 'glitch-thrust-hum', crackle: 'glitch-thrust-crackle' } as const;
const HOOK_FILE: Record<string, string> = { 'glitch-thrust-hum': 'thrust_hum', 'glitch-thrust-crackle': 'thrust_crackle' };
const HAVE = new Set<string>([]);
/** Other named hooks (silent until the file is added): worker-land-hiss = public/audio/robots/worker/worker_land_hiss.{ogg,m4a}. */
HOOK_FILE['worker-land-hiss'] = 'land_hiss'; // add 'glitch-thrust-hum' / 'glitch-thrust-crackle' when Echo's files land

export function createRobotAudio(base = `${import.meta.env.BASE_URL}audio/robots/`) {
  let hum: AudioBufferSourceNode | null = null, humGain: GainNode | null = null, humBusy = false, crackT = 0;
  let ctx: AudioContext | null = null, master: GainNode | null = null, type: RobotType | null = null, idle: AudioBufferSourceNode | null = null, rr = 0, volume = 1;
  const bufs = new Map<string, Promise<AudioBuffer | null>>();
  const load = (t: RobotType, n: string) => {
    const k = `${t}/${n}`;
    if (!bufs.has(k)) bufs.set(k, fetch(`${base}${t}/${t}_${n}.${EXT}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((a) => ctx!.decodeAudioData(a)).catch(() => null));
    return bufs.get(k)!;
  };
  const play = async (n: string, loop = false, g?: GainNode) => {
    if (!ctx || !master || !type) return null;
    const t = type, b = await load(t, n); if (!b || t !== type) return null;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = loop && (n.endsWith('idle_loop') || n === 'thrust_hum'); s.connect(g ?? master); s.start(); return s;
  };
  const startIdle = async () => { idle?.stop(); idle = null; idle = await play('idle_loop', true); };
  const unlock = () => {
    if (ctx) { void ctx.resume(); return; }
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    if (type) void startIdle();
  };
  addEventListener('pointerdown', unlock, { once: false, passive: true }); addEventListener('keydown', unlock, { passive: true });
  return {
    setType(t: RobotType) { if (t === type) return; type = t; if (ctx) { for (const n of [...STEPS, 'boost', 'hit']) void load(t, n); void startIdle(); } },
    set volume(v: number) { volume = v; if (master) master.gain.value = v; },
    step() { void play(STEPS[rr++ % 3]); },
    boost() { void play('boost'); },
    hit() { void play('hit'); },
    /** Glitch thruster level 0..1: hum loop follows it, crackle one-shots while it is on. No-ops until the files exist (HAVE). */
    glitchThrust(level: number, dt = 0) {
      if (!ctx || !master || type !== 'glitch') return;
      if (HAVE.has('glitch-thrust-hum')) {
        if (level > 0.05 && !hum && !humBusy) { humBusy = true; humGain = ctx.createGain(); humGain.connect(master); void play(HOOK_FILE['glitch-thrust-hum'], true, humGain).then((s) => { hum = s; humBusy = false; }); }
        if (humGain) humGain.gain.value = level;
        if (level <= 0.05 && hum) { hum.stop(); hum = null; humGain = null; }
      }
      if (HAVE.has('glitch-thrust-crackle') && level > 0.05) { crackT -= dt; if (crackT < 0) { crackT = 0.15 + Math.random() * 0.4; void play(HOOK_FILE['glitch-thrust-crackle']); } }
    },
    /** Play a named hook if Echo's file exists (see HAVE); otherwise no-op (no 404). */
    hook(name: string) { if (HAVE.has(name) && HOOK_FILE[name]) void play(HOOK_FILE[name]); },
    special(kind: string) { if (kind !== 'none') void play(`special_${kind}`); },
    setIdle(on: boolean) { if (!on) { idle?.stop(); idle = null; } else if (!idle) void startIdle(); },
  };
}
