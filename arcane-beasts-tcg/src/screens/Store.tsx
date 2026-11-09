// ============================================================================
// ショップ (tab): おすすめ · パック · アイテム · 交換所 · ジェム
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { foley, playMusic, sfx } from '../audio/audio';
import { card } from '../engine/cards';
import { artUrl } from '../lib/assets';
import { dailyDeals, GEM_PRODUCTS, leftOf, MAX_DECK_SLOTS, SHOP_ITEMS, type Deal, type ShopItem } from '../state/market';
import { dayKey, fmtRemain, msUntilTomorrow } from '../state/progress';
import { deckSlotsOf, PREMIUM_BOOSTER, SPECIAL_BOOSTER, useStore } from '../state/store';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { PaySheet } from '../ui/PaySheet';
import { setOpenGemShop, TopBar } from '../ui/TopBar';
import { BoosterPack } from './pack/BoosterPack';
import { Shop } from './Shop';

type Seg = 'pick' | 'pack' | 'items' | 'exchange' | 'gems';
/** the section open (kept when leaving and coming back) */
export const useShopSeg = create<{ seg: Seg }>(() => ({ seg: 'pick' }));
setOpenGemShop(() => {
  useShopSeg.setState({ seg: 'gems' });
  useStore.getState().go('store');
});

const SEGS: { id: Seg; label: string; icon: string }[] = [
  { id: 'pick', label: 'おすすめ', icon: 'stars' },
  { id: 'pack', label: 'パック', icon: 'cards' },
  { id: 'items', label: 'アイテム', icon: 'crystal-ball' },
  { id: 'exchange', label: '交換所', icon: 'exchange' },
  { id: 'gems', label: 'ジェム', icon: 'gem' },
];

