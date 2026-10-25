import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import type { ColorVariant, FishModelId, Palette, PatternDef, PatternKind, PatternVariant, Species } from '../data/types';

/**
 * 魚は外部の3Dモデル（public/assets/fish/<id>.json、出典は CREDITS.md）を使い、
 * 元テクスチャの陰影を残したまま、魚種・色違いの配色と模様をシェーダで乗せる。
 * モデルは変換時に「+X が頭・+Y が背・全長 1・中心が原点」へ揃えてある。
 */

export interface FishLook {
  palette: Palette;
  pattern: PatternDef;
  metallic: number;
  albino: boolean;
}

export function lookOf(s: Species, colorId: string | null, patternId: string | null): FishLook {
  const color: ColorVariant | undefined = s.colors.find((c) => c.id === colorId);
  const pat: PatternVariant | undefined = s.patterns.find((c) => c.id === patternId);
  const palette = { ...s.palette, ...(pat?.palette ?? {}), ...(color?.palette ?? {}) };
  return {
    palette,
    pattern: pat?.pattern ?? s.pattern,
    metallic: color?.metallic ?? 0,
    albino: !!colorId && /albino|white/.test(colorId),
  };
}

interface ModelPart {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture | null;
  color: THREE.Color;
  /** 元テクスチャ（または色）の平均の明るさ */
  refLum: number;
  fin: boolean;
}

interface LoadedModel {
  parts: ModelPart[];
  halfHeight: number;
}

const MODEL_IDS: FishModelId[] = ['bass', 'trout', 'salmon', 'koi', 'catfish', 'arowana'];
const models = new Map<FishModelId, LoadedModel>();
let loading: Promise<void> | null = null;

function averageLum(tex: THREE.Texture | null, color: THREE.Color): number {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return Math.max(color.r, color.g, color.b);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    // sRGB → 線形の近似
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    // 色相に左右されないよう、明るさは RGB の最大値で測る（紅白の鯉の模様が濃淡として残らない）
    sum += Math.max(lin(d[i]), lin(d[i + 1]), lin(d[i + 2]));
    n++;
  }
  return Math.max(0.02, n ? sum / n : 0.3);
}

/** ゲーム開始前に全モデルを読み込む */
export function preloadFishModels(): Promise<void> {
  if (loading) return loading;
  loading = Promise.all(
    MODEL_IDS.map(async (id) => {
      const gltf = await loadGltf(`${import.meta.env.BASE_URL}assets/fish/${id}.json`);
      const parts: ModelPart[] = [];
      const box = new THREE.Box3();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // マテリアルごとに別メッシュとして読み込まれるので、それぞれを部位として扱う
        const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
        if (!geometry.getAttribute('uv')) {
          geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
        }
        geometry.computeBoundingBox();
        box.union(geometry.boundingBox!);
        const sm = m.material as THREE.MeshStandardMaterial;
        const map = sm.map ?? null;
        parts.push({ geometry, map, color: sm.color.clone(), refLum: averageLum(map, sm.color), fin: /fin/i.test(sm.name) });
      });
      models.set(id, { parts, halfHeight: (box.max.y - box.min.y) / 2 });
    }),
  ).then(() => undefined);
  return loading;
}

let fallback: LoadedModel | null = null;
function fallbackModel(): LoadedModel {
  if (!fallback) {
    const geometry = new THREE.SphereGeometry(0.5, 20, 12).scale(1, 0.32, 0.16);
    fallback = { parts: [{ geometry, map: null, color: new THREE.Color(0.7, 0.7, 0.7), refLum: 0.5, fin: false }], halfHeight: 0.16 };
  }
  return fallback;
}

export function fishModelsReady(): boolean {
  return models.size === MODEL_IDS.length;
}

// ---------------- シェーダ ----------------

const PATTERN_INDEX: Record<PatternKind, number> = {
  none: 0,
  lateralBand: 1,
  bars: 2,
  spots: 3,
  blotches: 4,
  mirror: 5,
  nishiki: 6,
  stripes: 7,
  scutes: 8,
};

