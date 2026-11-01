import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { uniform, positionLocal, normalLocal, fract, abs, smoothstep, sin, time, mx_noise_float, vec3, mix, float, max, min } from 'three/tsl';
import { SLOTS, type RobotLook, type Slot } from './model';

/**
 * Blender-built mecha parts (tools/blender/robot_parts.py → public/robot/parts/<slot>.glb). Each top-level node is
 * `<slot>__<option>__<Bone>` and is parented onto that bone of the robot, so flames (nozzle empties) and the procedural
 * poses keep working. One shared node material per colour region:
 *  - paint from the RobotLook (shell / torso / joints / backpack, visor + decalColor glow),
 *  - energy: emissive panel seams, visor and chest core pulse, tinted by the visor paint, scaled by `energy` (charge / burst),
 *  - battle damage 0..1: scorch (noise-masked darkening), dents (small inward vertex push), handled per pixel/vertex, no extra draws,
 *  - repair sweep: a glowing band that runs up the body while damage drains (customise screen).
 */
export interface PartLib {
  nodes: { slot: Slot; opt: string; bone: string; obj: THREE.Object3D }[];
  mats: Record<string, THREE.MeshStandardNodeMaterial>;
  uniforms: { energy: { value: number }; damage: { value: number }; sweep: { value: number }; glow: { value: THREE.Color } };
}

export async function loadParts(base = `${import.meta.env.BASE_URL}robot/parts/`): Promise<PartLib | null> {
  try {
    const loader = new GLTFLoader();
    const files = await Promise.all((Object.keys(SLOTS) as Slot[]).map((s) => loader.loadAsync(`${base}${s}.glb?v=${__ROBOT_V__}`)));
    const uEnergy = uniform(1), uDamage = uniform(0), uSweep = uniform(-1), uGlow = uniform(new THREE.Color('#3df2ff'));
    const mats: PartLib['mats'] = {};
    const mk = (region: string) => {
      const glowing = region === 'visor' || region === 'decalColor';
      const m = new THREE.MeshStandardNodeMaterial({ roughness: glowing ? 0.3 : region === 'joints' ? 0.55 : 0.38, metalness: region === 'joints' ? 0.35 : 0.08, flatShading: false });
      m.name = region;
      const uCol = uniform(new THREE.Color('#ffffff')); m.userData.uCol = uCol;
      const p = positionLocal;
      // scorch: low-frequency noise, more coverage with damage; dark soot with a brownish edge
      const n = mx_noise_float(p.mul(14)).mul(0.5).add(0.5);
      const scorch = smoothstep(float(1.02).sub(uDamage.mul(0.75)), float(1.1).sub(uDamage.mul(0.75)), n.add(mx_noise_float(p.mul(55)).mul(0.12)));
      const base = mix(uCol, vec3(0.05, 0.045, 0.04), scorch.mul(0.85));
      m.colorNode = base;
      m.roughnessNode = mix(float(m.roughness), float(0.95), scorch);
      // panel seams: thin lines across each part (local space), glowing in the visor tint
      const seam = max(smoothstep(0.475, 0.492, abs(fract(p.y.mul(7)).sub(0.5))), smoothstep(0.482, 0.495, abs(fract(p.x.mul(6).add(0.25)).sub(0.5))).mul(0.6)).mul(float(1).sub(scorch));
      const pulse = sin(time.mul(2.6)).mul(0.25).add(0.85).mul(uEnergy);
      const sweep = smoothstep(0.05, 0.0, abs(p.y.sub(uSweep))).mul(uSweep.greaterThan(-0.9).select(float(1), float(0)));
      const hurt = float(1).sub(uDamage.mul(0.6)); // damaged seams flicker weaker
      const glowMain = glowing ? uCol.mul(pulse).mul(1.6).mul(hurt) : uGlow.mul(seam.mul(region === 'joints' ? 0.0 : 0.55).mul(pulse).mul(hurt));
      m.emissiveNode = glowMain.add(vec3(0.4, 1.0, 0.9).mul(sweep.mul(2.0)));
      // dents: push the surface in along the normal where a high-frequency noise is strong
      if (!glowing) m.positionNode = p.sub(normalLocal.mul(min(float(0.006), max(float(0), mx_noise_float(p.mul(30)).sub(0.35)).mul(uDamage).mul(0.02))));
      return m;
    };
    for (const r of ['shell', 'torso', 'joints', 'shorts', 'backpack', 'visor', 'decalColor']) mats[r] = mk(r);
    const nodes: PartLib['nodes'] = [];
    for (const g of files) for (const o of [...g.scene.children]) {
      const [slot, opt, bone] = o.name.split('__'); if (!bone) continue;
      o.traverse((c: any) => { if (c.isMesh) { const rn = (c.material?.name ?? 'shell').replace(/\.\d+$/, ''); c.material = mats[rn] ?? mats.shell; c.castShadow = false; } });
      nodes.push({ slot: slot as Slot, opt, bone, obj: o });
    }
    return { nodes, mats, uniforms: { energy: uEnergy, damage: uDamage, sweep: uSweep, glow: uGlow } };
  } catch (e) { console.warn('[City] robot parts failed to load; bare frame only', e); return null; }
}

/** Parent every part onto its bone (by name; Mixamo `mixamorig:` prefixes are fine). */
export function attachParts(root: THREE.Object3D, lib: PartLib) {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((o) => bones.set(o.name.replace(/^mixamorig:?/, ''), o));
  for (const n of lib.nodes) { const b = bones.get(n.bone); if (b) { b.add(n.obj); n.obj.position.set(0, 0, 0); n.obj.quaternion.identity(); } }
}

/** Visibility per chosen option and paint per region. */
export function applyParts(lib: PartLib | null, look: RobotLook) {
  if (!lib) return;
  for (const n of lib.nodes) n.obj.visible = look[n.slot] === n.opt;
  for (const [r, m] of Object.entries(lib.mats)) (m.userData.uCol as { value: THREE.Color }).value.set((look as any)[r] ?? '#ffffff');
  lib.uniforms.glow.value.set(look.visor);
}
