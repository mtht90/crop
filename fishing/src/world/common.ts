import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { texture } from '../core/assets';
import { UNDERWATER } from '../render/fishMesh';
import type { Hut } from './shape';

export interface Collider {
  x: number;
  z: number;
  r: number;
}

/** 釣り場の見た目（地形・水面・建物）。Game は釣り場を切り替える時に作り直す */
export interface FishingWorld {
  readonly group: THREE.Group;
  readonly water: Water;
  readonly colliders: Collider[];
  /** 夜に灯る明かり */
  readonly nightLights: THREE.PointLight[];
  readonly windowMats: THREE.MeshStandardMaterial[];
  update(dt: number, waveStrength: number): void;
  /** 水の澄み具合 0..1 と、水面の照り返しの強さ（偏光グラスで下がる） */
  setClarity(see: number, glare: number): void;
}

export interface TerrainTextures {
  grass: string;
  sand: string;
  mud: string;
  rock: string;
  forest: string;
}

/**
 * 地形のマテリアル。頂点属性 splat = (草, 砂, 泥, 岩) の重み、残りが森の地面。
 * 水中は水の色に沈む
 */
export function terrainMaterial(t: TerrainTextures): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const tex = {
    tGrass: { value: texture(t.grass) },
    tSand: { value: texture(t.sand) },
    tMud: { value: texture(t.mud) },
    tRock: { value: texture(t.rock) },
    tForest: { value: texture(t.forest) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tex, UNDERWATER);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass; uniform sampler2D tSand; uniform sampler2D tMud; uniform sampler2D tRock; uniform sampler2D tForest;
        uniform vec3 uWaterCol; uniform float uMurk;
        varying vec4 vSplat; varying vec3 vWPos;
        vec3 tri(sampler2D t, vec2 p) { return mix(texture2D(t, p * 0.11).rgb, texture2D(t, p * 0.027).rgb, 0.45); }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 p = vWPos.xz;
        float wf = clamp(1.0 - (vSplat.x + vSplat.y + vSplat.z + vSplat.w), 0.0, 1.0);
        vec3 col = tri(tGrass, p) * vSplat.x + tri(tSand, p) * vSplat.y + tri(tMud, p) * vSplat.z + tri(tRock, p * 0.7) * vSplat.w + tri(tForest, p) * wf;
        // 水底は草ではなく泥と砂（岩場はそのまま）
        float bed = smoothstep(0.05, 0.6, -vWPos.y) * (1.0 - vSplat.w);
        col = mix(col, mix(tri(tMud, p), tri(tSand, p * 0.8), 0.45) * vec3(0.8, 0.85, 0.75), bed);
        float under = clamp(-vWPos.y / 2.5, 0.0, 1.0);
        col = mix(col, col * vec3(0.55, 0.65, 0.6), under);
        diffuseColor.rgb *= col * 1.15;`,
      )
      // 深いほど水の色に溶ける（魚と同じ見え方）
      .replace(
        '#include <tonemapping_fragment>',
        'if (vWPos.y < 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterCol, clamp(1.0 - exp(vWPos.y * uMurk * 1.2), 0.0, 0.95));\n#include <tonemapping_fragment>',
      );
  };
  return mat;
}

/** 水面（three.js の Water に、覗き込むと透ける・偏光グラスで照り返しが減る改造を加える） */
export function buildWater(color: number, size = 1600): Water {
  const geo = new THREE.PlaneGeometry(size, size);
  const normals = texture('waternormals.jpg', { srgb: false });
  const water = new Water(geo, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: normals,
    sunDirection: new THREE.Vector3(0.5, 0.6, 0.2).normalize(),
    sunColor: 0xffffff,
    waterColor: color,
    distortionScale: 2.2,
    fog: true,
    alpha: 0.93,
  });
  water.material.transparent = true;
  // 真上から覗くほど水中が透けて見える（uSee = 水の澄み具合）。uGlare = 水面の照り返し（偏光グラスで減る）
  const m = water.material;
  m.uniforms.uSee = { value: 0.6 };
  m.uniforms.uGlare = { value: 1 };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float alpha;', 'uniform float alpha;\nuniform float uSee;\nuniform float uGlare;')
    .replace('float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );', 'float reflectance = ( rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 ) ) * uGlare;')
    .replace(
      'gl_FragColor = vec4( outgoingLight, alpha );',
      'float seeK = clamp( ( 1.0 - reflectance ) * uSee * smoothstep( 0.15, 0.7, theta ), 0.0, 1.0 );\ngl_FragColor = vec4( outgoingLight * ( 1.0 - 0.5 * seeK ), mix( alpha, 0.06, seeK ) );',
    );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.renderOrder = 1;
  return water;
}


/** 小屋（釣り小屋・釣具店）。正面（ドア）は -X 側 */
export function buildHut(HUT: Hut, signText: string, sink: { windowMats: THREE.MeshStandardMaterial[]; nightLights: THREE.PointLight[]; colliders: Collider[] }, y0 = 0): THREE.Group {
  const g = new THREE.Group();
  const wallTex = texture('weathered_planks_diff.jpg').clone();
  wallTex.repeat.set(2, 1);
  wallTex.rotation = Math.PI / 2;
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xb59a7a, roughness: 0.9 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(HUT.d, 3, HUT.w), wallMat);
  walls.position.set(0, 1.5, 0);
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  // 屋根
  const roofShape = new THREE.Shape([new THREE.Vector2(-HUT.d / 2 - 0.5, 0), new THREE.Vector2(HUT.d / 2 + 0.5, 0), new THREE.Vector2(0, 1.6)]);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: HUT.w + 0.8, bevelEnabled: false });
  roofGeo.translate(0, 0, -(HUT.w + 0.8) / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x5b2f25, roughness: 0.8 }));
  roof.position.y = 3;
  roof.castShadow = true;
  g.add(roof);
  // 正面（湖側 = -X）にドアと窓
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 }));
  door.position.set(-HUT.d / 2 - 0.03, 1.05, 0.9);
  g.add(door);
  for (const z of [-1.6]) {
    const winMat = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffb050, emissiveIntensity: 0 });
    sink.windowMats.push(winMat);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.2), winMat);
    win.position.set(-HUT.d / 2 - 0.03, 1.7, z);
    g.add(win);
  }
  // 看板
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#4a3220';
  c.fillRect(0, 0, 512, 128);
  c.strokeStyle = '#2a1a10';
  c.lineWidth = 10;
  c.strokeRect(5, 5, 502, 118);
  c.fillStyle = '#f2e2c0';
  c.font = 'bold 64px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(signText, 256, 68);
  const signTex = new THREE.CanvasTexture(cv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
  sign.position.set(-HUT.d / 2 - 0.08, 2.65, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  const lamp = new THREE.PointLight(0xffb060, 0, 14, 1.6);
  lamp.position.set(-HUT.d / 2 - 0.6, 2.3, -0.4);
  g.add(lamp);
  sink.nightLights.push(lamp);
  g.position.set(HUT.x, y0 - 0.1, HUT.z);
  sink.colliders.push({ x: HUT.x, z: HUT.z, r: 3.6 });
  return g;
}

