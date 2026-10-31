import * as THREE from 'three';
import lamps from './streetLamps.json';

/**
 * Warm sodium glow sprites along the low-lying main streets (Bay Ave, Ocean Ave, ...).
 * Positions come only from OpenStreetMap centerlines (see streetLamps.json), never from Google tiles.
 * One THREE.Points = 1 draw call for all lamps.
 * Heights: at runtime each lamp is dropped onto whatever ground is rendered (a transient raycast, like the
 * walk camera); nothing is stored. Lamps start hidden until their ground is found.
 */
export function createStreetGlow(ground: () => THREE.Object3D | null, lampHeight = 7) {
  const HIDDEN = -1e5;
  const pos = new Float32Array(lamps.points.length * 3);
  lamps.points.forEach(([x, z], i) => pos.set([x, HIDDEN, z], i * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,190,1)');
  grad.addColorStop(0.18, 'rgba(255,170,80,0.85)');
  grad.addColorStop(0.5, 'rgba(255,130,40,0.22)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.PointsMaterial({
    map: tex, size: 30, sizeAttenuation: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffd9a8, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 2;
  points.frustumCulled = false;
  const rc = new THREE.Raycaster(); (rc as any).firstHitOnly = true;
  const o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  let timer = 0, next = 0;
  return {
    points,
    /** Snap a few lamps per call (cheap), cycling forever so lamps follow tile LOD changes. */
    update(dt: number) {
      const g = ground(); timer -= dt; if (!g || timer > 0) return;
      timer = 0.05;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < 4; k++, next = (next + 1) % lamps.points.length) {
        const [x, z] = lamps.points[next];
        rc.set(o.set(x, 1500, z), down);
        const hit = rc.intersectObject(g, true)[0];
        if (hit) attr.setY(next, hit.point.y + lampHeight);
      }
      attr.needsUpdate = true;
    },
  };
}
