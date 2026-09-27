import { LayoutGroup, motion, AnimatePresence } from 'motion/react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { card, TYPE_JP } from '../engine/cards';
import { autoRetreatDiscard, canPay, energyUnits, maxHp, posEq, posKey, retreatCost, topCard } from '../engine/game';
import type { Action, CardInst, EnergyCard, GameState, MonsterCard, Pos, Prompt, Slot, TrainerCard } from '../engine/types';
import { CardBack, CardFace, EnergySymbol, RainbowSymbol } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { artUrl, preload, TYPE_SCENE } from '../lib/assets';
import { BattleController, HUMAN, useBattle } from './controller';
import { FxLayer } from './FxLayer';
import { PromptLayer } from './PromptLayer';
import { ResultOverlay } from './ResultOverlay';
import { useStore } from '../state/store';
import { foley, playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';
import './battle.css';

const LAYOUT = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.9 };

// ---------------------------------------------------------------------------
// Board card with shared-layout animation
// ---------------------------------------------------------------------------
interface BCProps {
  inst: CardInst;
  face: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  dim?: boolean;
  hoverPreview?: boolean;
  light?: boolean; // lightweight back
}

const BoardCard = memo(function BoardCard({ inst, face, className, style, onClick, dim, hoverPreview = true, light }: BCProps) {
  const setHover = useBattle((s) => s.setHover);
  return (
    <motion.div
      layoutId={`c${inst.uid}`}
      transition={{ layout: LAYOUT }}
      className={`bc ${className ?? ''}`}
      style={style}
      onClick={onClick}
      onMouseEnter={hoverPreview && face ? () => setHover(inst.cid) : undefined}
      onMouseLeave={hoverPreview && face ? () => setHover(null) : undefined}
      onContextMenu={face ? (e) => {
        e.preventDefault();
        setHover(inst.cid);
      } : undefined}
      data-uid={inst.uid}
    >
      <div className="bc-fx">
        {face ? <CardFace cid={inst.cid} className="bc-card" dim={dim} /> : light ? <div className="mini-back bc-card" /> : <CardBack className="bc-card" />}
      </div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// In-play monster slot
// ---------------------------------------------------------------------------
const COND_ICON: Record<string, string> = { poisoned: 'poison', burned: 'burn', asleep: 'sleep', paralyzed: 'paralyze', confused: 'confuse' };
const COND_JP: Record<string, string> = { poisoned: 'どく', burned: 'やけど', asleep: 'ねむり', paralyzed: 'マヒ', confused: 'こんらん' };

function EnergyOrb({ inst }: { inst: CardInst }) {
  const ec = card(inst.cid) as EnergyCard;
  return (
    <motion.div layoutId={`c${inst.uid}`} transition={{ layout: LAYOUT }} className="orb" data-uid={inst.uid}>
      {ec.any ? <RainbowSymbol size="100%" /> : <EnergySymbol type={ec.energyType} size="100%" />}
      {ec.count === 2 && <span className="orb-x2">×2</span>}
    </motion.div>
  );
}

interface SlotProps {
  s: GameState;
  slot: Slot;
  pos: Pos;
  highlight?: boolean;
  selectable?: boolean;
  onClick?: () => void;
  big?: boolean;
}

function SlotView({ s, slot, pos, highlight, selectable, onClick, big }: SlotProps) {
  const top = slot.stack[slot.stack.length - 1];
  const mc = topCard(slot);
  const hp = maxHp(s, slot);
  const left = Math.max(0, hp - slot.damage);
  const pct = left / hp;
  return (
    <div
      className={`slot ${big ? 'slot-active' : 'slot-bench'} ${highlight ? 'hl' : ''} ${selectable ? 'selectable' : ''}`}
      data-pos={posKey(pos)}
      data-drop={posKey(pos)}
      onClick={onClick}
    >
      {slot.stack.length > 1 && (
        <div className="stack-under">
          {slot.stack.slice(0, -1).map((c, i) => (
            <div key={c.uid} className="stack-edge" style={{ ['--i' as string]: slot.stack.length - 1 - i }} />
          ))}
        </div>
      )}
      <BoardCard key={top.uid} inst={top} face />
      <div className="hpbar">
        <div className={`hpfill ${pct <= 0.25 ? 'low' : pct <= 0.5 ? 'mid' : ''}`} style={{ width: `${pct * 100}%` }} />
        <span>
          {left}/{hp}
        </span>
      </div>
      {slot.damage > 0 && (
        <motion.div key={slot.damage} initial={{ scale: 1.8, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} className="dmg-badge">
          {slot.damage}
        </motion.div>
      )}
      <div className={`orbs ${slot.energy.length > 4 ? 'many' : ''} ${slot.energy.length > 7 ? 'lots' : ''}`}>
        {slot.energy.map((e) => (
          <EnergyOrb key={e.uid} inst={e} />
        ))}
      </div>
      {slot.tool && (
        <motion.div layoutId={`c${slot.tool.uid}`} className="tool-badge" title={card(slot.tool.cid).name}>
          <Icon name={(card(slot.tool.cid) as TrainerCard).icon ?? 'sparkles'} size="70%" />
        </motion.div>
      )}
      {slot.conditions.length > 0 && (
        <div className="conds">
          {slot.conditions.map((c) => (
            <span key={c} className={`cond cond-${c}`} title={COND_JP[c]}>
              <Icon name={COND_ICON[c]} size="1em" />
              {COND_JP[c]}
            </span>
          ))}
        </div>
      )}
      {mc.omega && <div className="omega-glow" />}
    </div>
  );
}

function EmptySlot({ pos, highlight, onClick }: { pos: Pos; highlight?: boolean; onClick?: () => void }) {
  return (
    <div className={`slot slot-bench empty ${highlight ? 'hl' : ''}`} data-drop={posKey(pos)} data-pos={posKey(pos)} onClick={onClick}>
      <div className="empty-mark" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------
function DeckPile({ s, p }: { s: GameState; p: 0 | 1 }) {
  const deck = s.players[p].deck;
  return (
    <div className={`pile deck ${p === 0 ? 'me' : 'opp'}`} data-deck={p}>
      <div className="pile-base" />
      {deck
        .slice(0, 12)
        .reverse()
        .map((c, i, arr) => (
          <BoardCard key={c.uid} inst={c} face={false} light className="pile-card" style={{ transform: `translate(${(arr.length - i) * -0.25}px, ${(arr.length - i) * -0.35}px)` }} />
        ))}
      <div className="pile-count">
        <Icon name="deck" size="1em" /> {deck.length}
      </div>
    </div>
  );
}

function DiscardPile({ s, p, onOpen }: { s: GameState; p: 0 | 1; onOpen: () => void }) {
  const dis = s.players[p].discard;
  const shown = dis.slice(-8);
  return (
    <div className={`pile discard ${p === 0 ? 'me' : 'opp'}`} onClick={onOpen}>
      <div className="pile-base">
        <Icon name="trash" size="40%" />
      </div>
      {shown.map((c, i) => (
        <BoardCard key={c.uid} inst={c} face className="pile-card" hoverPreview={false} style={{ transform: `rotate(${((c.uid * 37) % 11) - 5}deg) translate(${i * 0.4}px, ${-i * 0.4}px)` }} />
      ))}
      <div className="pile-count">
        <Icon name="trash" size="1em" /> {dis.length}
      </div>
    </div>
  );
}

function Prizes({ s, p }: { s: GameState; p: 0 | 1 }) {
  const pr = s.players[p].prizes;
  return (
    <div className={`prizes ${p === 0 ? 'me' : 'opp'}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="prize-slot" style={{ ['--i' as string]: i }}>
          {pr[i] && <BoardCard inst={pr[i]} face={false} light className="prize-card" />}
        </div>
      ))}
      <div className="prize-count">
        サイド <b>{pr.length}</b>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------
interface HandProps {
  cards: CardInst[];
  playable: Set<number>;
  selected: number | null;
  setupPick?: Set<number>;
  onSelect: (uid: number) => void;
  onDrop: (uid: number, target: string | null) => void;
}

function Hand({ cards, playable, selected, onSelect, onDrop, setupPick }: HandProps) {
  const n = cards.length;
  const maxW = 50;
  const cw = 8.2;
  const step = n <= 1 ? 0 : Math.min(cw * 0.92, (maxW - cw) / (n - 1));
  const total = step * (n - 1) + cw;
  const [hover, setHover] = useState<number | null>(null);
  const setPreview = useBattle((s) => s.setHover);
  return (
    <div className="hand">
      {cards.map((c, i) => {
        const mid = (n - 1) / 2;
        const off = i - mid;
        const rot = off * Math.min(3.2, 26 / Math.max(n, 1));
        const lift = Math.abs(off) * Math.abs(off) * 0.12;
        const isSel = selected === c.uid;
        const isHover = hover === c.uid;
        const can = playable.has(c.uid) || setupPick?.has(c.uid);
        return (
          <motion.div
            key={c.uid}
            layoutId={`c${c.uid}`}
            transition={{ layout: LAYOUT }}
            className={`bc hand-card ${can ? 'can' : ''} ${isSel ? 'sel' : ''}`}
            style={{
              left: `calc(var(--u) * ${50 - total / 2 + i * step})`,
              zIndex: isHover || isSel ? 100 : i,
            }}
            initial={{ rotateY: 90 }}
            animate={{
              rotate: isHover || isSel ? 0 : rot,
              y: `calc(var(--u) * ${isSel ? -8.5 : isHover ? -7 : lift})`,
              scale: isHover || isSel ? 1.18 : 1,
              rotateY: 0,
            }}
            drag={can}
            dragSnapToOrigin
            dragElastic={0.9}
            whileDrag={{ scale: 1.08, zIndex: 200, rotate: 0 }}
            onDragStart={() => foley.slide()}
            onDragEnd={(e, info) => {
              void e;
              const els = document.elementsFromPoint(info.point.x - window.scrollX, info.point.y - window.scrollY);
              const t = els.map((el) => (el as HTMLElement).closest('[data-drop]')?.getAttribute('data-drop')).find(Boolean) ?? null;
              onDrop(c.uid, t);
            }}
            onMouseEnter={() => {
              setHover(c.uid);
              setPreview(c.cid);
              foley.hover();
            }}
            onMouseLeave={() => {
              setHover(null);
              setPreview(null);
            }}
            onClick={() => onSelect(c.uid)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPreview(c.cid);
            }}
            data-uid={c.uid}
          >
            <div className="bc-fx">
              <CardFace cid={c.cid} className="bc-card" />
            </div>
            {can && <div className="can-glow" />}
          </motion.div>
        );
      })}
    </div>
  );
}

function OppHand({ cards }: { cards: CardInst[] }) {
  const n = cards.length;
  const step = Math.min(2.6, 26 / Math.max(n, 1));
  return (
    <div className="opp-hand">
      {cards.map((c, i) => (
        <BoardCard
          key={c.uid}
          inst={c}
          face={false}
          light
          className="opp-hand-card"
          style={{ left: `calc(var(--u) * ${50 - (step * (n - 1)) / 2 + i * step - 2.2})`, rotate: `${(i - (n - 1) / 2) * -2.5}deg` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action menu for own monsters
// ---------------------------------------------------------------------------
interface MenuProps {
  s: GameState;
  pos: Pos;
  legal: Action[];
  onAct: (a: Action) => void;
  onRetreat: () => void;
  onClose: () => void;
}

function ActionMenu({ s, pos, legal, onAct, onRetreat, onClose }: MenuProps) {
  const slot = pos.z === 'active' ? s.players[pos.p].active : s.players[pos.p].bench[pos.i];
  if (!slot) return null;
  const mc = topCard(slot);
  const units = energyUnits(slot);
  const canAtk = (i: number) => legal.some((a) => a.t === 'attack' && a.index === i);
  const canAb = legal.some((a) => a.t === 'ability' && posEq(a.pos, pos));
  const canRet = pos.z === 'active' && legal.some((a) => a.t === 'retreat');
  const firstTurn = s.turn === 1;
  return (
    <motion.div
      className={`action-menu ${pos.z === 'active' ? 'at-active' : 'at-bench'}`}
      style={pos.z === 'bench' ? { left: `calc(var(--u) * ${31.6 + pos.i * 7.6 + 3.2})` } : undefined}
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="am-head">
        <span className="am-name">{mc.name}</span>
        <button className="am-close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {mc.ability && (
        <button className={`am-row ability ${canAb ? '' : 'disabled'}`} disabled={!canAb} onClick={() => onAct({ t: 'ability', pos })}>
          <span className="am-badge">特性</span>
          <div className="am-main">
            <b>{mc.ability.name}</b>
            <small>{mc.ability.text}</small>
          </div>
        </button>
      )}
      {pos.z === 'active' &&
        mc.attacks.map((a, i) => {
          const ok = canAtk(i);
          const pay = canPay(units, a.cost);
          return (
            <button key={i} className={`am-row attack ${ok ? '' : 'disabled'}`} disabled={!ok} onClick={() => onAct({ t: 'attack', index: i })}>
              <span className="am-cost">
                {a.cost.map((c, j) => (
                  <EnergySymbol key={j} type={c} size="1.5em" />
                ))}
              </span>
              <div className="am-main">
                <b>{a.name}</b>
                {a.text && <small>{a.text}</small>}
                {!ok && <em>{firstTurn ? '先攻の最初の番はワザが使えない' : !pay ? 'エネルギーが足りない' : '今はワザが使えない'}</em>}
              </div>
              {a.damage !== undefined && (
                <span className="am-dmg">
                  {a.damage}
                  {a.suffix}
                </span>
              )}
            </button>
          );
        })}
      {pos.z === 'active' && (
        <button className={`am-row retreat ${canRet ? '' : 'disabled'}`} disabled={!canRet} onClick={onRetreat}>
          <span className="am-cost">
            {retreatCost(s, slot) === 0 ? <span className="free">0</span> : Array.from({ length: retreatCost(s, slot) }, (_, i) => <EnergySymbol key={i} type="colorless" size="1.3em" />)}
          </span>
          <div className="am-main">
            <b>にげる</b>
            <small>ベンチのモンスターと入れ替える</small>
          </div>
        </button>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Preview of hovered card
// ---------------------------------------------------------------------------
function Preview() {
  const cid = useBattle((s) => s.hover);
  return (
    <AnimatePresence>
      {cid && (
        <motion.div key={cid} className="preview" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <CardFace cid={cid} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------
function LogPanel({ s, open, onToggle }: { s: GameState; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [s.log.length, open]);
  return (
    <>
      <button className="log-toggle" onClick={onToggle} title="バトルログ">
        <Icon name="book" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="log-panel panel" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} ref={ref}>
            {s.log.slice(-120).map((l, i) => (
              <div key={i} className={`log-line ${l.player === 0 ? 'me' : l.player === 1 ? 'opp' : ''} ${l.text.startsWith('━━') ? 'turn' : ''}`}>
                {l.text}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function BattleScreen() {
  const cfg = useStore((s) => s.battle)!;
  const settings = useStore((s) => s.save.settings);
  const ctrlRef = useRef<BattleController | null>(null);
  const view = useBattle((s) => s.view);
  const prompt = useBattle((s) => s.prompt);
  const thinking = useBattle((s) => s.thinking);
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<Pos | null>(null);
  const [retreat, setRetreat] = useState<{ discard: number[]; need: number; choosing: boolean } | null>(null);
  const [setupActive, setSetupActive] = useState<number | null>(null);
  const [setupBench, setSetupBench] = useState<number[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [discardView, setDiscardView] = useState<0 | 1 | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const guideSeen = useStore((s) => !!s.save.guideSeen);
  const [guide, setGuide] = useState(!guideSeen && !cfg.spectate);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  useEffect(() => {
    if (ready && !guide && !startedRef.current && ctrlRef.current) {
      startedRef.current = true;
      ctrlRef.current.start();
    }
  }, [ready, guide]);

  // lifecycle
  useEffect(() => {
    const ctrl = new BattleController([cfg.playerDeck, cfg.oppDeck], ['あなた', cfg.oppName], cfg.level);
    ctrl.speed = settings.speed;
    ctrl.autoHuman = !!cfg.spectate;
    ctrlRef.current = ctrl;
    const boss = cfg.rival?.id === 'necros' || cfg.rival?.id === 'lilith';
    playMusic(boss ? 'boss' : (['battle1', 'battle2', 'battle3'] as const)[Math.floor(Math.random() * 3)]);
    // preload the art used by both decks so cards never pop in
    const urls = new Set<string>([artUrl(cfg.scene)]);
    for (const cid of [...cfg.playerDeck, ...cfg.oppDeck]) {
      const c = card(cid);
      if (c.kind === 'monster') {
        urls.add(artUrl(c.art));
        urls.add(artUrl(c.scene ?? TYPE_SCENE[c.type]));
      } else if (c.kind === 'trainer' && c.art !== 'item') urls.add(artUrl(c.art));
    }
    let cancelled = false;
    Promise.race([preload([...urls]), new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      ctrl.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.speed = settings.speed;
  }, [settings.speed]);

  const ctrl = ctrlRef.current;
  const myAction = prompt?.type === 'action' && prompt.player === HUMAN;
  const legal = useMemo(() => (myAction && ctrl ? ctrl.legal() : []), [prompt, ctrl, myAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setMenu(null);
        setRetreat(null);
        setConfirmEnd(false);
        useBattle.getState().setHover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // reset local UI when prompt changes
  useEffect(() => {
    setSelected(null);
    setMenu(null);
    setRetreat(null);
    setConfirmEnd(false);
  }, [prompt]);

  if (!view) return <div className="screen battle-screen" />;
  const s = view;
  const me = s.players[0];
  const opp = s.players[1];
  const isSetup = prompt?.type === 'setup';
  const slotPrompt = prompt?.type === 'slot' ? (prompt as Extract<Prompt, { type: 'slot' }>) : null;

  // --- playable cards / targets ---
  const playable = new Set<number>();
  for (const a of legal) if ('uid' in a) playable.add(a.uid);
  const selActions = selected !== null ? legal.filter((a) => 'uid' in a && a.uid === selected) : [];
  const targetKeys = new Set<string>();
  let benchTarget = false;
  for (const a of selActions) {
    if (a.t === 'playBasic') benchTarget = true;
    if ((a.t === 'evolve' || a.t === 'attachEnergy' || a.t === 'playTrainer') && 'target' in a && a.target) targetKeys.add(posKey(a.target));
  }
  const selNoTarget = selActions.find((a) => a.t === 'playTrainer' && !a.target) ?? null;

  const act = (a: Action) => {
    setSelected(null);
    setMenu(null);
    setRetreat(null);
    ctrl?.act(a);
  };

  const resolveDrop = (uid: number, key: string | null): Action | null => {
    const acts = legal.filter((a) => 'uid' in a && a.uid === uid);
    if (!acts.length) return null;
    if (key) {
      const t = acts.find((a) => 'target' in a && a.target && posKey(a.target) === key);
      if (t) return t;
      const isMyBench = key.startsWith('0b') || key === 'bench';
      const pb = acts.find((a) => a.t === 'playBasic');
      if (pb && (isMyBench || key === 'board')) return pb;
    }
    const nt = acts.find((a) => a.t === 'playTrainer' && !a.target);
    if (nt && key) return nt;
    return null;
  };

  // --- setup handlers ---
  const setupBasics = new Set(isSetup ? me.hand.filter((c) => (card(c.cid) as MonsterCard).stage === 'basic' && card(c.cid).kind === 'monster').map((c) => c.uid) : []);
  const onSetupPick = (uid: number) => {
    if (!setupBasics.has(uid)) return;
    foley.place();
    if (setupActive === uid) {
      setSetupActive(null);
      return;
    }
    if (setupBench.includes(uid)) {
      setSetupBench(setupBench.filter((u) => u !== uid));
      return;
    }
    if (setupActive === null) setSetupActive(uid);
    else if (setupBench.length < 5) setSetupBench([...setupBench, uid]);
  };
  const finishSetup = () => {
    if (setupActive === null || !ctrl) return;
    sfx('button', 0.6);
    ctrl.answer({ type: 'setup', active: setupActive, bench: setupBench });
    setSetupActive(null);
    setSetupBench([]);
  };

  // --- hand interaction ---
  const onSelectHand = (uid: number) => {
    if (isSetup) return onSetupPick(uid);
    if (!myAction) return;
    if (!playable.has(uid)) {
      sfx('miss-2', 0.3);
      return;
    }
    sfx('select', 0.5);
    setMenu(null);
    setSelected(selected === uid ? null : uid);
  };
  const onDropHand = (uid: number, key: string | null) => {
    if (isSetup) {
      if (key === '0a' || key === 'board') {
        if (setupBasics.has(uid)) {
          if (setupActive !== null) setSetupBench((b) => [...b.filter((u) => u !== setupActive), setupActive].slice(0, 5));
          setSetupBench((b) => b.filter((u) => u !== uid));
          setSetupActive(uid);
          foley.place();
        }
      } else if (key && key.startsWith('0b')) {
        if (setupBasics.has(uid) && setupActive !== uid && !setupBench.includes(uid) && setupBench.length < 5) setSetupBench([...setupBench, uid]);
      }
      return;
    }
    if (!myAction) return;
    const a = resolveDrop(uid, key);
    if (a) act(a);
  };

  // --- slot clicks ---
  const onSlotClick = (pos: Pos) => {
    if (slotPrompt) {
      if (slotPrompt.options.some((o) => posEq(o, pos))) {
        sfx('button', 0.6);
        ctrl?.answer({ type: 'slot', pos });
      }
      return;
    }
    if (!myAction) return;
    if (retreat?.choosing) {
      if (pos.p === 0 && pos.z === 'bench') act({ t: 'retreat', to: pos.i, discard: retreat.discard });
      return;
    }
    if (selected !== null) {
      const a = selActions.find((x) => 'target' in x && x.target && posEq(x.target, pos));
      if (a) return act(a);
      if (pos.p === 0 && pos.z === 'bench' && benchTarget) return act(selActions.find((x) => x.t === 'playBasic')!);
    }
    if (pos.p === 0) {
      sfx('select', 0.5);
      setSelected(null);
      setMenu(menu && posEq(menu, pos) ? null : pos);
    }
  };

  const startRetreat = () => {
    const act0 = me.active!;
    const cost = retreatCost(s, act0);
    const kinds = new Set(act0.energy.map((e) => e.cid));
    if (cost === 0 || kinds.size <= 1 || act0.energy.length <= cost) {
      setRetreat({ discard: autoRetreatDiscard(act0, cost), need: cost, choosing: true });
    } else {
      setRetreat({ discard: [], need: cost, choosing: false });
    }
    setMenu(null);
  };

  const endTurn = () => {
    const canAttack = legal.some((a) => a.t === 'attack');
    if (canAttack && !confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    sfx('button', 0.6);
    act({ t: 'endTurn' });
  };

  // highlight sets
  const slotHL = (pos: Pos) =>
    (slotPrompt ? slotPrompt.options.some((o) => posEq(o, pos)) : false) ||
    targetKeys.has(posKey(pos)) ||
    (!!retreat?.choosing && pos.p === 0 && pos.z === 'bench');

  const handCards = isSetup ? me.hand.filter((c) => c.uid !== setupActive && !setupBench.includes(c.uid)) : me.hand;
  const setupActiveInst = isSetup && setupActive !== null ? me.hand.find((c) => c.uid === setupActive) : null;
  const setupBenchInst = isSetup ? setupBench.map((u) => me.hand.find((c) => c.uid === u)!).filter(Boolean) : [];

  const stadium = s.stadium;
  const bg = stadium ? (card(stadium.cid) as TrainerCard).art : cfg.scene;

  return (
    <div
      className="screen battle-screen"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('.bc')) useBattle.getState().setHover(null);
      }}
    >
      <div className="battle-bg" style={{ backgroundImage: `url(${artUrl(bg)})` }} key={bg} />
      <div className="battle-bg-shade" />
      <div className="stage battle-stage">
        <div className="battle-shake">
          <div className="mat" data-drop="board">
            <div className="mat-line" />
            <div className="mat-zone active me" />
            <div className="mat-zone active opp" />
            <div className="mat-zone bench me" data-drop="bench" />
            <div className="mat-zone bench opp" />
            <div className="mat-emblem">
              <Icon name="omega" size="100%" />
            </div>
          </div>
          <LayoutGroup>
            {/* opponent */}
            <OppHand cards={opp.hand} />
            <Prizes s={s} p={1} />
            <DeckPile s={s} p={1} />
            <DiscardPile s={s} p={1} onOpen={() => setDiscardView(1)} />
            <div className="zone-active opp">
              {opp.active && <SlotView key={opp.active.stack[0].uid} s={s} slot={opp.active} pos={{ p: 1, z: 'active' }} big highlight={slotHL({ p: 1, z: 'active' })} onClick={() => onSlotClick({ p: 1, z: 'active' })} />}
            </div>
            <div className="zone-bench opp">
              {Array.from({ length: 5 }, (_, i) =>
                opp.bench[i] ? (
                  <SlotView key={opp.bench[i].stack[0].uid} s={s} slot={opp.bench[i]} pos={{ p: 1, z: 'bench', i }} highlight={slotHL({ p: 1, z: 'bench', i })} onClick={() => onSlotClick({ p: 1, z: 'bench', i })} />
                ) : (
                  <EmptySlot key={`e${i}`} pos={{ p: 1, z: 'bench', i }} />
                ),
              )}
            </div>

            {/* me */}
            <Prizes s={s} p={0} />
            <DeckPile s={s} p={0} />
            <DiscardPile s={s} p={0} onOpen={() => setDiscardView(0)} />
            <div className="zone-active me">
              {me.active && <SlotView key={me.active.stack[0].uid} s={s} slot={me.active} pos={{ p: 0, z: 'active' }} big highlight={slotHL({ p: 0, z: 'active' })} selectable={myAction} onClick={() => onSlotClick({ p: 0, z: 'active' })} />}
              {setupActiveInst && (
                <div className="slot slot-active" data-drop="0a">
                  <BoardCard inst={setupActiveInst} face onClick={() => onSetupPick(setupActiveInst.uid)} />
                </div>
              )}
              {isSetup && !setupActiveInst && (
                <div className="slot slot-active empty hl" data-drop="0a">
                  <div className="setup-hint">バトル場</div>
                </div>
              )}
            </div>
            <div className="zone-bench me" data-drop="bench">
              {Array.from({ length: 5 }, (_, i) => {
                const pos: Pos = { p: 0, z: 'bench', i };
                if (isSetup) {
                  const c = setupBenchInst[i];
                  return c ? (
                    <div key={i} className="slot slot-bench" data-drop={`0b${i}`}>
                      <BoardCard inst={c} face onClick={() => onSetupPick(c.uid)} />
                    </div>
                  ) : (
                    <EmptySlot key={i} pos={pos} highlight={setupActive !== null} />
                  );
                }
                return me.bench[i] ? (
                  <SlotView key={me.bench[i].stack[0].uid} s={s} slot={me.bench[i]} pos={pos} highlight={slotHL(pos)} selectable={myAction} onClick={() => onSlotClick(pos)} />
                ) : (
                  <EmptySlot key={`e${i}`} pos={pos} highlight={benchTarget && i === me.bench.length} onClick={() => onSlotClick(pos)} />
                );
              })}
            </div>

            {/* stadium & playing */}
            <div className="zone-stadium">
              {stadium ? <BoardCard inst={stadium} face className="stadium-card" /> : <div className="stadium-empty">スタジアム</div>}
            </div>
            <AnimatePresence>
              {s.playing && (
                <motion.div className="playing-wrap" key={s.playing.uid} initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
                  <BoardCard inst={s.playing} face className="playing-card" hoverPreview={false} />
                </motion.div>
              )}
            </AnimatePresence>

            <Hand cards={handCards} playable={playable} selected={selected} onSelect={onSelectHand} onDrop={onDropHand} setupPick={isSetup ? setupBasics : undefined} />
          </LayoutGroup>

          {/* HUD */}
          <div className="plate opp">
            <img src={artUrl(cfg.oppPortrait)} alt="" />
            <div>
              <div className="plate-name">{cfg.oppName}</div>
              <div className="plate-sub">
                手札 {opp.hand.length} ・ 山札 {opp.deck.length}
              </div>
            </div>
            {thinking && <div className="thinking">考え中<span>...</span></div>}
          </div>
          <div className="plate me">
            <img src={artUrl('humans/lieutenant')} alt="" />
            <div>
              <div className="plate-name">あなた</div>
              <div className="plate-sub">
                手札 {me.hand.length} ・ 山札 {me.deck.length}
              </div>
            </div>
          </div>

          <div className="turn-box">
            <div className={`turn-chip ${s.current === 0 ? 'me' : 'opp'}`}>
              <small>TURN {Math.max(1, s.turn)}</small>
              {s.phase === 'setup' ? '準備中' : s.current === 0 ? 'あなたの番' : '相手の番'}
            </div>
            <div className="turn-flags">
              <span className={s.flags.energyAttached || s.current !== 0 ? 'used' : ''} title="エネルギー">
                <EnergySymbol type="colorless" size="1.2em" />
              </span>
              <span className={s.flags.supporterPlayed || s.current !== 0 ? 'used' : ''} title="サポーター">
                <Icon name="person" />
              </span>
              <span className={s.flags.retreated || s.current !== 0 ? 'used' : ''} title="にげる">
                <Icon name="retreat" />
              </span>
            </div>
            <button className={`btn big end-turn ${myAction ? 'ready' : ''}`} disabled={!myAction} onClick={endTurn}>
              {confirmEnd ? '本当に終了？' : 'ターン終了'}
            </button>
            {confirmEnd && <div className="confirm-note">まだワザが使えます</div>}
          </div>

          <LogPanel s={s} open={logOpen} onToggle={() => setLogOpen(!logOpen)} />
          <button
            className="log-toggle surrender"
            title="降参する"
            onClick={async () => {
              if (await askConfirm('降参しますか？（敗北になります）', '降参する', true)) ctrl?.surrender();
            }}
          >
            <Icon name="skull" />
          </button>

          <AnimatePresence>
            {menu && myAction && <ActionMenu key={posKey(menu)} s={s} pos={menu} legal={legal} onAct={act} onRetreat={startRetreat} onClose={() => setMenu(null)} />}
          </AnimatePresence>

          {/* selection helpers */}
          <AnimatePresence>
 {selected !== null && myAction && (
              <motion.div key="sel" className="sel-bar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span>{selHint(card(me.hand.find((c) => c.uid === selected)?.cid ?? ''), benchTarget, targetKeys.size > 0)}</span>
                {selNoTarget && (
                  <button className="btn blue" onClick={() => act(selNoTarget)}>
                    使う
                  </button>
                )}
                <button className="btn ghost small" onClick={() => setSelected(null)}>
                  やめる
                </button>
              </motion.div>
            )}
 {retreat && (
              <motion.div key="retreat" className="sel-bar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {retreat.choosing ? (
                  <span>入れ替えるベンチモンスターを選んでください</span>
                ) : (
                  <RetreatPicker slot={me.active!} need={retreat.need} onDone={(d) => setRetreat({ discard: d, need: retreat.need, choosing: true })} />
                )}
                <button className="btn ghost small" onClick={() => setRetreat(null)}>
                  やめる
                </button>
              </motion.div>
            )}
 {isSetup && (
              <motion.div key="setup" className="sel-bar setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span>{setupActive === null ? 'バトル場に出すたねモンスターを選んでください' : 'ベンチに出すたねモンスターを選んでください（任意）'}</span>
                <button className="btn blue" disabled={setupActive === null} onClick={finishSetup}>
                  準備完了
                </button>
              </motion.div>
            )}
 {slotPrompt && slotPrompt.player === HUMAN && (
              <motion.div key={`slot-${slotPrompt.title}`} className="sel-bar prompt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span>{slotPrompt.title}</span>
                {slotPrompt.optional && (
                  <button className="btn ghost small" onClick={() => ctrl?.answer({ type: 'slot', pos: null })}>
                    選ばない
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {!menu && <Preview />}
          <FxLayer />
          <PromptLayer ctrl={ctrl} />
          {discardView !== null && <DiscardModal cards={s.players[discardView].discard} title={discardView === 0 ? 'あなたのトラッシュ' : '相手のトラッシュ'} onClose={() => setDiscardView(null)} />}
          <ResultOverlay />
          {guide && (
            <div className="modal-back" style={{ zIndex: 640 }}>
              <motion.div className="panel guide" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <h3>操作ガイド</h3>
                <ol>
                  <li>
                    手札のカードは <b>ドラッグ</b> で場に出すか、<b>クリック</b> で選んでから出し先をクリック
                  </li>
                  <li>
                    光っているカードが今使えるカード。エネルギーは1ターンに1枚まで
                  </li>
                  <li>
                    自分の <b>バトル場のモンスターをクリック</b> するとワザ・特性・にげるのメニュー
                  </li>
                  <li>
                    カードに <b>マウスを乗せる（スマホは長押し）</b> と拡大表示。右上の本アイコンでログ
                  </li>
                  <li>相手のサイドを6枚とれば勝ち！Ωモンスターを倒すと2枚とれる</li>
                </ol>
                <button
                  className="btn big"
                  onClick={() => {
                    setGuide(false);
                    useStore.getState().update((s) => void (s.guideSeen = true));
                  }}
                >
                  はじめる
                </button>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function selHint(c: ReturnType<typeof card> | undefined, bench: boolean, targets: boolean): string {
  if (!c) return '';
  if (c.kind === 'energy') return 'エネルギーをつけるモンスターを選んでください';
  if (c.kind === 'monster') return bench ? 'ベンチに出します（ベンチをクリック）' : targets ? '進化させるモンスターを選んでください' : '';
  if (c.kind === 'trainer' && c.sub === 'tool') return 'どうぐをつけるモンスターを選んでください';
  return `${c.name}を使いますか？`;
}

function RetreatPicker({ slot, need, onDone }: { slot: Slot; need: number; onDone: (d: number[]) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const units = sel.reduce((n, u) => n + ((card(slot.energy.find((e) => e.uid === u)!.cid) as EnergyCard).count ?? 1), 0);
  return (
    <div className="retreat-picker">
      <span>トラッシュするエネルギーを選択（{units}/{need}）</span>
      {slot.energy.map((e) => {
        const ec = card(e.cid) as EnergyCard;
        const on = sel.includes(e.uid);
        return (
          <button key={e.uid} className={`rp-orb ${on ? 'on' : ''}`} onClick={() => setSel(on ? sel.filter((x) => x !== e.uid) : [...sel, e.uid])}>
            {ec.any ? <RainbowSymbol size="100%" /> : <EnergySymbol type={ec.energyType} size="100%" />}
          </button>
        );
      })}
      <button className="btn small" disabled={units < need} onClick={() => onDone(sel)}>
        決定
      </button>
    </div>
  );
}

function DiscardModal({ cards, title, onClose }: { cards: CardInst[]; title: string; onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {title}（{cards.length}枚）
        </div>
        <div className="modal-grid">
          {cards.length === 0 && <div className="empty-note">カードはありません</div>}
          {cards.map((c) => (
            <CardFace key={c.uid} cid={c.cid} className="grid-card" />
          ))}
        </div>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

export { TYPE_JP };
