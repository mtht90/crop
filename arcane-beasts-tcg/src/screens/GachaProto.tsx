// ============================================================================
// ガチャ画面の試作 (?screen=gacha): a list of banners on the left, the chosen
// banner big on the right — art, period, rate-up, the pull buttons and the
// exchange points. Not wired into the menus yet.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { foley } from '../audio/audio';
import { card } from '../engine/cards';
import { artUrl } from '../lib/assets';
import { useStore } from '../state/store';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { TopBar } from '../ui/TopBar';
import './gacha.css';

interface Banner {
  id: string;
  /** the plate on the left */
  tab: string;
  tabSub?: string;
  kicker?: string;
  title: string;
  sub?: string;
  until?: string;
  hue: string;
  hue2: string;
  scene: string;
  /** the cards on the banner (the first is the biggest) */
  feature: string[];
  rateUp?: boolean;
  promo?: string;
  one: number;
  ten: number;
  free?: boolean;
  points?: boolean;
}

const BANNERS: Banner[] = [
  {
    id: 'pickup',
    tab: 'ピックアップ',
    tabSub: '紅蓮と星詠み',
    kicker: '期間限定',
    title: '紅蓮と星詠み',
    sub: 'ヴォルカリオン ・ アークウィッチ',
    until: '2026/11/23 23:59まで',
    hue: '#ff6a4a',
    hue2: '#3a0a2a',
    scene: 'story/p-fire-sky',
    feature: ['AB1-011-SAR', 'AB3-051-SAR'],
    rateUp: true,
    promo: '10連で★3以上1枚確定',
    one: 500,
    ten: 4500,
    points: true,
  },
  { id: 'special', tab: 'スペシャルパック', kicker: 'いつでも', title: 'スペシャルパック', sub: '★3以上2枚確定', hue: '#b98cff', hue2: '#12052a', scene: 'story/p-lake-castle', feature: ['AB2-004-SAR'], promo: '★4・★5が出やすい', one: 800, ten: 7980 },
  { id: 'rare', tab: 'レアパック', kicker: 'いつでも', title: 'レアパック', sub: '5枚目は★3以上確定', hue: '#e9c46a', hue2: '#1c1206', scene: 'story/landscape-castle', feature: ['AB2-034-SAR'], one: 500, ten: 4500 },
  { id: 'normal', tab: '通常パック', tabSub: '毎日無料', kicker: '毎日2回無料', title: '通常パック', sub: 'すべての章のカード', hue: '#5ab0ff', hue2: '#0a2a6e', scene: 'story/landscape-mountains-01', feature: ['AB1-014-SAR'], one: 500, ten: 4500, free: true },
  { id: 'chapter', tab: '章パック', kicker: 'いつでも', title: '章パック', sub: '選んだ章のカードだけ', hue: '#9ad0ff', hue2: '#0a1a33', scene: 'story/p-great-tree', feature: ['AB3-036-SAR'], one: 500, ten: 4500 },
  { id: 'type', tab: 'タイプ別パック', kicker: 'いつでも', title: 'タイプ別パック', sub: '選んだタイプのモンスターだけ', hue: '#8be28c', hue2: '#0a2a14', scene: 'story/grim-altar', feature: ['AB2-015-SAR'], one: 300, ten: 2700 },
];

export function GachaProto() {
  const [id, setId] = useState(BANNERS[0].id);
  const b = BANNERS.find((x) => x.id === id)!;
  const gems = useStore((s) => s.save.gems);
  return (
    <div className="screen gp">
      <div className="page-bg gp-bg" style={{ backgroundImage: `url(${artUrl(b.scene)})` }} />
      <div className="page-shade" />
      <div className="page gp-page">
        <TopBar title="パック" back="store" />
        <div className="gp-body">
          <nav className="gp-tabs">
            {BANNERS.map((x) => (
              <button
                key={x.id}
                className={`gp-tab ${x.id === id ? 'on' : ''}`}
                style={{ ['--h' as string]: x.hue, ['--h2' as string]: x.hue2 }}
                onClick={() => (foley.tick(), setId(x.id))}
              >
                <img src={artUrl(card(x.feature[0]).art)} alt="" draggable={false} />
                <span>
                  <b>{x.tab}</b>
                  {x.tabSub && <small>{x.tabSub}</small>}
                </span>
                {x.rateUp && <i className="gp-tab-up">UP</i>}
                {x.free && <i className="gp-tab-free">無料</i>}
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section
              key={b.id}
              className="gp-main"
              style={{ ['--h' as string]: b.hue, ['--h2' as string]: b.hue2 }}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="gp-scene" style={{ backgroundImage: `url(${artUrl(b.scene)})` }} />
              <div className="gp-tint" />
              <div className="gp-rays" />

              {/* the featured monsters */}
              <div className={`gp-art n${b.feature.length}`}>
                {b.feature.map((cid, i) => (
                  <motion.img
                    key={cid}
                    className={`gp-fig f${i}`}
                    src={artUrl(card(cid).art)}
                    alt=""
                    draggable={false}
                    initial={{ opacity: 0, y: 20, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.08 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
              </div>

              {/* top right: period and the title */}
              <div className="gp-head">
                {b.until && <div className="gp-until">{b.until}</div>}
                <div className="gp-title">
                  {b.kicker && <small>{b.kicker}</small>}
                  <b>{b.title}</b>
                </div>
                {b.promo && <div className="gp-promo">{b.promo}</div>}
              </div>

              {b.rateUp && (
                <motion.div className="gp-rateup" initial={{ opacity: 0, scale: 1.4, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 16 }}>
                  <span>登場確率</span>
                  <b>アップ</b>
                </motion.div>
              )}

              {/* bottom left: what is featured */}
              <div className="gp-feature">
                {b.rateUp && <div className="gp-tag">★4 ピックアップ</div>}
                <div className="gp-names">{b.sub}</div>
                <div className="gp-minis">
                  {b.feature.map((cid) => (
                    <div key={cid} className="gp-mini">
                      <CardFace cid={cid} />
                    </div>
                  ))}
                </div>
              </div>

              {/* bottom right: the pulls */}
              <div className="gp-pulls">
              {b.points && (
                <div className="gp-points">
                  <span>
                    交換P <b>0</b>
                    <small>/200</small>
                  </span>
                  <button className="gp-pbtn">P交換</button>
                </div>
              )}

                {b.free && (
                  <button className="gp-pull free">
                    <span>無料で1回引く</span>
                    <b>あと2回</b>
                  </button>
                )}
                <div className="gp-pull-row">
                  <button className="gp-pull">
                    <span>1回引く</span>
                    <b>
                      <Icon name="gem" /> {b.one.toLocaleString()}
                    </b>
                  </button>
                  <button className="gp-pull ten">
                    <span>10回引く</span>
                    <b>
                      <Icon name="gem" /> {b.ten.toLocaleString()}
                    </b>
                  </button>
                </div>
                <div className="gp-have">
                  所持 <Icon name="gem" /> <b>{gems.toLocaleString()}</b>
                </div>
              </div>

              <button className="gp-info" aria-label="提供割合">
                i
              </button>
            </motion.section>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
