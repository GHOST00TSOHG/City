import * as THREE from 'three/webgpu';

/**
 * Baked mocap (public/robot/anim/clips.json, tools/anim/bake.mjs): rig-independent LOCAL bone quaternions for the 13 pose bones + hip bob,
 * retargeted by bone direction from CMU BVH and Mixamo FBX (sources and licences: docs/ANIM-SOURCES.md). Loops start on left heel strike.
 * Quaternions are relative to the rig's rest pose (identity), so they apply to any robot type.
 */
export interface Clip { fps: number; n: number; loop: boolean; speed: number; bob: number[]; q: Record<string, number[]>; src: string }
let CLIPS: Record<string, Clip> | null = null;
export const clips = () => CLIPS;
export async function loadClips(base = `${import.meta.env.BASE_URL}robot/anim/`): Promise<Record<string, Clip> | null> {
  try { const r = await fetch(`${base}clips.json`); if (!r.ok) throw new Error(String(r.status)); CLIPS = await r.json(); } catch (e) { console.error('[anim] clips.json failed to load; procedural poses only', e); CLIPS = null; }
  return CLIPS;
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
/** Sample bone `name` at clip time `f` in frames (loops wrap, one-shots clamp). */
export function sampleQ(c: Clip, name: string, f: number, out: THREE.Quaternion) {
  const a = c.q[name]; if (!a) return out.identity();
  const n = c.n; let i0: number, i1: number, w: number;
  if (c.loop) { f = ((f % n) + n) % n; i0 = Math.floor(f); i1 = (i0 + 1) % n; w = f - i0; } else { f = Math.max(0, Math.min(n - 1, f)); i0 = Math.floor(f); i1 = Math.min(n - 1, i0 + 1); w = f - i0; }
  qa.set(a[i0 * 4], a[i0 * 4 + 1], a[i0 * 4 + 2], a[i0 * 4 + 3]); qb.set(a[i1 * 4], a[i1 * 4 + 1], a[i1 * 4 + 2], a[i1 * 4 + 3]);
  return out.copy(qa).slerp(qb, w);
}
export function sampleBob(c: Clip, f: number) {
  const n = c.n; if (c.loop) { f = ((f % n) + n) % n; const i = Math.floor(f); return c.bob[i] + (c.bob[(i + 1) % n] - c.bob[i]) * (f - i); }
  f = Math.max(0, Math.min(n - 1, f)); const i = Math.floor(f); return c.bob[i] + (c.bob[Math.min(n - 1, i + 1)] - c.bob[i]) * (f - i);
}
export const POSE_BONES = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
