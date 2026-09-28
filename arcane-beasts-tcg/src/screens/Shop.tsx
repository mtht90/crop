// ============================================================================
// Pack opening, modelled on the TCG Pocket flow:
//   booster select → pick a pack → trace the top edge to tear it → cards rise
//   out of the pack → swipe through the stack (rarest last; ★ cards arrive
//   face-down and turn over on tap) → results
// Effects are light-based (bloom, rings, glints); motion is transform/opacity.
// ============================================================================
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardDef, Rarity, SetCode } from '../engine/types';
import { byName, SET_INFO } from '../engine/cards';
import { BOOSTERS, MIRROR_CHANCE, openPack, openPremium, PACK_PRICE, PACK_TABLE, premiumBooster, PREMIUM_PRICE, PREMIUM_TABLE, RARITY_ORDER, useStore, type Booster } from '../state/store';
import { currentPickup, fmtRemain } from '../state/progress';
import { CardBack, CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from '../battle/particles';
import { BoosterPack, TEAR_Y } from './pack/BoosterPack';
import './pack/pack.css';

type Phase = 'choose' | 'tear' | 'reveal' | 'results';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** ☆ rarities arrive face-down and turn over on tap */
const isStar = (r: Rarity) => RARITY_ORDER[r] >= 5;
const RARE_COLOR: Partial<Record<Rarity, string>> = { UR: '#ffd27a', SAR: '#ffc9ee', SR: '#bfe6ff', S: '#dfe6ff', AR: '#fff1c4', CHR: '#fff1c4', RRR: '#ffd9b0' };
const rareColor = (r: Rarity) => RARE_COLOR[r] ?? '#ffffff';
const priceOf = (b: Booster) => (b.premium ? PREMIUM_PRICE : PACK_PRICE);
type Tab = SetCode | 'premium';
const TABS: [Tab, string][] = [
  ['AB1', `第1弾 ${SET_INFO.AB1.name}`],
  ['AB2', `第2弾 ${SET_INFO.AB2.name}`],
  ['premium', 'プレミアム'],
];

function useUnit() {
  const calc = () => Math.min(window.innerWidth / 100, (window.innerHeight * 1.7778) / 100);
  const [u, setU] = useState(calc);
  useEffect(() => {
    const on = () => setU(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return u;
}

/** Shows a hint only after the viewer has been idle for a moment. */
function useIdleHint(key: unknown, delay = 1600) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [key, delay]);
  return [show, () => setShow(false)] as const;
}

function Backdrop({ hue, dim = 0 }: { hue: string; dim?: number }) {
  const bokeh = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        left: `${(i * 23 + 7) % 100}%`,
        top: `${(i * 37 + 20) % 90}%`,
        size: `${10 + ((i * 7) % 14)}vmin`,
        dur: `${14 + ((i * 5) % 10)}s`,
        delay: `${-i * 2.3}s`,
      })),
    [],
  );
  return (
    <>
      <div className="po-backdrop" style={{ ['--hue' as string]: hue }} />
      <div className="po-glow" style={{ ['--hue' as string]: hue }} />
      <div className="po-bokeh">
        {bokeh.map((b, i) => (
          <i key={i} style={{ left: b.left, top: b.top, width: b.size, height: b.size, animationDuration: b.dur, animationDelay: b.delay }} />
        ))}
      </div>
      <motion.div className="po-dim" initial={false} animate={{ opacity: dim }} transition={{ duration: 0.6, ease: EASE_IN_OUT }} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shop screen (booster select)
// ---------------------------------------------------------------------------
interface OpeningState {
  booster: Booster;
  cards: CardDef[];
  god: boolean;
  fresh: Set<string>;
  /** indices of cards that became shards (11th copy or later) */
  shards: Set<number>;
  key: number;
}

export function Shop() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const addCards = useStore((s) => s.addCards);
  const [sel, setSel] = useState(0);
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [odds, setOdds] = useState(false);
  const [kind, setKind] = useState<Tab>(() => (/[?&]premium/.test(location.search) ? 'premium' : 'AB2'));
  const list = kind === 'premium' ? [] : BOOSTERS.filter((x) => x.set === kind);
  const u = useUnit();
  useEffect(() => playMusic('shop'), []);
  const premium = useMemo(() => premiumBooster(), []);
  const pickup = useMemo(() => currentPickup(), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const b = kind === 'premium' ? premium : list[Math.min(sel, list.length - 1)];
  const price = priceOf(b);

  const buy = useCallback(
    (booster: Booster) => {
      const cost = priceOf(booster);
      if (useStore.getState().save.coins < cost) {
        sfx('miss-2', 0.5);
        return false;
      }
      const res = booster.premium ? openPremium() : openPack(booster);
      const col = useStore.getState().save.collection;
      const fresh = new Set(res.cards.filter((c) => !(col[c.id] ?? 0)).map((c) => c.id));
      update((s) => {
        s.coins -= cost;
        s.packsOpened++;
      });
      useStore.getState().recordPack(!!booster.premium);
      const flags = addCards(res.cards.map((c) => c.id));
      const shards = new Set(flags.flatMap((f, i) => (f ? [i] : [])));
      setOpening({ booster, cards: res.cards, god: res.god, fresh, shards, key: Date.now() });
      return true;
    },
    [update, addCards],
  );

  const shift = (d: number) => {
    foley.slide();
    setSel((sel + d + list.length) % list.length);
  };

  const TYPE_JP: Record<string, string> = { fire: '炎', water: '水', grass: '草', lightning: '雷', psychic: '超', fighting: '闘', dark: '悪', colorless: '無色' };

  return (
    <div className="screen shop2">
      <Backdrop hue={b.hue} />
      <div className="stage">
        <TopBar
          title="パック開封"
          right={
            <>
            <div className="shop-kind">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  className={`${kind === k ? 'on' : ''} ${k}`}
                  onClick={() => {
                    if (kind === k) return;
                    foley.slide();
                    setKind(k);
                    setSel(0);
                  }}
                >
                  {label}
                  {k === 'AB2' && <i className="new">NEW</i>}
                  {k === 'premium' && pickup && <i>PICK UP</i>}
                </button>
              ))}
            </div>
            <button className="textbtn" onClick={() => setOdds(true)}>
              提供割合
            </button>
            </>
          }
        />
        {kind !== 'premium' ? (
        <div className="shop2-row" key={kind}>
          {list.map((bo, i) => {
            let d = i - sel;
            if (d > 1) d -= list.length;
            if (d < -1) d += list.length;
            const center = d === 0;
            return (
              <motion.div
                key={bo.id}
                className="shop2-pack"
                initial={false}
                animate={{ x: d * u * 24 - u * 10.5, scale: center ? 1 : 0.7, y: center ? 0 : u * 5.5, rotateY: d * -22, opacity: center ? 1 : 0.45 }}
                transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 1 }}
                style={{ zIndex: center ? 3 : 1 }}
                onClick={() => (center ? buy(bo) : shift(d))}
              >
                <motion.div animate={center ? { y: [0, -u * 0.6, 0] } : { y: 0 }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
                  <BoosterPack booster={bo} tilt={center} still={!center} />
                </motion.div>
              </motion.div>
            );
          })}
          <button className="shop2-arrow l" onClick={() => shift(-1)} aria-label="前のパック">
            ‹
          </button>
          <button className="shop2-arrow r" onClick={() => shift(1)} aria-label="次のパック">
            ›
          </button>
        </div>
        ) : (
          <PremiumView booster={premium} pickup={pickup} now={now} u={u} onBuy={() => buy(premium)} />
        )}
        <div className="shop2-bottom">
          <AnimatePresence mode="wait">
            <motion.div key={b.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} style={{ textAlign: 'center' }}>
              <div className="shop2-name">{b.name}</div>
              <div className="shop2-sub">{b.premium ? '全スロットのレアリティ上昇・5枚目はRRR以上確定' : `${b.types.map((t) => TYPE_JP[t]).join('・')}タイプが出やすい`}</div>
            </motion.div>
          </AnimatePresence>
          <button className={`pill ${b.premium ? 'gold' : ''}`} disabled={save.coins < price} onClick={() => buy(b)}>
            開封する
            <span className="coin">
              <Icon name="coin" /> {price}
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {opening && (
          <Opening
            {...opening}
            key={opening.key}
            onClose={() => setOpening(null)}
            onAgain={() => {
              if (!buy(opening.booster)) setOpening(null);
            }}
          />
        )}
      </AnimatePresence>

      {odds && <OddsModal premium={kind === 'premium'} onClose={() => setOdds(false)} />}
    </div>
  );
}

