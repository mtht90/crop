// ============================================================================
// ショップ (tab): パック · 日替わり · セット・アイテム
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { foley, playMusic, sfx } from '../audio/audio';
import { card } from '../engine/cards';
import { artUrl } from '../lib/assets';
import { dailyDeals, limitKey, SHOP_ITEMS, type Deal, type ShopItem } from '../state/market';
import { dayKey, fmtRemain, msUntilTomorrow } from '../state/progress';
import { useStore } from '../state/store';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PaySheet } from '../ui/PaySheet';
import { TopBar } from '../ui/TopBar';
import { Shop } from './Shop';

type Seg = 'pack' | 'deals' | 'items';
/** the section open (kept when leaving and coming back) */
export const useShopSeg = create<{ seg: Seg }>(() => ({ seg: 'pack' }));

const SEGS: { id: Seg; label: string; icon: string }[] = [
  { id: 'pack', label: 'パック', icon: 'chest' },
  { id: 'deals', label: '日替わり', icon: 'hourglass' },
  { id: 'items', label: 'セット・アイテム', icon: 'ticket' },
];

function Head() {
  const seg = useShopSeg((s) => s.seg);
  return (
    <>
      <TopBar title="ショップ" back={null} />
      <div className="st4-segs">
        {SEGS.map((g) => (
          <button
            key={g.id}
            className={`st4-seg ${seg === g.id ? 'on' : ''}`}
            onClick={() => {
              if (seg === g.id) return;
              foley.tick();
              useShopSeg.setState({ seg: g.id });
            }}
          >
            <Icon name={g.icon} />
            {g.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function Store() {
  const seg = useShopSeg((s) => s.seg);
  if (seg === 'pack') return <Shop header={<Head />} />;
  return <StorePage seg={seg} />;
}

function StorePage({ seg }: { seg: Seg }) {
  useEffect(() => playMusic('packs'), []);
  return (
    <div className="screen st4">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/p-study')})` }} />
      <div className="page-shade" />
      <div className="page">
        <Head />
        <div className="page-inner st4-body">{seg === 'deals' ? <Deals /> : <Items />}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 日替わり
// ---------------------------------------------------------------------------
function Deals() {
  const save = useStore((s) => s.save);
  const buyDeal = useStore((s) => s.buyDeal);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const day = dayKey(new Date(now));
  const deals = dailyDeals(day);
  const bought = save.dealsBought?.day === day ? save.dealsBought.cids : [];
  const [pick, setPick] = useState<Deal | null>(null);
  return (
    <>
      <div className="st4-head">
        <h3>今日のカード</h3>
        <span className="st4-timer">
          <Icon name="hourglass" /> 入れ替えまで {fmtRemain(msUntilTomorrow(new Date(now)))}
        </span>
      </div>
      <div className="st4-deals">
        {deals.map((d, i) => {
          const c = card(d.cid);
          const sold = bought.includes(d.cid);
          const have = save.collection[d.cid] ?? 0;
          return (
            <motion.button
              key={d.cid}
              className={`st4-deal r${c.rarity} ${sold ? 'sold' : ''}`}
              initial={{ opacity: 0, y: 16, rotateY: 40 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              disabled={sold}
              onClick={() => (sfx('expand', 0.4), setPick(d))}
            >
              <span className="st4-deal-card">
                <CardFace cid={d.cid} />
                {sold && <span className="st4-sold">購入済み</span>}
              </span>
              <span className="st4-deal-name">{c.name}</span>
              <span className="st4-deal-own">所持 {have}</span>
              <span className="st4-price">
                <Icon name="gem" /> {d.price}
              </span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {pick && (
          <PaySheet key={pick.cid} title={`日替わり：${card(pick.cid).name}`} price={pick.price} onCancel={() => setPick(null)} onPay={() => buyDeal(pick.cid)} onDone={() => setPick(null)}>
            <div className="st4-pay-card">
              <CardFace cid={pick.cid} />
            </div>
          </PaySheet>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// セット・アイテム
// ---------------------------------------------------------------------------
function Items() {
  const save = useStore((s) => s.save);
  const buyItem = useStore((s) => s.buyItem);
  const go = useStore((s) => s.go);
  const [pick, setPick] = useState<ShopItem | null>(null);
  const soldOut = (it: ShopItem) => {
    const k = limitKey(it);
    return !!k && save.shopBought?.[it.id] === k;
  };
  const sets = SHOP_ITEMS.filter((i) => i.limit);
  const items = SHOP_ITEMS.filter((i) => !i.limit);
  return (
    <>
      <div className="st4-have">
        <span>
          <Icon name="ticket" /> チケット <b>{save.autoTickets ?? 0}</b>
        </span>
        <span>
          <Icon name="scroll-unfurled" /> レシピ <b>{(save.recipes ?? []).length}</b>
        </span>
      </div>

      <div className="st4-head">
        <h3>お得なセット</h3>
      </div>
      <div className="st4-sets">
        {sets.map((it, i) => {
          const off = it.worth ? Math.round((1 - it.price / it.worth) * 100) : 0;
          const out = soldOut(it);
          return (
            <motion.button key={it.id} className={`st4-set ${out ? 'sold' : ''}`} disabled={out} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.45 }} onClick={() => (sfx('expand', 0.4), setPick(it))}>
              <span className="st4-ribbon">{it.limit === 'once' ? '1回限り' : '週1回'}</span>
              {off > 0 && <span className="st4-off">{off}%おトク</span>}
              <span className="st4-set-ico">
                <Icon name={it.icon} />
              </span>
              <span className="st4-set-text">
                <b>{it.name}</b>
                <small>{it.note}</small>
              </span>
              <span className="st4-price">
                {out ? (
                  '購入済み'
                ) : (
                  <>
                    {it.worth && <s>{it.worth.toLocaleString()}</s>}
                    <Icon name="gem" /> {it.price.toLocaleString()}
                  </>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="st4-head">
        <h3>アイテム</h3>
      </div>
      <div className="st4-items">
        {items.map((it, i) => {
          const off = it.worth ? Math.round((1 - it.price / it.worth) * 100) : 0;
          return (
            <motion.button key={it.id} className="box st4-item" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }} onMouseEnter={() => foley.hover()} onClick={() => (sfx('expand', 0.4), setPick(it))}>
              <span className="st4-item-ico">
                <Icon name={it.icon} />
              </span>
              <span className="st4-set-text">
                <b>{it.name}</b>
                {it.note && <small>{it.note}</small>}
              </span>
              {off > 0 && <span className="st4-off small">{off}%おトク</span>}
              <span className="st4-price">
                <Icon name="gem" /> {it.price.toLocaleString()}
              </span>
            </motion.button>
          );
        })}
        <button className="box st4-item" onClick={() => go('wardrobe')}>
          <span className="st4-item-ico">
            <Icon name="wardrobe" />
          </span>
          <span className="st4-set-text">
            <b>ワードローブ</b>
            <small>スリーブ・プレイマット・称号</small>
          </span>
          <span className="more-go">›</span>
        </button>
      </div>

      <AnimatePresence>
        {pick && <PaySheet key={pick.id} title={pick.name} price={pick.price} onCancel={() => setPick(null)} onPay={() => buyItem(pick.id).ok} onDone={() => setPick(null)} />}
      </AnimatePresence>
    </>
  );
}
