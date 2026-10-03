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
import { byName, RARITY_SYMBOL } from '../engine/cards';
import { dayNumber, msToNextLineup, THEMES, typesLabel } from '../state/themes';
import { todaysLineup, BOOSTERS, MIRROR_CHANCE, openPack, openPremium, PACK_PRICE, PACK_TABLE, premiumBooster, PREMIUM_PRICE, PREMIUM_TABLE, RARITY_ORDER, useStore, type Booster } from '../state/store';
import { currentPickup, fmtRemain } from '../state/progress';
import { CardBack, CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx, tearLoop } from '../audio/audio';
import { particles } from '../battle/particles';
import { BoosterPack, TEAR_BAND, TEAR_Y, tearClips, tearEdgeFrom } from './pack/BoosterPack';
import { MeteorCinema, OMEN_COLORS, type OmenTier } from './pack/cinema';
import './pack/pack.css';
import { vibrate } from '../lib/fx';

type Phase = 'launch' | 'cinema' | 'tear' | 'reveal' | 'results' | 'multi';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** ☆ rarities arrive face-down and turn over on tap */
const isStar = (r: Rarity) => RARITY_ORDER[r] >= RARITY_ORDER.ST;
const RARE_COLOR: Partial<Record<Rarity, string>> = { CR: '#ffd27a', ST2: '#ffe9a8', ST: '#fff1c4', RR: '#ffd9b0' };
const rareColor = (r: Rarity) => RARE_COLOR[r] ?? '#ffffff';
const priceOf = (b: Booster) => (b.premium ? PREMIUM_PRICE : PACK_PRICE);

// ---------------------------------------------------------------------------
// Omen (予兆) and promotion (昇格)
//   actual: the best card in the pack → 0 nothing / 1 ◇◇◇◇ / 2 ☆ / 3 ♛
//   shown:  what the meteors and the first aura colour reveal. It is never
//           higher than the truth; sometimes lower, and the pack's aura then
//           climbs to the real colour before it can be opened.
// ---------------------------------------------------------------------------
interface Omen {
  actual: OmenTier;
  shown: OmenTier;
  /** one meteor per card, best first; a card's meteor never shows more than the omen */
  meteors: OmenTier[];
}
const cardTier = (c: CardDef): OmenTier => (RARITY_ORDER[c.rarity] >= RARITY_ORDER.CR ? 3 : RARITY_ORDER[c.rarity] >= RARITY_ORDER.ST ? 2 : RARITY_ORDER[c.rarity] >= RARITY_ORDER.RR ? 1 : 0);
function makeOmen(cards: CardDef[], god: boolean): Omen {
  const tiers = cards.map(cardTier).sort((a, b) => b - a);
  const actual = (god ? 3 : tiers[0]) as OmenTier;
  let shown = actual;
  const r = Math.random();
  if (actual === 3) shown = (r < 0.15 ? 1 : r < 0.5 ? 2 : 3) as OmenTier;
  else if (actual === 2) shown = (r < 0.35 ? 1 : 2) as OmenTier;
  else if (actual === 1) shown = (r < 0.25 ? 0 : 1) as OmenTier;
  const dbg = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('omen') : null; // e.g. ?omen=3,1
  if (dbg) {
    const [a, b] = dbg.split(',').map(Number);
    return { actual: a as OmenTier, shown: (b ?? a) as OmenTier, meteors: tiers.map((t, i) => (i === 0 ? ((b ?? a) as OmenTier) : (Math.min(t, b ?? a) as OmenTier))) };
  }
  const meteors = tiers.map((t, i) => (i === 0 ? shown : (Math.min(t, shown) as OmenTier)));
  return { actual, shown, meteors };
}
type Tab = 'today' | 'premium';
const hms = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

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
  /** 1 or 10 (10連) */
  packs: number;
  key: number;
}

