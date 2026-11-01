import * as THREE from 'three/webgpu';
/**
 * A6 shader/pipeline prewarm. Compiles pipelines for everything in `root`, including objects that are hidden now
 * but appear later (rockets, crater, rings, rain/snow, empty LOD buckets, grass), so first sight never compiles
 * mid-flight. Temporarily shows hidden objects and gives empty instanced meshes one instance, then restores.
 */
export async function prewarm(renderer: THREE.WebGPURenderer, root: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene = root as THREE.Scene) {
  const undo: (() => void)[] = [];
  root.traverse((o: any) => {
    if (!o.visible) { o.visible = true; undo.push(() => (o.visible = false)); }
    if (o.isInstancedMesh && o.count === 0) { o.count = 1; undo.push(() => (o.count = 0)); }
    if (o.geometry?.isInstancedBufferGeometry && o.geometry.instanceCount === 0) { const g = o.geometry; g.instanceCount = 1; undo.push(() => (g.instanceCount = 0)); }
    if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; undo.push(() => (o.frustumCulled = true)); }
  });
  const t0 = performance.now();
  try { await renderer.compileAsync(root, camera, scene); } catch (e) { console.warn('[City] prewarm compile failed', e); }
  undo.forEach((f) => f());
  return performance.now() - t0;
}
