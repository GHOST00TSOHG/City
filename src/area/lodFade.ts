import { uniform, screenCoordinate, vec2, fract, dot, float } from 'three/tsl';

/** Cross-fade between a tile's near buildings (many chunks) and its merged far-detail mesh, in `FADE_SECONDS`, with no extra draw calls and no sorting:
 *  both are opaque and drawn with complementary screen-space dither masks (interleaved gradient noise), so every pixel shows exactly one of them.
 *  Each object carries its visible share in `userData.fade` (a chunk reads its parent group's); the node is an object-update uniform, so the shared
 *  materials need no per-tile clones (no extra pipelines). Share 1 = fully visible, so steady state looks exactly as before. */
export const FADE_SECONDS = 0.4;
const share = uniform(1).onObjectUpdate(({ object }) => (object?.userData.fade as number | undefined) ?? (object?.parent?.userData.fade as number | undefined) ?? 1);
const noise = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
/** near detail: pixel kept where noise < share; far detail (share = 1 - near share): kept where noise >= 1 - share, the exact complement. */
export const nearMask = () => noise.lessThan(share);
export const farMask = () => float(1).sub(noise).lessThanEqual(share);

/** Eases a near-share from its current value toward 0 (far) or 1 (near) over FADE_SECONDS. */
export function createLodFade() {
  let a = 1, target = 1;
  return {
    get near() { return a; }, get busy() { return a !== target; },
    set(far: boolean, instant = false) { target = far ? 0 : 1; if (instant) a = target; },
    step(dt: number) { if (a === target) return false; const d = Math.min(dt, 0.1) / FADE_SECONDS; a = a < target ? Math.min(target, a + d) : Math.max(target, a - d); return true; },
  };
}
