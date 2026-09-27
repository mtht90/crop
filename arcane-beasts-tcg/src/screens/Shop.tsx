// ============================================================================
// Pack opening — modelled on the TCG Pocket flow:
//   booster select → pick one pack from a coverflow → trace the top edge to
//   tear it → cards rise out of the pack → swipe through the stack (rares last,
//   ★ cards arrive face-down and flip on tap) → results grid
// ============================================================================
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardDef, Rarity } from '../engine/types';
import { byName } from '../engine/cards';
import { BOOSTERS, openPack, PACK_PRICE, PACK_SIZE, RARITY_ORDER, useStore, type Booster } from '../state/store';
import { artUrl, TYPE_SCENE } from '../lib/assets';
import { CardBack, CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from '../battle/particles';
import { BoosterPack, TEAR_Y } from './pack/BoosterPack';
import type { MonsterCard } from '../engine/types';
import './pack/pack.css';

type Phase = 'choose' | 'tear' | 'emerge' | 'reveal' | 'results';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
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

const isStar = (r: Rarity) => r === 'SR' || r === 'UR';

function Diamond() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="M10 1 L19 10 L10 19 L1 10 Z" fill="url(#rm-silver)" stroke="#3a3f4a" strokeWidth="1.2" />
    </svg>
  );
}
function Star() {
  return (
    <svg viewBox="0 0 20 20">
      <path d="M10 1.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L10 14.8l-5.4 3 1.2-6.1L1.3 7.5l6.1-.7z" fill="url(#rm-gold)" stroke="#5a3a00" strokeWidth="1" />
    </svg>
  );
}
function Crown() {
  return (
    <svg viewBox="0 0 24 20">
      <path d="M2 6l5 4 5-8 5 8 5-4-2 12H4z" fill="url(#rm-gold)" stroke="#5a3a00" strokeWidth="1.1" />
    </svg>
  );
}

export function RarityMarks({ rarity }: { rarity: Rarity }) {
  const n = { C: 1, U: 2, R: 3, RR: 4, SR: 2, UR: 1 }[rarity];
  return (
    <span className="rmarks" aria-label={rarity}>
      {rarity === 'UR' ? <Crown /> : Array.from({ length: n }, (_, i) => (isStar(rarity) ? <Star key={i} /> : <Diamond key={i} />))}
    </span>
  );
}

function RarityDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="rm-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#c7d0de" />
          <stop offset="1" stopColor="#7f8a9c" />
        </linearGradient>
        <linearGradient id="rm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7cc" />
          <stop offset="0.5" stopColor="#ffc94a" />
          <stop offset="1" stopColor="#b8801c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Motes({ n = 26 }: { n?: number }) {
  const motes = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${(i * 0.63) % 9}s`, dur: `${7 + ((i * 1.7) % 6)}s`, size: 2 + ((i * 3) % 4) })),
    [n],
  );
  return (
    <div className="po-motes">
      {motes.map((m, i) => (
        <i key={i} style={{ left: m.left, animationDelay: m.delay, animationDuration: m.dur, width: m.size, height: m.size }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop screen (booster select)
// ---------------------------------------------------------------------------
export function Shop() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const addCards = useStore((s) => s.addCards);
  const [sel, setSel] = useState(0);
  const [opening, setOpening] = useState<{ booster: Booster; cards: CardDef[]; god: boolean; fresh: Set<string>; key: number } | null>(null);
  const [odds, setOdds] = useState(false);
  const u = useUnit();
  useEffect(() => playMusic('shop'), []);
  const b = BOOSTERS[sel];
  const mascot = byName(b.mascot) as MonsterCard;

  const buy = useCallback(
    (booster: Booster) => {
      const coins = useStore.getState().save.coins;
      if (coins < PACK_PRICE) {
        sfx('miss-2', 0.5);
        return false;
      }
      const res = openPack(booster);
      const col = useStore.getState().save.collection;
      const fresh = new Set(res.cards.filter((c) => !(col[c.id] ?? 0)).map((c) => c.id));
      update((s) => {
        s.coins -= PACK_PRICE;
        s.packsOpened++;
      });
      addCards(res.cards.map((c) => c.id));
      setOpening({ booster, cards: res.cards, god: res.god, fresh, key: Date.now() });
      return true;
    },
    [update, addCards],
  );

  const shift = (d: number) => {
    foley.tick();
    foley.slide();
    setSel((sel + d + BOOSTERS.length) % BOOSTERS.length);
  };

  return (
    <div className="screen shop2" style={{ ['--hue' as string]: b.hue }}>
      <RarityDefs />
      <div className="shop2-bg" style={{ backgroundImage: `url(${artUrl(TYPE_SCENE[mascot.type])})` }} />
      <div className="shop2-tint" />
      <div className="stage">
        <TopBar
          title="パック開封"
          right={
            <button className="btn ghost small" onClick={() => setOdds(true)}>
              提供割合
            </button>
          }
        />
        <div className="shop2-row">
          {BOOSTERS.map((bo, i) => {
            let d = i - sel;
            if (d > 1) d -= BOOSTERS.length;
            if (d < -1) d += BOOSTERS.length;
            return (
              <motion.div
                key={bo.id}
                className="shop2-pack"
                animate={{ x: d * u * 23 - u * 10.75, scale: d === 0 ? 1 : 0.72, y: d === 0 ? 0 : u * 5, rotateY: d * -18, opacity: d === 0 ? 1 : 0.6, zIndex: d === 0 ? 3 : 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                style={{ filter: d === 0 ? undefined : 'brightness(0.6) saturate(0.8)' }}
                onClick={() => (d === 0 ? buy(bo) : shift(d))}
              >
                <motion.div animate={d === 0 ? { y: [0, -u * 0.8, 0] } : { y: 0 }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
                  <BoosterPack booster={bo} tilt={d === 0} />
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
        <div className="shop2-bottom">
          <div className="shop2-dots">
            {BOOSTERS.map((x, i) => (
              <span key={x.id} className={i === sel ? 'on' : ''} />
            ))}
          </div>
          <div className="shop2-name">{b.name}</div>
          <div className="shop2-sub">
            {b.mascot}が表紙。{b.types.map((t) => ({ fire: '炎', water: '水', grass: '草', lightning: '雷', psychic: '超', fighting: '闘', dark: '悪', colorless: '無色' })[t]).join('・')}タイプが出やすい
          </div>
          <div className="shop2-actions">
            <button className="btn big" disabled={save.coins < PACK_PRICE} onClick={() => buy(b)}>
              <Icon name="coin" /> {PACK_PRICE} で開封する
            </button>
          </div>
          {save.coins < PACK_PRICE && <div className="warn">コインが足りません。バトルに勝ってコインを集めよう！</div>}
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

      {odds && <OddsModal onClose={() => setOdds(false)} />}
    </div>
  );
}

function OddsModal({ onClose }: { onClose: () => void }) {
  const rows: [string, Rarity, string][] = [
    ['1〜3枚目', 'C', 'コモン 75〜90% ／ アンコモン 10〜25%'],
    ['4枚目', 'U', 'アンコモン 72% ／ レア 22% ／ ダブルレア 6%'],
    ['5枚目', 'R', 'レア 64% ／ ダブルレア 25% ／ SR 8% ／ UR 3%'],
  ];
  return (
    <div className="zoom-back" onClick={onClose}>
      <div className="panel odds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">提供割合</div>
        <table className="odds-table">
          <tbody>
            {rows.map(([slot, r, text]) => (
              <tr key={slot}>
                <th>{slot}</th>
                <td>
                  <RarityMarks rarity={r} />
                </td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="odds-note">
          ◆1＝C ◆2＝U ◆3＝R ◆4＝RR（Ω） ★★＝SR（フルアート） ♛＝UR（ゴールド）。パックの表紙のタイプのカードは2倍出やすくなります。ごくまれに、すべてRR以上の「ゴッドパック」が出ることがあります。
        </div>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening overlay
// ---------------------------------------------------------------------------
interface OpeningProps {
  booster: Booster;
  cards: CardDef[];
  god: boolean;
  fresh: Set<string>;
  onClose: () => void;
  onAgain: () => void;
}

function Opening({ booster, cards, god, fresh, onClose, onAgain }: OpeningProps) {
  const u = useUnit();
  const [phase, setPhase] = useState<Phase>('choose');
  const [idx, setIdx] = useState(0);
  const [faceUp, setFaceUp] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState(0);
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

  const burstAt = (clientX: number, clientY: number, preset: string, n: number, scale = 1) => {
    const r = root.current?.getBoundingClientRect();
    if (r) particles.burst(clientX - r.left, clientY - r.top, preset, n, scale);
  };
  const doFlash = () => setFlash((f) => f + 1);

  const top = cards[idx];
  const topIsStar = top && isStar(top.rarity);
  const bgClass = phase === 'reveal' && top ? (top.rarity === 'SR' || god ? 'rainbow' : top.rarity === 'UR' ? 'rare' : '') : god && phase !== 'results' ? 'rainbow' : '';

  const skip = () => {
    foley.shuffle();
    setPhase('results');
  };

  return (
    <motion.div
      ref={root}
      className={`po ${bgClass}`}
      style={{ ['--hue' as string]: booster.hue }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="po-rays" />
      <Motes />
      <canvas ref={canvas} className="po-canvas" />
      <AnimatePresence>
        {flash > 0 && (
          <motion.div key={flash} className="po-flash" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
        )}
      </AnimatePresence>

      <div className="stage">
        {phase === 'choose' && (
          <Coverflow
            booster={booster}
            god={god}
            u={u}
            onPick={() => {
              foley.pop();
              sfx('expand', 0.5);
              setPhase('tear');
            }}
          />
        )}

        {(phase === 'tear' || phase === 'emerge') && (
          <TearStage
            booster={booster}
            god={god}
            u={u}
            torn={phase === 'emerge'}
            cards={cards}
            burstAt={burstAt}
            onTorn={() => {
              foley.rip();
              doFlash();
              sfx('open-chest', 0.45);
              setPhase('emerge');
              setTimeout(() => {
                foley.slide();
                setTimeout(() => setPhase('reveal'), 900);
              }, 650);
            }}
          />
        )}

        {phase === 'reveal' && top && (
          <>
            <div className="counter">
              {idx + 1} / {cards.length}
            </div>
            <div className="stack">
              {cards
                .slice(idx + 1, idx + 4)
                .reverse()
                .map((c, k, arr) => {
                  const depth = arr.length - k;
                  return (
                    <div key={`${idx + depth}`} className="stack-card stack-under" style={{ transform: `translate(${depth * 0.35 * u}px, ${depth * 0.35 * u}px)` }}>
                      {isStar(c.rarity) ? <CardBack /> : <CardFace cid={c.id} />}
                    </div>
                  );
                })}
              <TopCard
                key={idx}
                card={top}
                u={u}
                faceUp={!topIsStar || faceUp.has(idx)}
                burstAt={burstAt}
                onFlip={() => {
                  setFaceUp((s) => new Set(s).add(idx));
                  doFlash();
                }}
                onGone={() => {
                  if (idx + 1 >= cards.length) setPhase('results');
                  else setIdx(idx + 1);
                }}
              />
            </div>
            {(!topIsStar || faceUp.has(idx)) && (
              <motion.div key={`meta${idx}`} className="card-meta" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <RarityMarks rarity={top.rarity} />
                <span className="nm">{top.name}</span>
                {fresh.has(top.id) && <span className="new-chip">NEW</span>}
              </motion.div>
            )}
            <div className="po-hint">{topIsStar && !faceUp.has(idx) ? 'タップしてめくる' : 'スワイプ（またはタップ）で次のカードへ'}</div>
            <button className="btn ghost small po-skip" onClick={skip}>
              スキップ
            </button>
          </>
        )}

        {phase === 'results' && <Results cards={cards} fresh={fresh} onClose={onClose} onAgain={onAgain} canAgain={coins >= PACK_PRICE} />}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Coverflow: pick one pack out of a row
// ---------------------------------------------------------------------------
const CF_COUNT = 9;

function CoverPack({ i, pos, u, booster, god }: { i: number; pos: MotionValue<number>; u: number; booster: Booster; god: boolean }) {
  const d = useTransform(pos, (p) => i - p);
  const x = useTransform(d, (v) => Math.sign(v) * Math.min(Math.abs(v), 1) * u * 17 + Math.sign(v) * Math.max(0, Math.abs(v) - 1) * u * 9);
  const rotateY = useTransform(d, (v) => Math.max(-1, Math.min(1, v)) * -42);
  const z = useTransform(d, (v) => -Math.min(Math.abs(v), 4) * u * 7);
  const scale = useTransform(d, (v) => 1 - Math.min(Math.abs(v), 3) * 0.06);
  const opacity = useTransform(d, (v) => (Math.abs(v) > 3.6 ? 0 : 1 - Math.max(0, Math.abs(v) - 2.2) * 0.7));
  const zIndex = useTransform(d, (v) => 100 - Math.round(Math.abs(v) * 10));
  const filter = useTransform(d, (v) => `brightness(${1 - Math.min(Math.abs(v), 2) * 0.22})`);
  return (
    <motion.div className="cf-pack" style={{ x, rotateY, z, scale, opacity, zIndex, filter }} data-i={i}>
      <BoosterPack booster={booster} god={god && i === 4} still />
    </motion.div>
  );
}

function Coverflow({ booster, god, u, onPick }: { booster: Booster; god: boolean; u: number; onPick: () => void }) {
  const start = Math.floor(CF_COUNT / 2);
  const pos = useMotionValue(start + 2.5);
  const drag = useRef<{ x: number; p: number; t: number; moved: number; lastX: number; lastT: number } | null>(null);
  const [picked, setPicked] = useState(false);
  const lastTick = useRef(Math.round(pos.get()));

  useEffect(() => {
    const c = animate(pos, start, { type: 'spring', stiffness: 60, damping: 16 });
    const unsub = pos.on('change', (v) => {
      const r = Math.round(v);
      if (r !== lastTick.current) {
        lastTick.current = r;
        foley.tick();
      }
    });
    return () => {
      c.stop();
      unsub();
    };
  }, [pos, start]);

  const snap = (target: number) => {
    const t = Math.max(0, Math.min(CF_COUNT - 1, Math.round(target)));
    animate(pos, t, { type: 'spring', stiffness: 180, damping: 24 });
    return t;
  };

  const choose = () => {
    if (picked) return;
    setPicked(true);
    snap(pos.get());
    setTimeout(onPick, 650);
  };

  return (
    <>
      <div className="po-head">開封するパックを1つ選んでください</div>
      <motion.div
        className="cf"
        animate={picked ? { opacity: 1 } : {}}
        onPointerDown={(e) => {
          if (picked) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, p: pos.get(), t: performance.now(), moved: 0, lastX: e.clientX, lastT: performance.now() };
          pos.stop();
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          g.moved = Math.max(g.moved, Math.abs(e.clientX - g.x));
          pos.set(g.p - (e.clientX - g.x) / (u * 12));
          g.lastX = e.clientX;
          g.lastT = performance.now();
        }}
        onPointerUp={(e) => {
          const g = drag.current;
          drag.current = null;
          if (!g) return;
          if (g.moved < 6) {
            // tap: center pack → choose; side pack → bring it to center
            const el = (document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).closest?.('.cf-pack')) as HTMLElement | undefined)?.closest('.cf-pack') as HTMLElement | null;
            const i = el ? Number(el.dataset.i) : Math.round(pos.get());
            if (i === Math.round(pos.get())) choose();
            else snap(i);
            return;
          }
          const dt = Math.max(16, performance.now() - g.t);
          const v = -(e.clientX - g.x) / (u * 12) / (dt / 1000);
          snap(pos.get() + Math.max(-2.5, Math.min(2.5, v * 0.12)));
        }}
      >
        {Array.from({ length: CF_COUNT }, (_, i) => (
          <PickWrap key={i} i={i} pos={pos} picked={picked} u={u}>
            <CoverPack i={i} pos={pos} u={u} booster={booster} god={god} />
          </PickWrap>
        ))}
      </motion.div>
      <div className="cf-pick">
        {!picked && (
          <button className="btn big" onClick={choose}>
            このパックにする
          </button>
        )}
      </div>
      {!picked && <div className="po-hint">左右にドラッグして選び、まんなかのパックをタップ</div>}
    </>
  );
}

function PickWrap({ i, pos, picked, u, children }: { i: number; pos: MotionValue<number>; picked: boolean; u: number; children: React.ReactNode }) {
  const center = Math.round(pos.get());
  const chosen = picked && i === center;
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}
      animate={picked ? (chosen ? { y: -u * 0.2, scale: 24 / 21 } : { y: u * 30, opacity: 0 }) : { y: 0, opacity: 1, scale: 1 }}
      transition={picked ? { duration: chosen ? 0.55 : 0.45, ease: chosen ? 'easeOut' : 'easeIn', delay: chosen ? 0 : Math.abs(i - center) * 0.03 } : { duration: 0 }}
    >
      <div style={{ pointerEvents: 'auto', transformStyle: 'preserve-3d' }}>{children}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Tear: trace along the top edge
// ---------------------------------------------------------------------------
interface TearProps {
  booster: Booster;
  god: boolean;
  u: number;
  torn: boolean;
  cards: CardDef[];
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onTorn: () => void;
}

function TearStage({ booster, god, u, torn, cards, burstAt, onTorn }: TearProps) {
  const packRef = useRef<HTMLDivElement>(null);
  const prog = useMotionValue(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; max: number; lastSound: number } | null>(null);
  const done = useRef(false);
  const cutW = useTransform(prog, (p) => `${p * 100}%`);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    animate(prog, 1, { duration: 0.12 });
    const r = packRef.current?.getBoundingClientRect();
    if (r) {
      const y = r.top + r.height * TEAR_Y;
      for (let k = 0; k <= 8; k++) setTimeout(() => burstAt(r.left + (r.width * k) / 8, y, god ? 'rainbow' : 'gold', 14, 1.2), k * 22);
    }
    onTorn();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!torn && (e.key === 'Enter' || e.key === ' ')) finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torn]);

  const onDown = (e: React.PointerEvent) => {
    if (torn) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    g.current = { x: e.clientX, max: 0, lastSound: 0 };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    const r = packRef.current?.getBoundingClientRect();
    if (!s || !r || torn) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 4) return;
    const d = dx > 0 ? 1 : -1;
    if (s.max === 0) setDir(d);
    const p = Math.min(1, Math.abs(dx) / (r.width * 0.82));
    if (p > s.max) {
      s.max = p;
      prog.set(p);
      burstAt(e.clientX, r.top + r.height * TEAR_Y, god ? 'rainbow' : 'gold', 3, 0.8);
      const now = performance.now();
      if (now - s.lastSound > 45) {
        s.lastSound = now;
        foley.scratch();
      }
    }
    if (p >= 1) {
      g.current = null;
      setDragging(false);
      finish();
    }
  };
  const onUp = () => {
    const s = g.current;
    g.current = null;
    setDragging(false);
    if (!s || torn) return;
    if (s.max >= 0.78) finish();
    else animate(prog, 0, { duration: 0.35, ease: 'easeOut' });
  };

  const packH = (u * 24) / 0.62;
  return (
    <>
      {!torn && <div className="po-head">パックの上をなぞって開封しよう</div>}
      {/* the card stack waiting inside the pack */}
      {torn && (
        <motion.div className="stack" initial={{ y: u * 15 }} animate={{ y: 0 }} transition={{ delay: 0.35, duration: 0.9, ease: [0.2, 0.8, 0.25, 1] }}>
          {cards
            .slice(0, 3)
            .reverse()
            .map((c, k, arr) => {
              const depth = arr.length - 1 - k;
              return (
                <div key={k} className="stack-card" style={{ transform: `translate(${depth * 0.35 * u}px, ${depth * 0.35 * u}px)` }}>
                  {isStar(c.rarity) ? <CardBack /> : <CardFace cid={c.id} />}
                </div>
              );
            })}
        </motion.div>
      )}
      <div className="tear-wrap">
        <motion.div
          className="tear-float"
          ref={packRef}
          initial={{ scale: 1 }}
          animate={torn ? { y: 0 } : { y: [0, -u * 0.7, 0] }}
          transition={torn ? { duration: 0.2 } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {!torn && <BoosterPack booster={booster} tilt={!dragging} god={god} />}
          {torn && (
            <>
              <motion.div className="tear-body" initial={{ y: 0, opacity: 1 }} animate={{ y: packH * 1.15, opacity: 0.2 }} transition={{ delay: 0.45, duration: 0.9, ease: [0.5, 0, 0.75, 0.4] }}>
                <BoosterPack booster={booster} part="body" god={god} />
              </motion.div>
              <motion.div
                className="tear-piece"
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: dir * u * 16, y: -u * 22, rotate: dir * 32, opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.2, 0.7, 0.4, 1] }}
                style={{ transformOrigin: dir > 0 ? '100% 10%' : '0% 10%' }}
              >
                <BoosterPack booster={booster} part="top" god={god} />
              </motion.div>
            </>
          )}
          {!torn && (
            <>
              <div className="tear-guide" style={{ top: `${TEAR_Y * 100}%` }} />
              <motion.div className="tear-cut" style={{ top: `${TEAR_Y * 100}%`, width: cutW, left: dir > 0 ? 0 : 'auto', right: dir > 0 ? 'auto' : 0 }} />
              {!dragging && (
                <motion.div
                  className="tear-hand"
                  style={{ top: `calc(${TEAR_Y * 100}% - ${u * 0.6}px)` }}
                  initial={{ left: '-6%', opacity: 0 }}
                  animate={{ left: ['-6%', '-6%', '88%', '88%'], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 2.2, times: [0, 0.15, 0.75, 1], repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
                >
                  <Icon name="pointing" size="100%" />
                </motion.div>
              )}
              <div className="tear-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            </>
          )}
        </motion.div>
      </div>
      {!torn && <div className="po-hint">{god ? '✦ パックが虹色に輝いている……！ ✦' : '点線にそって左右になぞる（Enterキーでも開封）'}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Top card of the stack: swipe away, or flip a face-down ★ card
// ---------------------------------------------------------------------------
interface TopProps {
  card: CardDef;
  u: number;
  faceUp: boolean;
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onFlip: () => void;
  onGone: () => void;
}

function TopCard({ card, u, faceUp, burstAt, onFlip, onGone }: TopProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-u * 40, u * 40], [-16, 16]);
  const controls = useAnimationControls();
  const ref = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const star = isStar(card.rarity);
  const rank = RARITY_ORDER[card.rarity];
  useEffect(() => {
    controls.start({ scale: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } });
  }, [controls]);

  // arrival cues
  useEffect(() => {
    if (star && !faceUp) {
      foley.charge();
      sfx('magic-holy-2', 0.5);
    } else if (rank === 3) {
      setTimeout(() => {
        foley.sparkle();
        const r = ref.current?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height / 2, 'sparkle', 30, 1.3);
      }, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fly = async (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    foley.swipe();
    await controls.start({ x: dir * u * 90, y: -u * 4, rotate: dir * 28, opacity: 0, transition: { duration: 0.34, ease: [0.4, 0, 1, 1] } });
    onGone();
  };

  const flip = async () => {
    if (busy.current) return;
    busy.current = true;
    await controls.start({ rotateY: 90, scale: 1.16, transition: { duration: 0.32, ease: 'easeIn' } });
    onFlip();
    foley.impact();
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      burstAt(cx, cy, card.rarity === 'UR' ? 'gold' : 'rainbow', 140, 2);
      setTimeout(() => burstAt(cx, cy, 'sparkle', 60, 1.6), 200);
    }
    setTimeout(() => {
      sfx('fanfare-short', 0.8);
      foley.rarity(5);
    }, 120);
    controls.start({ rotateY: 0, scale: 1, transition: { type: 'spring', stiffness: 170, damping: 13 } });
    // allow swiping as soon as the card has turned face up
    setTimeout(() => (busy.current = false), 450);
  };

  const showBack = star && !faceUp;
  return (
    <motion.div
      ref={ref}
      className="stack-card top"
      style={{ x, rotate }}
      initial={{ scale: 0.96 }}
      animate={controls}
      drag={showBack ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > u * 7 || Math.abs(info.velocity.x) > 600) fly(info.offset.x > 0 ? 1 : -1);
      }}
      onTap={() => (showBack ? flip() : fly(-1))}
    >
      {showBack ? (
        <div className="rare-back">
          <div className={`rare-aura ${card.rarity}`} />
          <CardBack />
          <div className="rare-glint" />
        </div>
      ) : (
        <>
          {rank === 3 && <div className="shine-ring" />}
          {star && <div className={`rare-aura ${card.rarity}`} style={{ inset: '-8%', opacity: 0.7 }} />}
          <CardFace cid={card.id} interactive />
        </>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Results grid (3 + 2)
// ---------------------------------------------------------------------------
function Results({ cards, fresh, onClose, onAgain, canAgain }: { cards: CardDef[]; fresh: Set<string>; onClose: () => void; onAgain: () => void; canAgain: boolean }) {
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    cards.forEach((_, i) => setTimeout(() => foley.flip(), 120 + i * 110));
    if (cards.some((c) => RARITY_ORDER[c.rarity] >= 3)) setTimeout(() => foley.sparkle(), 700);
  }, [cards]);
  const rows = [cards.slice(0, 3), cards.slice(3, PACK_SIZE)];
  let n = 0;
  return (
    <div className="results">
      <div className="results-title">開封結果</div>
      <div className="results-grid">
        {rows.map((row, ri) => (
          <div className="results-row" key={ri}>
            {row.map((c) => {
              const i = n++;
              return (
                <motion.div
                  key={i}
                  className="results-item"
                  initial={{ opacity: 0, rotateY: 180, scale: 0.7, y: 20 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.11, type: 'spring', stiffness: 200, damping: 20 }}
                  onClick={() => {
                    foley.flip();
                    setZoom(c.id);
                  }}
                >
                  <CardFace cid={c.id} interactive />
                  {fresh.has(c.id) && <span className="new-chip">NEW</span>}
                  <RarityMarks rarity={c.rarity} />
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="results-actions">
        <button className="btn ghost big" onClick={onClose}>
          とじる
        </button>
        <button className="btn big" disabled={!canAgain} onClick={onAgain}>
          <Icon name="coin" /> もう1パック（{PACK_PRICE}）
        </button>
      </div>
      {zoom && (
        <div className="zoom-back" onClick={() => setZoom(null)}>
          <motion.div className="zoom-card" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
            <CardFace cid={zoom} interactive />
          </motion.div>
        </div>
      )}
    </div>
  );
}
