import * as THREE from 'three/webgpu';
import { positionWorld, cameraPosition, texture, vec2, vec3, float, time, sin, cos, normalize, dot, pow, max, mix, smoothstep, clamp, mx_noise_float, transformNormalToView, uniform } from 'three/tsl';
import type { Terrain } from './data';

/** Ocean (one draw): depth colour from the baked terrain (shallow turquoise → deep blue), animated shoreline foam,
 *  Fresnel sky reflection plus moon glint from the moonlight, swell normals. Depth comes from a small R8 texture of the bathymetry. */
/** inland: no open sea beyond the bake (rivers/bays only, plane clipped to the baked extent). */
export function buildOcean(terrain: Terrain, inland = false) {
  const { nx, nz, cell, x0, z0, h } = terrain, D = 14; // depth range m
  const data = new Uint8Array(nx * nz);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(Math.max(-h[i], 0), D) / D * 255);
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  const uSky = uniform(new THREE.Color(0x1a2438)), uFoam = uniform(1), uRough = uniform(0);
  const p = positionWorld, t = time;
  const tuv = vec2(p.x.sub(x0).div(cell * (nx - 1)), p.z.sub(z0).div(cell * (nz - 1)));
  const inside = smoothstep(0, 0.18, tuv.x).mul(smoothstep(1, 0.82, tuv.x)).mul(smoothstep(0, 0.18, tuv.y)).mul(smoothstep(1, 0.82, tuv.y)); // wide fade: no edge where the bake ends
  const depth = inland ? texture(tex, tuv).r.mul(D) : mix(float(D), texture(tex, tuv).r.mul(D), inside); // outside the baked area = open sea (coastal areas)
  // swell normals (rougher in storms)
  const amp = float(1).add(uRough.mul(1.4));
  const dx = cos(p.x.mul(0.045).add(t.mul(0.6))).mul(0.06).add(cos(p.x.mul(0.17).add(p.z.mul(0.09)).add(t.mul(1.3))).mul(0.035)).add(cos(p.x.mul(0.61).sub(p.z.mul(0.33)).add(t.mul(2.3))).mul(0.015)).mul(amp);
  const dz = cos(p.z.mul(0.05).sub(t.mul(0.5))).mul(0.06).add(cos(p.z.mul(0.21).sub(p.x.mul(0.07)).add(t.mul(1.1))).mul(0.03)).add(cos(p.z.mul(0.57).add(p.x.mul(0.29)).add(t.mul(2.1))).mul(0.015)).mul(amp);
  const n = normalize(vec3(dx.negate(), 1, dz.negate()));
  const V = normalize(cameraPosition.sub(p));
  const fres = pow(float(1).sub(max(dot(n, V), 0)), 5).mul(0.9).add(0.03);
  const shallow = vec3(0.05, 0.17, 0.18), mid = vec3(0.025, 0.1, 0.14), deep = vec3(0.012, 0.045, 0.085); // night-dimmed
  const kd = smoothstep(0, 9, depth);
  const water = mix(mix(shallow, mid, smoothstep(0, 0.35, kd)), deep, smoothstep(0.3, 1, kd));
  // shoreline foam: bands rolling toward the beach, broken by noise; also faint whitecaps in storms
  const nz2 = mx_noise_float(vec3(p.x.mul(0.35), p.z.mul(0.35), t.mul(0.25))).mul(0.5).add(0.5);
  const band = sin(depth.mul(5).sub(t.mul(1.6))).mul(0.5).add(0.5);
  const shore = smoothstep(1.4, 0.05, depth).mul(inland ? 1 : inside);
  const foam = clamp(shore.mul(smoothstep(0.55, 0.9, band.mul(0.6).add(nz2.mul(0.6)))).add(smoothstep(0.35, 0.02, depth).mul(inside).mul(0.6))
    .add(uRough.mul(smoothstep(0.82, 0.95, nz2)).mul(0.35)), 0, 1).mul(uFoam);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.16, metalness: 0, transparent: true, depthWrite: false });
  mat.colorNode = mix(water, vec3(0.75, 0.8, 0.82), foam);
  mat.emissiveNode = uSky.mul(fres).mul(float(1).sub(foam)).add(vec3(0.03, 0.035, 0.04).mul(foam));
  const op = clamp(smoothstep(0, 2.2, depth).mul(0.55).add(0.35).add(foam.mul(0.5)), 0, 0.94);
  mat.opacityNode = inland ? op.mul(smoothstep(0.02, 0.25, depth)) : op; // inland: water only where the bake has water
  mat.normalNode = transformNormalToView(n);
  mat.roughnessNode = mix(float(0.14), float(0.5), foam);
  const W = cell * (nx - 1), H = cell * (nz - 1);
  const geo = inland ? new THREE.PlaneGeometry(W, H, 1, 1).rotateX(-Math.PI / 2).translate(x0 + W / 2, 0, z0 + H / 2) : new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea'; mesh.renderOrder = 1;
  return { mesh, uSky, uFoam, uRough };
}
