import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Public start spot: Twin Lights Historic Site, Highlands NJ (a public landmark, never a home). */
export const START = { name: 'twin-lights', lat: 40.3966, lon: -73.9861 };

export function createScene(canvas: HTMLCanvasElement) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const nightSky = new THREE.Color(0x070a14);
  scene.background = nightSky;
  scene.fog = new THREE.FogExp2(0x141c33, 0.0005); // light distance fog

  // ENU local frame: x east, -z north, y up (meters). Camera looks NW over the bay toward NYC.
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 40000);
  camera.position.set(420, 260, 520);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 20, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.4; controls.zoomSpeed = 0.6; controls.panSpeed = 0.5;
  controls.minDistance = 40; controls.maxDistance = 6000;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.15; // slow, calm drift
  controls.addEventListener('start', () => (controls.autoRotate = false));
  controls.update();

  // Lighting: cool moon key, faint sky/ground fill, warm sodium city glow.
  const moon = new THREE.DirectionalLight(0xb4c4ff, 2.4);
  moon.position.set(-2000, 3000, -1500);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x5a6c9e, 0x1a140e, 1.5));
  const glow = new THREE.PointLight(0xffa04a, 2.5, 2500, 1.2); // sodium glow from town
  glow.position.set(0, 120, 0);
  scene.add(glow);

  // Fallback (no key): wet dark ground + sky dome with horizon city glow. 3 draw calls.
  const fallback = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20000, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.25, metalness: 0.6 }),
  );
  fallback.add(ground);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x0a1226) }, horizon: { value: new THREE.Color(0x6a4330) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vp; void main(){ float h = clamp(normalize(vp).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.35)), 1.0); }',
  });
  fallback.add(new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), skyMat));
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(260, 32), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
  moonDisc.position.copy(moon.position).normalize().multiplyScalar(25000);
  moonDisc.lookAt(0, 0, 0);
  fallback.add(moonDisc);
  scene.add(fallback);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, controls, fallback, update: (_dt: number) => controls.update() };
}
