// ============================================================================
// ガチャ画面: the banners on the left, the chosen one big on the right — its
// art, the pull buttons, the gems held. Only the ピックアップ (limited) shows
// its end, its cards and its 交換P; the rest stay plain.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { foley, sfx } from '../audio/audio';
import { byName, card } from '../engine/cards';
import type { EType } from '../engine/types';
import { artUrl, TYPE_SCENE } from '../lib/assets';
import { isPickup, PICKUP_POINT_COST, pickupNow, pickupPoints } from '../state/pickup';
import { CHAPTER_BOOSTERS, NORMAL_BOOSTER, PREMIUM_BOOSTER, SPECIAL_BOOSTER, SURE3_BOOSTER, TYPE_BOOSTERS, useStore, type Booster, type FreePackState } from '../state/store';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import './gacha.css';

type Via = 'free' | 'gem' | 'ticket';

interface Tab {
  id: string;
  name: string;
  /** the art on the plate and the banner */
  art: string[];
  scene: string;
  hue: string;
  hue2: string;
  /** the packs to choose between (章パック, タイプ別) */
  packs: Booster[];
  limited?: boolean;
}

const fmtWait = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const fmtEnd = (t: number) => {
  const d = new Date(t - 1);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}まで`;
};
const mascotArt = (b: Booster) => byName(b.mascot).art;
const CHAPTER_SCENES = ['story/landscape-castle', 'story/p-lake-castle', 'story/p-great-tree'];

function tabsOf(pickup: Booster): Tab[] {
  const pu = pickupNow();
  return [
    { id: 'pickup', name: 'ピックアップ', art: pu.cards.map((c) => card(c).art), scene: pu.scene, hue: pu.hue, hue2: pu.hue2, packs: [pickup], limited: true },
    { id: 'special', name: 'スペシャルパック', art: [card('AB2-004-SAR').art], scene: 'story/p-lake-castle', hue: SPECIAL_BOOSTER.hue, hue2: SPECIAL_BOOSTER.hue2, packs: [SPECIAL_BOOSTER] },
    { id: 'rare', name: 'レアパック', art: [card('AB2-034-SAR').art], scene: 'story/landscape-castle', hue: PREMIUM_BOOSTER.hue, hue2: PREMIUM_BOOSTER.hue2, packs: [PREMIUM_BOOSTER] },
    { id: 'normal', name: '通常パック', art: [card('AB1-014-SAR').art], scene: 'story/landscape-mountains-01', hue: NORMAL_BOOSTER.hue, hue2: NORMAL_BOOSTER.hue2, packs: [NORMAL_BOOSTER] },
    { id: 'chapter', name: '章パック', art: [mascotArt(CHAPTER_BOOSTERS[0])], scene: CHAPTER_SCENES[0], hue: '#9ad0ff', hue2: '#0a1a33', packs: CHAPTER_BOOSTERS },
    { id: 'type', name: 'タイプ別パック', art: [mascotArt(TYPE_BOOSTERS[0])], scene: 'story/grim-altar', hue: '#8be28c', hue2: '#0a2a14', packs: TYPE_BOOSTERS },
  ];
}

export function GachaView({ pickup, free, now, cost, onBuy, onOdds }: { pickup: Booster; free: FreePackState; now: number; cost: (b: Booster, n: number) => number; onBuy: (b: Booster, packs?: number, via?: Via) => boolean; onOdds: (b: Booster) => void }) {
  const tabs = tabsOf(pickup);
  const [id, setId] = useState(tabs[0].id);
  const [sub, setSub] = useState(0);
  const [trade, setTrade] = useState(false);
  const save = useStore((s) => s.save);
  const t = tabs.find((x) => x.id === id)!;
  const b = t.packs[Math.min(sub, t.packs.length - 1)];
  // a chapter / type pack shows its own monster and place
  const art = t.packs.length > 1 ? [mascotArt(b)] : t.art;
  const scene = t.id === 'chapter' ? CHAPTER_SCENES[sub] ?? t.scene : t.id === 'type' ? TYPE_SCENE[b.id.replace('type-', '') as EType] ?? t.scene : t.scene;
  const hue = t.packs.length > 1 ? b.hue : t.hue;
  const hue2 = t.packs.length > 1 ? b.hue2 : t.hue2;
  const pts = pickupPoints(save.pickupPts, now);
  const pu = pickupNow(now);
  const premiumT = save.packTickets?.premium ?? 0;
  const sure3T = save.packTickets?.sure3 ?? 0;
  const freeWait = free.readyAt ? free.readyAt - now : null;

  return (
    <div className="gp-body">
      <nav className="gp-tabs">
        {tabs.map((x) => (
          <button
            key={x.id}
            className={`gp-tab ${x.id === id ? 'on' : ''}`}
            style={{ ['--h' as string]: x.hue, ['--h2' as string]: x.hue2 }}
            onClick={() => {
              if (x.id === id) return;
              foley.tick();
              setId(x.id);
              setSub(0);
            }}
          >
            <img src={artUrl(x.art[0])} alt="" draggable={false} />
            <span>
              <b>{x.name}</b>
              {x.limited && <small>{pu.title}</small>}
            </span>
            {x.limited && <i className="gp-tab-up">限定</i>}
            {x.id === 'normal' && free.ready && <i className="gp-tab-free">無料</i>}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.section
          key={`${t.id}-${b.id}`}
          className="gp-main"
          style={{ ['--h' as string]: hue, ['--h2' as string]: hue2 }}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="gp-scene" style={{ backgroundImage: `url(${artUrl(scene)})` }} />
          <div className="gp-tint" />
          <div className="gp-rays" />

          <div className={`gp-art n${art.length}`}>
            {art.map((a, i) => (
              <motion.img
                key={a}
                className={`gp-fig f${i}`}
                src={artUrl(a)}
                alt=""
                draggable={false}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.06 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>

          <div className="gp-head">
            {t.limited && <div className="gp-until">{fmtEnd(pu.ends)}</div>}
            <div className="gp-title">
              <b>{t.limited ? pu.title : b.name}</b>
            </div>
            {t.packs.length > 1 && (
              <div className="gp-chips">
                {t.packs.map((p, k) => (
                  <button key={p.id} className={k === sub ? 'on' : ''} style={{ ['--h' as string]: p.hue }} onClick={() => (foley.tick(), setSub(k))}>
                    {p.name.replace('のパック', '').replace('パック', '')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {t.limited && (
            <div className="gp-feature">
              <div className="gp-tag">ピックアップ</div>
              <div className="gp-names">{pu.cards.map((c) => card(c).name).join(' ・ ')}</div>
              <div className="gp-minis">
                {pu.cards.map((cid) => (
                  <div key={cid} className="gp-mini">
                    <CardFace cid={cid} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="gp-pulls">
            {t.limited && (
              <div className="gp-points">
                <span>
                  交換P <b>{pts}</b>
                  <small>/{PICKUP_POINT_COST}</small>
                </span>
                <button className="gp-pbtn" disabled={pts < PICKUP_POINT_COST} onClick={() => (sfx('expand', 0.4), setTrade(true))}>
                  P交換
                </button>
              </div>
            )}
            {b.free ? (
              <>
                <button className={`gp-pull free ${free.ready ? '' : 'off'}`} disabled={!free.ready} onClick={() => onBuy(b, 1, 'free')}>
                  <span>{free.ready ? '無料で1回引く' : freeWait !== null ? `次の無料まで ${fmtWait(freeWait)}` : '今日の無料は終わり'}</span>
                  <b>あと{free.left}回</b>
                </button>
                {sure3T > 0 && (
                  <button className="gp-pull ticket" onClick={() => onBuy(SURE3_BOOSTER, 1, 'ticket')}>
                    <span>★3確定チケットで引く</span>
                    <b>×{sure3T}</b>
                  </button>
                )}
              </>
            ) : (
              <>
                {b.id === PREMIUM_BOOSTER.id && premiumT > 0 && (
                  <button className="gp-pull ticket" onClick={() => onBuy(b, 1, 'ticket')}>
                    <span>チケットで引く</span>
                    <b>×{premiumT}</b>
                  </button>
                )}
                <div className="gp-pull-row">
                  <button className="gp-pull" disabled={save.gems < cost(b, 1)} onClick={() => onBuy(b, 1)}>
                    <span>1回引く</span>
                    <b>
                      <Icon name="gem" /> {cost(b, 1).toLocaleString()}
                    </b>
                  </button>
                  <button className="gp-pull ten" disabled={save.gems < cost(b, 10)} onClick={() => onBuy(b, 10)}>
                    <span>10回引く</span>
                    <b>
                      <Icon name="gem" /> {cost(b, 10).toLocaleString()}
                    </b>
                  </button>
                </div>
              </>
            )}
            <div className="gp-have">
              所持 <Icon name="gem" /> <b>{save.gems.toLocaleString()}</b>
            </div>
          </div>

          <button className="gp-info" aria-label="提供割合" onClick={() => onOdds(b)}>
            i
          </button>
        </motion.section>
      </AnimatePresence>

      <AnimatePresence>{trade && <TradeSheet cards={pu.cards} onClose={() => setTrade(false)} />}</AnimatePresence>
    </div>
  );
}

/** 交換P → one of the two pickup cards */
function TradeSheet({ cards, onClose }: { cards: string[]; onClose: () => void }) {
  const [got, setGot] = useState<string | null>(null);
  const take = (cid: string) => {
    const s = useStore.getState();
    if (pickupPoints(s.save.pickupPts) < PICKUP_POINT_COST) return;
    s.update((sv) => {
      sv.pickupPts = { key: pickupNow().key, n: pickupPoints(sv.pickupPts) - PICKUP_POINT_COST };
    });
    s.addCards([cid]);
    foley.chime(7);
    sfx('gold', 0.6);
    setGot(cid);
  };
  return (
    <motion.div className="pay-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel pay-sheet gp-trade" initial={{ y: 20 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="pay-title">{got ? `${card(got).name}を手に入れた` : `交換P ${PICKUP_POINT_COST} でカードを1枚`}</div>
        <div className="gp-trade-cards">
          {(got ? [got] : cards).map((cid) => (
            <button key={cid} className="gp-trade-card" disabled={!!got} onClick={() => take(cid)}>
              <CardFace cid={cid} />
            </button>
          ))}
        </div>
        <div className="pay-btns">
          <button className="btn" onClick={onClose}>
            {got ? 'OK' : 'やめる'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export { isPickup };
