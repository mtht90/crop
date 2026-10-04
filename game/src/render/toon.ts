import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-step ramp for cel shading. */
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.Material>();

/** Toon material with a soft rim light that lifts characters off the background. */
export function toon(color: number, opts: { rim?: number; emissive?: number; map?: THREE.Texture } = {}) {
  const key = `${color}-${opts.rim ?? 0.35}-${opts.emissive ?? 0}-${opts.map?.uuid ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: opts.map ?? null });
  if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
  const rim = opts.rim ?? 0.35;
  if (rim > 0) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.rimStrength = { value: rim };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float rimStrength;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `float rimDot = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
           outgoingLight += vec3(1.0, 0.97, 0.9) * smoothstep(0.62, 0.72, rimDot) * rimStrength;
           #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => `rim-${rim}`;
  }
  cache.set(key, m);
  return m;
}

const outlineMat = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.022 }, color: { value: new THREE.Color(0x1d1b2e) } },
  vertexShader: `
    uniform float thickness;
    void main() {
      vec3 p = position + normal * thickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 color;
    void main() { gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.BackSide,
});

/** Inverted-hull outline. Attach as a child so it follows the mesh. */
export function addOutline(mesh: THREE.Mesh, thickness = 0.022) {
  const mat = thickness === 0.022 ? outlineMat : outlineMat.clone();
  if (mat !== outlineMat) (mat as THREE.ShaderMaterial).uniforms.thickness.value = thickness;
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return o;
}

/** Creates a toon mesh with outline and shadows in one go. */
export function part(geo: THREE.BufferGeometry, color: number, outline = 0.022, opts: { rim?: number; emissive?: number } = {}) {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.castShadow = true;
  if (outline > 0) addOutline(m, outline);
  return m;
}
