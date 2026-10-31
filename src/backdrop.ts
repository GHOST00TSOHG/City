/**
 * TEMPORARY Google Photorealistic 3D Tiles backdrop.
 * Never cache, copy, export, trace or derive from these tiles (see knowledge/BUILD-GUIDE.md §2).
 */
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
import { START } from './scene';
import { applyNightShader } from './nightShader';

export function createBackdrop(apiToken: string, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken, autoRefreshToken: true }));
  tiles.registerPlugin(new ReorientationPlugin({ lat: START.lat * THREE.MathUtils.DEG2RAD, lon: START.lon * THREE.MathUtils.DEG2RAD, height: 0, recenter: true }));
  tiles.errorTarget = 28;
  const BASE_ERROR = 28, MAX_CALLS = 140; // keep the frame within the 150 draw-call budget
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  // True colours: white base colour, no tint. Night comes only from lights, exposure, fog and sky.
  tiles.addEventListener('load-model', ({ scene: s }: any) => {
    s.traverse((o: any) => {
      if (o.material) {
        const m = o.material;
        const lit = new THREE.MeshStandardMaterial({ map: m.map, roughness: 0.9, metalness: 0.0, color: 0xffffff });
        applyNightShader(lit);
        m.dispose?.(); o.material = lit;
      }
    });
  });
  scene.add(tiles.group);
  return {
    group: tiles.group,
    /** Adaptive LOD: coarsen tiles when draw calls approach the budget, refine when there is headroom. */
    budget(calls: number) {
      if (calls > MAX_CALLS) tiles.errorTarget = Math.min(tiles.errorTarget * 1.08, 120);
      else if (calls < MAX_CALLS - 30) tiles.errorTarget = Math.max(tiles.errorTarget * 0.98, BASE_ERROR);
    },
    update() { camera.updateMatrixWorld(); tiles.setResolutionFromRenderer(camera, renderer); tiles.update(); },
    copyright(): string {
      return tiles.getAttributions().filter((a: any) => a.type === 'string').map((a: any) => a.value).join('; ');
    },
  };
}
