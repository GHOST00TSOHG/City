/**
 * TEMPORARY Google Photorealistic 3D Tiles backdrop.
 * Never cache, copy, export, trace or derive from these tiles (see knowledge/BUILD-GUIDE.md §2).
 */
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { ReorientationPlugin } from '3d-tiles-renderer/three/plugins';
import { START } from './scene';

export function createBackdrop(apiToken: string, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken, autoRefreshToken: true }));
  tiles.registerPlugin(new ReorientationPlugin({ lat: START.lat * THREE.MathUtils.DEG2RAD, lon: START.lon * THREE.MathUtils.DEG2RAD, height: 0, recenter: true }));
  tiles.errorTarget = 28; // keeps the laptop view within the 150 draw-call budget
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  // Darken the daytime photo textures toward night.
  tiles.addEventListener('load-model', ({ scene: s }: any) => {
    s.traverse((o: any) => {
      if (o.material) {
        const m = o.material;
        const lit = new THREE.MeshStandardMaterial({ map: m.map, roughness: 0.6, metalness: 0.1, color: 0x6a7388 });
        m.dispose?.(); o.material = lit;
      }
    });
  });
  scene.add(tiles.group);
  return {
    update() { camera.updateMatrixWorld(); tiles.setResolutionFromRenderer(camera, renderer); tiles.update(); },
    copyright(): string {
      return tiles.getAttributions().filter((a: any) => a.type === 'string').map((a: any) => a.value).join('; ');
    },
  };
}
