// Browser side of custom avatars: pick a picture, crop the middle to a square,
// shrink it and encode it small enough for the server.
import { AVATAR_MAX_CHARS, validAvatar } from './avatar';

const SIZE = 128;

/** a chosen image file → the data URL to send. Rejects with a short Japanese message. */
export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
  if (file.size > 12 * 1024 * 1024) throw new Error('画像が大きすぎます（12MBまで）');
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createBitmap(file);
  } catch {
    throw new Error('この画像は読み込めませんでした');
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('この端末では画像を加工できません');
  g.fillStyle = '#111a3a';
  g.fillRect(0, 0, SIZE, SIZE);
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  if ('close' in bmp) bmp.close();
  // jpeg works everywhere (Safari cannot encode webp); lower the quality until it is small enough
  for (const q of [0.86, 0.74, 0.6, 0.46, 0.32]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= AVATAR_MAX_CHARS && validAvatar(url)) return url;
  }
  throw new Error('画像を小さくできませんでした。別の画像を選んでください');
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
