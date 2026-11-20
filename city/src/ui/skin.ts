// Bliss GUI のアトラス（ui.pack）を読み、各画像を CSS 変数（--ui-button など）に入れる
import { loadPack } from '../render/pack';

export async function loadSkin(): Promise<boolean> {
  try {
    const pack = await loadPack(`${import.meta.env.BASE_URL}assets/ui.pack`);
    const png = pack.get('atlas.png');
    const json = pack.get('atlas.json');
    if (!png || !json) return false;
    const rects = JSON.parse(new TextDecoder().decode(json)) as Record<string, { x: number; y: number; w: number; h: number }>;
    const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const root = document.documentElement;
    for (const [name, r] of Object.entries(rects)) {
      const c = document.createElement('canvas');
      c.width = r.w;
      c.height = r.h;
      c.getContext('2d')!.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
      root.style.setProperty(`--ui-${name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, `url(${URL.createObjectURL(blob)})`);
    }
    root.classList.add('skin-ready');
    return true;
  } catch {
    return false;
  }
}
