import * as THREE from 'three';

export const JP_FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif';

/** キャンバスに描いた文字をテクスチャ化する (看板・値札・レジ表示) */
export class CanvasTex {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 文字幅に合わせてフォントを縮める */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${JP_FONT}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 8);
}

/** 看板メッシュ (両面ではなく片面, 発光あり) */
export function signMesh(w: number, h: number, tex: CanvasTex, emissive = 0.6): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: tex.texture, emissive: new THREE.Color('#ffffff'), emissiveMap: tex.texture, emissiveIntensity: emissive, roughness: 0.6, transparent: true,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}