const FRAG_HEAD = `
uniform vec3 uBack; uniform vec3 uFlank; uniform vec3 uBelly; uniform vec3 uFin;
uniform vec3 uPatColor; uniform vec3 uAccent;
uniform float uPatInt; uniform float uPatScale; uniform int uPatKind;
uniform float uTint; uniform float uRefLum; uniform float uIsFin; uniform float uHalfH; uniform float uDetail; uniform float uPatOn;
varying vec3 vFPos; varying vec3 vFNor;
float fh3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fn3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh3(i), fh3(i + vec3(1,0,0)), f.x), mix(fh3(i + vec3(0,1,0)), fh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fh3(i + vec3(0,0,1)), fh3(i + vec3(1,0,1)), f.x), mix(fh3(i + vec3(0,1,1)), fh3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec2 fishPattern(vec3 p, float yn) {
  float body = smoothstep(0.4, 0.28, p.x) * smoothstep(-0.48, -0.3, p.x);
  if (uPatKind == 1) {
    float n = fn3(p * vec3(14.0, 14.0, 4.0));
    return vec2((1.0 - smoothstep(0.1, 0.22, abs(yn + (n - 0.5) * 0.3))) * body, 0.0);
  }
  if (uPatKind == 2) {
    float s = smoothstep(0.45, 0.7, 0.5 + 0.5 * sin((p.x + 0.5) * uPatScale * 6.2832));
    return vec2(s * smoothstep(-0.3, 0.35, yn) * body, 0.0);
  }
  if (uPatKind == 3) {
    vec3 q = p * vec3(uPatScale * 2.4, uPatScale * 2.4, uPatScale * 1.4);
    vec3 c = floor(q); vec3 f = fract(q) - 0.5;
    vec3 o = vec3(fh3(c + 3.1), fh3(c + 7.7), fh3(c + 1.3)) - 0.5;
    float r = fh3(c);
    float d = length(f - o * 0.45);
    float spot = (1.0 - smoothstep(0.15, 0.24, d)) * step(0.3, r);
    return vec2(spot * smoothstep(-0.7, 0.1, yn) * body, step(0.8, r));
  }
  if (uPatKind == 4) {
    float n = fn3(p * uPatScale * 3.0) + 0.5 * fn3(p * uPatScale * 7.0 + 5.0);
    return vec2(smoothstep(0.82, 1.0, n) * body, 0.0);
  }
  if (uPatKind == 5) {
    if (uPatScale > 4.0) return vec2(0.0);
    vec2 q = vec2(p.x * 9.0, yn * 2.2);
    vec2 c = floor(q); vec2 f = fract(q) - 0.5;
    float plate = (1.0 - smoothstep(0.3, 0.4, length(f))) * step(0.45, fh3(vec3(c, 1.0)));
    return vec2(plate * body * step(-0.25, yn), 1.0);
  }
  if (uPatKind == 6) {
    float n = fn3(p * vec3(5.0, 5.0, 3.0) + 3.0);
    return vec2(smoothstep(0.48, 0.56, n) * smoothstep(-0.5, 0.0, yn) * body, 1.0);
  }
  if (uPatKind == 7) {
    float s = 0.0;
    for (int i = 0; i < 3; i++) { float c = 0.12 + float(i) * 0.22; s = max(s, 1.0 - smoothstep(0.03, 0.07, abs(yn - c))); }
    return vec2(s * body, 0.0);
  }
  if (uPatKind == 8) {
    float rowD = min(abs(yn - 0.9), min(abs(yn - 0.05), abs(yn + 0.55)));
    float fx = abs(fract(p.x * 14.0) - 0.5);
    return vec2((1.0 - smoothstep(0.25, 0.33, fx + rowD * 3.0)) * smoothstep(0.45, 0.3, p.x), 0.0);
  }
  return vec2(0.0);
}
`;

const FRAG_BODY = `
#include <map_fragment>
{
  float lum = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
  float detail = mix(1.0, clamp(lum / uRefLum, 0.25, 1.8), uDetail);
  // 背は体の上側ほど濃く、腹は下側ほど白く（側面から見ても背の色が見えるよう高さも使う）
  float k = vFPos.y / uHalfH * 0.8 + normalize(vFNor).y * 0.4;
  vec3 base = k > -0.12 ? mix(uFlank, uBack, smoothstep(0.0, 0.3, k + 0.12)) : mix(uFlank, uBelly, smoothstep(0.05, 0.5, -k));
  base = mix(base, uFin, uIsFin);
  diffuseColor.rgb = mix(diffuseColor.rgb, base * detail, uTint);
  // 模様は元テクスチャの上にも乗せられる（色違い・模様違い用）
  vec2 pm = fishPattern(vFPos, vFPos.y / uHalfH);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(uPatColor, uAccent, pm.y) * detail, pm.x * uPatInt * uPatOn);
}
`;

/** 水中の見え方（湖の魚すべてで共有）。濁りが強いほど深い魚は水の色に溶ける */
export const UNDERWATER = {
  uWaterCol: { value: new THREE.Color(0x0b2422) },
  uMurk: { value: 0.3 },
};
const NO_WATER = { uWaterCol: { value: new THREE.Color(0) }, uMurk: { value: 0 } };

export interface SwimUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uFreq: { value: number };
}

