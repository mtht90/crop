// Weather / atmosphere drawn on a canvas over the background.
import { useEffect, useRef } from 'react';
import type { Weather as W } from './types';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  ph: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function Weather({ kind }: { kind: W }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || kind === 'none') return;
    const ctx = c.getContext('2d')!;
    let w = 0;
    let h = 0;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.width = Math.max(1, Math.floor(r.width * dpr));
      h = c.height = Math.max(1, Math.floor(r.height * dpr));
    };
    fit();
    window.addEventListener('resize', fit);
    const count = { rain: 240, storm: 340, snow: 150, embers: 90, ash: 90, petals: 50, stars: 130, fog: 7, motes: 55 }[kind];
    const make = (spread = true): P => {
      const base: P = { x: rnd(0, w), y: spread ? rnd(0, h) : -20, vx: 0, vy: 0, r: 1, a: 1, ph: rnd(0, 6.28) };
      switch (kind) {
        case 'rain':
        case 'storm':
          return { ...base, vx: -w * 0.0009 * (kind === 'storm' ? 2 : 1), vy: h * rnd(0.011, 0.018), r: rnd(0.6, 1.3), a: rnd(0.25, 0.6) };
        case 'snow':
          return { ...base, vx: rnd(-0.0003, 0.0003) * w, vy: h * rnd(0.0012, 0.0035), r: rnd(1.2, 3.6) * (w / 1280), a: rnd(0.5, 0.95) };
        case 'embers':
          return { ...base, y: spread ? rnd(0, h) : h + 10, vx: rnd(-0.0004, 0.0006) * w, vy: -h * rnd(0.0015, 0.0045), r: rnd(1, 3.2) * (w / 1280), a: rnd(0.4, 1) };
        case 'ash':
          return { ...base, vx: rnd(-0.0004, 0.0003) * w, vy: h * rnd(0.0008, 0.0022), r: rnd(1, 2.8) * (w / 1280), a: rnd(0.25, 0.6) };
        case 'petals':
          return { ...base, vx: rnd(0.0005, 0.0014) * w, vy: h * rnd(0.001, 0.0024), r: rnd(3, 6) * (w / 1280), a: rnd(0.6, 0.95) };
        case 'stars':
          return { ...base, y: rnd(0, h * 0.7), r: rnd(0.5, 1.8) * (w / 1280), a: rnd(0.3, 1) };
        case 'fog':
          return { ...base, x: rnd(-0.2, 1.2) * w, y: rnd(0.3, 1) * h, vx: rnd(-0.00025, 0.0004) * w, r: rnd(0.25, 0.5) * w, a: rnd(0.06, 0.14) };
        default:
          return { ...base, vx: rnd(-0.0002, 0.0002) * w, vy: -h * rnd(0.0003, 0.0012), r: rnd(1, 2.6) * (w / 1280), a: rnd(0.3, 0.8) };
      }
    };
    const ps: P[] = Array.from({ length: count }, () => make(true));
    let bolt = 0;
    let nextBolt = performance.now() + rnd(2500, 6000);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(2.5, (now - last) / 16.7);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        p.ph += 0.03 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (kind === 'snow' || kind === 'petals' || kind === 'ash') p.x += Math.sin(p.ph) * 0.4 * dt * (w / 1280);
        if (kind === 'embers' || kind === 'motes') p.x += Math.sin(p.ph * 1.3) * 0.25 * dt * (w / 1280);
        const out = p.y > h + 30 || p.y < -40 || p.x < -p.r * 2 - 40 || p.x > w + 40;
        if (kind !== 'stars' && kind !== 'fog' && out) {
          ps[k] = make(false);
          if (kind === 'embers' || kind === 'motes') ps[k].y = h + 10;
          if (kind === 'rain' || kind === 'storm' || kind === 'snow' || kind === 'ash' || kind === 'petals') ps[k].x = rnd(-0.1, 1.1) * w;
          continue;
        }
        if (kind === 'fog' && (p.x > w + p.r || p.x < -p.r * 1.5)) p.vx *= -1;
        switch (kind) {
          case 'rain':
          case 'storm':
            ctx.strokeStyle = `rgba(200,220,255,${p.a})`;
            ctx.lineWidth = p.r;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 2.2, p.y - p.vy * 2.2);
            ctx.stroke();
            break;
          case 'snow':
            ctx.fillStyle = `rgba(255,255,255,${p.a})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.283);
            ctx.fill();
            break;
          case 'ash':
            ctx.fillStyle = `rgba(190,190,200,${p.a})`;
            ctx.fillRect(p.x, p.y, p.r * 1.6, p.r);
            break;
          case 'petals':
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.ph);
            ctx.fillStyle = `rgba(255,190,215,${p.a})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.283);
            ctx.fill();
            ctx.restore();
            break;
          case 'embers':
          case 'motes': {
            const tw = 0.6 + Math.sin(p.ph * 3) * 0.4;
            const col = kind === 'embers' ? '255,150,60' : '255,236,170';
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
            g.addColorStop(0, `rgba(${col},${p.a * tw})`);
            g.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 4, 0, 6.283);
            ctx.fill();
            break;
          }
          case 'stars': {
            const tw = 0.5 + Math.sin(p.ph * 2) * 0.5;
            ctx.fillStyle = `rgba(255,255,240,${p.a * tw})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.283);
            ctx.fill();
            break;
          }
          case 'fog': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, `rgba(215,225,240,${p.a})`);
            g.addColorStop(1, 'rgba(215,225,240,0)');
            ctx.fillStyle = g;
            ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
            break;
          }
        }
      }
      if (kind === 'storm') {
        if (now > nextBolt) {
          bolt = 1;
          nextBolt = now + rnd(3000, 8000);
        }
        if (bolt > 0) {
          ctx.fillStyle = `rgba(220,230,255,${bolt * 0.5})`;
          ctx.fillRect(0, 0, w, h);
          bolt = Math.max(0, bolt - 0.045 * dt);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [kind]);
  return <canvas ref={ref} className={`story-weather ${kind}`} />;
}
