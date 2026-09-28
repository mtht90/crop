import { memo, useRef } from 'react';
import { card, COND_JP, RARITY_SYMBOL, STAGE_JP, SET_COUNT, TYPE_JP, byName } from '../engine/cards';
import type { CardDef, EnergyCard, EType, MonsterCard, TrainerCard } from '../engine/types';
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
const HOLO = new Set(['R', 'RR', 'ST', 'CR']);
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

  const onMove = (e: React.PointerEvent) => {
    if (!interactive || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const el = ref.current;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - y) * 18}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 22}deg`);
    el.style.setProperty('--hyp', `${Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2)}`);
  };
  const onLeave = () => {
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
    def.kind === 'monster' && def.ex ? 'ex' : '',
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

export function OmegaMark() {
  return (
    <svg className="omega" viewBox="0 0 40 40" aria-label="Ω">
      <defs>
        <linearGradient id="omg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.35" stopColor="#ffc94a" />
          <stop offset="0.65" stopColor="#ff5fa2" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <path
        d="M20 3C10.6 3 4 9.6 4 18.4c0 5.9 3 10.4 7.4 13H5.5V37h12.6v-5.2C12.8 30 9.8 25 9.8 18.6 9.8 12.3 14.1 8 20 8s10.2 4.3 10.2 10.6c0 6.4-3 11.4-8.3 13.2V37h12.6v-5.6h-5.9c4.4-2.6 7.4-7.1 7.4-13C36 9.6 29.4 3 20 3z"
        fill="url(#omg)"
        stroke="#3a1a00"
        strokeWidth="1.6"
        paintOrder="stroke"
      />
    </svg>
  );
}

export function ExMark() {
  return (
    <svg className="exmark" viewBox="0 0 64 36" aria-label="EX">
      <defs>
        <linearGradient id="exg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#ffe7a3" />
          <stop offset="0.55" stopColor="#ff9b3d" />
          <stop offset="1" stopColor="#d6321b" />
        </linearGradient>
      </defs>
      <text x="32" y="29" textAnchor="middle" fontFamily="'Dela Gothic One', sans-serif" fontSize="30" transform="skewX(-12) translate(6 0)" fill="url(#exg)" stroke="#2a0a00" strokeWidth="3.2" paintOrder="stroke" letterSpacing="-1">
        EX
      </text>
    </svg>
  );
}

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
  const nameLen = def.name.length + (def.omega ? 1 : 0) + (def.ex ? 1.6 : 0) + (def.hp >= 100 ? 0.5 : 0);
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
          {def.omega && <OmegaMark />}
          {def.ex && <ExMark />}
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
        {def.omega && <div className="omega-rule"><b>Ωルール</b>：Ωがきぜつしたとき、相手はサイドを2枚とる。</div>}
        {def.ex && <div className="omega-rule ex-rule"><b>EXルール</b>：EXがきぜつしたとき、相手はサイドを3枚とる。</div>}
        {def.flavor && !def.ability && def.attacks.length < 2 && !def.omega && !def.ex && <div className="tcg-flavor">{def.flavor}</div>}
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
        <div className="back-ring" />
        <div className="back-logo">
          <span className="b1">ARCANE</span>
          <span className="b2">BEASTS</span>
        </div>
        <div className="back-sigil">
          <Icon name="omega" size="100%" />
        </div>
      </div>
      </div>
    </div>
  );
});

export function condLabel(c: string) {
  return COND_JP[c as keyof typeof COND_JP] ?? c;
}
