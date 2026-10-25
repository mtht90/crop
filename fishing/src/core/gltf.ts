import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 変換済みモデル（データ埋め込みの glTF JSON）を読み込む。
 * three.js 標準の読み込みは埋め込みデータ（data: URL）を fetch で読むため、
 * 埋め込み表示（アーティファクト）では通信制限で失敗する。
 * そこでバイナリは自前で base64 から復元して GLB に組み立て、
 * 画像は <img> で読む TextureLoader に切り替えて解析する。
 */
const loader = new GLTFLoader();
loader.register((parser) => {
  (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: 'img_texture_loader' };
});

function decodeBase64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

/** 埋め込みバッファを持つ glTF JSON を GLB に組み立てる */
function toGlb(json: { buffers?: { uri?: string; byteLength: number }[] }): ArrayBuffer {
  let bin = new Uint8Array(0);
  const buf = json.buffers?.[0];
  if (buf?.uri?.startsWith('data:')) {
    bin = decodeBase64(buf.uri.slice(buf.uri.indexOf(',') + 1));
    delete buf.uri;
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const binLen = pad4(bin.length);
  const total = 12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  if (bin.length) {
    const o = 20 + jsonLen;
    view.setUint32(o, binLen, true);
    view.setUint32(o + 4, 0x004e4942, true); // 'BIN'
    bytes.set(bin, o + 8);
  }
  return out;
}

export async function loadGltf(url: string): Promise<GLTF> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const json = await res.json();
  const glb = toGlb(json);
  return await loader.parseAsync(glb, url.slice(0, url.lastIndexOf('/') + 1));
}
