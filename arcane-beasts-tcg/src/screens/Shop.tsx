// ============================================================================
// Pack opening, modelled on the TCG Pocket flow:
//   通常 / プレミアム → hold the pack to charge it (its light builds up in the
//   omen colour and may climb, 昇格) and let go → trace the top edge to tear
//   it → swipe through the cards (rarest last;
//   ★4 / ★5 arrive face-down and turn over on tap) → results
// Effects are light-based (bloom, rings, glints); motion is transform/opacity.
// ============================================================================
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardDef, Rarity } from '../engine/types';
import { byName, RARITY_COLOR, RARITY_SYMBOL } from '../engine/cards';
import { dayKey } from '../state/progress';
import { CHAPTER_BOOSTERS, SPECIAL_BOOSTER, SPECIAL_TABLE, SURE3_BOOSTER, TYPE_BOOSTERS, BOOSTERS, NORMAL_BOOSTER, openPack, PACK_TABLE, PREMIUM_BOOSTER, PREMIUM_TABLE, PRINTING_CHANCE, PREMIUM_PRINTING_CHANCE, TEN_PACKS, freePackState, FREE_PACKS_PER_DAY, FREE_PACK_GAP_MS, useStore, type FreePackState, type Booster } from '../state/store';
import { CardBack, CardFace } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { Icon } from '../ui/Icon';
import type { MonsterCard } from '../engine/types';
import { artUrl } from '../lib/assets';
import { chargeLoop, foley, playMusic, sfx, tearLoop } from '../audio/audio';
import { particles } from '../battle/particles';
import { BoosterPack, TEAR_BAND, TEAR_Y, tearClips, tearEdgeFrom } from './pack/BoosterPack';
import { CINE_SLOW, MeteorCinema, OMEN_COLORS, type OmenTier } from './pack/cinema';
import './pack/pack.css';
import { GachaView } from './Gacha';
import { isPickup, pickupBooster, pickupNow, pickupPoints } from '../state/pickup';
import { vibrate } from '../lib/fx';

type Phase = 'tear' | 'reveal' | 'results' | 'multi';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/** ★4 and ★5 arrive face-down and turn over on tap */
const isStar = (r: Rarity) => r >= 4;
const rareColor = (r: Rarity) => (r >= 3 ? RARITY_COLOR[r] : '#ffffff');
const priceOf = (b: Booster) => b.price;
/** h:mm:ss */
const fmtWait = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
/** what n packs cost: a 10連 is 9 packs' price */
const costOf = (b: Booster, n: number) => (n >= 10 && b.tenPrice ? b.tenPrice * Math.floor(n / 10) + priceOf(b) * (n % 10) : priceOf(b) * (n >= 10 ? TEN_PACKS * Math.floor(n / 10) + (n % 10) : n));

// ---------------------------------------------------------------------------
// Omen (予兆) and promotion (昇格)
//   actual: the best ★ in the pack (grey / blue / gold / rainbow / rainbow-gold)
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
const cardTier = (c: CardDef): OmenTier => c.rarity;
function makeOmen(cards: CardDef[], god: boolean): Omen {
  const tiers = cards.map(cardTier).sort((a, b) => b - a);
  const actual = (god ? 5 : tiers[0]) as OmenTier;
  let shown = actual;
  const r = Math.random();
  // sometimes the meteors hide the truth, and the aura climbs (昇格) before the pack opens
  if (actual === 5) shown = (r < 0.2 ? 3 : r < 0.55 ? 4 : 5) as OmenTier;
  else if (actual === 4) shown = (r < 0.35 ? 3 : 4) as OmenTier;
  else if (actual === 3) shown = (r < 0.25 ? 2 : 3) as OmenTier;
  const dbg = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('omen') : null; // e.g. ?omen=3,1
  if (dbg) {
    const [a, b] = dbg.split(',').map(Number);
    return { actual: a as OmenTier, shown: (b ?? a) as OmenTier, meteors: tiers.map((t, i) => (i === 0 ? ((b ?? a) as OmenTier) : (Math.min(t, b ?? a) as OmenTier))) };
  }
  const meteors = tiers.map((t, i) => (i === 0 ? shown : (Math.min(t, shown) as OmenTier)));
  return { actual, shown, meteors };
}

