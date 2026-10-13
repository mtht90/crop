// 埋め込み glTF(JSON) を、data: URL を fetch せずに読み込む。
// アーティファクトの配信環境では data: への fetch がセキュリティポリシーで拒否されるため、
// base64 を自前で復号して GLB に組み直し、GLTFLoader.parse に渡す。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const enc = new TextEncoder();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toGLB(json) {
  let bin = new Uint8Array(0);
  const buf = json.buffers && json.buffers[0];
  if (buf && buf.uri && buf.uri.startsWith('data:')) {
    bin = b64ToBytes(buf.uri.slice(buf.uri.indexOf(',') + 1));
    delete buf.uri;
  }
  let js = enc.encode(JSON.stringify(json));
  const jsPad = (4 - (js.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + js.length + jsPad + (bin.length ? 8 + bin.length + binPad : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let o = 12;
  dv.setUint32(o, js.length + jsPad, true); dv.setUint32(o + 4, 0x4e4f534a, true); // JSON
  out.set(js, o + 8);
  out.fill(0x20, o + 8 + js.length, o + 8 + js.length + jsPad);
  o += 8 + js.length + jsPad;
  if (bin.length) {
    dv.setUint32(o, bin.length + binPad, true); dv.setUint32(o + 4, 0x004e4942, true); // BIN
    out.set(bin, o + 8);
  }
  return out.buffer;
}

export async function loadGLTF(url) {
  // 応答が返らないまま読み込みが止まらないよう、時間切れで原因のファイル名を出して失敗させる
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  let json;
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    json = await res.json();
  } catch (e) {
    throw new Error(`${url} を読み込めません（${e.name === 'AbortError' ? '時間切れ' : e.message}）`);
  } finally {
    clearTimeout(timer);
  }
  // GLTFLoader は createImageBitmap があると埋め込み画像を blob: へ fetch する。
  // fetch は connect-src で拒否されうるので、<img> 経由の TextureLoader を使わせる
  const cib = self.createImageBitmap;
  self.createImageBitmap = undefined;
  try {
    return await loader.parseAsync(toGLB(json), '');
  } finally {
    self.createImageBitmap = cib;
  }
}
