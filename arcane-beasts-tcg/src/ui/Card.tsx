import { memo, useEffect, useRef } from 'react';
import { card, COND_JP, RARITY_SYMBOL, STAGE_JP, SET_COUNT, TYPE_JP, byName } from '../engine/cards';
import type { CardDef, EnergyCard, EType, MonsterCard, TrainerCard } from '../engine/types';
import { onGyro } from '../lib/gyro';
import { artUrl, TYPE_COLOR, TYPE_SCENE } from '../lib/assets';
import { Icon } from './Icon';
import './card.css';

// ---------------------------------------------------------------------------
// Energy symbol
// ---------------------------------------------------------------------------
export function EnergySymbol({ type, size = '1em', className }: { type: EType; size?: string | number; className?: string }) {
  const c = TYPE_COLOR[type];
  return (
    <span
      className={`esym esym-${type} ${className ?? ''}`}
      style={{ width: size, height: size, ['--ea' as string]: c.a, ['--eb' as string]: c.b, ['--ec' as string]: c.c }}
      title={TYPE_JP[type]}
    >
      <Icon name={type} size="64%" color={type === 'lightning' || type === 'colorless' ? '#2a2100' : '#fff'} />
    </span>
  );
}

export function RainbowSymbol({ size = '1em' }: { size?: string | number }) {
  return (
    <span className="esym esym-rainbow" style={{ width: size, height: size }}>
      <Icon name="sparkles" size="64%" color="#fff" />
    </span>
  );
}

/** rarities printed with a foil treatment */
/** ★3 and up shine */
const HOLO = new Set([3, 4, 5]);
/** variants whose illustration covers the whole card */
const BLEED = new Set(['AR', 'CHR', 'SAR']);
const SUB_JP: Record<string, string> = { item: 'アイテム', supporter: 'サポーター', stadium: 'スタジアム', tool: 'どうぐ' };
const SUB_RULE: Record<string, string> = {
  item: 'アイテムは、自分の番に何枚でも使える。',
  supporter: 'サポーターは、自分の番に1枚しか使えない。',
  stadium: 'スタジアムは、自分の番に1枚だけ、バトル場の横に出せる。別の名前のスタジアムが場に出たなら、このカードをトラッシュする。',
  tool: 'どうぐは、自分の番に何枚でも、自分のモンスターにつけられる。モンスター1匹につき1枚だけつけられる。',
};

// ---------------------------------------------------------------------------
// Card face
// ---------------------------------------------------------------------------
export interface CardProps {
  cid: string;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean; // tilt + holo following pointer
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  dim?: boolean;
}

export const CardFace = memo(function CardFace({ cid, className, style, interactive, onClick, onMouseEnter, onMouseLeave, dim }: CardProps) {
  const def = card(cid);
  const ref = useRef<HTMLDivElement>(null);

  const hovering = useRef(false);
  const tilt = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - y) * 18}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
    el.style.setProperty('--hyp', `${Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2)}`);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!interactive || !ref.current) return;
    if (e.pointerType === 'mouse') hovering.current = true;
    const r = ref.current.getBoundingClientRect();
    tilt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  // the phone's tilt moves the shine too (while no mouse is hovering)
  useEffect(() => {
    if (!interactive) return;
    return onGyro((x, y) => !hovering.current && tilt(x, y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);
  const onLeave = () => {
    hovering.current = false;
    const el = ref.current;
    if (el) {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--mx', '50%');
      el.style.setProperty('--my', '50%');
      el.style.setProperty('--hyp', '0');
    }
    onMouseLeave?.();
  };

  const rare = def.rarity;
  const v = def.variant;
  const holo = HOLO.has(rare) && v !== 'mirror';
  const classes = [
    'tcg',
    `kind-${def.kind}`,
    v ? `v-${v}` : '',
    v && BLEED.has(v) ? 'bleed' : '',
    def.kind === 'monster' && def.rarity === 5 ? 'ex' : '',
    def.kind === 'monster' ? `t-${def.type}` : def.kind === 'energy' ? `t-${def.energyType}` : `sub-${(def as TrainerCard).sub}`,
    def.fullArt ? 'full-art' : '',
    def.gold ? 'gold' : '',
    `r-${rare}`,
    holo ? 'holo' : '',
    interactive ? 'interactive' : '',
    dim ? 'dim' : '',
    className ?? '',
  ].join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      data-cid={cid}
    >
      <div className="tcg-frame">
        <div className="tcg-inner">
          {def.kind === 'monster' && <MonsterFace def={def} />}
          {def.kind === 'trainer' && <TrainerFace def={def} />}
          {def.kind === 'energy' && <EnergyFace def={def} />}
          {v === 'mirror' && <div className={`tcg-mirror ${def.kind === 'trainer' ? 'tw' : def.kind === 'energy' ? 'ew' : ''}`} />}
          {v === 'S' && <div className="tcg-glitter" />}
          {holo && <div className="tcg-shine" />}
          {(holo || v === 'mirror') && <div className="tcg-glare" />}
        </div>
      </div>
    </div>
  );
});



