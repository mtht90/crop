// base64 テキストに詰めたバイナリ（.glb.txt / .hdr.txt）を ArrayBuffer に戻す
// （Artifact では .glb/.hdr をそのまま配信できないため。tools/pack_b64.py 参照）
export async function loadB64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const s = (await res.text()).trim();
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(s).buffer;
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// GLTFLoader で base64 化した GLB を読む。外部テクスチャは url と同じフォルダから
export async function loadGLTFB64(loader, url) {
  const buf = await loadB64(url);
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise((res, rej) => loader.parse(buf, dir, res, rej));
}
