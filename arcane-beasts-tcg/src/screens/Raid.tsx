// ボスレイド: this week's boss, how worn down it is, and a way in.
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck } from '../engine/decks';
import { card } from '../engine/cards';
import { BOSS_RAGE_BONUS, RAID_DROP, raidCardOf } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';
import { currentBoss, RAID_TRY_GEMS, raidCost, raidNow, raidWinReward } from '../state/raid';
import { CardFace } from '../ui/Card';
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
  const rc = raidCardOf(boss.id);
  const ownCard = (save.collection[rc.id] ?? 0) > 0;
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

  const wins = r.wins;
  const ladder = [1, 2, 3, 4, 5].map((k) => Math.max(1, wins - 1) + k - 1).map((n) => ({ n, gems: raidWinReward(n).gems }));
  const errs = deck ? validateDeck(deck.cards) : [];

  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl(boss.scene ?? 'story/p-the-fall')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="ボスレイド" back="arena" />
        <div className="page-inner rv3 raid2">
          <button className="box arena3-deck" onClick={() => go('deck')}>
            {deck && <CardFace cid={deck.cover} />}
            <span className="arena3-deck-text">
              <small>使用デッキ</small>
              <b>{deck?.name ?? 'デッキがありません'}</b>
              {errs.length > 0 && <span className="warn">{errs[0]}</span>}
            </span>
            <span className="chip-btn">変更</span>
          </button>

          <h3 className="section-title">
            今週のボス <span className="raid2-remain">あと {fmtRemain(msUntilNextWeek())}</span>
          </h3>
          <motion.div className="box cpu3-detail raid2-boss" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <img className="raid2-por" src={artUrl(boss.art)} alt="" />
            <div className="cpu3-info">
              <small>
                HP {boss.hp.toLocaleString()} ・ <EnergySymbol type={boss.type} size="1.05em" /> {TYPE_JP[boss.type]}
                {boss.weakness && (
                  <>
                    {' '}・ 弱点 <EnergySymbol type={boss.weakness} size="1.05em" /> ×2
                  </>
                )}
              </small>
              <h2>{boss.name}</h2>
              <p>{boss.flavor}</p>
              <div className="rv3-meta">
                <span>
                  今週 <b>{r.wins}</b>勝 ／ {r.tries}回挑戦
                </span>
                {r.fastest ? (
                  <span>
                    最速 <b>{r.fastest}</b>ターン
                  </span>
                ) : r.best ? (
                  <span>
                    最高ダメージ <b>{r.best.toLocaleString()}</b>
                  </span>
                ) : null}
              </div>
            </div>
          </motion.div>

          <h3 className="section-title">ボスのワザ（毎ターン、上から順に使う）</h3>
          <div className="box raid2-moves">
            {boss.attacks.map((a, i) => (
              <div className="raid2-move" key={i}>
                <i>{i + 1}</i>
                <div>
                  <b>{a.name}</b>
                  {a.text && <p>{a.text}</p>}
                </div>
                <span className="raid2-dmg">{a.damage ?? '―'}</span>
              </div>
            ))}
            <div className="raid2-rage">HPが半分以下になると激昂し、すべてのワザのダメージが +{BOSS_RAGE_BONUS}</div>
          </div>

          <h3 className="section-title">ルール</h3>
          <div className="box raid2-rules">
            <div className="raid2-cond win">
              <b>勝ち</b>
              <p>1回のバトルで、ボスのHPを0にする</p>
            </div>
            <div className="raid2-cond lose">
              <b>負け</b>
              <p>
                あなたのモンスターが6匹きぜつする
                <br />
                場にモンスターがいなくなる
                <br />
                山札が引けなくなる
              </p>
            </div>
            <ul>
              <li>ボスは1体だけで、ベンチ・手札・山札はない。エネルギーなしでワザを使う</li>
              <li>ボスはどく・マヒなどの特殊状態にならない</li>
              <li>あなたは普段どおり先攻・後攻を決め、自分のデッキで戦う</li>
              <li>挑戦は週1回目が無料、2回目からはジェム{RAID_TRY_GEMS}個。何度でも挑戦できる</li>
            </ul>
          </div>

          <h3 className="section-title">報酬</h3>
          <div className="box raid2-rewards">
            <div className="raid2-ladder">
              {ladder.map((l) => (
                <div key={l.n} className={`raid2-step ${l.n <= wins ? 'got' : l.n === wins + 1 ? 'next' : ''}`}>
                  <small>{l.n}勝目</small>
                  <b>
                    <Icon name="gem" /> {l.gems}
                  </b>
                </div>
              ))}
            </div>
            <p className="set-note">今週の勝利数が増えるほど報酬が上がる（1勝ごとに+10、最大150）。負けても、与えたダメージ100ごとにジェム1個（最大{RAID_TRY_GEMS}個）。</p>
            <div className="raid-drop-row">
              <div className={`raid-drop-card ${ownCard ? '' : 'locked'}`}>
                <CardFace cid={rc.id} />
              </div>
              <div>
                <b>レイドカード「{rc.name}」</b>
                <p>勝利するたび、ごくまれに（{(RAID_DROP * 100).toFixed(1)}%）手に入る。パックからは出ない特別なカードで、デッキに1枚まで入れられる。</p>
                <small>{ownCard ? `所持 ${save.collection[rc.id]}枚` : '未所持'}</small>
              </div>
            </div>
          </div>

          <div className="raid2-go">
            <button className="btn blue raid-btn" onClick={challenge}>
              {!deckOk ? (
                'デッキを組む'
              ) : (
                <>
                  <Icon name="swords" /> 挑戦する
                  <span className="raid-cost">{cost ? <><Icon name="gem" /> {cost}</> : '無料'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
