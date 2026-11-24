import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
/** 3段階のトゥーン陰影 */
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toToon(src: THREE.Material, extra: Partial<THREE.MeshToonMaterialParameters> = {}) {
  const s = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshToonMaterial({
    color: s.color ? s.color.clone() : new THREE.Color('#fff'),
    map: s.map ?? null,
    gradientMap: toonGradient(),
    transparent: s.transparent,
    side: s.side,
    ...extra,
  });
  m.name = src.name;
  return m;
}

const outlineMats = new Map<string, THREE.MeshBasicMaterial>();
/** 裏面を法線方向に膨らませて描く輪郭線（スキンメッシュ対応） */
export function outlineMaterial(thickness = 0.012, color = '#2a1d17') {
  const key = thickness + color;
  let m = outlineMats.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineMats.set(key, m);
  return m;
}

export function addOutline(mesh: THREE.Mesh, thickness = 0.012, color = '#2a1d17') {
  let o: THREE.Mesh;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const sm = mesh as THREE.SkinnedMesh;
    const so = new THREE.SkinnedMesh(sm.geometry, outlineMaterial(thickness, color));
    so.bind(sm.skeleton, sm.bindMatrix);
    so.bindMode = sm.bindMode;
    o = so;
  } else {
    o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  }
  o.name = mesh.name + '_outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.frustumCulled = false;
  o.renderOrder = -1;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    mesh.parent!.add(o);
    o.position.copy(mesh.position);
    o.quaternion.copy(mesh.quaternion);
    o.scale.copy(mesh.scale);
  } else mesh.add(o);
  return o;
}