/** turn cumulative slot tables into "C 75% ／ U 25%" rows */
function oddsRows(table: [Rarity, number][][], labels: string[]): [string, string][] {
  return table.map((t, i) => {
    let prev = 0;
    const parts = t.map(([r, p]) => {
      const pct = Math.round((p - prev) * 1000) / 10;
      prev = p;
      return `${r} ${pct}%`;
    });
    return [labels[i], parts.join(' ／ ')];
  });
}

function OddsModal({ onClose, premium }: { onClose: () => void; premium?: boolean }) {
  const labels = ['1枚目', '2枚目', '3枚目', '4枚目', '5枚目'];
  const rows = oddsRows(premium ? PREMIUM_TABLE : PACK_TABLE, labels);
  return (
    <div className="zoom-back" onClick={onClose}>
      <div className="panel odds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">提供割合{premium ? '（プレミアムパック）' : '（通常パック）'}</div>
        <table className="odds-table">
          <tbody>
            {rows.map(([slot, text]) => (
              <tr key={slot}>
                <th>{slot}</th>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="odds-note">
          {premium
            ? 'すべての弾のカードが出ます。ピックアップ開催中は、ピックアップ対象と同じレアリティが出た場合、その50%がピックアップカードになります。'
            : `3枚目は${Math.round(MIRROR_CHANCE * 100)}%でミラー仕様のカードになります。パックに描かれたタイプのカードは2倍出やすくなります。ごくまれに、5枚すべてがRR以上のパックが出ることがあります。そのパックの弾に存在しないレアリティが出た場合は、1つ下のレアリティになります。`}
        </div>
        <button className="pill ghost" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening overlay
// ---------------------------------------------------------------------------
interface OpeningProps extends Omit<OpeningState, 'key'> {
  onClose: () => void;
  onAgain: () => void;
}

function Opening({ booster, cards, god, fresh, shards, onClose, onAgain }: OpeningProps) {
  const u = useUnit();
  const [phase, setPhase] = useState<Phase>('choose');
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [fx, setFx] = useState<{ id: number; color: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const coins = useStore((s) => s.save.coins);

  useEffect(() => {
    particles.attach(canvas.current);
    const on = () => particles.resize();
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      particles.attach(null);
    };
  }, []);

  const burstAt = useCallback((clientX: number, clientY: number, preset: string, n: number, scale = 1) => {
    const r = root.current?.getBoundingClientRect();
    if (r) particles.burst(clientX - r.left, clientY - r.top, preset, n, scale);
  }, []);

  const top = cards[idx];
  const awaitingFlip = phase === 'reveal' && !!top && isStar(top.rarity) && !revealed.has(idx);
  const dim = phase === 'reveal' ? (awaitingFlip ? 0.45 : 0.15) : phase === 'results' ? 0.1 : 0;

  return (
    <motion.div ref={root} className="po" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE_IN_OUT }}>
      <Backdrop hue={booster.hue} dim={dim} />
      <canvas ref={canvas} className="po-canvas" />

      {/* light shafts behind a face-down rare card */}
      <AnimatePresence>
        {awaitingFlip && (
          <motion.div
            key={`shafts${idx}`}
            className="shafts"
            style={{ ['--rc' as string]: rareColor(top.rarity) }}
            initial={{ opacity: 0, rotate: -8 }}
            animate={{ opacity: 1, rotate: 8 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.8 }, rotate: { duration: 8, ease: 'linear' } }}
          >
            {[-60, -34, -12, 12, 34, 60, 180].map((a, i) => (
              <i key={i} style={{ transform: `rotate(${a}deg)` }} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* flip impact: bloom + shock ring */}
      <AnimatePresence>
        {fx && (
          <motion.div key={fx.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 26 }} initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="flash" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0.85, 0], scale: [0.6, 1, 1.15] }} transition={{ duration: 0.9, times: [0, 0.18, 1], ease: 'easeOut' }} />
            <motion.div
              className="ring"
              style={{ borderColor: fx.color }}
              initial={{ opacity: 0.9, scale: 0.35 }}
              animate={{ opacity: 0, scale: 2.4 }}
              transition={{ duration: 1.1, ease: EASE_OUT }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stage">
        {phase === 'choose' && (
          <Coverflow
            booster={booster}
            god={god}
            u={u}
            onPick={() => {
              sfx('select', 0.45);
              setPhase('tear');
            }}
          />
        )}

        {phase === 'tear' && <TearStage booster={booster} god={god} u={u} cards={cards} burstAt={burstAt} onDone={() => setPhase('reveal')} />}

        {phase === 'reveal' && top && (
          <>
            <div className="stack">
              {cards.map((c, i) => {
                const depth = i - idx;
                if (depth < 1 || depth > 3) return null;
                return (
                  <motion.div
                    key={i}
                    className="sc"
                    initial={false}
                    animate={{ x: depth * u * 0.28, y: depth * u * 0.34, scale: 1 - depth * 0.012 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    style={{ zIndex: 10 - depth }}
                  >
                    <div className="sc-face" style={{ transform: 'none' }}>
                      {isStar(c.rarity) ? <CardBack /> : <CardFace cid={c.id} />}
                    </div>
                  </motion.div>
                );
              })}
              <TopCard
                key={idx}
                card={top}
                u={u}
                first={idx === 0}
                faceDown={isStar(top.rarity) && !revealed.has(idx)}
                burstAt={burstAt}
                onFlipImpact={() => setFx({ id: Date.now(), color: rareColor(top.rarity) })}
                onFlipped={() => setRevealed((s) => new Set(s).add(idx))}
                onGone={() => {
                  setFx(null);
                  if (idx + 1 >= cards.length) setPhase('results');
                  else setIdx(idx + 1);
                }}
              />
            </div>
            <button
              className="textbtn po-skip"
              onClick={() => {
                foley.shuffle();
                setPhase('results');
              }}
            >
              スキップ
            </button>
          </>
        )}

        {phase === 'results' && <Results cards={cards} fresh={fresh} shards={shards} onClose={onClose} onAgain={onAgain} canAgain={coins >= priceOf(booster)} price={priceOf(booster)} u={u} />}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Coverflow
// ---------------------------------------------------------------------------
const CF_COUNT = 9;
const CF_STEP = 12;

function CoverPack({ i, pos, u, booster, god, picked }: { i: number; pos: MotionValue<number>; u: number; booster: Booster; god: boolean; picked: number | null }) {
  const d = useTransform(pos, (p) => i - p);
  const x = useTransform(d, (v) => Math.sign(v) * (Math.min(Math.abs(v), 1) * u * 16 + Math.max(0, Math.abs(v) - 1) * u * 8.5));
  const rotateY = useTransform(d, (v) => Math.max(-1, Math.min(1, v)) * -38);
  const z = useTransform(d, (v) => -Math.min(Math.abs(v), 4) * u * 6);
  const opacity = useTransform(d, (v) => Math.max(0, 1 - Math.max(0, Math.abs(v) - 2.4) * 1.2));
  const zIndex = useTransform(d, (v) => 100 - Math.round(Math.abs(v) * 10));
  const shade = useTransform(d, (v) => Math.min(Math.abs(v), 2) * 0.3);
  const chosen = picked === i;
  return (
    <motion.div className="cf-pack" style={{ x, rotateY, z, opacity, zIndex }} data-i={i}>
      <motion.div
        style={{ transformOrigin: '50% 0%' }}
        animate={picked === null ? { y: 0, scale: 1, opacity: 1 } : chosen ? { y: -u * 0.9, scale: 24 / 21, opacity: 1 } : { y: u * 6, scale: 0.94, opacity: 0 }}
        transition={picked === null ? { duration: 0 } : { duration: chosen ? 0.7 : 0.45, ease: chosen ? EASE_OUT : EASE_IN_OUT }}
      >
        <BoosterPack booster={booster} god={god && i === Math.floor(CF_COUNT / 2)} still={!chosen} />
        <motion.div className="cf-shade" style={{ opacity: shade }} />
      </motion.div>
    </motion.div>
  );
}

function Coverflow({ booster, god, u, onPick }: { booster: Booster; god: boolean; u: number; onPick: () => void }) {
  const start = Math.floor(CF_COUNT / 2);
  const pos = useMotionValue(start + 1.6);
  const drag = useRef<{ x: number; p: number; moved: number; samples: { x: number; t: number }[] } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [hint, hideHint] = useIdleHint('cf', 1400);
  const last = useRef(Math.round(pos.get()));

  useEffect(() => {
    const c = animate(pos, start, { type: 'spring', stiffness: 70, damping: 18 });
    const unsub = pos.on('change', (v) => {
      const r = Math.round(v);
      if (r !== last.current) {
        last.current = r;
        foley.tick();
      }
    });
    return () => {
      c.stop();
      unsub();
    };
  }, [pos, start]);

  const snap = (target: number, velocity = 0) => {
    const t = Math.max(0, Math.min(CF_COUNT - 1, Math.round(target)));
    animate(pos, t, { type: 'spring', stiffness: 150, damping: 24, velocity });
    return t;
  };

  const choose = (i: number) => {
    if (picked !== null) return;
    hideHint();
    snap(i);
    setPicked(i);
    setTimeout(onPick, 720);
  };

  return (
    <>
      <div
        className="cf"
        onPointerDown={(e) => {
          if (picked !== null) return;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, p: pos.get(), moved: 0, samples: [{ x: e.clientX, t: performance.now() }] };
          pos.stop();
          hideHint();
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          g.moved = Math.max(g.moved, Math.abs(e.clientX - g.x));
          pos.set(g.p - (e.clientX - g.x) / (u * CF_STEP));
          g.samples.push({ x: e.clientX, t: performance.now() });
          if (g.samples.length > 5) g.samples.shift();
        }}
        onPointerUp={(e) => {
          const g = drag.current;
          drag.current = null;
          if (!g) return;
          if (g.moved < 6) {
            const hit = document.elementsFromPoint(e.clientX, e.clientY).map((x) => (x as HTMLElement).closest?.('.cf-pack') as HTMLElement | null).find(Boolean);
            const i = hit ? Number(hit.dataset.i) : Math.round(pos.get());
            if (i === Math.round(pos.get())) choose(i);
            else snap(i);
            return;
          }
          const a = g.samples[0];
          const b = g.samples[g.samples.length - 1];
          const v = -((b.x - a.x) / (u * CF_STEP)) / Math.max(0.016, (b.t - a.t) / 1000); // packs per second
          snap(pos.get() + v * 0.18, v);
        }}
      >
        {Array.from({ length: CF_COUNT }, (_, i) => (
          <CoverPack key={i} i={i} pos={pos} u={u} booster={booster} god={god} picked={picked} />
        ))}
      </div>
      <AnimatePresence>{hint && picked === null && <motion.div className="po-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>パックを選んでタップ</motion.div>}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tear
// ---------------------------------------------------------------------------
interface TearProps {
  booster: Booster;
  god: boolean;
  u: number;
  cards: CardDef[];
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onDone: () => void;
}

function TearStage({ booster, god, u, cards, burstAt, onDone }: TearProps) {
  const packRef = useRef<HTMLDivElement>(null);
  const prog = useMotionValue(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [torn, setTorn] = useState(false);
  const [active, setActive] = useState(false);
  const [hint, hideHint] = useIdleHint('tear', 1800);
  const g = useRef<{ x: number; max: number; lastSound: number } | null>(null);
  const cutW = useTransform(prog, (p) => `${p * 92}%`);

  const finish = () => {
    if (torn) return;
    setTorn(true);
    hideHint();
    animate(prog, 1, { duration: 0.1 });
    foley.rip();
    const r = packRef.current?.getBoundingClientRect();
    if (r) {
      const y = r.top + r.height * TEAR_Y;
      for (let k = 0; k <= 10; k++) setTimeout(() => burstAt(r.left + (r.width * (dir > 0 ? k : 10 - k)) / 10, y, 'sparkw', 5, 1), k * 14);
      setTimeout(() => burstAt(r.left + r.width / 2, y, 'mote', 40, 1.4), 120);
    }
    setTimeout(() => foley.slide(), 520);
    setTimeout(onDone, 1500);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torn]);

  const onDown = (e: React.PointerEvent) => {
    if (torn) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    g.current = { x: e.clientX, max: 0, lastSound: 0 };
    setActive(true);
    hideHint();
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    const r = packRef.current?.getBoundingClientRect();
    if (!s || !r || torn) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 3) return;
    if (s.max === 0) setDir(dx > 0 ? 1 : -1);
    const p = Math.min(1, Math.abs(dx) / (r.width * 0.8));
    if (p > s.max) {
      s.max = p;
      prog.set(p);
      burstAt(e.clientX, r.top + r.height * TEAR_Y, 'sparkw', 2, 0.8);
      const now = performance.now();
      if (now - s.lastSound > 40) {
        s.lastSound = now;
        foley.scratch();
      }
    }
    if (p >= 1) {
      g.current = null;
      setActive(false);
      finish();
    }
  };
  const onUp = () => {
    const s = g.current;
    g.current = null;
    setActive(false);
    if (!s || torn) return;
    if (s.max >= 0.75) finish();
    else animate(prog, 0, { duration: 0.45, ease: EASE_OUT });
  };

  return (
    <>
      {/* cards waiting inside the pack; they rise once it opens */}
      <motion.div
        className="stack"
        initial={{ y: u * 17, scale: 0.97, opacity: 0 }}
        animate={torn ? { y: 0, scale: 1, opacity: 1 } : { y: u * 17, scale: 0.97, opacity: 0 }}
        transition={{ delay: torn ? 0.42 : 0, duration: 1.0, ease: EASE_OUT, opacity: { duration: 0.01, delay: torn ? 0.42 : 0 } }}
      >
        {cards
          .slice(0, 3)
          .reverse()
          .map((c, k, arr) => {
            const depth = arr.length - 1 - k;
            return (
              <div key={k} className="sc" style={{ transform: `translate(${depth * u * 0.28}px, ${depth * u * 0.34}px) scale(${1 - depth * 0.012})` }}>
                <div className="sc-face" style={{ transform: 'none' }}>
                  {isStar(c.rarity) ? <CardBack /> : <CardFace cid={c.id} />}
                </div>
              </div>
            );
          })}
      </motion.div>

      <div className="tear-wrap">
        <motion.div className="tear-float" ref={packRef} animate={torn ? { y: 0 } : { y: [0, -u * 0.45, 0] }} transition={torn ? { duration: 0.3 } : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
          {torn && (
            <motion.div className="tear-beam" initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 0.9, 0], scaleY: [0.2, 1, 1.15] }} transition={{ delay: 0.25, duration: 1.3, times: [0, 0.35, 1], ease: 'easeOut' }} />
          )}
          {!torn ? (
            <BoosterPack booster={booster} tilt={!active} god={god} />
          ) : (
            <>
              <motion.div className="tear-part" style={{ zIndex: 4 }} initial={{ y: 0, opacity: 1 }} animate={{ y: u * 70, opacity: 1 }} transition={{ delay: 0.38, duration: 0.85, ease: EASE_IN }}>
                <BoosterPack booster={booster} part="body" god={god} />
              </motion.div>
              <motion.div
                className="tear-part"
                style={{ zIndex: 9, transformOrigin: dir > 0 ? '100% 4%' : '0% 4%' }}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: dir * u * 9, y: -u * 13, rotate: dir * 16, opacity: [1, 1, 0] }}
                transition={{ duration: 1.0, ease: EASE_OUT, opacity: { duration: 1.0, times: [0, 0.55, 1] } }}
              >
                <BoosterPack booster={booster} part="top" god={god} />
              </motion.div>
              <motion.div
                className="tear-bloom"
                style={{ top: `${TEAR_Y * 100}%` }}
                initial={{ opacity: 0, scaleX: 0.2, scaleY: 0.5 }}
                animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1.25], scaleY: [0.5, 1, 0.7] }}
                transition={{ duration: 0.75, times: [0, 0.2, 1], ease: 'easeOut' }}
              />
            </>
          )}
          {!torn && (
            <>
              <div className="tear-guide" style={{ top: `${TEAR_Y * 100}%` }} />
              <motion.div className="tear-cut" style={{ top: `${TEAR_Y * 100}%`, width: cutW, left: dir > 0 ? '4%' : 'auto', right: dir > 0 ? 'auto' : '4%' }} />
              {!active && (
                <motion.div
                  className="tear-dot"
                  style={{ top: `${TEAR_Y * 100}%` }}
                  initial={{ left: '6%', opacity: 0 }}
                  animate={{ left: ['6%', '94%'], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.6, times: [0, 0.15, 0.8, 1], repeat: Infinity, repeatDelay: 0.9, ease: EASE_IN_OUT }}
                />
              )}
              <div className="tear-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            </>
          )}
        </motion.div>
      </div>
      <AnimatePresence>{hint && !torn && <motion.div className="po-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>パックの上端をなぞって開封</motion.div>}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Top card: throw it off to reveal the next; ★ cards turn over first
// ---------------------------------------------------------------------------
interface TopProps {
  card: CardDef;
  u: number;
  first: boolean;
  faceDown: boolean;
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onFlipImpact: () => void;
  onFlipped: () => void;
  onGone: () => void;
}

function TopCard({ card, u, first, faceDown, burstAt, onFlipImpact, onFlipped, onGone }: TopProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-u * 45, u * 45], [-14, 14]);
  const opacity = useTransform(x, [-u * 70, -u * 40, 0, u * 40, u * 70], [0, 1, 1, 1, 0]);
  const controls = useAnimationControls();
  const ref = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const star = isStar(card.rarity);
  const rank = RARITY_ORDER[card.rarity];
  const [up, setUp] = useState(!faceDown);
  const [hint, hideHint] = useIdleHint(`${card.id}${up}`, first || !up ? 1500 : 999999);

  useEffect(() => {
    controls.set({ rotateY: faceDown ? 180 : 0, scale: 0.985 });
    controls.start({ scale: 1, transition: { type: 'spring', stiffness: 260, damping: 26 } });
    if (faceDown) foley.charge();
    else if (card.variant === 'mirror') {
      setTimeout(() => {
        foley.sparkle();
        const r = ref.current?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height * 0.4, 'glint', 6, 1);
      }, 150);
    } else if (rank === 3 || rank === 4) {
      setTimeout(() => {
        foley.sparkle();
        const r = ref.current?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height * 0.4, 'glint', 14, 1.2);
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const center = () => {
    const r = ref.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null;
  };

  const flip = async () => {
    if (busy.current) return;
    busy.current = true;
    hideHint();
    sfx('magic-holy-2', 0.35);
    await controls.start({ y: -u * 1.2, scale: 1.05, transition: { duration: 0.28, ease: EASE_OUT } });
    setTimeout(() => {
      setUp(true);
      onFlipImpact();
      foley.impact();
      foley.rarity(rank >= 7 ? 5 : 4);
      const c = center();
      if (c) {
        burstAt(c.cx, c.cy, 'glint', 50, 1.6);
        burstAt(c.cx, c.cy, 'mote', 60, 1.8);
        burstAt(c.cx, c.cy, 'sparkw', 24, 1.4);
      }
    }, 330);
    await controls.start({ rotateY: 0, scale: [1.05, 1.14, 1], y: [-u * 1.2, -u * 2, 0], transition: { duration: 0.85, ease: EASE_IN_OUT } });
    onFlipped();
    busy.current = false;
  };

  const fly = (dir: 1 | -1, velocity = 0) => {
    if (busy.current) return;
    busy.current = true;
    hideHint();
    foley.swipe();
    const target = dir * window.innerWidth * 0.9;
    animate(x, target, { type: 'spring', stiffness: 90, damping: 20, velocity: velocity || dir * 2600, restDelta: 40 });
    controls.start({ y: -u * 2, transition: { duration: 0.4, ease: EASE_OUT } });
    setTimeout(onGone, 330);
  };

  const rc = rareColor(card.rarity);
  return (
    <>
      <motion.div
        ref={ref}
        className="sc top"
        style={{ x, rotate, opacity, ['--rc' as string]: rc }}
        animate={controls}
        drag={up ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 26 }}
        onDragStart={hideHint}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.x) > u * 6 || Math.abs(info.velocity.x) > 500) fly(info.offset.x > 0 ? 1 : -1, info.velocity.x);
        }}
        onTap={() => (!up ? flip() : fly(-1))}
      >
        {star && <motion.div className="halo" animate={{ scale: [1, 1.06, 1], opacity: up ? [0.35, 0.5, 0.35] : [0.28, 0.45, 0.28] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />}
        <div className="sc-face">
          <CardFace cid={card.id} interactive={up} />
          {(rank === 3 || rank === 4 || card.variant === 'mirror' || (star && up)) && <div className="glare" />}
        </div>
        <div className="sc-back">
          <CardBack />
          {!up && <div className="edge-light" />}
        </div>
      </motion.div>
      <AnimatePresence>
        {hint && (
          <motion.div className="po-hint" style={{ position: 'fixed' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {up ? 'スワイプして次へ' : 'タップしてめくる'}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
function Results({ cards, fresh, shards, onClose, onAgain, canAgain, price, u }: { cards: CardDef[]; fresh: Set<string>; shards: Set<number>; onClose: () => void; onAgain: () => void; canAgain: boolean; price: number; u: number }) {
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    cards.forEach((_, i) => setTimeout(() => foley.slide(), 80 + i * 90));
  }, [cards]);
  const rows = [cards.slice(0, 3), cards.slice(3)];
  let n = 0;
  return (
    <div className="results">
      <div className="results-grid">
        {rows.map((row, ri) => (
          <div className="results-row" key={ri}>
            {row.map((c) => {
              const i = n++;
              const rank = RARITY_ORDER[c.rarity];
              return (
                <motion.div
                  key={i}
                  className="results-item"
                  initial={{ opacity: 0, y: u * 1.6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.08 + i * 0.07, duration: 0.6, ease: EASE_OUT }}
                  whileHover={{ y: -u * 0.5, transition: { duration: 0.25, ease: EASE_OUT } }}
                  onClick={() => {
                    foley.flip();
                    setZoom(c.id);
                  }}
                >
                  <CardFace cid={c.id} />
                  {rank >= 3 && <div className="glare" style={{ animationDelay: `${0.5 + i * 0.07}s` }} />}
                  {fresh.has(c.id) && <span className="new">NEW</span>}
                  {shards.has(i) && (
                    <span className="shard-tag">
                      <Icon name="shard" /> かけら+1
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
      <motion.div className="results-actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease: EASE_OUT }}>
        <button className="pill ghost" onClick={onClose}>
          とじる
        </button>
        <button className="pill" disabled={!canAgain} onClick={onAgain}>
          もう1パック開ける
          <span className="coin">
            <Icon name="coin" /> {price}
          </span>
        </button>
      </motion.div>
      <AnimatePresence>
        {zoom && (
          <motion.div className="zoom-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(null)}>
            <motion.div className="zoom-card" initial={{ scale: 0.92, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
              <CardFace cid={zoom} interactive />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium pack view with the (irregular) pick-up banner
// ---------------------------------------------------------------------------
function PremiumView({ booster, pickup, now, u, onBuy }: { booster: Booster; pickup: ReturnType<typeof currentPickup>; now: number; u: number; onBuy: () => void }) {
  return (
    <div className="prem">
      <motion.div className="prem-info" initial={{ opacity: 0, x: -u * 2 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
        <div className="prem-kicker">PREMIUM PACK</div>
        <h3>プレミアムパック</h3>
        <ul>
          <li>
            <b>全スロット</b>のレアリティが上昇
          </li>
          <li>
            5枚目は<b>RRR以上</b>確定
          </li>
          <li>
            AR以上の☆レア 通常の<b>約5倍</b>
          </li>
          <li>
            <b>全弾</b>のカードが封入
          </li>
        </ul>
      </motion.div>
      <motion.div
        className="shop2-pack prem-pack"
        initial={{ opacity: 0, y: u * 2, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        onClick={onBuy}
      >
        <motion.div animate={{ y: [0, -u * 0.6, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
          <BoosterPack booster={booster} tilt />
        </motion.div>
      </motion.div>
      <motion.div className={`prem-pu ${pickup ? 'on' : ''}`} initial={{ opacity: 0, x: u * 2 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.05 }}>
        {pickup ? (
          <>
            <div className="pu-head">
              <span className="pu-tag">PICK UP</span>
              <span className="pu-time">
                <Icon name="hourglass" /> 残り {fmtRemain(pickup.end.getTime() - now)}
              </span>
            </div>
            <div className="pu-card">
              <CardFace cid={pickup.card.id} />
              <div className="glare" />
            </div>
            <div className="pu-name">{pickup.card.name}</div>
            <div className="pu-desc">{pickup.card.rarity} が出たとき、50%でこのカードに</div>
          </>
        ) : (
          <>
            <div className="pu-head">
              <span className="pu-tag off">PICK UP</span>
            </div>
            <div className="pu-empty">
              <div className="q">?</div>
              現在開催中のピックアップはありません。
              <br />
              ピックアップは<b>不定期</b>に開催されます。
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// keep the mascot lookup warm so packs render without a hitch
BOOSTERS.forEach((b) => byName(b.mascot));