function Footer({ def }: { def: CardDef }) {
  return (
    <div className="tcg-footer">
      <span className="illus">{def.kind === 'energy' || (def.kind === 'trainer' && (def.sub === 'item' || def.sub === 'tool')) ? 'Icon. game-icons.net' : 'Illus. Wesnoth'}</span>
      <span className="setno">
        <b>{def.set}</b> {String(def.no).padStart(3, '0')}/{SET_COUNT[def.set]} <i className={`rmark r-${def.rarity}`}>{RARITY_SYMBOL[def.rarity]}</i>
      </span>
    </div>
  );
}

function Cost({ cost }: { cost: EType[] }) {
  if (!cost.length) return <span className="cost empty"><EnergySymbol type="colorless" size="100%" className="ghost" /></span>;
  return (
    <span className="cost">
      {cost.map((c, i) => (
        <EnergySymbol key={i} type={c} size="100%" />
      ))}
    </span>
  );
}

function MonsterFace({ def }: { def: MonsterCard }) {
  const scene = def.scene ?? TYPE_SCENE[def.type];
  let prev: MonsterCard | null = null;
  if (def.evolvesFrom) {
    try {
      prev = byName(def.evolvesFrom) as MonsterCard;
    } catch {
      prev = null;
    }
  }
  const nameLen = def.name.length + (def.hp >= 100 ? 0.5 : 0);
  const crop = def.crop ?? {};
  const pStyle: React.CSSProperties | undefined =
    def.variant === 'S'
      ? { filter: `hue-rotate(${def.hue ?? 180}deg) saturate(1.2) drop-shadow(0 1cqw 1.4cqw rgba(0, 0, 0, 0.55))` }
      : crop.scale || crop.x !== undefined || crop.y !== undefined
        ? { ['--ps' as string]: crop.scale, ['--px' as string]: crop.x !== undefined ? `${crop.x}%` : undefined, ['--py' as string]: crop.y !== undefined ? `${crop.y}%` : undefined }
        : undefined;
  return (
    <>
      <div className="tcg-art">
        <img className="scene" src={artUrl(scene)} alt="" draggable={false} loading="lazy" />
        {def.variant === 'SAR' && !scene.startsWith('story/p-') && <div className="sar-wash" />}
        <img className="portrait" src={artUrl(def.art)} alt={def.name} draggable={false} loading="lazy" style={pStyle} />
        {def.variant === 'CHR' && def.partner && <img className="partner" src={artUrl(def.partner)} alt="" draggable={false} loading="lazy" />}
      </div>
      <div className="tcg-head">
        <span className={`tcg-stage stage-${def.stage}`}>{STAGE_JP[def.stage]}</span>
        <span className={`name ${nameLen > 6.5 ? 'long' : ''} ${nameLen > 8 ? 'xlong' : ''} ${nameLen > 9.5 ? 'xxlong' : ''}`}>
          {def.name}
        </span>
        <span className="hp">
          <small>HP</small>
          {def.hp}
        </span>
        <EnergySymbol type={def.type} size="7.6cqw" />
      </div>
      {prev && (
        <div className="evo-from">
          <img src={artUrl(prev.art)} alt="" draggable={false} loading="lazy" />
          <span>{def.evolvesFrom}から進化</span>
        </div>
      )}
      <div className="tcg-species">
        No.{String(def.no).padStart(3, '0')} {def.species}モンスター
      </div>
      <div className="tcg-body">
        {def.ability && (
          <div className="ability">
            <div className="ability-head">
              <span className="ab-badge">特性</span>
              <span className="ab-name">{def.ability.name}</span>
            </div>
            <p>{def.ability.text}</p>
          </div>
        )}
        {def.attacks.map((a, i) => (
          <div className="attack" key={i}>
            <div className="attack-head">
              <Cost cost={a.cost} />
              <span className="atk-name">{a.name}</span>
              {a.damage !== undefined && (
                <span className="atk-dmg">
                  {a.damage}
                  {a.suffix}
                </span>
              )}
            </div>
            {a.text && <p>{a.text}</p>}
          </div>
        ))}
        {def.rarity >= 4 && (
          <div className={`omega-rule ${def.rarity === 5 ? 'ex-rule' : ''}`}>
            <b>{RARITY_SYMBOL[def.rarity]}</b>：きぜつしたとき、相手はサイドを{def.rarity === 5 ? 3 : 2}枚とる。
          </div>
        )}
        {def.flavor && !def.ability && def.attacks.length < 2 && def.rarity < 4 && <div className="tcg-flavor">{def.flavor}</div>}
      </div>
      <div className="tcg-stats">
        <div>
          <label>弱点</label>
          {def.weakness ? (
            <span>
              <EnergySymbol type={def.weakness} size="4.6cqw" />×2
            </span>
          ) : (
            <span className="none">―</span>
          )}
        </div>
        <div>
          <label>抵抗力</label>
          {def.resistance ? (
            <span>
              <EnergySymbol type={def.resistance} size="4.6cqw" />-30
            </span>
          ) : (
            <span className="none">―</span>
          )}
        </div>
        <div>
          <label>にげる</label>
          <span>
            {def.retreat === 0 ? <span className="none">―</span> : Array.from({ length: def.retreat }, (_, i) => <EnergySymbol key={i} type="colorless" size="4.6cqw" />)}
          </span>
        </div>
      </div>
      <Footer def={def} />
    </>
  );
}

