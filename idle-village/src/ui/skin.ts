// Tiny Swords のUIパーツ(隙間のある9分割画像)を、CSSの border-image で使える1枚絵に組み直す。
// そのまま使える画像(小さなボタン・ゲージの中身・カーソル)は URL をCSS変数にする。
import { BASE } from '../render/assets';

const UI = BASE + 'UI Elements/UI Elements/';
const abs = (p: string) => new URL(p, location.href).href;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

/** 3x3に分かれたパーツを詰めて1枚にする */
export function pack9(im: HTMLImageElement, cols: [number, number][], rows: [number, number][]): HTMLCanvasElement {
  const W = cols.reduce((a, c) => a + c[1], 0);
  const H = rows.reduce((a, r) => a + r[1], 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  let dy = 0;
  for (const [ry, rh] of rows) {
    let dx = 0;
    for (const [cx, cw] of cols) {
      ctx.drawImage(im, cx, ry, cw, rh, dx, dy, cw, rh);
      dx += cw;
    }
    dy += rh;
  }
  return c;
}

export const S320: [number, number][] = [
  [0, 64],
  [128, 64],
  [256, 64],
];
export const S448: [number, number][] = [
  [0, 128],
  [192, 64],
  [320, 128],
];

export async function applySkin() {
  const root = document.documentElement.style;
  const set = (name: string, url: string) => root.setProperty(name, `url("${url}")`);
  const jobs: Promise<void>[] = [];
  const job = (src: string, fn: (im: HTMLImageElement) => void) =>
    jobs.push(
      loadImg(UI + src)
        .then(fn)
        .catch(() => undefined),
    );
  job('Papers/RegularPaper.png', (im) => set('--paper', pack9(im, S320, S320).toDataURL()));
  job('Papers/SpecialPaper.png', (im) => set('--paper-special', pack9(im, S320, S320).toDataURL()));
  job('Wood Table/WoodTable.png', (im) => set('--wood', pack9(im, S448, S448).toDataURL()));
  job('Wood Table/WoodTable_Slots.png', (im) => set('--wood-slot', im.src));
  job('Banners/Banner.png', (im) => set('--banner', pack9(im, S448, S448).toDataURL()));
  job('Banners/Banner_Slots.png', (im) => set('--banner-slot', im.src));
  job('Buttons/BigBlueButton_Regular.png', (im) => set('--btn-blue', pack9(im, S320, S320).toDataURL()));
  job('Buttons/BigBlueButton_Pressed.png', (im) => set('--btn-blue-p', pack9(im, S320, S320).toDataURL()));
  job('Buttons/BigRedButton_Regular.png', (im) => set('--btn-red', pack9(im, S320, S320).toDataURL()));
  job('Buttons/BigRedButton_Pressed.png', (im) => set('--btn-red-p', pack9(im, S320, S320).toDataURL()));
  job('Ribbons/BigRibbons.png', (im) => {
    ['blue', 'red', 'yellow', 'purple', 'black'].forEach((n, i) => set(`--ribbon-${n}`, pack9(im, S448, [[i * 128, 128]]).toDataURL()));
  });
  job('Bars/BigBar_Base.png', (im) => set('--bar', pack9(im, S320, [[0, 64]]).toDataURL()));
  job('Bars/SmallBar_Base.png', (im) => set('--sbar', pack9(im, S320, [[0, 64]]).toDataURL()));
  await Promise.all(jobs);
  // そのまま使う画像
  const img: Record<string, string> = {
    '--bar-fill': 'Bars/BigBar_Fill.png',
    '--tiny-blue': 'Buttons/TinySquareBlueButton.png',
    '--tiny-red': 'Buttons/TinySquareRedButton.png',
    '--tiny-round-blue': 'Buttons/TinyRoundBlueButton.png',
    '--round-red': 'Buttons/SmallRedRoundButton_Regular.png',
    '--round-red-p': 'Buttons/SmallRedRoundButton_Pressed.png',
    '--round-blue': 'Buttons/SmallBlueRoundButton_Regular.png',
    '--sq-blue': 'Buttons/SmallBlueSquareButton_Regular.png',
    '--sq-blue-p': 'Buttons/SmallBlueSquareButton_Pressed.png',
    '--icon-x': 'Icons/Icon_09.png',
    '--icon-check': 'Icons/Icon_07.png',
  };
  for (const [k, p] of Object.entries(img)) set(k, abs(UI + p));
  const cursor = abs(UI + 'Cursors/Cursor_01.png');
  const pointer = abs(UI + 'Cursors/Cursor_02.png');
  root.setProperty('--cursor', `url("${cursor}") 22 17, auto`);
  root.setProperty('--cursor-pointer', `url("${pointer}") 22 17, pointer`);
}

export const icon = (n: number) => `${UI}Icons/Icon_${String(n).padStart(2, '0')}.png`;
export const avatar = (n: number) => `${UI}Human Avatars/Avatars_${String(n).padStart(2, '0')}.png`;
export const resIcon = (k: 'wood' | 'meat' | 'gold') =>
  BASE +
  {
    wood: 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png',
    meat: 'Terrain/Resources/Meat/Meat Resource/Meat Resource.png',
    gold: 'UI Elements/UI Elements/Icons/Icon_03.png',
  }[k];
export const buildingImg = (kind: string, variant = 1) => {
  const f = kind === 'house' ? `House${variant}` : kind[0].toUpperCase() + kind.slice(1);
  return `${BASE}Buildings/Blue Buildings/${f}.png`;
};
