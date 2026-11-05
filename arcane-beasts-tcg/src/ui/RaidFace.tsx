// ============================================================================
// The face of a raid card. Not a recoloured monster card: its own layout and
// materials, to read as the rarest thing in the game.
//   • the boss's painting edge to edge, the monster climbing out of the frame
//   • an engraved gold frame with filigree corners, a crest and a seal
//   • names in a serif face, numerals in Roman capitals, gold leaf lettering
//   • an etched foil over the whole card that moves as the card tilts
// ============================================================================
import '@fontsource/shippori-mincho-b1/800.css';
import type { MonsterCard } from '../engine/types';
import { artUrl } from '../lib/assets';
import { EnergySymbol } from './Card';
import './raid-card.css';

/** one engraved corner flourish, drawn for the top-left and mirrored */
const CORNER =
  'M18 92 C18 50 50 18 92 18 M30 120 C26 70 70 26 120 30 M18 92 C40 88 60 72 64 50 C66 36 56 28 46 34 C38 40 42 52 52 50 ' +
  'M92 18 C88 40 72 60 50 64 C36 66 28 56 34 46 C40 38 52 42 50 52 M64 64 L74 74 M70 58 L80 50 M58 70 L50 80';

function Frame({ id }: { id: string }) {
  const gold = `url(#${id}g)`;
  const corners = [
    'translate(0 0)',
    'translate(630 0) scale(-1 1)',
    'translate(0 880) scale(1 -1)',
    'translate(630 880) scale(-1 -1)',
  ];
  return (
    <svg className="rf-frame" viewBox="0 0 630 880" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset=".18" stopColor="#d9a93e" />
          <stop offset=".34" stopColor="#7a4f0e" />
          <stop offset=".5" stopColor="#ffe9a3" />
          <stop offset=".66" stopColor="#a8741a" />
          <stop offset=".82" stopColor="#fff1bd" />
          <stop offset="1" stopColor="#8a5c12" />
        </linearGradient>
        <filter id={`${id}s`} x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity=".85" />
        </filter>
      </defs>
      <g filter={`url(#${id}s)`} fill="none" stroke={gold} strokeLinecap="round">
        {/* the frame: a heavy outer band, a hairline inside it, a beaded line */}
        <rect x="9" y="9" width="612" height="862" rx="26" strokeWidth="10" />
        <rect x="22" y="22" width="586" height="836" rx="18" strokeWidth="2" />
        <rect x="30" y="30" width="570" height="820" rx="14" strokeWidth="1.2" strokeDasharray="1 7" />
        {corners.map((t) => (
          <g key={t} transform={t}>
            <path d={CORNER} strokeWidth="3.2" />
            <path d="M46 46 l8 -8 l8 8 l-8 8 z" fill={gold} stroke="none" />
          </g>
        ))}
        {/* diamonds on the long sides */}
        {[300, 580].map((y) => (
          <g key={y}>
            <path d={`M9 ${y} l12 -14 l12 14 l-12 14 z`} fill={gold} stroke="none" />
            <path d={`M597 ${y} l12 -14 l12 14 l-12 14 z`} fill={gold} stroke="none" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function RaidFace({ def }: { def: MonsterCard }) {
  const id = `rf${def.id.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div className={`rf rf-${def.type}`}>
      <img className="rf-scene" src={artUrl(def.scene ?? 'story/p-the-fall')} alt="" draggable={false} loading="lazy" />
      <div className="rf-glow" />
      <div className="rf-vignette" />
      <div className="rf-foil" />
      <Frame id={id} />

      <div className="rf-crest">
        <EnergySymbol type={def.type} size="100%" />
      </div>
      {/* the nameplate: a band of black and gold across the card */}
      <div className="rf-band">
        <div className="rf-title">
          <small>RAID BOSS ・ 化身</small>
          <b>{def.name}</b>
        </div>
        <div className="rf-hp">
          <small>HP</small>
          <b>{def.hp}</b>
        </div>
      </div>

      <div className="rf-plate">
        {def.attacks.map((a, i) => (
          <div className="rf-atk" key={i}>
            <div className="rf-atk-head">
              <span className="rf-cost">
                {a.cost.map((c, j) => (
                  <i key={j}>
                    <EnergySymbol type={c} size="100%" />
                  </i>
                ))}
              </span>
              <span className="rf-atk-name">{a.name}</span>
              {a.damage !== undefined && (
                <span className="rf-dmg">
                  {a.damage}
                  {a.suffix}
                </span>
              )}
            </div>
            {a.text && <p>{a.text}</p>}
          </div>
        ))}
        <div className="rf-stats">
          <span>
            弱点 {def.weakness ? <EnergySymbol type={def.weakness} size="1.1em" /> : '―'}
            {def.weakness && '×2'}
          </span>
          <span>抵抗力 {def.resistance ? <EnergySymbol type={def.resistance} size="1.1em" /> : '―'}</span>
          <span>
            にげる
            {Array.from({ length: def.retreat }, (_, i) => (
              <EnergySymbol key={i} type="colorless" size="1.1em" />
            ))}
          </span>
        </div>
      </div>

      <div className="rf-seal">
        <svg viewBox="0 0 100 100" aria-hidden>
          <defs>
            <radialGradient id={`${id}w`} cx="40%" cy="35%" r="70%">
              <stop offset="0" stopColor="#ff6b5e" />
              <stop offset=".55" stopColor="#a3101e" />
              <stop offset="1" stopColor="#4a0309" />
            </radialGradient>
            <path id={`${id}c`} d="M50 50 m-33 0 a33 33 0 1 1 66 0 a33 33 0 1 1 -66 0" />
          </defs>
          <path
            d="M50 3 C58 6 64 3 70 9 C77 12 82 14 85 22 C91 28 95 34 94 42 C98 50 95 57 93 64 C92 72 86 77 80 83 C74 89 66 91 58 95 C50 98 43 95 36 93 C28 92 22 86 16 80 C10 74 7 66 5 58 C2 50 5 43 7 36 C9 28 14 22 20 16 C26 10 34 7 42 5 C45 4 47 3 50 3 Z"
            fill={`url(#${id}w)`}
          />
          <circle cx="50" cy="50" r="38" fill="none" stroke="#ffd7a0" strokeOpacity=".55" strokeWidth="1.2" />
          <text fontFamily="Cinzel, serif" fontSize="10.5" fontWeight="700" fill="#ffe6c0" letterSpacing="2.2">
            <textPath href={`#${id}c`}>✦ RAID ✦ ARCANE BEASTS ✦</textPath>
          </text>
          <text x="50" y="59" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="26" fontWeight="700" fill="#ffe6c0">
            R
          </text>
        </svg>
      </div>
      <div className="rf-foot">
        <span>Illus. Wesnoth</span>
        <span className="rf-no">No.{String(def.no - 900).padStart(3, '0')} / 004 ・ RAID</span>
      </div>
    </div>
  );
}