function TrainerFace({ def }: { def: TrainerCard }) {
  const isPortrait = def.sub === 'supporter';
  const isStadium = def.sub === 'stadium';
  return (
    <>
      <div className="tcg-thead">
        <span className="tsub">{SUB_JP[def.sub]}</span>
        <span className="tlabel">トレーナーズ</span>
      </div>
      <div className={`tcg-tname ${def.name.length > 8 ? 'long' : ''}`}>{def.name}</div>
      <div className={`tcg-art trainer-art ${isPortrait ? 'portrait-art' : isStadium ? 'stadium-art' : 'item-art'}`}>
        {isPortrait && (
          <>
            <img className={`scene ${def.paint ? 'painting' : ''}`} src={artUrl(def.scene ?? 'story/landscape-castle')} alt="" draggable={false} loading="lazy" />
            {!def.paint && <img className="portrait" src={artUrl(def.art)} alt="" draggable={false} loading="lazy" />}
          </>
        )}
        {isStadium && <img className="scene full" src={artUrl(def.art)} alt="" draggable={false} loading="lazy" />}
        {!isPortrait && !isStadium && (
          <div className="emblem">
            <div className="emblem-rays" />
            <Icon name={def.icon ?? 'sparkles'} size="62%" />
          </div>
        )}
      </div>
      <div className="tcg-tbody">
        <p>{def.text}</p>
      </div>
      <div className="tcg-trule">{SUB_RULE[def.sub]}</div>
      <Footer def={def} />
    </>
  );
}

function EnergyFace({ def }: { def: EnergyCard }) {
  return (
    <>
      <div className="energy-bg" />
      <div className="energy-big">
        {def.any ? <RainbowSymbol size="100%" /> : <EnergySymbol type={def.energyType} size="100%" />}
        {def.count === 2 && (
          <div className="energy-double">
            <EnergySymbol type="colorless" size="100%" />
          </div>
        )}
      </div>
      <div className="energy-name">{def.name}</div>
      {def.text && <div className="energy-text">{def.text}</div>}
      {!def.basic && <div className="energy-tag">特殊エネルギー</div>}
      <Footer def={def} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card back
// ---------------------------------------------------------------------------
export const CardBack = memo(function CardBack({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`tcg tcg-back ${className ?? ''}`} style={style}>
      <div className="tcg-frame">
        <div className="back-inner">
          <div className="back-line" />
          <svg className="back-mark" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
            <path d="M50 18 L55 45 L82 50 L55 55 L50 82 L45 55 L18 50 L45 45 Z" fill="currentColor" />
            <circle cx="50" cy="50" r="4" fill="#0b1336" />
          </svg>
          <div className="back-name">ARCANE BEASTS</div>
          <div className="back-sheen" />
        </div>
      </div>
    </div>
  );
});

export function condLabel(c: string) {
  return COND_JP[c as keyof typeof COND_JP] ?? c;
}