export function Shop() {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const addCards = useStore((s) => s.addCards);
  const [sel, setSel] = useState(0);
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [odds, setOdds] = useState(false);
  const [kind, setKind] = useState<Tab>(() => (/[?&]premium/.test(location.search) ? 'premium' : 'today'));
  const u = useUnit();
  useEffect(() => playMusic('shop'), []);
  const premium = useMemo(() => premiumBooster(), []);
  const pickup = useMemo(() => currentPickup(), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // today's two series; the line-up changes at local midnight
  const day = dayNumber(now);
  const lineup = useMemo(() => todaysLineup(), [day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSel(0), [day]);
  // every pack on sale today, side by side (the set series first)
  const today = useMemo(() => [...lineup].sort((x, y) => (x.kind === 'set' ? -1 : 0) - (y.kind === 'set' ? -1 : 0)).flatMap((se) => se.boosters.map((bo) => ({ bo, se }))), [lineup]);
  const list = kind === 'premium' ? [] : today.map((t) => t.bo);
  const series = kind === 'premium' ? null : today[Math.min(sel, today.length - 1)].se;
  const b = kind === 'premium' ? premium : list[Math.min(sel, list.length - 1)];
  const price = priceOf(b);

  const buy = useCallback(
    (booster: Booster, packs = 1) => {
      const cost = priceOf(booster) * packs;
      if (useStore.getState().save.coins < cost) {
        sfx('miss-2', 0.5);
        return false;
      }
      const results = Array.from({ length: packs }, () => (booster.premium ? openPremium() : openPack(booster)));
      const cards = results.flatMap((r) => r.cards);
      const god = results.some((r) => r.god);
      const col = useStore.getState().save.collection;
      const fresh = new Set(cards.filter((c) => !(col[c.id] ?? 0)).map((c) => c.id));
      update((s) => {
        s.coins -= cost;
        s.packsOpened += packs;
      });
      for (let k = 0; k < packs; k++) useStore.getState().recordPack(!!booster.premium);
      const flags = addCards(cards.map((c) => c.id));
      const shards = new Set(flags.flatMap((f, i) => (f ? [i] : [])));
      setOpening({ booster, cards, god, fresh, shards, packs, key: Date.now() });
      return true;
    },
    [update, addCards],
  );

  const shift = (d: number) => {
    foley.slide();
    setSel((sel + d + list.length) % list.length);
  };

  return (
    <div className="screen shop2">
      <Backdrop hue={b.hue} />
      <div className="stage">
        <TopBar
          title="パック開封"
          right={
            <>
            <div className="shop-kind">
              {(['today', 'premium'] as Tab[]).map((k) => (
                <button
                  key={k}
                  className={`${kind === k ? 'on' : ''} ${k === 'premium' ? 'premium' : ''}`}
                  onClick={() => {
                    if (kind === k) return;
                    foley.slide();
                    setKind(k);
                    setSel(0);
                  }}
                >
                  {k === 'premium' ? 'プレミアム' : '本日のパック'}
                  {k !== 'premium' && <i className="lim">{list.length || today.length}種</i>}
                  {k === 'premium' && pickup && <i>PICK UP</i>}
                </button>
              ))}
            </div>
            <span className="lineup-timer" title="毎日0時に、本日のパックが入れ替わります">
              入れ替えまで <b>{hms(msToNextLineup(now))}</b>
            </span>
            <button className="textbtn" onClick={() => setOdds(true)}>
              提供割合
            </button>
            </>
          }
        />
        {kind !== 'premium' ? (
        <div className="shop2-row" key={`${kind}-${day}`}>
          {list.map((bo, i) => {
            let d = (((i - sel) % list.length) + list.length) % list.length;
            if (d > list.length / 2) d -= list.length;
            const center = d === 0;
            const far = Math.abs(d) > 1;
            return (
              <motion.div
                key={bo.id}
                className="shop2-pack"
                initial={false}
                animate={{ x: d * u * 24 - u * 10.5, scale: center ? 1 : 0.7, y: center ? 0 : u * 5.5, rotateY: Math.max(-1, Math.min(1, d)) * -22, opacity: center ? 1 : far ? 0 : 0.45 }}
                transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 1 }}
                style={{ zIndex: center ? 3 : 1, pointerEvents: far ? 'none' : undefined }}
                onClick={() => (center ? buy(bo) : shift(d))}
              >
                <motion.div animate={center ? { y: [0, -u * 0.6, 0] } : { y: 0 }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
                  <BoosterPack booster={bo} tilt={center} still={!center} />
                </motion.div>
              </motion.div>
            );
          })}
          {list.length > 1 && (
            <>
              <button className="shop2-arrow l" onClick={() => shift(-1)} aria-label="前のパック">
                ‹
              </button>
              <button className="shop2-arrow r" onClick={() => shift(1)} aria-label="次のパック">
                ›
              </button>
            </>
          )}
        </div>
        ) : (
          <PremiumView booster={premium} pickup={pickup} now={now} u={u} onBuy={() => buy(premium)} />
        )}
        <div className="shop2-bottom">
          <AnimatePresence mode="wait">
            <motion.div key={b.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} style={{ textAlign: 'center' }}>
              <div className="shop2-name">{b.name}</div>
              <div className="shop2-sub">{b.premium ? '全弾から・5枚目は◇◇◇◇以上確定' : b.theme ? `本日のパック ・ 全弾から ・ ${typesLabel(b.types)}` : `${series?.name ?? ''} ・ ${typesLabel(b.types)}`}</div>
              {!b.premium && list.length > 1 && (
                <div className="shop2-dots">
                  {list.map((x, i) => (
                    <i key={x.id} className={i === sel ? 'on' : ''} onClick={() => (foley.tick(), setSel(i))} />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="shop2-buttons">
            <button className={`pill ${b.premium ? 'gold' : ''}`} disabled={save.coins < price} onClick={() => buy(b)}>
              開封する
              <span className="coin">
                <Icon name="coin" /> {price}
              </span>
            </button>
            <button className={`pill ten ${b.premium ? 'gold' : ''}`} disabled={save.coins < price * 10} onClick={() => buy(b, 10)}>
              10パック開封
              <span className="coin">
                <Icon name="coin" /> {(price * 10).toLocaleString()}
              </span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {opening && (
          <Opening
            {...opening}
            key={opening.key}
            onClose={() => setOpening(null)}
            onAgain={() => {
              if (!buy(opening.booster, opening.packs)) setOpening(null);
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
      return `${RARITY_SYMBOL[r]} ${pct}%`;
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
            : `3枚目は${Math.round(MIRROR_CHANCE * 100)}%でミラー仕様のカードになります。パックに描かれたタイプのカードは2倍出やすくなります。ごくまれに、5枚すべてが◇◇◇◇以上のパックが出ることがあります。そのパックの弾に存在しないレアリティが出た場合は、1つ下のレアリティになります。`}
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

function Opening({ booster, cards, god, fresh, shards, packs, onClose, onAgain }: OpeningProps) {
  const u = useUnit();
  const [phase, setPhase] = useState<Phase>('launch');
  const cineApi = useRef<CinemaApi | null>(null);
  /** WebGL failed: after the launch go straight to the pack */
  const noCine = useRef(false);
  const omen = useMemo(() => makeOmen(cards, god), [cards, god]);
  const [aura, setAura] = useState<AuraState>({ tier: omen.shown, visible: false, hot: false });
  const packSlot = useRef<HTMLDivElement>(null);
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
  /** every pack has the same number of cards; the reveal goes pack by pack */
  const perPack = Math.max(1, Math.round(cards.length / packs));
  const packNo = Math.floor(idx / perPack) + 1;
  const finish = () => setPhase(packs > 1 ? 'multi' : 'results');
  const awaitingFlip = phase === 'reveal' && !!top && isStar(top.rarity) && !revealed.has(idx);
  const dim = phase === 'reveal' ? (awaitingFlip ? 0.45 : 0.15) : phase === 'results' ? 0.1 : 0;

  return (
    <motion.div ref={root} className="po" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE_IN_OUT }}>
      <Backdrop hue={booster.hue} dim={dim} />
      <AnimatePresence>
        {(phase === 'launch' || phase === 'cinema' || phase === 'tear') && (
          <CinemaLayer
            key="cinema"
            omen={omen}
            god={god && packs === 1}
            aura={aura}
            held={phase === 'launch'}
            playing={phase === 'cinema'}
            api={cineApi}
            target={() => packSlot.current?.getBoundingClientRect() ?? null}
            onDone={() => {
              if (phase === 'launch') noCine.current = true;
              else setPhase('tear');
            }}
          />
        )}
      </AnimatePresence>
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
        {/* where the pack will be: the cinematic's light (and later the aura) aims here */}
        {phase === 'launch' && (
          <PackLaunch
            booster={booster}
            packs={packs}
            u={u}
            onLaunch={(pts) => cineApi.current?.release(pts)}
            onGone={() => setPhase(noCine.current ? 'tear' : 'cinema')}
          />
        )}

        {(phase === 'launch' || phase === 'cinema' || phase === 'tear') && (
          <div className="tear-wrap" style={{ visibility: 'hidden', pointerEvents: 'none' }}>
            <div className="tear-float" ref={packSlot} />
          </div>
        )}

        {phase === 'tear' && <TearStage booster={booster} god={god} u={u} cards={cards} omen={omen} packs={packs} onAura={setAura} burstAt={burstAt} onDone={() => setPhase('reveal')} />}

        {(phase === 'multi' || (phase === 'reveal' && packs > 1)) && <TornPile booster={booster} u={u} n={Math.min(packs, 10)} fall={false} />}
        {phase === 'multi' && (
          <MultiResults opened={revealed} cards={cards} fresh={fresh} shards={shards} burstAt={burstAt} onClose={onClose} onAgain={onAgain} canAgain={coins >= priceOf(booster) * packs} price={priceOf(booster) * packs} u={u} />
        )}

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
                  if (idx + 1 >= cards.length) finish();
                  else setIdx(idx + 1);
                }}
              />
            </div>
            {packs > 1 && (
              <div className="po-packno">
                <AnimatePresence mode="wait">
                  <motion.div key={packNo} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                    <small>PACK</small>
                    <b>{packNo}</b>
                    <span>/ {packs}</span>
                  </motion.div>
                </AnimatePresence>
                <div className="po-pips">
                  {Array.from({ length: perPack }, (_, k) => (
                    <i key={k} className={k < idx - (packNo - 1) * perPack ? 'done' : k === idx - (packNo - 1) * perPack ? 'on' : ''} />
                  ))}
                </div>
              </div>
            )}
            <button
              className="textbtn po-skip"
              onClick={() => {
                foley.shuffle();
                finish();
              }}
            >
              {packs > 1 ? '残りをスキップして一覧へ' : 'スキップ'}
            </button>
          </>
        )}

        {phase === 'results' && <Results cards={cards} fresh={fresh} shards={shards} onClose={onClose} onAgain={onAgain} canAgain={coins >= priceOf(booster)} price={priceOf(booster)} u={u} />}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 流星降臨: the live-rendered cinematic that delivers the pack
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Launch: the pack (or a bundle of them) floats over the night lake. Swipe it
// up and it flies into the sky, becomes a star, and falls back as the meteor.
// ---------------------------------------------------------------------------
/** where the cinematic waits (seconds into its opening): the lake, the far peaks, the moon */
const LAUNCH_HOLD = 1.5;

/** seconds between packs of a bundle leaving one after another */
const LAUNCH_GAP = 0.11;
const LAUNCH_FLIGHT = 0.62;

/** thrown into the sky ahead: the pack tips over backwards and shrinks into the distance */
function flightPath(w: number, h: number, seed: number) {
  const drift = (seed - 0.5) * 0.08 * w; // the front pack goes straight; the rest wander a little
  const spanY = (0.24 + seed * 0.05) * h;
  const N = 9;
  const x: number[] = [];
  const y: number[] = [];
  const rotateX: number[] = [];
  const scale: number[] = [];
  const opacity: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = Math.pow(t, 1.3); // slow out of the hand, fast into the sky
    x.push(drift * s);
    y.push(-spanY * (1 - Math.pow(1 - s, 1.8)));
    rotateX.push(62 * Math.pow(s, 0.6)); // the top falls away from you
    scale.push(1 - 0.95 * Math.pow(s, 0.7));
    opacity.push(t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
  }
  return { x, y, rotateX, scale, opacity };
}

function PackLaunch({ booster, packs, u, onLaunch, onGone }: { booster: Booster; packs: number; u: number; onLaunch: (points: { x: number; y: number; delay: number }[]) => void; onGone: () => void }) {
  const n = Math.min(packs, 10);
  const y = useMotionValue(0);
  const box = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  /** how far the pack had been pulled up when it was let go (the flights start from there) */
  const [from, setFrom] = useState(0);
  const [hint, hideHint] = useIdleHint('launch', 900);
  const lift = useTransform(y, [-u * 14, 0], [1, 0]);
  const tilt = useTransform(y, [-u * 14, 0, u * 4], [-6, 0, 2]);
  const glow = useTransform(lift, (v) => 0.25 + v * 0.75);
  const shadow = useTransform(lift, [0, 1], [0.7, 0]);
  const W = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const H = typeof window !== 'undefined' ? window.innerHeight : 600;
  /** one flight per pack, by launch order (0 = the front pack, first to go) */
  const paths = useMemo(() => Array.from({ length: n }, (_, o) => flightPath(W, H, o === 0 ? 0.5 : Math.random())), [n, W, H]);
  const restOf = (o: number) => ({ x: o * u * 0.32, y: o * u * 0.26, rotate: n > 1 ? (o % 2 ? 1.2 : -1.2) * Math.min(1, o) : 0, scale: 1, opacity: 1 });

  const launch = () => {
    if (gone) return;
    hideHint();
    const r = box.current?.getBoundingClientRect();
    // the holder must not spring back down under the packs: freeze it and hand its offset to the flights
    const pulled = y.get();
    setFrom(pulled);
    setGone(true);
    const still = () => {
      y.stop();
      y.jump(0);
    };
    still();
    requestAnimationFrame(still);
    if (r) {
      // where each pack ends as a point of light; the 3D star carries on from there
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      onLaunch(
        paths.map((p, o) => ({ x: cx + restOf(o).x + p.x[p.x.length - 1], y: cy + restOf(o).y + p.y[p.y.length - 1], delay: o * LAUNCH_GAP + LAUNCH_FLIGHT * 0.88 })),
      );
    }
    sfx('magic-holy-2', 0.3);
    // one whoosh per pack: shun, shun, shun…
    for (let o = 0; o < n; o++)
      setTimeout(() => {
        foley.whoosh();
        vibrate(o === 0 ? 18 : 8);
      }, o * LAUNCH_GAP * 1000);
    setTimeout(onGone, ((n - 1) * LAUNCH_GAP + LAUNCH_FLIGHT * 0.85) * 1000);
  };

  return (
    <div className="launch">
      <motion.div className="launch-title" initial={{ opacity: 0, y: -8 }} animate={{ opacity: gone ? 0 : 1, y: 0 }} transition={{ duration: 0.6, delay: gone ? 0 : 0.4 }}>
        {packs > 1 ? `${packs}パックを空へ` : 'パックを空へ'}
      </motion.div>
      <div className="tear-wrap launch-wrap">
        <motion.div
          ref={box}
          className={`launch-pack ${gone ? 'gone' : ''}`}
          style={{ y, rotate: tilt }}
          drag={gone ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.75, bottom: 0.12 }}
          dragTransition={{ bounceStiffness: 380, bounceDamping: 24 }}
          onDragStart={hideHint}
          onDragEnd={(_, info) => {
            if (info.offset.y < -u * 5 || info.velocity.y < -550) launch();
          }}
          onTap={() => !gone && animate(y, [0, -u * 2.2, 0], { duration: 0.55, ease: 'easeOut' })}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        >
          {/* the light it leaves behind as it rises */}
          <motion.div className="launch-glow" style={{ opacity: glow }} animate={gone ? { opacity: 0 } : undefined} transition={{ duration: 0.4 }} />
          {Array.from({ length: n }, (_, k) => {
            const order = n - 1 - k; // 0 = the front pack, which leaves first
            const rest = restOf(order);
            const path = paths[order];
            return (
              <motion.div
                key={k}
                className="launch-one"
                style={{ zIndex: k, transformPerspective: 1100 }}
                initial={false}
                animate={
                  gone
                    ? { x: path.x.map((v) => v + rest.x), y: path.y.map((v) => v + rest.y + from), rotate: 0, rotateX: path.rotateX, scale: path.scale, opacity: path.opacity, filter: ['brightness(1)', 'brightness(1.6)', 'brightness(2.6)'] }
                    : rest
                }
                transition={gone ? { duration: LAUNCH_FLIGHT, delay: order * LAUNCH_GAP, ease: 'linear' } : { duration: 0.3 }}
              >
                <BoosterPack booster={booster} still={k !== n - 1} />
                {gone && <motion.i className="launch-trail" initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 1, 0.9, 0], scaleY: [0.2, 1, 1.4, 1.6] }} transition={{ duration: LAUNCH_FLIGHT, delay: order * LAUNCH_GAP, times: [0, 0.3, 0.8, 1] }} />}
              </motion.div>
            );
          })}
        </motion.div>
        <motion.div className="launch-shadow" style={{ opacity: shadow }} animate={gone ? { opacity: 0 } : undefined} />
      </div>
      <AnimatePresence>
        {!gone && (
          <motion.div className="launch-cue" initial={{ opacity: 0 }} animate={{ opacity: hint ? 1 : 0.55 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <div className="launch-chev">
              <i />
              <i />
              <i />
            </div>
            上にスワイプして、空へ
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface AuraState {
  tier: OmenTier;
  visible: boolean;
  hot: boolean;
}

interface CinemaApi {
  release: (points: { x: number; y: number; delay: number }[]) => void;
}

function CinemaLayer({ omen, god, aura, held, playing, api, target, onDone }: { omen: Omen; god: boolean; aura: AuraState; held: boolean; playing: boolean; api: React.MutableRefObject<CinemaApi | null>; target: () => DOMRect | null; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cine = useRef<MeteorCinema | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!host.current) return;
    let c: MeteorCinema;
    try {
      c = new MeteorCinema(host.current, {
        tier: omen.shown,
        god,
        meteors: omen.meteors,
        target,
        holdAt: LAUNCH_HOLD,
        onBeat: (b) => {
          if (b === 'twinkle') {
            foley.chime(4 + omen.shown);
            foley.sparkle();
          } else if (b === 'enter') {
            foley.whoosh();
            if (omen.shown >= 2) setTimeout(() => foley.sparkle(), 250);
            if (god) setTimeout(() => foley.rarity(5), 700);
          } else if (b === 'dive') foley.charge();
          else if (b === 'impact') {
            foley.impact();
            sfx('rumble', 0.5);
          } else if (b === 'orb') foley.chime(3 + omen.shown);
          else if (b === 'morph') sfx('magic-holy-2', 0.4);
        },
        onDone: () => doneRef.current(),
      });
    } catch {
      // no WebGL: go straight to the pack
      setTimeout(() => doneRef.current(), 0);
      return;
    }
    cine.current = c;
    api.current = { release: (pts) => c.release(pts) };
    c.play();
    return () => {
      c.dispose();
      cine.current = null;
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => cine.current?.setIdle(!playing), [playing]);
  useEffect(() => cine.current?.setAura(aura.tier, aura.visible, aura.hot), [aura]);

  return (
    <>
      <motion.div className="cine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
        <div ref={host} className="cine-host" />
      </motion.div>
      {/* tap anywhere to skip; lives outside .cine so it sits above the stage */}
      {playing && !held && (
        <>
          <div className="cine-tap" onPointerDown={() => cine.current?.skip()} />
          <button className="textbtn po-skip cine-skip" onClick={() => cine.current?.skip()}>
            スキップ
          </button>
        </>
      )}
    </>
  );
}

interface TearProps {
  booster: Booster;
  god: boolean;
  u: number;
  cards: CardDef[];
  omen: Omen;
  packs: number;
  onAura: (a: AuraState) => void;
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onDone: () => void;
}

function TearStage({ booster, god, u, cards, omen, packs, onAura, burstAt, onDone }: TearProps) {
  // aura: starts at the omen shown by the meteors and climbs to the truth
  const [aura, setAura] = useState<OmenTier>(omen.shown);
  const [shaking, setShaking] = useState(false);
  const [promo, setPromo] = useState(0);
  const locked = aura < omen.actual;
  useEffect(() => {
    if (omen.actual <= omen.shown) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 1100;
    for (let tier = omen.shown + 1; tier <= omen.actual; tier++) {
      const t = tier as OmenTier;
      timers.push(setTimeout(() => {
        setShaking(true);
        foley.charge();
      }, at));
      timers.push(setTimeout(() => {
        setShaking(false);
        setAura(t);
        setPromo((n) => n + 1);
        foley.impact();
        foley.rarity(2 + t);
        sfx('magic-holy-2', 0.5);
        const r = packRef.current?.getBoundingClientRect();
        if (r) {
          burstAt(r.left + r.width / 2, r.top + r.height / 2, `aura${t}`, 70, 1.6);
          burstAt(r.left + r.width / 2, r.top + r.height / 2, 'sparkw', 30, 1.4);
        }
      }, at + 750));
      at += 1500;
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // drifting motes around the pack in the aura colour
  useEffect(() => {
    const iv = setInterval(() => {
      const r = packRef.current?.getBoundingClientRect();
      if (!r) return;
      const edge = Math.random() * 4;
      const x = edge < 1 ? r.left : edge < 2 ? r.right : r.left + Math.random() * r.width;
      const y = edge < 2 ? r.top + Math.random() * r.height : edge < 3 ? r.top : r.bottom;
      burstAt(x, y, `aura${auraRef.current}`, auraRef.current === 0 ? 1 : 2, 0.9);
    }, 130);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const auraRef = useRef(aura);
  auraRef.current = aura;
  const packRef = useRef<HTMLDivElement>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [torn, setTorn] = useState(false);
  const [active, setActive] = useState(false);
  const [hint, hideHint] = useIdleHint('tear', 1800);
  // the traced cut, in percent of the pack box; only points inside TEAR_BAND count
  const pathRef = useRef<[number, number][]>([]);
  const [path, setPath] = useState<[number, number][]>([]);
  const [outside, setOutside] = useState(false);
  const g = useRef<{ dir: 0 | 1 | -1; lost: boolean; lastBuzz: number; lastT: number; lastX: number; speed: number; t0: number } | null>(null);
  // the tear's sound follows the finger speed
  const sound = useRef<ReturnType<typeof tearLoop>>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const stopSound = () => {
    clearTimeout(idleTimer.current);
    sound.current?.stop();
    sound.current = null;
  };
  useEffect(() => stopSound, []);
  // the cut strip peels up from where the finger started (pivoting on the uncut end)
  const lift = useMotionValue(0); // signed progress
  const stripRot = useTransform(lift, (v) => v * 4.5);
  const stripY = useTransform(lift, (v) => -Math.abs(v) * u * 0.35);
  const [snap, setSnap] = useState(false);
  const [healing, setHealing] = useState(false);
  const finishing = useRef(false);
  const buzz = vibrate;
  useEffect(() => onAura({ tier: aura, visible: !torn, hot: shaking }), [aura, torn, shaking, onAura]);

  const B0 = TEAR_BAND[0] * 100;
  const B1 = TEAR_BAND[1] * 100;
  const cutting = path.length >= 2;
  const tip = path[path.length - 1];
  const span = cutting ? Math.abs(tip[0] - path[0][0]) : 0;
  const progress = Math.min(1, span / 70);
  const clips = useMemo(() => tearClips(tearEdgeFrom(path.length >= 2 ? path : [])), [path]);
  const seam = path.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const pivot = cutting ? `${dir > 0 ? 100 : 0}% ${tip[1]}%` : dir > 0 ? '100% 7%' : '0% 7%';
  const seamY = cutting ? path.reduce((a, p) => a + p[1], 0) / path.length : TEAR_Y * 100;

  const toPct = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const r = packRef.current?.getBoundingClientRect();
    if (!r) return null;
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };
  const pctToClient = ([x, y]: [number, number]) => {
    const r = packRef.current!.getBoundingClientRect();
    return [r.left + (r.width * x) / 100, r.top + (r.height * y) / 100] as const;
  };

  const finish = () => {
    if (torn || locked || finishing.current) return;
    finishing.current = true;
    hideHint();
    setOutside(false);
    // keyboard / auto-complete: run the cut straight to the far side
    let pts = pathRef.current;
    let d = dir;
    if (pts.length < 2) {
      pts = [[0, TEAR_Y * 100], [100, TEAR_Y * 100]];
      d = 1;
      setDir(1);
    }
    pathRef.current = pts;
    setPath(pts);
    animate(lift, d, { duration: 0.08 });
    // a quick swipe rips short and bright, a slow pull long and low
    const s0 = g.current;
    const secs = s0 && pts.length >= 2 ? (performance.now() - s0.t0) / 1000 : 0.3;
    const sweep = pts.length >= 2 ? Math.abs(pts[pts.length - 1][0] - pts[0][0]) : 100;
    stopSound();
    foley.rip(Math.min(1, sweep / 100 / Math.max(0.05, secs) / 2.2));
    buzz([0, 28]);
    // hit-stop: the pack freezes bright for a beat, then the strip flies off
    setSnap(true);
    if (packRef.current) {
      const n = 12;
      for (let k = 0; k <= n; k++) {
        const p = pts[Math.round((k / n) * (pts.length - 1))];
        setTimeout(() => {
          const [cx, cy] = pctToClient(p);
          burstAt(cx, cy, k % 2 ? 'glint' : 'sparkw', 2, 1);
        }, k * 10);
      }
      const [ex, ey] = pctToClient(pts[pts.length - 1]);
      burstAt(ex, ey, 'glint', 16, 1.3);
      const r = packRef.current.getBoundingClientRect();
      const my = r.top + (r.height * pts.reduce((a, p) => a + p[1], 0)) / pts.length / 100;
      setTimeout(() => burstAt(r.left + r.width / 2, my, 'mote', 50, 1.5), 140);
      setTimeout(() => burstAt(r.left + r.width / 2, my, `aura${auraRef.current}`, 30, 1.3), 180);
    }
    setTimeout(() => {
      setSnap(false);
      setTorn(true);
    }, 120);
    setTimeout(() => foley.slide(), 640);
    setTimeout(onDone, 1620);
  };

  // the key handler always calls the latest finish (lock state changes while waiting)
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') finishRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const heal = () => {
    // not far enough: the seam closes up again
    setHealing(true);
    stopSound();
    animate(lift, 0, { type: 'spring', stiffness: 420, damping: 18 });
    setTimeout(() => {
      pathRef.current = [];
      setPath([]);
      setHealing(false);
      setOutside(false);
    }, 260);
  };

  const addPoint = (pt: [number, number]) => {
    const s = g.current;
    if (!s || torn || finishing.current) return;
    const [x, y] = pt;
    const pts = pathRef.current;
    const inBand = y >= B0 && y <= B1 && x >= -12 && x <= 112;
    if (!inBand) {
      // off the line: the blade stops until the finger comes back to the tip
      if (pts.length && !s.lost) {
        s.lost = true;
        setOutside(true);
        buzz(18);
        sound.current?.idle();
      }
      return;
    }
    const cx = Math.max(0, Math.min(100, x));
    if (!pts.length) {
      pathRef.current = [[cx, y]];
      s.lastX = cx;
      s.lastT = performance.now();
      s.t0 = s.lastT;
      return;
    }
    const last = pts[pts.length - 1];
    if (s.lost) {
      if (Math.abs(cx - last[0]) > 9) return;
      s.lost = false;
      setOutside(false);
    }
    if (s.dir === 0) {
      if (Math.abs(cx - last[0]) < 2) {
        pathRef.current = [[cx, y]];
        return;
      }
      s.dir = cx > last[0] ? 1 : -1;
      setDir(s.dir);
    }
    const adv = (cx - last[0]) * s.dir;
    if (adv < 0.8) return;
    const next: [number, number][] = [...pts, [cx, y]];
    pathRef.current = next;
    setPath(next);
    const p = Math.min(1, Math.abs(cx - next[0][0]) / 70);
    lift.set(s.dir * p);
    const [hx, hy] = pctToClient([cx, y]);
    burstAt(hx, hy, 'sparkw', 1, 0.8);
    if (Math.random() < 0.35) burstAt(hx, hy, `aura${auraRef.current}`, 1, 0.8);
    // finger speed in pack widths per second, smoothed
    const now = performance.now();
    const v = Math.abs(cx - s.lastX) / 100 / Math.max(0.008, (now - s.lastT) / 1000);
    s.speed = s.speed * 0.6 + v * 0.4;
    s.lastX = cx;
    s.lastT = now;
    if (!sound.current) sound.current = tearLoop();
    sound.current?.update(s.speed / 2.2);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => sound.current?.idle(), 90);
    // a light tick every ~7% of the cut
    if (p - s.lastBuzz > 0.07) {
      s.lastBuzz = p;
      buzz(6);
    }
    if (p >= 1 || (s.dir > 0 ? cx >= 100 : cx <= 0)) {
      if (p >= 0.6) {
        setActive(false);
        finish();
        g.current = null;
      }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (torn || locked || finishing.current || healing) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    g.current = { dir: 0, lost: false, lastBuzz: 0, lastT: 0, lastX: 0, speed: 0, t0: performance.now() };
    pathRef.current = [];
    setActive(true);
    hideHint();
    const pt = toPct(e);
    if (pt) addPoint(pt);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!g.current) return;
    // use the coalesced samples so a fast stroke still follows the finger
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e]) {
      const pt = toPct(ev);
      if (pt) addPoint(pt);
    }
  };
  const onUp = () => {
    const s = g.current;
    setActive(false);
    if (!s || torn || finishing.current) {
      g.current = null;
      return;
    }
    const pts = pathRef.current;
    const done = pts.length >= 2 ? Math.abs(pts[pts.length - 1][0] - pts[0][0]) / 70 : 0;
    if (done >= 0.7) finish();
    else if (pts.length) heal();
    g.current = null;
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

      <div className="tear-wrap" style={{ ['--ac' as string]: OMEN_COLORS[aura] }}>
        <PackAura tier={aura} promo={promo} />
        {packs > 1 && (
          <motion.div className="tear-bundle" initial={{ opacity: 0 }} animate={{ opacity: torn ? 0 : 1 }} transition={{ duration: torn ? 0.3 : 0.6, delay: torn ? 0 : 0.2 }}>
            {[3, 2, 1].map((k) => (
              <div key={k} className="tb-sheet" style={{ transform: `translate(${k * u * 0.55}px, ${k * u * 0.35}px) rotate(${k * 1.6}deg)`, opacity: 1 - k * 0.18 }}>
                <BoosterPack booster={booster} still god={god} />
              </div>
            ))}
            <span className="tb-count">
              <small>×</small>
              {packs}
            </span>
          </motion.div>
        )}
        <motion.div
          className="tear-press"
          animate={snap ? { scale: 1.035, rotate: 0 } : active ? { scale: 0.985, rotate: -dir * 0.6 } : { scale: 1, rotate: 0 }}
          transition={snap ? { duration: 0.06 } : { type: 'spring', stiffness: 380, damping: 22 }}
          style={{ filter: snap ? 'brightness(1.8) saturate(0.6)' : undefined }}
        >
          <motion.div
            className={`tear-float ${shaking ? 'shaking' : ''}`}
            ref={packRef}
            initial={{ opacity: 0, filter: 'brightness(4) saturate(0)' }}
            animate={torn ? { y: 0, opacity: 1, filter: 'brightness(1) saturate(1)' } : { y: [0, -u * 0.45, 0], opacity: 1, filter: 'brightness(1) saturate(1)' }}
            transition={
              torn
                ? { duration: 0.3 }
                : { y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.35 }, filter: { duration: 0.9, ease: EASE_OUT } }
            }
          >
            {torn && (
              <motion.div className="tear-beam" initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 0.9, 0], scaleY: [0.2, 1, 1.15] }} transition={{ delay: 0.25, duration: 1.3, times: [0, 0.35, 1], ease: 'easeOut' }} />
            )}
            {!torn && !cutting && <BoosterPack booster={booster} tilt={!active} god={god} />}
            {!torn && cutting && (
              <>
                <div className="tear-part" style={{ zIndex: 4 }}>
                  <BoosterPack booster={booster} part="body" god={god} clip={clips.body} />
                </div>
                <svg className="tear-leak" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: healing ? 0 : Math.min(1, 0.35 + progress) }}>
                  <polyline points={seam} />
                </svg>
                <motion.div className="tear-part" style={{ zIndex: 9, transformOrigin: pivot, rotate: stripRot, y: stripY }}>
                  <BoosterPack booster={booster} part="top" god={god} clip={clips.top} />
                </motion.div>
              </>
            )}
            {torn && (
              <>
                <motion.div
                  className="tear-part"
                  style={{ zIndex: 4 }}
                  initial={{ y: 0, opacity: 1 }}
                  animate={packs > 1 ? { y: u * 30, opacity: 0 } : { y: u * 70, opacity: 1 }}
                  transition={{ delay: 0.38, duration: 0.85, ease: EASE_IN }}
                >
                  <BoosterPack booster={booster} part="body" god={god} clip={clips.body} />
                </motion.div>
                <motion.div
                  className="tear-part"
                  style={{ zIndex: 9, transformOrigin: pivot }}
                  initial={{ x: 0, y: 0, rotate: lift.get() * 4.5, opacity: 1 }}
                  animate={{ x: dir * u * 9, y: -u * 13, rotate: dir * 16, opacity: [1, 1, 0] }}
                  transition={{ duration: 1.0, ease: EASE_OUT, opacity: { duration: 1.0, times: [0, 0.55, 1] } }}
                >
                  <BoosterPack booster={booster} part="top" god={god} clip={clips.top} />
                </motion.div>
                <motion.div
                  className="tear-bloom"
                  style={{ top: `${seamY}%` }}
                  initial={{ opacity: 0, scaleX: 0.2, scaleY: 0.5 }}
                  animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1.25], scaleY: [0.5, 1, 0.7] }}
                  transition={{ duration: 0.75, times: [0, 0.2, 1], ease: 'easeOut' }}
                />
              </>
            )}
            {!torn && (
              <>
                <div className={`tear-band ${active ? 'on' : ''} ${outside ? 'warn' : ''}`} style={{ top: `${B0}%`, height: `${B1 - B0}%` }} />
                {!cutting && <div className="tear-guide" style={{ top: `${TEAR_Y * 100}%` }} />}
                {cutting && (
                  <svg className={`tear-seam ${healing ? 'heal' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline points={seam} />
                  </svg>
                )}
                {cutting && !healing && <div className={`tear-head ${outside ? 'stop' : ''}`} style={{ left: `${tip[0]}%`, top: `${tip[1]}%` }} />}
                {!active && !cutting && (
                  <motion.div
                    className="tear-dot"
                    style={{ top: `${TEAR_Y * 100}%` }}
                    initial={{ left: '6%', opacity: 0 }}
                    animate={{ left: ['6%', '94%'], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.6, times: [0, 0.15, 0.8, 1], repeat: Infinity, repeatDelay: 0.9, ease: EASE_IN_OUT }}
                  />
                )}
                <div className="tear-zone" style={{ top: `${B0 - 7}%`, height: `${B1 - B0 + 14}%` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
      {torn && packs > 1 && <TornPile booster={booster} u={u} n={Math.min(packs, 10)} fall />}
      <AnimatePresence>
        {snap && <motion.div key="snap" className="tear-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0.9 }} exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }} />}
      </AnimatePresence>
      <AnimatePresence>
        {outside && !torn && (
          <motion.div key="out" className="po-hint warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            光の帯の中をなぞってください
          </motion.div>
        )}
        {hint && !outside && !torn && !locked && (
          <motion.div key="hint" className="po-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            パックの上のほうを好きな線でなぞって開封
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 昇格 burst: a shock ring and a flash when the aura climbs (the flames themselves are drawn in 3D) */
function PackAura({ tier, promo }: { tier: OmenTier; promo: number }) {
  return (
    <div className={`aura t${tier}`} style={{ ['--ac' as string]: OMEN_COLORS[tier] }}>
      <AnimatePresence>
        {promo > 0 && (
          <motion.div key={promo} className="aura-burst" initial={{ opacity: 1, scale: 0.6 }} animate={{ opacity: 0, scale: 2.6 }} transition={{ duration: 1.1, ease: EASE_OUT }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {promo > 0 && (
          <motion.div key={`f${promo}`} className="aura-flash" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
        )}
      </AnimatePresence>
    </div>
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
  // Which face shows is decided here from the flip angle, not left to backface-visibility:
  // iOS Safari lets the front show through the back of a card with layered effects.
  const ry = useMotionValue(faceDown ? 180 : 0);
  const frontVis = useTransform(ry, (a) => (Math.abs(((a % 360) + 360) % 360 - 180) >= 90 ? 'visible' : 'hidden'));
  const backVis = useTransform(ry, (a) => (Math.abs(((a % 360) + 360) % 360 - 180) < 90 ? 'visible' : 'hidden'));
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
    } else if (rank === 3) {
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
      foley.rarity(rank >= RARITY_ORDER.CR ? 5 : 4);
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
        style={{ x, rotate, opacity, rotateY: ry, ['--rc' as string]: rc }}
        initial={{ rotateY: faceDown ? 180 : 0, scale: 0.985 }}
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
        <motion.div className="sc-face" style={{ visibility: frontVis }}>
          <CardFace cid={card.id} interactive={up} />
          {(rank === 3 || card.variant === 'mirror' || (star && up)) && <div className="glare" />}
        </motion.div>
        <motion.div className="sc-back" style={{ visibility: backVis }}>
          <CardBack />
          {!up && <div className="edge-light" />}
        </motion.div>
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
// 10連: the opened packs tumble down and pile up at the bottom of the screen
// ---------------------------------------------------------------------------
function pileSpot(k: number) {
  const r = (n: number) => {
    const v = Math.sin((k + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: (r(1) - 0.5) * 70, y: r(2) * 5, rot: (r(3) - 0.5) * 80 };
}

function TornPile({ booster, u, n, fall }: { booster: Booster; u: number; n: number; fall: boolean }) {
  // a soft thud as each pack lands
  useEffect(() => {
    if (!fall) return;
    const ts = Array.from({ length: n }, (_, k) => setTimeout(() => foley.place(), 350 + k * 90 + 700));
    return () => ts.forEach(clearTimeout);
  }, [fall, n]);
  return (
    <div className="torn-pile">
      {Array.from({ length: n }, (_, k) => {
        const p = pileSpot(k);
        return (
          <motion.div
            key={k}
            className="torn-piece"
            style={{ zIndex: k }}
            initial={fall ? { x: 0, y: -u * 30, scale: 2, rotate: 0, opacity: 0 } : false}
            animate={{ x: p.x * u, y: p.y * u, scale: 1, rotate: p.rot, opacity: 1 }}
            transition={fall ? { delay: 0.35 + k * 0.09, duration: 0.75, ease: [0.3, 0, 0.2, 1], opacity: { delay: 0.35 + k * 0.09, duration: 0.05 } } : { duration: 0 }}
          >
            <BoosterPack booster={booster} part="body" still />
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10連 results: every card at once, rarest last; ☆ / ♛ wait face down
// ---------------------------------------------------------------------------
interface MultiProps {
  /** cards already turned over one by one before the list */
  opened?: Set<number>;
  cards: CardDef[];
  fresh: Set<string>;
  shards: Set<number>;
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onClose: () => void;
  onAgain: () => void;
  canAgain: boolean;
  price: number;
  u: number;
}

function MultiResults({ opened, cards, fresh, shards, burstAt, onClose, onAgain, canAgain, price, u }: MultiProps) {
  // keep each card's original index (shard flags refer to it), sort rarest last
  const items = useMemo(
    () =>
      cards
        .map((c, i) => ({ c, i }))
        .sort((a, b) => RARITY_ORDER[a.c.rarity] - RARITY_ORDER[b.c.rarity] || (a.c.variant ? 1 : 0) - (b.c.variant ? 1 : 0) || a.i - b.i),
    [cards],
  );
  const hidden = items.filter((x) => isStar(x.c.rarity)).map((x) => x.i);
  const [open, setOpen] = useState<Set<number>>(() => new Set(opened ?? []));
  const [onlyNew, setOnlyNew] = useState(false);
  const newCount = items.filter((x) => fresh.has(x.c.id)).length;
  const [zoom, setZoom] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: number; color: string } | null>(null);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const running = useRef(false);
  const left = hidden.filter((i) => !open.has(i));
  const deal = 0.05 + items.length * 0.018;

  useEffect(() => {
    for (let k = 0; k < Math.min(12, items.length); k++) setTimeout(() => foley.slide(), 60 + k * 70);
    // a shimmer for the RR (◇◇◇◇) cards as they land
    items.forEach((x, k) => {
      if (RARITY_ORDER[x.c.rarity] !== RARITY_ORDER.RR) return;
      setTimeout(() => {
        const r = refs.current.get(x.i)?.getBoundingClientRect();
        if (r) burstAt(r.left + r.width / 2, r.top + r.height / 2, 'glint', 5, 0.7);
      }, 500 + k * 18);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reveal = (i: number) => {
    if (open.has(i)) return;
    const c = cards[i];
    setOpen((s) => new Set(s).add(i));
    setFlash({ id: Date.now() + i, color: rareColor(c.rarity) });
    foley.impact();
    foley.rarity(RARITY_ORDER[c.rarity] >= RARITY_ORDER.CR ? 5 : 4);
    sfx('magic-holy-2', 0.3);
    const r = refs.current.get(i)?.getBoundingClientRect();
    if (r) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      burstAt(cx, cy, 'glint', 26, 1.1);
      burstAt(cx, cy, 'mote', 30, 1.2);
      burstAt(cx, cy, 'sparkw', 14, 1);
    }
  };
  const revealAll = () => {
    if (running.current) return;
    running.current = true;
    left.forEach((i, k) => setTimeout(() => reveal(i), k * 520));
    setTimeout(() => (running.current = false), left.length * 520);
  };

  const cols = items.length > 30 ? 10 : 5;
  const w = items.length > 30 ? 6.05 : 9.6;
  return (
    <div className="multi">
      <div className="multi-head">
        <span>{cards.length}枚のカード</span>
        {hidden.length > 0 && (
          <em>
            ☆以上 <b>{hidden.length}</b>枚
          </em>
        )}
        <div className="seg multi-filter">
          <button className={!onlyNew ? 'on' : ''} onClick={() => setOnlyNew(false)}>
            すべて
          </button>
          <button className={onlyNew ? 'on' : ''} disabled={newCount === 0} onClick={() => setOnlyNew(true)}>
            NEWのみ（{newCount}）
          </button>
        </div>
      </div>
      <div className="multi-grid" style={{ gridTemplateColumns: `repeat(${cols}, calc(var(--u) * ${w}))` }}>
        {items.map(({ c, i }, k) => {
          if (onlyNew && !fresh.has(c.id)) return null;
          const star = isStar(c.rarity);
          const down = star && !open.has(i);
          const rank = RARITY_ORDER[c.rarity];
          return (
            <motion.div
              key={i}
              ref={(el) => {
                if (el) refs.current.set(i, el);
              }}
              className={`multi-item r${rank} ${down ? 'down' : ''}`}
              style={{ ['--rc' as string]: rareColor(c.rarity) }}
              initial={{ opacity: 0, y: u * 1.2, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.05 + k * 0.018, duration: 0.5, ease: EASE_OUT }}
              whileHover={{ y: -u * 0.4, transition: { duration: 0.2, ease: EASE_OUT } }}
              onClick={() => {
                if (down) reveal(i);
                else {
                  foley.flip();
                  setZoom(c.id);
                }
              }}
            >
              <motion.div className={`multi-flip ${down ? 'down' : ''}`} initial={false} animate={{ rotateY: down ? 180 : 0 }} transition={{ duration: 0.6, ease: EASE_IN_OUT }}>
                <div className="sc-face">
                  <CardFace cid={c.id} />
                  {(rank >= 3 || (star && open.has(i))) && <div className="glare" style={{ animationDelay: star ? '0.3s' : `${deal + 0.1}s` }} />}
                </div>
                <div className="sc-back">
                  <CardBack />
                  {down && <div className="edge-light" />}
                </div>
              </motion.div>
              {down && <motion.div className="multi-halo" animate={{ opacity: [0.35, 0.7, 0.35] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />}
              {!down && fresh.has(c.id) && <span className="new">NEW</span>}
              {!down && shards.has(i) && (
                <span className="shard-tag">
                  <Icon name="shard" />
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <motion.div className="results-actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: deal + 0.3, duration: 0.5, ease: EASE_OUT }}>
        {left.length > 0 ? (
          <button className="pill gold" onClick={revealAll}>
            すべてめくる（{left.length}）
          </button>
        ) : (
          <>
            <button className="pill ghost" onClick={onClose}>
              とじる
            </button>
            <button className="pill" disabled={!canAgain} onClick={onAgain}>
              もう一度10パック
              <span className="coin">
                <Icon name="coin" /> {price}
              </span>
            </button>
          </>
        )}
      </motion.div>
      <AnimatePresence>
        {flash && (
          <motion.div key={flash.id} className="multi-flash" style={{ ['--rc' as string]: flash.color }} initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
        )}
      </AnimatePresence>
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
            5枚目は<b>◇◇◇◇以上</b>確定
          </li>
          <li>
            ☆・♛ の出現数 通常の<b>約6倍</b>
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
            <div className="pu-desc">{RARITY_SYMBOL[pickup.card.rarity]} が出たとき、50%でこのカードに</div>
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
THEMES.forEach((t) => byName(t.mascot));
