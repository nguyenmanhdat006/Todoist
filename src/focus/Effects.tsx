import { useEffect, useRef } from 'react';
import type { Effect } from './store';

interface P {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  ph: number;
}

/** Hiệu ứng nền nhẹ vẽ bằng canvas: đom đóm, sao, mưa, bong bóng, tuyết */
export function Effects({ kind, color }: { kind: Effect; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || kind === 'off') return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const count = kind === 'rain' ? 140 : kind === 'stars' ? 110 : kind === 'snow' ? 90 : kind === 'bubbles' ? 28 : 55;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const make = (init: boolean): P => {
      const p: P = { x: rnd(0, w), y: init ? rnd(0, h) : -10, r: 1, vx: 0, vy: 0, a: 1, ph: rnd(0, 6.28) };
      if (kind === 'rain') Object.assign(p, { r: rnd(8, 18), vy: rnd(10, 18), vx: -1.5, a: rnd(0.15, 0.4) });
      else if (kind === 'snow') Object.assign(p, { r: rnd(1.2, 3.4), vy: rnd(0.4, 1.2), vx: rnd(-0.3, 0.3), a: rnd(0.4, 0.9) });
      else if (kind === 'bubbles') Object.assign(p, { y: init ? rnd(0, h) : h + 20, r: rnd(6, 22), vy: -rnd(0.3, 0.9), vx: rnd(-0.2, 0.2), a: rnd(0.15, 0.35) });
      else if (kind === 'stars') Object.assign(p, { y: rnd(0, h), r: rnd(0.4, 1.6), vy: 0, a: rnd(0.3, 1) });
      else Object.assign(p, { y: init ? rnd(0, h) : h + 10, r: rnd(1, 3), vy: -rnd(0.1, 0.5), vx: rnd(-0.2, 0.2), a: rnd(0.3, 0.8) });
      return p;
    };
    const ps = Array.from({ length: count }, () => make(true));
    let t = 0;

    const frame = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx;
        p.y += p.vy;
        if (kind === 'motes' || kind === 'snow') p.x += Math.sin(t + p.ph) * 0.3;
        if (p.y > h + 24 || p.y < -30 || p.x < -20 || p.x > w + 20) {
          ps[i] = make(false);
          if (kind === 'rain') ps[i].x = rnd(0, w + 60);
          continue;
        }
        ctx.globalAlpha = kind === 'stars' ? p.a * (0.55 + 0.45 * Math.sin(t * 1.6 + p.ph)) : p.a;
        if (kind === 'rain') {
          ctx.strokeStyle = '#cfe3ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 1.2, p.y + p.r);
          ctx.stroke();
        } else if (kind === 'bubbles') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.283);
          ctx.stroke();
        } else {
          ctx.fillStyle = kind === 'motes' ? color : '#fff';
          if (kind === 'motes') {
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, 6.283);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, w, h);
    };
  }, [kind, color]);

  return <canvas ref={ref} className="fp-fx" aria-hidden="true" />;
}
