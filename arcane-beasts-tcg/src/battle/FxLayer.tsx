import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import fxMeta from '../assets/fx.json';
import { asset, TYPE_COLOR } from '../lib/assets';
import { TYPE_JP } from '../engine/cards';
import { useFx, type Floater } from './fx';
import { particles } from './particles';
import { Icon } from '../ui/Icon';

const META = fxMeta as Record<string, { w: number; h: number; frames: number }>;

function SpriteFx({ f }: { f: Floater }) {
  const ref = useRef<HTMLDivElement>(null);
  const m = META[f.sprite!];
  const sc = f.scale ?? 1;
  const w = m.w * sc;
  const h = m.h * sc;
  useEffect(() => {
    const el = ref.current;
    if (!el || !m) return;
    el.animate([{ backgroundPosition: '0px 0px' }, { backgroundPosition: `${-w * m.frames}px 0px` }], {
      duration: f.duration,
      easing: `steps(${m.frames})`,
      fill: 'forwards',
    });
  }, [f.duration, m, w]);
  if (!m) return null;
  return (
    <div
      ref={ref}
      className="fx-sprite"
      style={{
        left: f.x - w / 2,
        top: f.y - h / 2,
        width: w,
        height: h,
        backgroundImage: `url(${asset(`fx/${f.sprite}.png`)})`,
        backgroundSize: `${w * m.frames}px ${h}px`,
      }}
    />
  );
}

function FloaterView({ f }: { f: Floater }) {
  if (f.kind === 'sprite') return <SpriteFx f={f} />;
  const common = { left: f.x, top: f.y };
  const dur = f.duration / 1000;
  switch (f.kind) {
    case 'damage':
      return (
        <motion.div
          className="fx-anchor"
          style={common}
          initial={{ scale: 0.2, y: 0, opacity: 0 }}
          animate={{ scale: [0.2, 1.5, 1], y: [0, -30, -50], opacity: [0, 1, 1, 0] }}
          transition={{ duration: dur, times: [0, 0.2, 1], ease: 'easeOut' }}
        >
          <div className={`fx-dmg ${f.big ? 'big' : ''}`}>-{f.text}</div>
        </motion.div>
      );
    case 'heal':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ y: 0, opacity: 0 }} animate={{ y: -60, opacity: [0, 1, 1, 0] }} transition={{ duration: dur }}>
          <div className="fx-heal">{f.text}</div>
        </motion.div>
      );
    case 'weak':
    case 'resist':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ scale: 3, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: [0, 1, 1, 0], rotate: -6 }} transition={{ duration: dur, times: [0, 0.15, 0.8, 1] }}>
          <div className={`fx-weak ${f.kind}`}>{f.text}</div>
        </motion.div>
      );
    case 'callout':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: [0.5, 1.2, 1], opacity: [0, 1, 1, 0], y: -20 }} transition={{ duration: dur }}>
          <div className={`fx-callout ${f.sub}`}>{f.text}</div>
        </motion.div>
      );
    case 'cond':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.2, 1], opacity: [0, 1, 1, 0], y: -24 }} transition={{ duration: dur }}>
          <div className={`fx-cond cond-${f.sub}`}>{f.text}！</div>
        </motion.div>
      );
    case 'ko':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ scale: 2.5, opacity: 0 }} animate={{ scale: 1, opacity: [0, 1, 1, 0] }} transition={{ duration: dur, times: [0, 0.15, 0.8, 1] }}>
          <div className="fx-ko">{f.text}</div>
        </motion.div>
      );
    case 'ability':
      return (
        <motion.div className="fx-anchor" style={common} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: [0, 1, 1, 0] }} transition={{ duration: dur }}>
          <div className="fx-ability">
            <span>特性</span>
            {f.text}
          </div>
        </motion.div>
      );
    default:
      return null;
  }
}

export function FxLayer() {
  const floaters = useFx((s) => s.floaters);
  const banner = useFx((s) => s.banner);
  const toast = useFx((s) => s.toast);
  const coin = useFx((s) => s.coin);
  const attack = useFx((s) => s.attack);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    particles.attach(canvas.current);
    const onR = () => particles.resize();
    window.addEventListener('resize', onR);
    return () => {
      window.removeEventListener('resize', onR);
      particles.attach(null);
    };
  }, []);

  return (
    <div className="fx-layer">
      <canvas ref={canvas} className="fx-canvas" />
      {floaters.map((f) => (
        <FloaterView key={f.id} f={f} />
      ))}

      <AnimatePresence>
        {attack && (
          <motion.div
            key={attack.id}
            className={`fx-attack side-${attack.side}`}
            style={{ ['--ta' as string]: TYPE_COLOR[attack.type].a, ['--tb' as string]: TYPE_COLOR[attack.type].b }}
            initial={{ x: attack.side === 0 ? '-60%' : '60%', opacity: 0, skewX: -12 }}
            animate={{ x: 0, opacity: 1, skewX: -12 }}
            exit={{ x: attack.side === 0 ? '40%' : '-40%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <span className="fx-attack-type">{TYPE_JP[attack.type]}</span>
            <span className="fx-attack-name">{attack.name}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {banner && (
          <motion.div key={banner.id} className={`fx-banner ${banner.kind}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <motion.div className="fx-banner-band" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={{ duration: 0.25 }} />
            <motion.div className="fx-banner-text" initial={{ x: '-40%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '40%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
              {banner.text}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {coin && (
          <motion.div key={coin.id} className="fx-coin-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {coin.label && <div className="fx-coin-label">{coin.label}</div>}
            <motion.div
              className="fx-coin"
              initial={{ rotateY: 0, y: 0 }}
              animate={{ rotateY: 1800 + (coin.heads ? 0 : 180), y: [0, -120, 0] }}
              transition={{ duration: 0.95, ease: [0.2, 0.7, 0.3, 1], y: { duration: 0.95, times: [0, 0.45, 1], ease: 'easeOut' } }}
            >
              <div className="coin-face heads">
                <Icon name="crown" size="60%" />
              </div>
              <div className="coin-face tails">
                <Icon name="skull" size="55%" />
              </div>
            </motion.div>
            <motion.div className={`fx-coin-result ${coin.heads ? 'heads' : 'tails'}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.95 }}>
              {coin.heads ? 'オモテ' : 'ウラ'}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="fx-toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
