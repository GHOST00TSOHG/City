import type { RobotType } from './types';

/**
 * Per-type robot SFX (public/audio/robots/<type>/<type>_<name>.{ogg,m4a}, see LICENSES.md there).
 * One master gain; every clip plays at 1.0 (levels are mastered in the files). Only *_idle_loop loops.
 * Footsteps 01–03 are round-robin. Lazy: nothing is fetched until the first user gesture unlocks audio.
 */
const EXT = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
const STEPS = ['footstep_01', 'footstep_02', 'footstep_03'];

export function createRobotAudio(base = `${import.meta.env.BASE_URL}audio/robots/`) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, type: RobotType | null = null, idle: AudioBufferSourceNode | null = null, rr = 0, volume = 1;
  const bufs = new Map<string, Promise<AudioBuffer | null>>();
  const load = (t: RobotType, n: string) => {
    const k = `${t}/${n}`;
    if (!bufs.has(k)) bufs.set(k, fetch(`${base}${t}/${t}_${n}.${EXT}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((a) => ctx!.decodeAudioData(a)).catch(() => null));
    return bufs.get(k)!;
  };
  const play = async (n: string, loop = false) => {
    if (!ctx || !master || !type) return null;
    const t = type, b = await load(t, n); if (!b || t !== type) return null;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = loop && n.endsWith('idle_loop'); s.connect(master); s.start(); return s;
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
    special(kind: string) { if (kind !== 'none') void play(`special_${kind}`); },
    setIdle(on: boolean) { if (!on) { idle?.stop(); idle = null; } else if (!idle) void startIdle(); },
  };
}