function installShader(mat: THREE.Material, swim: SwimUniforms, extra: Record<string, { value: unknown }> | null, water = NO_WATER): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, swim, extra ?? {}, extra ? water : {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;\nuniform float uFreq;\nvarying vec3 vFPos;\nvarying vec3 vFNor;\nvarying float vWorldY;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFPos = position;
        vFNor = normal;
        float tailK = clamp(0.55 - position.x, 0.0, 1.1);
        transformed.z += sin(uTime * uFreq - position.x * 7.0) * uAmp * tailK * tailK;
        transformed.x -= abs(sin(uTime * uFreq - position.x * 7.0)) * uAmp * 0.15 * tailK;
        vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    if (extra) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_HEAD}\nuniform vec3 uWaterCol; uniform float uMurk; varying float vWorldY;`)
        .replace('#include <map_fragment>', FRAG_BODY)
        // 水面下は深さに応じて暗い影（魚影）になっていく。周りの水より暗いので見つけやすい
        .replace(
          '#include <tonemapping_fragment>',
          'if (vWorldY < 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterCol * 0.35, clamp(1.0 - exp(vWorldY * uMurk * 1.6), 0.0, 0.85));\n#include <tonemapping_fragment>',
        );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFPos;\nvarying vec3 vFNor;');
    }
  };
}

export interface FishObject {
  group: THREE.Group;
  swim: SwimUniforms;
  materials: THREE.Material[];
  dispose(): void;
}

/** 魚の3Dオブジェクト（全長1、+Xが頭）。silhouette = 図鑑の未発見表示、inWorld = 湖の中（水中の見え方を適用） */
export function buildFishObject(s: Species, colorId: string | null, patternId: string | null, silhouette = false, inWorld = false): FishObject {
  // モデルが読み込めていない場合も止まらないよう、別のモデルか簡易な形で代用する
  const model = models.get(s.model.id) ?? models.values().next().value ?? fallbackModel();
  const look = lookOf(s, colorId, patternId);
  const swim: SwimUniforms = { uTime: { value: 0 }, uAmp: { value: 0.03 }, uFreq: { value: 6 } };
  const pal = look.palette;
  const col = (hex: string) => new THREE.Color(hex);
  // 元テクスチャのままにするか、魚種・色違いの配色を乗せるか
  const native = [colorId, patternId].some((id) => id && s.model.native?.includes(id));
  const baseTint = s.model.tint ?? 0;
  const tint = native ? 0 : colorId ? Math.max(0.8, baseTint) : baseTint;
  // 魚種本来の模様は元テクスチャにある（配色を強く乗せた時だけ描く）。模様違いは常に描く
  const patOn = native ? 0 : patternId || tint > 0.5 ? 1 : 0;
  const mats: THREE.Material[] = model.parts.map((p) => {
    if (silhouette) {
      const m = new THREE.MeshBasicMaterial({ color: 0x1a2430 });
      installShader(m, swim, null);
      return m;
    }
    const m = new THREE.MeshStandardMaterial({
      map: p.map,
      color: p.map ? 0xffffff : p.color,
      roughness: 0.45 - look.metallic * 0.2,
      metalness: 0.05 + look.metallic * 0.7,
      envMapIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    installShader(m, swim, {
      uBack: { value: col(pal.back) },
      uFlank: { value: col(pal.flank) },
      uBelly: { value: col(pal.belly) },
      uFin: { value: col(pal.fin) },
      uPatColor: { value: col(pal.pattern) },
      uAccent: { value: col(look.pattern.accent ?? (look.pattern.kind === 'mirror' ? '#e8c870' : pal.pattern)) },
      uPatInt: { value: look.pattern.intensity ?? 0.6 },
      uPatScale: { value: look.pattern.scale ?? 1 },
      uPatKind: { value: PATTERN_INDEX[look.pattern.kind] },
      uTint: { value: !p.map ? 1 : tint },
      uDetail: { value: s.model.detail ?? 1 },
      uPatOn: { value: patOn },
      uRefLum: { value: p.refLum },
      uIsFin: { value: p.fin ? 1 : 0 },
      uHalfH: { value: model.halfHeight },
    }, inWorld ? UNDERWATER : NO_WATER);
    return m;
  });
  const group = new THREE.Group();
  model.parts.forEach((p, i) => {
    const mesh = new THREE.Mesh(p.geometry, mats[i]);
    mesh.scale.set(1, s.model.sy ?? 1, s.model.sz ?? 1);
    mesh.castShadow = true;
    group.add(mesh);
  });
  return {
    group,
    swim,
    materials: mats,
    dispose() {
      for (const m of mats) m.dispose();
    },
  };
}
