// Poly Haven の HDRI を、照明用（1k .hdr のまま）と背景用（トーンマップ済み JPEG）に分ける
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';

/** Radiance .hdr（RGBE・新RLE）を Float32 RGB に展開する */
function readHdr(buf) {
  let pos = 0;
  const line = () => {
    let s = '';
    while (buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]);
    pos++;
    return s;
  };
  for (let l = line(); l !== ''; l = line());
  const [, h, , w] = line().split(' ');
  const W = +w, H = +h;
  const out = new Float32Array(W * H * 3);
  const scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[pos] !== 2 || buf[pos + 1] !== 2) throw new Error('unsupported hdr');
    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[pos++];
        if (n > 128) {
          n -= 128;
          const v = buf[pos++];
          while (n--) scan[x++ * 4 + c] = v;
        } else while (n--) scan[x++ * 4 + c] = buf[pos++];
      }
    }
    for (let x = 0; x < W; x++) {
      const e = scan[x * 4 + 3];
      const f = e ? Math.pow(2, e - 136) : 0;
      const o = (y * W + x) * 3;
      out[o] = scan[x * 4] * f;
      out[o + 1] = scan[x * 4 + 1] * f;
      out[o + 2] = scan[x * 4 + 2] * f;
    }
  }
  return { W, H, data: out };
}

const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export async function processSky(cache, out) {
  fs.mkdirSync(path.join(out, 'sky'), { recursive: true });
  const { W, H, data } = readHdr(fs.readFileSync(path.join(cache, 'polyhaven', 'sky_2k.hdr')));
  const px = Buffer.alloc(W * H * 4);
  const exposure = 0.95;
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(srgb(aces(data[i * 3 + c] * exposure)) * 255);
    px[i * 4 + 3] = 255;
  }
  const jpg = jpeg.encode({ data: px, width: W, height: H }, 86);
  fs.writeFileSync(path.join(out, 'sky', 'sky_2k.jpg'), jpg.data);
  console.log('  → sky_2k.jpg', `${(jpg.data.length / 1024).toFixed(0)}KB`);
}