/** true while the screen is taller than wide */
function usePortrait() {
  const q = typeof window !== 'undefined' ? window.matchMedia('(orientation: portrait)') : null;
  const [p, setP] = useState(() => !!q?.matches);
  useEffect(() => {
    if (!q) return;
    const on = () => setP(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [q]);
  return p;
}

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
/** how a pack was paid for: the daily free one, gems, or a ticket */
type Via = 'free' | 'gem' | 'ticket';

/** can `packs` of this pack be opened that way right now */
function canOpen(b: Booster, packs: number, via: Via): boolean {
  const s = useStore.getState().save;
  if (via === 'free') return !!b.free && packs === 1 && freePackState(s).ready;
  if (via === 'ticket') return (b.sure3 ? s.packTickets?.sure3 ?? 0 : s.packTickets?.premium ?? 0) >= packs;
  return !b.free && s.gems >= costOf(b, packs);
}

interface OpeningState {
  booster: Booster;
  via: Via;
  cards: CardDef[];
  god: boolean;
  fresh: Set<string>;
  /** coins each card was sold for (already at the copy limit), by index */
  sold: number[];
  /** 1 or 10 (10連) */
  packs: number;
  key: number;
}

export function Shop({ header }: { header?: React.ReactNode } = {}) {
  const save = useStore((s) => s.save);
  const update = useStore((s) => s.update);
  const addCards = useStore((s) => s.addCards);
  const [opening, setOpening] = useState<OpeningState | null>(null);
  const [odds, setOdds] = useState<Booster | null>(null);
  useEffect(() => playMusic('packs'), []);

  // the free 通常パック: tick once a second so the countdown moves
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const free = freePackState(save, now);
  const pickupKey = pickupNow(now).key;
  const pickup = useMemo(() => pickupBooster(PREMIUM_BOOSTER.price), [pickupKey]);

  const buy = useCallback(
    (booster: Booster, packs = 1, via: Via = booster.free ? 'free' : 'gem') => {
      // the 通常パック is the free slot only (2 a day, never bought); others are gems or a ticket
      if (!canOpen(booster, packs, via)) {
        sfx('miss-2', 0.5);
        return false;
      }
      const cost = via === 'gem' ? costOf(booster, packs) : 0;
      const results = Array.from({ length: packs }, () => openPack(booster));
      const cards = results.flatMap((r) => r.cards);
      const god = results.some((r) => r.god);
      const col = useStore.getState().save.collection;
      const fresh = new Set(cards.filter((c) => !(col[c.id] ?? 0)).map((c) => c.id));
      update((s) => {
        s.gems -= cost;
        s.packsOpened += packs;
        if (via === 'free') {
          const st = freePackState(s);
          s.freePacks = { day: dayKey(), used: FREE_PACKS_PER_DAY - st.left + 1, last: Date.now() };
        }
        if (via === 'ticket') {
          const t = { premium: s.packTickets?.premium ?? 0, sure3: s.packTickets?.sure3 ?? 0 };
          if (booster.sure3) t.sure3 -= packs;
          else t.premium -= packs;
          s.packTickets = t;
        }
        if (cost > 0 || via === 'ticket') s.purchases = [{ at: Date.now(), label: `${booster.name}${packs > 1 ? ` ×${packs}` : ''}`, gems: cost, tickets: via === 'ticket' ? packs : undefined }, ...(s.purchases ?? [])].slice(0, 100);
      });
      for (let k = 0; k < packs; k++) useStore.getState().recordPack(!!booster.premium);
      // a pickup pack: one 交換P a pack
      if (isPickup(booster)) update((s) => void (s.pickupPts = { key: pickupNow().key, n: pickupPoints(s.pickupPts) + packs }));
      const sold = addCards(cards.map((c) => c.id));
      setOpening({ booster, via, cards, god, fresh, sold, packs, key: Date.now() });
      return true;
    },
    [update, addCards],
  );

  return (
    <div className="screen shop3">
      <Backdrop hue="#3d5bbf" />
      <div className="page">
        {header ?? <TopBar title="パック" back={null} />}
        <GachaView pickup={pickup} free={free} now={now} cost={costOf} onBuy={buy} onOdds={setOdds} />
      </div>

      <AnimatePresence>
        {opening && (
          <Opening
            {...opening}
            key={opening.key}
            onClose={() => setOpening(null)}
            onAgain={() => {
              if (!buy(opening.booster, opening.packs, opening.via)) setOpening(null);
            }}
          />
        )}
      </AnimatePresence>

      {odds && <OddsModal premium={!!odds.premium} special={odds.table === 'special'} onClose={() => setOdds(null)} />}
    </div>
  );
}






/** turn cumulative slot tables into "C 75% ／ U 25%" rows */
function oddsRows(table: [Rarity, number][][], labels: string[]): [string, string][] {
  return table.map((t, i) => {
    let prev = 0;
    const parts = t.map(([r, p]) => {
      // two decimals so the legendary ★5 (a few hundredths of a percent) still shows
      const pct = Math.round((p - prev) * 10000) / 100;
      prev = p;
      return `${RARITY_SYMBOL[r]} ${pct}%`;
    });
    return [labels[i], parts.join(' ／ ')];
  });
}

function OddsModal({ onClose, premium, special }: { onClose: () => void; premium?: boolean; special?: boolean }) {
  const labels = ['1枚目', '2枚目', '3枚目', '4枚目', '5枚目'];
  const rows = oddsRows(special ? SPECIAL_TABLE : premium ? PREMIUM_TABLE : PACK_TABLE, labels);
  return (
    <div className="zoom-back" onClick={onClose}>
      <div className="panel odds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">提供割合{special ? '（スペシャルパック）' : premium ? '（レアパック）' : '（通常パック）'}</div>
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
          {`すべての章のカードが出ます。★1〜★3のカードは${Math.round((premium ? PREMIUM_PRINTING_CHANCE : PRINTING_CHANCE) * 100)}%で光るカードになります。★3〜★5には特別な絵のカードがあります。ごくまれに、すべてが★3以上のパックが出ることがあります。同じカードが${10}枚を超えた分は、自動でジェムに交換されます。`}
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

function Opening({ booster, via, cards, god, fresh, sold, packs, onClose, onAgain }: OpeningProps) {
  const u = useUnit();
  const [phase, setPhase] = useState<Phase>('tear');
  const cineApi = useRef<CinemaApi | null>(null);
  // opening has its own music; the shop's comes back when it closes
  useEffect(() => {
    playMusic('opening');
    return () => playMusic('packs');
  }, []);
  /** WebGL failed: after the launch go straight to the pack */
  const noCine = useRef(false);
  const omen = useMemo(() => makeOmen(cards, god), [cards, god]);
  const [aura, setAura] = useState<AuraState>({ tier: omen.shown, visible: false, hot: false, amt: 0 });
  const packSlot = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [fx, setFx] = useState<{ id: number; color: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const coins = useStore((s) => s.save.gems);

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
        {phase === 'tear' && (
          <CinemaLayer
            key="cinema"
            omen={omen}
            god={god && packs === 1}
            aura={aura}
            held
            playing={false}
            api={cineApi}
            target={() => packSlot.current?.getBoundingClientRect() ?? null}
            onDone={() => void (noCine.current = true)}
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

        {phase === 'tear' && (
          <div className="tear-wrap" style={{ visibility: 'hidden', pointerEvents: 'none' }}>
            <div className="tear-float" ref={packSlot} />
          </div>
        )}

        {phase === 'tear' && <TearStage booster={booster} god={god} u={u} cards={cards} omen={omen} packs={packs} onAura={setAura} burstAt={burstAt} onDone={() => setPhase('reveal')} />}

        {phase === 'multi' && (
          <MultiResults opened={revealed} cards={cards} fresh={fresh} sold={sold} burstAt={burstAt} onClose={onClose} onAgain={onAgain} canAgain={canOpen(booster, packs, via)} price={via === 'gem' ? costOf(booster, packs) : 0} u={u} />
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

        {phase === 'results' && <Results cards={cards} fresh={fresh} sold={sold} onClose={onClose} onAgain={onAgain} canAgain={canOpen(booster, 1, via)} price={via === 'gem' ? priceOf(booster) : 0} u={u} />}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The night lake behind the pack (rendered live with three.js): it rises from
// the water to the mountains and waits there, and draws the pack's aura
// ---------------------------------------------------------------------------
/** where the scene settles (seconds into its opening): the lake, the far peaks, the moon */
const SCENE_HOLD = 1.5;

interface AuraState {
  tier: OmenTier;
  visible: boolean;
  hot: boolean;
  /** how strong it is, 0–1 (it builds up while the pack is charged) */
  amt: number;
}

interface CinemaApi {
  setAura: (a: AuraState) => void;
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
        holdAt: SCENE_HOLD,
        onBeat: (b) => {
          // heavy and low throughout: booms, swells and rushes, no chimes
          if (b === 'twinkle') foley.boom(0.6 + omen.shown * 0.1);
          else if (b === 'flash') foley.boom(1);
          else if (b === 'enter') {
            foley.rush();
            if (god) setTimeout(() => foley.gong(), 500);
          } else if (b === 'dive') foley.swell();
          else if (b === 'impact') {
            foley.impact();
            sfx('rumble', 0.5);
          } else if (b === 'orb') foley.boom(0.7);
          else if (b === 'morph') foley.boom(0.8);
        },
        onDone: () => doneRef.current(),
      });
    } catch {
      // no WebGL: go straight to the pack
      setTimeout(() => doneRef.current(), 0);
      return;
    }
    cine.current = c;
    api.current = { setAura: (a) => c.setAura(a.tier, a.visible, a.hot, a.amt) };
    c.play();
    return () => {
      c.dispose();
      cine.current = null;
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => cine.current?.setIdle(!playing), [playing]);
  useEffect(() => cine.current?.setAura(aura.tier, aura.visible, aura.hot, aura.amt), [aura]);

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

/**
 * 力をためる: streaks of light drawn in from all round the screen, rushing into
 * the pack (they pass behind it and vanish into it). More and faster as the
 * charge fills; none once the finger lets go.
 */
function ChargeIntake({ charge, holding, target }: { charge: MotionValue<number>; holding: React.MutableRefObject<boolean>; target: React.RefObject<HTMLDivElement> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let box = c.getBoundingClientRect();
    const fit = () => {
      box = c.getBoundingClientRect();
      w = c.width = Math.max(1, Math.floor(box.width * dpr));
      h = c.height = Math.max(1, Math.floor(box.height * dpr));
    };
    fit();
    window.addEventListener('resize', fit);
    /** a soft dot, drawn once, stamped at each streak's head */
    const dot = document.createElement('canvas');
    dot.width = dot.height = 64;
    {
      const g = dot.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.18, 'rgba(255,250,235,0.85)');
      gr.addColorStop(0.45, 'rgba(255,236,190,0.22)');
      gr.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }
    const COLS = ['255,255,255', '255,236,186', '214,236,255', '255,246,222'];
    interface S { a: number; d: number; v: number; len: number; wd: number; col: string; tw: number }
    interface D { a: number; d: number; v: number; r: number; ph: number }
    const ss: S[] = [];
    const dust: D[] = [];
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let accD = 0;
    // a tapered streak: wide and bright at the head, a hair at the tail
    const streak = (hx: number, hy: number, tx: number, ty: number, wd: number, col: string, alpha: number) => {
      const dx = tx - hx;
      const dy = ty - hy;
      const L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * wd * 0.5;
      const ny = (dx / L) * wd * 0.5;
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, `rgba(${col},${alpha})`);
      g.addColorStop(0.25, `rgba(${col},${alpha * 0.55})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hx + nx, hy + ny);
      ctx.lineTo(tx, ty);
      ctx.lineTo(hx - nx, hy - ny);
      ctx.arc(hx, hy, wd * 0.5, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
      ctx.closePath();
      ctx.fill();
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ch = charge.get();
      const r = target.current?.getBoundingClientRect();
      ctx.clearRect(0, 0, w, h);
      if (!r) return;
      const cx = (r.left + r.width / 2 - box.left) * dpr;
      const cy = (r.top + r.height / 2 - box.top) * dpr;
      const far = Math.hypot(w, h) * 0.62;
      const core = Math.min(r.width, r.height) * dpr * 0.3;
      const on = holding.current && ch < 1;
      // streaks: a trickle at first, a rush near full
      if (on) {
        acc += dt * (16 + ch * ch * 120);
        while (acc >= 1) {
          acc -= 1;
          const big = Math.random() < 0.18;
          ss.push({
            a: Math.random() * Math.PI * 2,
            d: far * (0.8 + Math.random() * 0.3),
            v: far * (0.3 + Math.random() * 0.25 + ch * 0.8),
            len: (big ? 0.5 : 0.22) + Math.random() * 0.2 + ch * 0.2,
            wd: (big ? 3.4 : 1.6) * (0.8 + Math.random() * 0.5 + ch * 0.6) * dpr,
            col: COLS[Math.floor(Math.random() * COLS.length)],
            tw: Math.random() * 6.28,
          });
        }
        // fine dust drifting in more slowly between the streaks
        accD += dt * (30 + ch * 60);
        while (accD >= 1) {
          accD -= 1;
          dust.push({ a: Math.random() * Math.PI * 2, d: far * (0.5 + Math.random() * 0.5), v: far * (0.08 + Math.random() * 0.1 + ch * 0.25), r: (0.6 + Math.random() * 1.2) * dpr, ph: Math.random() * 6.28 });
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = dust.length - 1; i >= 0; i--) {
        const k = dust[i];
        k.v *= 1 + dt * 1.6;
        k.d -= k.v * dt;
        k.a += dt * 0.35 * (far / Math.max(k.d, core)) * 0.25; // a slow swirl as it nears
        k.ph += dt * 9;
        if (k.d <= core) {
          dust.splice(i, 1);
          continue;
        }
        const al = (0.35 + Math.sin(k.ph) * 0.3) * Math.min(1, (far - k.d) / (far * 0.2));
        ctx.fillStyle = `rgba(255,244,214,${Math.max(0, al)})`;
        ctx.fillRect(cx + Math.cos(k.a) * k.d - k.r / 2, cy + Math.sin(k.a) * k.d - k.r / 2, k.r, k.r);
      }
      for (let i = ss.length - 1; i >= 0; i--) {
        const k = ss[i];
        k.v *= 1 + dt * 2.4; // they speed up as they fall in
        k.d -= k.v * dt;
        if (k.d <= core) {
          ss.splice(i, 1);
          continue;
        }
        const ca = Math.cos(k.a);
        const sa = Math.sin(k.a);
        const hx = cx + ca * k.d;
        const hy = cy + sa * k.d;
        // the faster it goes, the longer it stretches
        const tail = Math.min(far * 1.1, k.d + far * k.len * (0.5 + (k.v / far) * 0.6));
        const tx = cx + ca * tail;
        const ty = cy + sa * tail;
        // fade in from the edge, fade out right at the pack
        const fadeIn = Math.min(1, (far * 1.05 - k.d) / (far * 0.25));
        const fadeOut = Math.min(1, (k.d - core) / (core * 1.2));
        const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * (0.75 + Math.sin(k.tw + now / 90) * 0.15);
        streak(hx, hy, tx, ty, k.wd * 3.2, k.col, alpha * 0.16); // soft glow
        streak(hx, hy, tx, ty, k.wd, k.col, alpha); // bright core
        const hs = k.wd * 5;
        ctx.globalAlpha = alpha;
        ctx.drawImage(dot, hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, [charge, holding, target]);
  return <canvas ref={ref} className="charge-intake" />;
}

/** seconds of holding to fill the charge */
const CHARGE_TIME = 2.7;

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
  // 力をためる: hold the pack (about 2.7 s) and white light gathers into it,
  // the pack trembling harder as it fills. Let go when it is full and it blooms
  // — ボワっ — in the colour of its best ★. Then it can be torn open.
  const aura = omen.actual;
  const [shaking, setShaking] = useState(false);
  const [promo, setPromo] = useState(0);
  const locked = false;
  const [charged, setCharged] = useState(false);
  const charge = useMotionValue(0);
  /** the charge in coarse steps, for the 3D light (so the overlay does not re-render every frame) */
  const [chargeStep, setChargeStep] = useState(0);
  const holding = useRef(false);
  const [held, setHeld] = useState(false);
  /** the rumble while the pack is held */
  const rumble = useRef<ReturnType<typeof chargeLoop>>(null);
  const stopRumble = (fade?: number) => {
    rumble.current?.stop(fade);
    rumble.current = null;
  };
  useEffect(() => () => stopRumble(0.1), []);
  const release = () => {
    stopRumble(0.08);
    setCharged(true);
    charge.set(1);
    setChargeStep(1);
    hideHint();
    setPromo((n) => n + 1);
    // a deep blow, heavier for a better pack (no chimes)
    // only low, heavy sound here: no bells, chimes or magic tones
    foley.blast();
    foley.impact();
    vibrate([0, 40]);
    const r = packRef.current?.getBoundingClientRect();
    if (r) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      burstAt(cx, cy, `aura${aura}`, 110, 2);
      burstAt(cx, cy, 'glint', 26, 1.5);
      burstAt(cx, cy, 'sparkw', 40, 1.6);
    }
    setSnap(true);
    setTimeout(() => setSnap(false), 140);
  };
  // the charge runs while the pack is held and ebbs away when it is let go too soon
  useEffect(() => {
    if (charged) return;
    let raf = 0;
    let last = performance.now();
    let step = 0;
    let tick = 0;
    const loop = (now: number) => {
      // real time, so it takes 2.7 s however slowly frames come (a busy phone, low power mode);
      // a frame's timestamp can be older than the moment the loop started: never step backwards
      const dt = Math.max(0, Math.min(0.3, (now - last) / 1000));
      last = Math.max(last, now);
      let c = charge.get();
      c = holding.current ? Math.min(1, c + dt / CHARGE_TIME) : Math.max(0, c - dt / 1.0);
      charge.set(c);
      rumble.current?.update(c);
      const st = Math.round(c * 20) / 20;
      if (st !== step) {
        step = st;
        setChargeStep(st);
      }
      // white light drawn in from all round the pack, thicker as it fills
      const r = packRef.current?.getBoundingClientRect();
      if (r && holding.current && Math.random() < 0.08 + c * 0.25) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.max(r.width, r.height) * (0.6 + Math.random() * 0.3);
        burstAt(r.left + r.width / 2 + Math.cos(a) * rad, r.top + r.height / 2 + Math.sin(a) * rad, 'mote', 1 + Math.round(c * 2), 0.9 + c * 0.6);
      }
      // a heartbeat that quickens as it fills
      tick += dt;
      if (holding.current && tick > 0.45 - c * 0.33) {
        tick = 0;
        vibrate(5 + Math.round(c * 10));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charged]);
  const onHoldStart = (e: React.PointerEvent) => {
    if (charged) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = true;
    setHeld(true);
    hideHint();
    foley.grip();
    stopRumble(0.05);
    rumble.current = chargeLoop();
  };
  const onHoldEnd = () => {
    if (charged || !holding.current) return;
    holding.current = false;
    setHeld(false);
    if (charge.get() >= 1) release();
    else stopRumble(0.5);
  };
  // full: it lets go by itself a moment later if the finger stays down
  useEffect(() => {
    if (charged || chargeStep < 1 || !held) return;
    // full: no sound of its own — the rumble at its height says it
    const t = setTimeout(() => {
      if (holding.current) {
        holding.current = false;
        setHeld(false);
        release();
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeStep, held, charged]);
  // drifting motes around the pack in its colour, once it has bloomed
  useEffect(() => {
    if (!charged) return;
    const iv = setInterval(() => {
      const r = packRef.current?.getBoundingClientRect();
      if (!r) return;
      const edge = Math.random() * 4;
      const x = edge < 1 ? r.left : edge < 2 ? r.right : r.left + Math.random() * r.width;
      const y = edge < 2 ? r.top + Math.random() * r.height : edge < 3 ? r.top : r.bottom;
      burstAt(x, y, `aura${aura}`, aura <= 1 ? 1 : 2, 0.9);
    }, 130);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charged]);
  void setShaking;
  const ring = useTransform(charge, (c) => 1 - c);
  const dim = useTransform(charge, (c) => (charged ? 0 : Math.min(1, c * 1.15)));
  const squeeze = useTransform(charge, (c) => 1 - c * 0.035);
  const auraRef = useRef(aura);
  const packRef = useRef<HTMLDivElement>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [torn, setTorn] = useState(false);
  const [active, setActive] = useState(false);
  const [hint, hideHint] = useIdleHint(charged ? 'tear' : 'charge', charged ? 1800 : 900);
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
  useEffect(
    // while charging the light is white (★1's grey-white); it takes the ★ colour when it blooms
    () => onAura({ tier: charged ? aura : 1, visible: !torn && (charged || chargeStep > 0), hot: shaking || (held && chargeStep > 0.3), amt: charged ? 1 : 0.1 + chargeStep * 0.9 }),
    [aura, torn, shaking, onAura, charged, chargeStep, held],
  );

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
    if (!charged) {
      // keyboard: skip straight to a full charge
      release();
      return;
    }
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
    const tipX = pts.length ? pts[pts.length - 1][0] : 0;
    // a finger drifting a little off the line is pulled back onto it; only a
    // clear miss (well above or below the band) stops the blade
    const slack = (B1 - B0) * 1.2;
    const inBand = y >= B0 - slack && y <= B1 + slack && x >= -12 && x <= 112;
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
    const cy = Math.max(B0 + 1, Math.min(B1 - 1, y));
    pt = [cx, cy];
    if (!pts.length) {
      pathRef.current = [[cx, cy]];
      s.lastX = cx;
      s.lastT = performance.now();
      s.t0 = s.lastT;
      return;
    }
    const last = pts[pts.length - 1];
    if (s.lost) {
      // the blade waits at the tip: carry on once the finger reaches it again
      if (Math.abs(cx - tipX) > 14) return;
      s.lost = false;
      setOutside(false);
    }
    if (s.dir === 0) {
      if (Math.abs(cx - last[0]) < 2) {
        pathRef.current = [[cx, cy]];
        return;
      }
      s.dir = cx > last[0] ? 1 : -1;
      setDir(s.dir);
    }
    const adv = (cx - last[0]) * s.dir;
    if (adv < 0.8) return;
    const next: [number, number][] = [...pts, [cx, cy]];
    pathRef.current = next;
    setPath(next);
    const p = Math.min(1, Math.abs(cx - next[0][0]) / 70);
    lift.set(s.dir * p);
    const [hx, hy] = pctToClient([cx, cy]);
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
    const prev = pathRef.current;
    // a cut already under way: the new stroke picks it up from the tip
    const resume = prev.length >= 2;
    g.current = resume
      ? { dir, lost: true, lastBuzz: Math.abs(prev[prev.length - 1][0] - prev[0][0]) / 70, lastT: performance.now(), lastX: prev[prev.length - 1][0], speed: 0, t0: performance.now() - 300 }
      : { dir: 0, lost: false, lastBuzz: 0, lastT: 0, lastX: 0, speed: 0, t0: performance.now() };
    if (!resume) pathRef.current = [];
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
    // let go part way: the seam closes up and the cut starts over
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

      {!torn && <motion.div className="charge-dim" style={{ opacity: dim }} />}
      {!charged && <ChargeIntake charge={charge} holding={holding} target={packRef} />}
      <div className="tear-wrap" style={{ ['--ac' as string]: charged ? OMEN_COLORS[aura] : '#ffffff' }}>
        <PackAura tier={aura} promo={promo} />
        <AnimatePresence>
        {snap && <motion.div key={`wave${promo}`} className="charge-wave" style={{ ['--ac' as string]: OMEN_COLORS[aura] }} initial={{ opacity: 0.95, scale: 0.3 }} animate={{ opacity: 0, scale: 3.2 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE_OUT }} />}
      </AnimatePresence>
        {packs > 1 && (
          <motion.div className="tear-bundle" initial={{ opacity: 0 }} animate={{ opacity: torn ? 0 : 1 }} transition={{ duration: torn ? 0.3 : 0.6, delay: torn ? 0 : 0.2 }}>
            {[-2, 2, -1, 1].map((k) => (
              <div key={k} className="tb-sheet" style={{ transform: `translate(${k * u * 0.9}px, ${Math.abs(k) * u * 0.25}px) rotate(${k * 2.4}deg)`, opacity: 1 - Math.abs(k) * 0.2 }}>
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
          animate={
            snap
                ? { scale: 1.05, rotate: 0 }
                : active
                  ? { scale: 0.985, rotate: -dir * 0.6 }
                  : { scale: 1, rotate: 0 }
          }
          onPointerDown={onHoldStart}
          onPointerUp={onHoldEnd}
          onPointerCancel={onHoldEnd}
          transition={snap ? { duration: 0.06 } : { type: 'spring', stiffness: 380, damping: 22 }}
          style={{ filter: snap ? 'brightness(1.8) saturate(0.6)' : undefined }}
        >
          <motion.div
            className={`tear-float ${shaking || (held && chargeStep > 0.25 && chargeStep < 1) ? 'shaking' : ''} ${held && !charged ? 'charging' : ''} ${held && !charged && chargeStep >= 1 ? 'full' : ''}`}
            style={{ scale: charged ? 1 : squeeze }}
            ref={packRef}
            initial={{ opacity: 0, filter: 'brightness(4) saturate(0)' }}
            animate={torn || active || cutting ? { y: 0, opacity: 1, filter: 'brightness(1) saturate(1)' } : { y: [0, -u * 0.45, 0], opacity: 1, filter: 'brightness(1) saturate(1)' }}
            transition={
              torn || active || cutting
                ? { duration: 0.25 }
                : { y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.35 }, filter: { duration: 0.9, ease: EASE_OUT } }
            }
          >
            {torn && (
              <motion.div className="tear-beam" initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 0.9, 0], scaleY: [0.2, 1, 1.15] }} transition={{ delay: 0.25, duration: 1.3, times: [0, 0.35, 1], ease: 'easeOut' }} />
            )}
            {!torn && !cutting && <BoosterPack booster={booster} tilt={!active && !held} god={god} />}
            {/* the charge: light runs round the edge of the pack as it fills */}
            {!charged && (
              <svg className="charge-ring" viewBox="0 0 60 100" preserveAspectRatio="none">
                <motion.rect x="0.8" y="0.8" width="58.4" height="98.4" rx="2.6" pathLength={1} style={{ strokeDashoffset: ring }} />
              </svg>
            )}
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
                  animate={{ y: u * 75, rotate: dir * 4, opacity: 1 }}
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
            {!torn && charged && (
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
                <div className="tear-zone" style={{ top: `${B0 - 12}%`, height: `${B1 - B0 + 24}%` }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              </>
            )}
          </motion.div>
        </motion.div>
      </div>
      <AnimatePresence>
        {snap && <motion.div key="snap" className="tear-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0.9 }} exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }} />}
      </AnimatePresence>
      <AnimatePresence>
        {outside && !torn && (
          <motion.div key="out" className="po-hint warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            光の帯の中をなぞってください
          </motion.div>
        )}
        {hint && !charged && !held && (
          <motion.div key="hint-charge" className="po-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            パックを長押しして、力をためる
          </motion.div>
        )}
        {hint && charged && !outside && !torn && !locked && (
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
  const y = useMotionValue(0);
  // held by the finger: it leans with the pull, the way a card pivots in your hand
  const rotate = useTransform(x, [-u * 45, u * 45], [-14, 14]);
  const controls = useAnimationControls();
  const ref = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const star = isStar(card.rarity);
  const rank = card.rarity;
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
      foley.rarity(rank === 5 ? 5 : 4);
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

  /** throw it off along (dx, dy) at `speed` px/s; the next card shows once this one has left the screen */
  const fly = (dx: number, dy: number, speed = 2400) => {
    if (busy.current) return;
    busy.current = true;
    hideHint();
    foley.swipe();
    const len = Math.hypot(dx, dy) || 1;
    const far = Math.max(window.innerWidth, window.innerHeight) * 1.1;
    const tx = x.get() + (dx / len) * far;
    const ty = y.get() + (dy / len) * far;
    const dur = Math.max(0.22, Math.min(0.45, far / Math.max(1600, speed)));
    // ease-out so it leaves with the finger's speed instead of starting from rest
    const ease = [0.25, 0.75, 0.45, 1] as const;
    animate(x, tx, { duration: dur, ease });
    animate(y, ty, { duration: dur, ease });
    setTimeout(onGone, dur * 1000 * 0.9);
  };

  const rc = rareColor(card.rarity);
  return (
    <>
      <motion.div
        ref={ref}
        className="sc top"
        style={{ x, y, rotate, rotateY: ry, ['--rc' as string]: rc }}
        initial={{ rotateY: faceDown ? 180 : 0, scale: 0.985 }}
        animate={controls}
        // it follows the finger anywhere; let go and it is thrown the way it was moving
        drag={up}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.9}
        dragMomentum={false}
        dragTransition={{ bounceStiffness: 320, bounceDamping: 26 }}
        onDragStart={hideHint}
        onDragEnd={(_, info) => {
          const sp = Math.hypot(info.velocity.x, info.velocity.y);
          const dist = Math.hypot(info.offset.x, info.offset.y);
          if (sp > 450) fly(info.velocity.x, info.velocity.y, sp);
          else if (dist > u * 7) fly(info.offset.x, info.offset.y, 1800);
        }}
        onTap={() => (!up ? flip() : fly(-1, -0.15))}
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
// 10連 results: every card at once, rarest last; ☆ / ♛ wait face down
// ---------------------------------------------------------------------------
interface MultiProps {
  /** cards already turned over one by one before the list */
  opened?: Set<number>;
  cards: CardDef[];
  fresh: Set<string>;
  sold: number[];
  burstAt: (x: number, y: number, preset: string, n: number, scale?: number) => void;
  onClose: () => void;
  onAgain: () => void;
  canAgain: boolean;
  price: number;
  u: number;
}

function MultiResults({ opened, cards, fresh, sold, burstAt, onClose, onAgain, canAgain, price, u }: MultiProps) {
  // keep each card's original index (shard flags refer to it), sort rarest last
  const items = useMemo(
    () =>
      cards
        .map((c, i) => ({ c, i }))
        .sort((a, b) => a.c.rarity - b.c.rarity || (a.c.variant ? 1 : 0) - (b.c.variant ? 1 : 0) || a.i - b.i),
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
    // a shimmer for the ★3 (gold) cards as they land
    items.forEach((x, k) => {
      if (x.c.rarity !== 3) return;
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
    foley.rarity(c.rarity === 5 ? 5 : 4);
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

  // portrait phones: five across and the list scrolls; landscape fits it all on one screen
  const portrait = usePortrait();
  const cols = portrait ? 5 : items.length > 30 ? 10 : 5;
  const w = portrait ? 10.2 : items.length > 30 ? 6.05 : 9.6;
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
          const rank = c.rarity;
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
              {!down && sold[i] > 0 && (
                <span className="shard-tag">
                  <Icon name="gem" /> +{sold[i]}
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
                <Icon name="gem" /> {price.toLocaleString()}
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
function Results({ cards, fresh, sold, onClose, onAgain, canAgain, price, u }: { cards: CardDef[]; fresh: Set<string>; sold: number[]; onClose: () => void; onAgain: () => void; canAgain: boolean; price: number; u: number }) {
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
              const rank = c.rarity;
              return (
                <motion.div
                  key={i}
                  className={`results-item r${rank}`}
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
                  {sold[i] > 0 && (
                    <span className="shard-tag">
                      <Icon name="gem" /> 上限のため +{sold[i]}
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
        {(price > 0 || canAgain) && (
          <button className="pill" disabled={!canAgain} onClick={onAgain}>
            もう1パック開ける
            <span className="coin">{price > 0 ? <><Icon name="gem" /> {price.toLocaleString()}</> : '無料'}</span>
          </button>
        )}
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

// keep the mascot lookup warm so packs render without a hitch
BOOSTERS.forEach((b) => byName(b.mascot));
