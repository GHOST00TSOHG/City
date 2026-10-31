import * as THREE from 'three';

/** Night sky: gradient dome + star field + moon disc with halo. 3 draw calls, follows the camera. */
export function createSky(moonDir: THREE.Vector3) {
  const group = new THREE.Group();
  const R = 30000;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x040817) },
        mid: { value: new THREE.Color(0x0c142a) },
        warm: { value: new THREE.Color(0x4a3a36) }, // sodium city glow (NYC lies NW)
        cool: { value: new THREE.Color(0x2a3346) },
        moonDir: { value: moonDir },
        haze: { value: 0 },
      },
      vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 zenith, mid, warm, cool, moonDir; uniform float haze; varying vec3 vp;
        void main(){
          vec3 d = normalize(vp); float h = max(d.y, 0.0);
          // warm toward NW (-x, -z), cool elsewhere
          float nw = smoothstep(-0.3, 1.0, dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(vec2(-1.0, -1.0))));
          vec3 horizon = mix(cool, warm, nw);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, zenith, smoothstep(0.12, 0.7, h));
          c += vec3(0.10, 0.11, 0.13) * pow(max(dot(d, moonDir), 0.0), 12.0); // moon scatter
          c = mix(c, horizon * 0.8, haze * 0.6);
          if (d.y < 0.0) c = horizon * 0.9;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -3;
  group.add(dome);

  // Stars: one Points draw call, twinkle-free (calm), fade toward the horizon.
  const N = 2500, pos = new Float32Array(N * 3), mag = new Float32Array(N);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const y = 0.05 + rnd() * 0.95, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * R * 0.95, y * R * 0.95, Math.sin(a) * r * R * 0.95], i * 3);
    mag[i] = Math.pow(rnd(), 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { vis: { value: 1 }, pr: { value: 1 } },
    vertexShader: `attribute float mag; uniform float pr; varying float a;
      void main(){ vec3 d = normalize(position); a = (0.35 + 0.65 * mag) * smoothstep(0.03, 0.25, d.y);
        gl_PointSize = (1.2 + 1.8 * mag) * pr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float vis; varying float a; void main(){ float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.92, 0.94, 1.0) * a * vis * smoothstep(0.5, 0.1, r), 1.0); }`,
  });
  const stars = new THREE.Points(sg, starMat);
  stars.renderOrder = -2; stars.frustumCulled = false;
  group.add(stars);

  // Moon disc + soft halo in one quad.
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { vis: { value: 1 } },
      vertexShader: 'varying vec2 vu; void main(){ vu = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float vis; varying vec2 vu; void main(){ float r = length(vu - 0.5) * 2.0;
        float disc = smoothstep(0.17, 0.155, r); float halo = exp(-r * 6.0) * 0.45;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.93) * (disc * 1.6 + halo) * vis, 1.0); }`,
    }),
  );
  moon.position.copy(moonDir).multiplyScalar(R * 0.9);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -1;
  group.add(moon);

  return {
    group,
    /** 0 = clear, 1 = overcast (rain): hides stars/moon, hazes the dome. */
    setOvercast(k: number) {
      starMat.uniforms.vis.value = 1 - k;
      (moon.material as THREE.ShaderMaterial).uniforms.vis.value = 1 - 0.85 * k;
      (dome.material as THREE.ShaderMaterial).uniforms.haze.value = k;
    },
    setPixelRatio(pr: number) { starMat.uniforms.pr.value = pr; },
    follow(cam: THREE.Camera) { group.position.copy(cam.position); },
  };
}
