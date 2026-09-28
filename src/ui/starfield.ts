/** 背景の星空 (軽量な canvas アニメーション) */
export function startStarfield(canvas: HTMLCanvasElement, lowFx: () => boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  type Star = { x: number; y: number; z: number; tw: number };
  let stars: Star[] = [];
  let w = 0;
  let hgt = 0;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    hgt = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.floor((w * hgt) / 5000);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * hgt, z: Math.random(), tw: Math.random() * Math.PI * 2 }));
  };
  resize();
  window.addEventListener('resize', resize);
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, hgt);
      const low = lowFx();
      for (const s of stars) {
        if (!low) {
          s.x -= (4 + s.z * 18) * dt;
          if (s.x < -2) s.x = w + 2;
          s.tw += dt * (1 + s.z * 2);
        }
        const a = 0.35 + 0.45 * s.z + (low ? 0 : 0.2 * Math.sin(s.tw));
        ctx.fillStyle = `rgba(220,230,255,${a.toFixed(3)})`;
        const r = 0.4 + s.z * 1.3;
        ctx.fillRect(s.x, s.y, r, r);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
