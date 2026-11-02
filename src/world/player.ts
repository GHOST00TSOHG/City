import * as THREE from 'three/webgpu';
import { registry } from './registry';

/** walk = on the ground / on foot, fly = rockets or skydiving, free = the free-fly debug camera. */
export type PlayerMode = 'walk' | 'fly' | 'free';

/**
 * THE player state. One object, written by whoever drives the player this frame (robot controller, or the free-fly camera) and read
 * by everyone else (HUD, audio, streaming, interiors, tests). Positions are in the ACTIVE area's local ENU frame (x east, y up, z south, m);
 * use `world()` for the shared world frame (registry.toWorld).
 *
 * - `pos` / `vel` are the same Vector3s the robot controller integrates; the free-fly camera copies its own position/velocity in each frame.
 * - `speed` (3D, m/s), `altitude` (m above the floor under the player) and `mode` are refreshed by the writer every step.
 * - `avatar`: the robot body is in the world, so `pos` is its feet (the free-fly camera's `pos` is the eye).
 * - `area`: area of interest, the area the player is in (today = the one loaded area; run B: from registry.areaAt on the world position).
 */
export const player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  speed: 0,
  altitude: 0,
  mode: 'free' as PlayerMode,
  avatar: false,
  heading: 0,
  area: '' as string,
  /** Refresh the derived fields (speed) from vel; altitude = height above `floorY`. Writers call this once per step. */
  update(floorY: number) { this.speed = this.vel.length(); this.altitude = Math.max(0, this.pos.y - floorY); },
  /** Position in the shared world frame (m); allocates only if no `out` is given. */
  world(out: { x: number; z: number } = { x: 0, z: 0 }) { return registry.toWorld(this.area, this.pos.x, this.pos.z, out); },
};
export type PlayerState = typeof player;
