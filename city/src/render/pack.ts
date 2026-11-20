// scripts/import-assets.mjs が作る素材パック (models.pack) の読み込み
const PACK_MAGIC = 'CCPK';
const PACK_KEY = 'city-conglomerate';

export interface PackEntry {
  name: string;
  offset: number;
  length: number;
}

/** アーティファクト版はパックを base64 の .txt で置く（バイナリのファイルを置けないため） */
const TEXT_PACKS = !!import.meta.env.VITE_ARTIFACT;

export async function loadPack(url: string): Promise<Map<string, ArrayBuffer>> {
  const res = await fetch(TEXT_PACKS ? url + '.txt' : url);
  if (!res.ok) throw new Error(`素材パックを読み込めません: ${res.status}`);
  let buf: Uint8Array;
  if (TEXT_PACKS) {
    const bin = atob((await res.text()).trim());
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  } else {
    buf = new Uint8Array(await res.arrayBuffer());
  }
  const magic = String.fromCharCode(...buf.subarray(0, 4));
  if (magic !== PACK_MAGIC) throw new Error('素材パックの形式が違います');
  const headerLen = new DataView(buf.buffer).getUint32(4, true);
  const body = buf.subarray(8);
  const key = new TextEncoder().encode(PACK_KEY);
  for (let i = 0; i < body.length; i++) body[i] ^= key[i % key.length] ^ (i & 0xff);
  const index = JSON.parse(new TextDecoder().decode(body.subarray(0, headerLen))) as PackEntry[];
  const out = new Map<string, ArrayBuffer>();
  for (const e of index) {
    const start = headerLen + e.offset;
    out.set(e.name, body.slice(start, start + e.length).buffer);
  }
  return out;
}
