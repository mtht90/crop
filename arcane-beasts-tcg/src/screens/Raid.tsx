// ボスレイド: this week's boss, how worn down it is, and a way in.
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck } from '../engine/decks';
import { card } from '../engine/cards';
import { RAID_MULT } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';
import { currentBoss, raidCost, raidNow, RAID_MILESTONES } from '../state/raid';
import { fmtRemain, msUntilNextWeek } from '../state/progress';
import { artUrl } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { EnergySymbol } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { askConfirm } from '../ui/Confirm';
import { foley, playMusic, sfx } from '../audio/audio';
import { TYPE_JP } from '../engine/cards';

export function Raid() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const startRaid = useStore((s) => s.startRaid);
  useEffect(() => playMusic('boss'), []);
  const r = raidNow(save.raid);
  const boss = (card(r.bossId) as MonsterCard) ?? currentBoss();
  const left = Math.max(0, boss.hp - r.damage);
  const pct = (100 * r.damage) / boss.hp;
  const defeated = left <= 0;
  const cost = raidCost(r);
  const deck = activeDeck(save);
  const deckOk = !!deck && validateDeck(deck.cards).length === 0;

  const challenge = async () => {
    if (!deck || !deckOk) return go('deck');
    if (cost > 0 && !(await askConfirm(`ジェムを${cost}個使って挑戦しますか？（今週${r.tries + 1}回目）`, '挑戦する'))) return;
    sfx('horn-1', 0.7);
    if (!startRaid(deck.cards)) {
      foley.tick();
      await askConfirm('ジェムが足りません', 'OK');
    }
  };

  return (
    <div className="screen raid">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl(boss.scene ?? 'story/p-the-fall')})` }} />
      <div className="page-shade raid-shade" />
      <div className="page">
        <TopBar title="ボスレイド" back="arena" />
        <div className="page-inner raid-page">
          <motion.div className="raid-hero" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <img className="raid-boss-img" src={artUrl(boss.art)} alt="" />
            <div className="raid-hero-text">
              <small>今週のレイドボス ・ 残り {fmtRemain(msUntilNextWeek())}</small>
              <h1 className="gold-title">{boss.name}</h1>
              <p>{boss.flavor}</p>
              <div className="raid-tags">
                <span>
                  <EnergySymbol type={boss.type} size="1.1em" /> {TYPE_JP[boss.type]}
                </span>
                {boss.weakness && (
                  <span>
                    弱点 <EnergySymbol type={boss.weakness} size="1.1em" /> ×2
                  </span>
                )}
                <span>特殊状態にならない</span>
              </div>
            </div>
          </motion.div>

          <div className="box raid-hp">
            <div className="raid-hp-head">
              <b>HP {left.toLocaleString()}</b>
              <span>/ {boss.hp.toLocaleString()}</span>
              {defeated && <i className="raid-done">討伐済み</i>}
            </div>
            <div className="raid-hp-track">
              <div className="raid-hp-fill" style={{ width: `${100 - pct}%` }} />
              {RAID_MILESTONES.slice(0, 3).map((m) => (
                <i key={m.pct} className={`raid-mark ${r.paid.includes(m.pct) ? 'on' : ''}`} style={{ left: `${100 - m.pct}%` }} />
              ))}
            </div>
            <div className="raid-stats">
              <span>今週の挑戦 {r.tries}回</span>
              <span>1回の最高 {r.best.toLocaleString()}</span>
            </div>
          </div>

          <div className="box raid-rules">
            <h3>ルール</h3>
            <ul>
              <li>相手はボス1体だけ。ボスは毎ターン、ワザを順番に使う（次のワザは画面に表示）</li>
              <li>あなたのサイドは1枚。ボスをきぜつさせれば討伐</li>
              <li>ボスへのダメージは <b>×{RAID_MULT}</b>。与えたダメージは今週ずっと残る</li>
              <li>HPが半分を切ると、ボスのワザが強くなる</li>
              <li>毎週1回目は無料、2回目からはジェム10個</li>
            </ul>
          </div>

          <div className="box raid-rewards">
            <h3>報酬</h3>
            {RAID_MILESTONES.map((m) => (
              <div key={m.pct} className={`raid-rw ${r.paid.includes(m.pct) ? 'got' : ''}`}>
                <span>{m.pct === 100 ? '討伐' : `HP ${m.pct}% 削る`}</span>
                <b>
                  <Icon name="gem" /> {m.gems} <Icon name="coin" /> {m.coins.toLocaleString()}
                </b>
                {r.paid.includes(m.pct) && <small>受取済み</small>}
              </div>
            ))}
            <div className="raid-rw">
              <span>毎回</span>
              <b>与えたダメージに応じてコイン</b>
            </div>
          </div>

          <div className="raid-go">
            <small>使用デッキ：{deck ? deck.name : 'なし'}</small>
            <button className="btn big red raid-btn" disabled={defeated} onClick={challenge}>
              {defeated ? '今週は討伐済み' : !deckOk ? 'デッキを組む' : cost ? (
                <>
                  挑戦する <span className="raid-cost"><Icon name="gem" /> {cost}</span>
                </>
              ) : (
                '挑戦する（無料）'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
