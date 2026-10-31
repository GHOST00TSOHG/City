import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createFlyControls } from './flyControls';
import { createSky } from './sky';

/** Public start spot: Twin Lights Historic Site, Highlands NJ (a public landmark, never a home). */
export const START = { name: 'twin-lights', lat: 40.3966, lon: -73.9861 };

/** Target device: MacBook Air M4 (Apple GPU, Safari/Chrome). pixelRatio capped at 1.5. */
export const MAX_PIXEL_RATIO = 1.5;

export function createScene(canvas: HTMLCanvasElement, ground: () => THREE.Object3D | null) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62; // gentle overall darkening; colours stay true
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const fogClear = new THREE.Color(0x1a1f2a), fogRain = new THREE.Color(0x22252b);
  scene.fog = new THREE.FogExp2(fogClear.clone(), 0.00035);

  // ENU local frame: x east, -z north, y up (meters). Camera looks NW over the bay toward NYC.
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 40000);
  camera.position.set(420, 260, 520);
  camera.lookAt(0, 20, 0);
  const controls = createFlyControls(camera, canvas, ground);

  // Lighting: near-neutral moon key (no blue cast) + neutral sky/ground fill. Night = low intensity, not tint.
  const moon = new THREE.DirectionalLight(0xf1f2f8, 1.6);
  moon.position.set(-2000, 3000, -1500);
  scene.add(moon);
  const hemi = new THREE.HemisphereLight(0xdfe3ec, 0x3a3630, 1.1);
  scene.add(hemi);

  const sky = createSky(moon.position.clone().normalize());
  sky.setPixelRatio(renderer.getPixelRatio());
  scene.add(sky.group);

  // Fallback (no key): dark ground, 1 draw call.
  const fallback = new THREE.Group();
  fallback.add(new THREE.Mesh(
    new THREE.CircleGeometry(20000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 }),
  ));
  scene.add(fallback);

  // Post: subtle half-resolution bloom so the lights glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.45, 0.85);
  const fullSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w: number, h: number) => fullSize(Math.round(w / 2), Math.round(h / 2)); // half-res bloom chain
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  return {
    renderer, scene, camera, controls, fallback, composer, moon, sky,
    /** k: 0 clear .. 1 heavy rain. Darker lights, more fog, overcast sky. */
    setRainLook(k: number) {
      (scene.fog as THREE.FogExp2).color.copy(fogClear).lerp(fogRain, k);
      (scene.fog as THREE.FogExp2).density = 0.00035 + 0.0009 * k;
      moon.intensity = 1.6 * (1 - 0.6 * k); hemi.intensity = 1.1 * (1 - 0.3 * k);
      sky.setOvercast(k);
    },
    update(dt: number) { controls.update(dt); sky.follow(camera); },
  };
}
