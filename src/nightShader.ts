import * as THREE from 'three';

/** Shared uniforms for the night tweak on the tile material (one object, updated once per frame). */
export const nightUniforms = {
  uMoonDirView: { value: new THREE.Vector3(0, 1, 0) },
  uLightStrength: { value: 1.0 },
  uWaterStrength: { value: 1.0 },
  // ENU y=0 is the WGS84 ellipsoid; mean sea level (geoid) is ~34 m below it at Highlands, NJ (bay surface measured at y ~ -34).
  uSeaLevel: { value: -34 },
  /** 0 = dry, 1 = soaked (rain): darker albedo + wet specular sheen on flat ground. */
  uWet: { value: 0 },
};

/**
 * Night tweak for the tile material (runtime shading only, nothing is stored or exported):
 * - warm sodium speckles: bright, warm-ish albedo pixels get a hashed emissive boost (street lights, windows)
 * - moonlit water: dark, blue-dominant, low-height pixels get a soft specular moon highlight
 */
export function applyNightShader(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, nightUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNightWorld; varying vec3 vNightUp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvNightWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vNightUp = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vNightWorld; varying vec3 vNightUp;
uniform vec3 uMoonDirView; uniform float uLightStrength; uniform float uWaterStrength; uniform float uSeaLevel; uniform float uWet;
float nHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <opaque_fragment>', `{
  vec3 alb = diffuseColor.rgb;
  float lum = dot(alb, vec3(0.299, 0.587, 0.114));
  float h = vNightWorld.y - uSeaLevel;
  vec3 Nv = normalize(normal); vec3 V = normalize(vViewPosition);
  // Wet look: darken slightly and add a moon/street sheen on flat-ish surfaces.
  outgoingLight *= 1.0 - 0.25 * uWet;
  vec3 Rw = reflect(-uMoonDirView, Nv);
  float flatUp = smoothstep(0.75, 0.95, normalize(vNightUp).y);
  float wetSpec = pow(max(dot(Rw, V), 0.0), 60.0) * flatUp;
  outgoingLight += (vec3(0.18) * wetSpec + vec3(0.05, 0.04, 0.03) * flatUp * pow(1.0 - max(dot(Nv, V), 0.0), 4.0)) * uWet;
  // Lit windows / street lights: bright pixels above ground level, sparse hashed cells (~3 m).
  float cell = nHash(floor(vNightWorld / 3.0));
  float bright = smoothstep(0.35, 0.65, lum);
  float sparse = step(0.8, cell);
  float above = smoothstep(1.0, 6.0, h);
  float warmBias = 0.6 + 0.4 * smoothstep(-0.05, 0.1, alb.r - alb.b);
  vec3 sodium = vec3(1.0, 0.62, 0.25);
  outgoingLight += sodium * (bright * sparse * above * warmBias * 3.0 + bright * 0.06) * uLightStrength;
  // Moonlit water: dark, blue-dominant, near sea level.
  float blue = smoothstep(0.0, 0.06, alb.b - max(alb.r, alb.g * 0.95));
  float dark = 1.0 - smoothstep(0.18, 0.35, lum);
  float low = 1.0 - smoothstep(2.0, 8.0, h);
  float water = blue * dark * low * smoothstep(0.9, 0.98, normalize(vNightUp).y);
  vec3 R = reflect(-uMoonDirView, Nv);
  float spec = pow(max(dot(R, V), 0.0), 24.0);
  float fres = pow(1.0 - max(dot(Nv, V), 0.0), 3.0);
  outgoingLight += vec3(0.9, 0.9, 0.86) * (spec * 0.8 + fres * 0.06) * water * uWaterStrength;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'city-night-v3';
}
