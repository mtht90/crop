// ============================================================================
// ショップ (tab): オートバトルチケット and デッキレシピ for gems
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { foley, playMusic, sfx } from '../audio/audio';
import { artUrl } from '../lib/assets';
import { SHOP_ITEMS, type ShopItem } from '../state/market';
import { useStore } from '../state/store';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import { PaySheet } from '../ui/PaySheet';

export function Store() {
  const save = useStore((s) => s.save);
  const buyItem = useStore((s) => s.buyItem);
  const go = useStore((s) => s.go);
  const [item, setItem] = useState<ShopItem | null>(null);
  useEffect(() => playMusic('menu'), []);
  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/p-study')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="ショップ" />
        <div className="page-inner store3">
          <div className="box store3-have">
            <span>
              <Icon name="ticket" /> オートバトルチケット <b>{save.autoTickets ?? 0}</b>枚
            </span>
            <span>
              <Icon name="scroll-unfurled" /> デッキレシピ <b>{(save.recipes ?? []).length}</b>
            </span>
          </div>
          <div className="store3-list">
            {SHOP_ITEMS.map((it, i) => (
              <motion.button
                key={it.id}
                className="box store3-item"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                onMouseEnter={() => foley.hover()}
                onClick={() => (sfx('expand', 0.4), setItem(it))}
              >
                <span className="store3-ico">
                  <Icon name={it.icon} />
                </span>
                <span className="store3-name">{it.name}</span>
                <span className="store3-price">
                  <Icon name="gem" /> {it.price.toLocaleString()}
                </span>
              </motion.button>
            ))}
            <button className="box store3-item" onClick={() => go('wardrobe')}>
              <span className="store3-ico">
                <Icon name="wardrobe" />
              </span>
              <span className="store3-name">ワードローブ</span>
              <span className="more-go">›</span>
            </button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {item && (
          <PaySheet
            key={item.id}
            title={item.name}
            price={item.price}
            onCancel={() => setItem(null)}
            onPay={() => {
              const r = buyItem(item.id);
              return r.ok;
            }}
            onDone={() => setItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
