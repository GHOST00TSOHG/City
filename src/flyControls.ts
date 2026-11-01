import * as THREE from 'three/webgpu';

/**
 * Free fly / walk camera for laptops.
 * - WASD / arrows move, E or Space up, Q or C down, Shift = speed boost
 * - drag to look, or press L for pointer lock (Esc exits)
 * - trackpad pinch (ctrl+wheel) or mouse wheel = move forward/back; two-finger trackpad drag = orbit a pivot
 * - G toggles walk mode: keeps the eye ~1.7 m above the tiles via a downward raycast
 * - never below ground (fly mode keeps >= 2 m clearance)
 */
export function createFlyControls(camera: THREE.PerspectiveCamera, dom: HTMLElement, ground: (x: number, z: number, y?: number) => number | null) {
  const keys = new Set<string>();
  const vel = new THREE.Vector3();
  let yaw = 0, pitch = 0;
  let walk = false;
  let dragging = false, lx = 0, ly = 0;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const pivotOrbit = { dYaw: 0, dPitch: 0 };
  let wheelMove = 0;
  let enabled = true;

  const syncAngles = () => { euler.setFromQuaternion(camera.quaternion, 'YXZ'); yaw = euler.y; pitch = euler.x; };
  syncAngles();

  const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT';
  addEventListener('keydown', (e) => {
    if (isTyping(e) || !enabled) return;
    keys.add(e.code);
    if (e.code === 'KeyG') walk = !walk;
    if (e.code === 'KeyL') dom.requestPointerLock?.();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const look = (dx: number, dy: number) => {
    if (!enabled) return;
    yaw -= dx * 0.0025; pitch -= dy * 0.0025;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  };
  dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointerup', () => (dragging = false));
  dom.addEventListener('pointermove', (e) => {
    if (document.pointerLockElement === dom) { look(e.movementX, e.movementY); return; }
    if (!dragging) return;
    look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
  });
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!enabled) return;
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || mouseWheel) wheelMove += -e.deltaY * (e.ctrlKey ? 4 : 1); // pinch / wheel = dolly
    else { pivotOrbit.dYaw += e.deltaX * 0.003; pivotOrbit.dPitch += e.deltaY * 0.002; } // two-finger drag = orbit
  }, { passive: false });

  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let groundY: number | null = null, rcTimer = 0;
  // Ground comes from the baked height field (constant time), not a raycast through the city mesh.
  const sampleGround = () => { groundY = ground(camera.position.x, camera.position.z, camera.position.y - 1); }; // y: a bridge deck is ground only when the camera is above it

  return {
    get walk() { return walk; },
    get enabled() { return enabled; },
    /** Off while the robot drives the camera; on re-enable, angles resync from wherever the camera is. */
    setEnabled(v: boolean) { enabled = v; keys.clear(); vel.set(0, 0, 0); wheelMove = 0; pivotOrbit.dYaw = pivotOrbit.dPitch = 0; if (v) syncAngles(); },
    setWalk(v: boolean) { walk = v; },
    update(dt: number) {
      dt = Math.min(dt, 0.1);
      // Orbit a pivot ~ 300 m ahead (two-finger drag).
      if (pivotOrbit.dYaw || pivotOrbit.dPitch) {
        camera.getWorldDirection(fwd);
        const pivot = tmp.copy(camera.position).addScaledVector(fwd, 300);
        const off = camera.position.clone().sub(pivot);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -pivotOrbit.dYaw);
        camera.position.copy(pivot).add(off);
        yaw -= pivotOrbit.dYaw; pitch = Math.max(-1.45, Math.min(1.2, pitch - pivotOrbit.dPitch));
        pivotOrbit.dYaw = pivotOrbit.dPitch = 0;
      }
      euler.set(pitch, yaw, 0); camera.quaternion.setFromEuler(euler);

      const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
      const speed = (walk ? 6 : 60) * boost;
      camera.getWorldDirection(fwd); if (walk) fwd.setY(0);
      fwd.normalize(); right.crossVectors(fwd, camera.up).normalize();
      const want = new THREE.Vector3();
      if (keys.has('KeyW') || keys.has('ArrowUp')) want.add(fwd);
      if (keys.has('KeyS') || keys.has('ArrowDown')) want.sub(fwd);
      if (keys.has('KeyD') || keys.has('ArrowRight')) want.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) want.sub(right);
      if (!walk && (keys.has('KeyE') || keys.has('Space'))) want.y += 1;
      if (!walk && (keys.has('KeyQ') || keys.has('KeyC'))) want.y -= 1;
      if (want.lengthSq()) want.normalize().multiplyScalar(speed);
      // smooth acceleration + damping
      vel.lerp(want, 1 - Math.exp(-dt * 6));
      camera.position.addScaledVector(vel, dt);
      if (wheelMove) {
        camera.getWorldDirection(fwd);
        const step = wheelMove * 0.25 * (walk ? 0.05 : 1);
        camera.position.addScaledVector(fwd, step); wheelMove -= wheelMove * 0.25;
        if (Math.abs(wheelMove) < 0.5) wheelMove = 0;
      }
      rcTimer -= dt;
      if (rcTimer <= 0) { sampleGround(); rcTimer = 0.05; }
      if (groundY !== null) {
        const eye = groundY + (walk ? 1.7 : 2);
        if (walk) camera.position.y += (eye - camera.position.y) * (1 - Math.exp(-dt * 10));
        if (camera.position.y < eye) camera.position.y = eye;
      }
      camera.position.y = Math.min(camera.position.y, 6000);
    },
    syncAngles,
  };
}