function Head() {
  const seg = useShopSeg((s) => s.seg);
  return (
    <>
      <TopBar title="ショップ" back={null} />
      <nav className="st4-segs">
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
            {g.id === 'gems' ? <Icon name="gem" /> : <Icon name={g.icon} />}
            {g.label}
          </button>
        ))}
      </nav>
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
      <div className="page-bg st4-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="page-shade" />
      <div className="page">
        <Head />
        <div className="page-inner st4-body">
          {seg === 'pick' ? <Pick /> : seg === 'items' ? <ItemList section={['set', 'item']} /> : seg === 'exchange' ? <ItemList section={['exchange']} /> : <Gems />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// おすすめ: a banner carousel and today's cards
// ---------------------------------------------------------------------------
interface Banner {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  badge?: string;
  hue: string;
  pack?: import('../state/store').Booster;
  icon?: string;
  go: () => void;
}

function Pick() {
  const save = useStore((s) => s.save);
  const [buy, setBuy] = useState<ShopItem | null>(null);
  const starter = SHOP_ITEMS.find((i) => i.id === 'starter')!;
  const sure3 = SHOP_ITEMS.find((i) => i.id === 'sure3-set')!;
  const banners: Banner[] = [
    { key: 'special', kicker: 'NEW', title: 'スペシャルパック', sub: '★3以上2枚確定', hue: SPECIAL_BOOSTER.hue, pack: SPECIAL_BOOSTER, go: () => useShopSeg.setState({ seg: 'pack' }) },
    ...(leftOf(starter, save.shopBought) > 0 ? [{ key: 'starter', kicker: '初心者限定・1回のみ', title: 'スタートダッシュセット', sub: starter.note!, badge: `${Math.round((1 - starter.price / starter.worth!) * 100)}%おトク`, hue: '#ffd76a', icon: 'crown', go: () => setBuy(starter) }] : []),
    { key: 'sure3', kicker: '週1回', title: '★3確定セット', sub: sure3.note!, hue: '#c890ff', icon: 'stars', go: () => setBuy(sure3) },
    { key: 'premium', kicker: 'いつでも', title: 'レアパック', sub: '5枚目は★3以上確定', hue: PREMIUM_BOOSTER.hue, pack: PREMIUM_BOOSTER, go: () => useShopSeg.setState({ seg: 'pack' }) },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);
  const b = banners[i % banners.length];
  return (
    <>
      <div className="st4-carousel">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.button
            key={b.key}
            className="st4-banner"
            style={{ ['--bh' as string]: b.hue }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => (sfx('expand', 0.4), b.go())}
          >
            <span className="st4-banner-art">
              {b.pack ? (
                <BoosterPack booster={b.pack} still />
              ) : (
                <span className="st4-banner-ico">
                  <Icon name={b.icon ?? 'chest'} />
                </span>
              )}
            </span>
            <span className="st4-banner-text">
              <small>{b.kicker}</small>
              <b>{b.title}</b>
              <span>{b.sub}</span>
            </span>
            {b.badge && <span className="st4-banner-badge">{b.badge}</span>}
          </motion.button>
        </AnimatePresence>
        <button className="st4-arrow l" aria-label="前へ" onClick={() => setI((n) => (n + banners.length - 1) % banners.length)}>
          ‹
        </button>
        <button className="st4-arrow r" aria-label="次へ" onClick={() => setI((n) => (n + 1) % banners.length)}>
          ›
        </button>
        <div className="st4-dots">
          {banners.map((x, k) => (
            <i key={x.key} className={k === i % banners.length ? 'on' : ''} onClick={() => setI(k)} />
          ))}
        </div>
      </div>
      <Deals />
      <AnimatePresence>{buy && <BuySheet key={buy.id} item={buy} onClose={() => setBuy(null)} />}</AnimatePresence>
    </>
  );
}

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
        <h3>日替わりカード</h3>
        <span className="st4-timer">
          <Icon name="hourglass" /> 入れ替えまで {fmtRemain(msUntilTomorrow(new Date(now)))}
        </span>
      </div>
      <div className="st4-deals">
        {deals.map((d, k) => {
          const c = card(d.cid);
          const sold = bought.includes(d.cid);
          return (
            <motion.button
              key={d.cid}
              className={`st4-deal r${c.rarity} ${sold ? 'sold' : ''}`}
              initial={{ opacity: 0, y: 16, rotateY: 40 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ delay: k * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              disabled={sold}
              onClick={() => (sfx('expand', 0.4), setPick(d))}
            >
              <span className="st4-deal-card">
                <CardFace cid={d.cid} />
                {sold && <span className="st4-sold">購入済み</span>}
              </span>
              <span className="st4-deal-name">{c.name}</span>
              <span className="st4-deal-own">所持 {save.collection[d.cid] ?? 0}</span>
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
// アイテム · 交換所
// ---------------------------------------------------------------------------
function BuySheet({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const buyItem = useStore((s) => s.buyItem);
  return <PaySheet title={item.name} price={item.price} currency={item.currency} onCancel={onClose} onPay={() => buyItem(item.id).ok} onDone={onClose} />;
}

function ItemList({ section }: { section: ShopItem['section'][] }) {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const [pick, setPick] = useState<ShopItem | null>(null);
  const groups: [string, ShopItem[]][] = section.includes('exchange')
    ? [['コインで交換', SHOP_ITEMS.filter((i) => i.section === 'exchange')]]
    : [
        ['お得なセット', SHOP_ITEMS.filter((i) => i.section === 'set')],
        ['アイテム', SHOP_ITEMS.filter((i) => i.section === 'item')],
      ];
  const slots = deckSlotsOf(save);
  return (
    <>
      <div className="st4-have">
        <span>
          <Icon name="ticket" /> レア <b>{save.packTickets?.premium ?? 0}</b>
        </span>
        <span>
          <Icon name="stars" /> ★3確定 <b>{save.packTickets?.sure3 ?? 0}</b>
        </span>
        <span>
          <Icon name="robot" /> オート <b>{save.autoTickets ?? 0}</b>
        </span>
        <span>
          <Icon name="deck" /> デッキ枠 <b>{slots}</b>/{MAX_DECK_SLOTS}
        </span>
      </div>
      {groups.map(([title, list]) => (
        <div key={title} className="st4-group">
          <div className="st4-head">
            <h3>{title}</h3>
            {section.includes('exchange') && (
              <span className="st4-timer">
                <Icon name="coin" /> {save.coins.toLocaleString()}
              </span>
            )}
          </div>
          <div className="st4-grid">
            {list.map((it, k) => {
              const left = leftOf(it, save.shopBought);
              const out = left <= 0 || (!!it.give.slots && slots >= MAX_DECK_SLOTS);
              const off = it.worth ? Math.round((1 - it.price / it.worth) * 100) : 0;
              const coin = it.currency === 'coin';
              return (
                <motion.button
                  key={it.id}
                  className={`st4-tile ${it.section} ${out ? 'sold' : ''}`}
                  disabled={out}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: k * 0.04, duration: 0.4 }}
                  onMouseEnter={() => foley.hover()}
                  onClick={() => (sfx('expand', 0.4), setPick(it))}
                >
                  <span className="st4-tile-name">{it.name}</span>
                  <span className="st4-tile-art">
                    <Icon name={it.icon} />
                    {it.limit && (
                      <i className="st4-tile-limit">
                        {it.limit.per === 'once' ? '1回限定' : `${it.limit.per === 'week' ? '今週' : '今日'}あと${left}回`}
                      </i>
                    )}
                    {off > 0 && <i className="st4-tile-off">{off}%おトク</i>}
                  </span>
                  {it.note && <small className="st4-tile-note">{it.note}</small>}
                  <span className={`st4-tile-price ${coin ? 'coin' : ''}`}>
                    {out ? (
                      '購入済み'
                    ) : (
                      <>
                        {it.worth && !coin && <s>{it.worth.toLocaleString()}</s>}
                        <Icon name={coin ? 'coin' : 'gem'} /> {it.price.toLocaleString()}
                      </>
                    )}
                  </span>
                </motion.button>
              );
            })}
            {title === 'アイテム' && (
              <button className="st4-tile" onClick={() => go('wardrobe')}>
                <span className="st4-tile-name">ワードローブ</span>
                <span className="st4-tile-art">
                  <Icon name="wardrobe" />
                </span>
                <small className="st4-tile-note">スリーブ・プレイマット・称号</small>
                <span className="st4-tile-price">見る ›</span>
              </button>
            )}
          </div>
        </div>
      ))}
      <AnimatePresence>{pick && <BuySheet key={pick.id} item={pick} onClose={() => setPick(null)} />}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// ジェム (the buy screen: payment is not open yet)
// ---------------------------------------------------------------------------
function Gems() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <div className="st4-head">
        <h3>ジェムを購入</h3>
      </div>
      <div className="st4-gems">
        {GEM_PRODUCTS.map((g, k) => (
          <motion.button key={g.yen} className="st4-gem" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.05, duration: 0.4 }} onClick={() => (sfx('expand', 0.4), setNote('現在、ジェムの購入は準備中です'))}>
            <span className="st4-gem-art" style={{ ['--n' as string]: Math.min(5, k + 1) }}>
              {Array.from({ length: Math.min(5, k + 1) }, (_, j) => (
                <Icon key={j} name="gem" />
              ))}
            </span>
            <b>{g.gems.toLocaleString()}</b>
            <span className="st4-yen">¥{g.yen.toLocaleString()}</span>
          </motion.button>
        ))}
      </div>
      <div className="st4-legal">
        <button onClick={() => setNote('資金決済法に基づく表示は準備中です')}>資金決済法に基づく表示</button>
        <button onClick={() => setNote('特定商取引法に基づく表示は準備中です')}>特定商取引法に基づく表示</button>
      </div>
      <AnimatePresence>
        {note && (
          <motion.div className="pay-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNote(null)}>
            <motion.div className="panel pay-sheet" initial={{ y: 20 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="pay-title">お知らせ</div>
              <p className="st4-note">{note}</p>
              <div className="pay-btns">
                <button className="btn" onClick={() => setNote(null)}>
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
