// ボスレイド: the running session's boss, how worn down it is, and a way in.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck } from '../engine/decks';
import { card } from '../engine/cards';
import { BOSS_RAGE_BONUS, RAID_DROP, raidCardOf } from '../engine/cards/bosses';
import type { MonsterCard } from '../engine/types';
import { currentBoss, fmtDay, lastDay, nextRaidSession, raidEndsIn, raidSession, RAID_TRY_GEMS, raidCost, raidLapBonus, raidLapHp, raidLapReward, raidNow } from '../state/raid';
import { CardFace } from '../ui/Card';
import { fmtRemain } from '../state/progress';
import { artUrl } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { EnergySymbol } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { askConfirm } from '../ui/Confirm';
import { foley, playMusic, sfx } from '../audio/audio';
import { TYPE_JP } from '../engine/cards';

/** the accent of each boss's page (glow, title, button) */
const TINT: Record<string, string> = { fire: '255, 110, 60', water: '80, 175, 255', dark: '170, 110, 255', grass: '120, 220, 90', lightning: '255, 215, 60', psychic: '210, 120, 255', fighting: '230, 140, 70', colorless: '230, 225, 210' };

type Sheet = 'help' | 'rewards' | null;

export function Raid() {
  const save = useStore((s) => s.save);
  const go = useStore((s) => s.go);
  const startRaid = useStore((s) => s.startRaid);
  useEffect(() => playMusic('boss'), []);
  const [sheet, setSheet] = useState<Sheet>(null);
  const r = raidNow(save.raid);
  const boss = (card(r.bossId) as MonsterCard) ?? currentBoss();
  const rc = raidCardOf(boss.id);
  const ownCard = (save.collection[rc.id] ?? 0) > 0;
  const cost = raidCost(r);
  const deck = activeDeck(save);
  const errs = deck ? validateDeck(deck.cards) : ['デッキがありません'];
  const deckOk = !!deck && errs.length === 0;
  const lap = r.laps + 1;
  const lapHp = raidLapHp(lap);
  const left = lapHp - r.damage;

  const session = raidSession();
  const upcoming = nextRaidSession();
  const challenge = async () => {
    if (!session) return;
    if (!deck || !deckOk) return go('deck');
    if (cost > 0 && !(await askConfirm(`ジェムを${cost}個使って挑戦しますか？（この開催で${r.tries + 1}回目）`, '挑戦する'))) return;
    sfx('horn-1', 0.7);
    if (!startRaid(deck.cards)) {
      foley.tick();
      await askConfirm('ジェムが足りません', 'OK');
    }
  };
  const open = (k: Sheet) => {
    sfx('expand', 0.4);
    setSheet(k);
  };

  return (
    <div className="screen raid3" style={{ ['--bt' as string]: TINT[boss.type] ?? TINT.colorless }}>
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl(boss.scene ?? 'story/p-the-fall')})` }} />
      <div className="raid3-tint" />
      <motion.div className="raid3-boss" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
        <div className="raid3-aura" />
        <img src={artUrl(boss.art)} alt="" />
      </motion.div>
      <div className="page">
        <TopBar
          title="ボスレイド"
          back="arena"
          right={
            <button className="round-btn" title="ルール" onClick={() => open('help')}>
              ?
            </button>
          }
        />
        <div className="raid3-body">
          <motion.div className="raid3-logo" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
            <span className="raid3-kicker">
              <Icon name="crown" /> レイドバトル
            </span>
            <h1>{boss.name}</h1>
            <span className="raid3-period">
              <Icon name="hourglass" /> 終了まで あと {fmtRemain(raidEndsIn())}
            </span>
          </motion.div>

          <div className="raid3-side">
            <section className="raid3-panel">
              <h4>ボス情報</h4>
              <div className="raid3-info">
                <img src={artUrl(boss.art)} alt="" />
                <div>
                  <div className="raid3-hptext">
                    <b>HP</b> {left.toLocaleString()}
                    <small> / {lapHp.toLocaleString()}</small>
                  </div>
                  <div className="raid3-hpbar">
                    <div style={{ width: `${(100 * left) / lapHp}%` }} />
                  </div>
                  <div className="raid3-chips">
                    <span>
                      <EnergySymbol type={boss.type} size="1.1em" /> {TYPE_JP[boss.type]}
                    </span>
                    {boss.weakness && (
                      <span>
                        弱点 <EnergySymbol type={boss.weakness} size="1.1em" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="raid3-panel">
              <h4>主な報酬</h4>
              <div className="raid3-rewards">
                <div className={`raid3-rw card ${ownCard ? '' : 'locked'}`} title={`レイドカード「${rc.name}」`}>
                  <CardFace cid={rc.id} />
                </div>
                <div className="raid3-rw" title="ジェム">
                  <span className="raid3-gem">
                    <Icon name="gem" />
                  </span>
                  <small>{raidLapReward(lap)}</small>
                </div>
              </div>
            </section>
          </div>

          <div className="raid3-actions">
            <motion.button className="raid3-go" onClick={challenge} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45 }}>
              <Icon name="swords" />
              <span>{deckOk ? '挑戦する' : 'デッキを組む'}</span>
              {deckOk && <small>{cost ? <><Icon name="gem" /> {cost}</> : '1回目 無料'}</small>}
            </motion.button>
            <div className="raid3-subs">
              <button className="raid3-sub" onClick={() => go('deck')}>
                <Icon name="deck" />
                <span>
                  使用デッキ
                  <small>{deck?.name ?? 'なし'}</small>
                </span>
              </button>
              <button className="raid3-sub" onClick={() => open('rewards')}>
                <Icon name="chest" />
                <span>報酬一覧</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {!session && (
        <div className="raid3-closed">
          <b>現在、レイドは開催していません</b>
          <span>{upcoming ? `次回 ${fmtDay(upcoming.start)}〜${lastDay(upcoming)}` : '次回の開催をお待ちください'}</span>
        </div>
      )}
      <AnimatePresence>
        {sheet && (
          <motion.div className="login-modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)}>
            <motion.div className="panel raid3-sheet" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn close" title="閉じる" onClick={() => setSheet(null)}>
                <Icon name="close" />
              </button>
              {sheet === 'help' ? (
                <>
                  <h2>ルール</h2>
                  <div className="raid2-cond win">
                    <b>討伐</b>
                    <p>
                      ボスのHPを0にすると討伐
                      <br />
                      ボスは強くなって復活する
                    </p>
                  </div>
                  <div className="raid2-cond keep">
                    <b>持ち越し</b>
                    <p>
                      バトルに負けても、与えたダメージはそのまま残る
                      <br />
                      （週が変わるとリセット）
                    </p>
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
                  <h3>ボスのワザ</h3>
                  {boss.attacks.map((a, i) => (
                    <div className="raid2-move" key={i}>
                                            <div>
                        <b>{a.name}</b>
                        {a.text && <p>{a.text}</p>}
                      </div>
                      <span className="raid2-dmg">{a.damage ?? '―'}</span>
                    </div>
                  ))}
                  <div className="raid2-rage">HPが半分以下になると激昂し、すべてのワザのダメージが +{BOSS_RAGE_BONUS}</div>
                  <div className="raid2-rage">復活したボスはHP {raidLapHp(2).toLocaleString()}、すべてのワザのダメージが +{raidLapBonus(2)}</div>
                  <ul className="raid3-notes">
                    <li>ボスは1体だけ。エネルギーなしでワザを使い、特殊状態にならない</li>
                    <li>レイドは不定期に開催。開催中は何度でも挑戦でき、1回目は無料、2回目からはジェム{RAID_TRY_GEMS}個</li>
                  </ul>
                </>
              ) : (
                <>
                  <h2>報酬一覧</h2>
                  <h3>討伐報酬</h3>
                  <p className="raid3-note">
                    ボスを倒すたびに <Icon name="gem" /> {raidLapReward(1)}（2回目は {raidLapReward(2)}、3回目からは {raidLapReward(3)}）。倒したボスは強くなって復活する。
                  </p>
                  <h3>参加報酬</h3>
                  <p className="raid3-note">毎回のバトルで、与えたダメージ40ごとにジェム1個（最大50個）。</p>
                  <h3>レイドカード</h3>
                  <div className="raid-drop-row">
                    <div className={`raid-drop-card ${ownCard ? '' : 'locked'}`}>
                      <CardFace cid={rc.id} />
                    </div>
                    <div>
                      <b>「{rc.name}」</b>
                      <p>ボスを倒すたび、ごくまれに（{(RAID_DROP * 100).toFixed(0)}%）手に入る。パックからは出ない特別なカードで、デッキに1枚まで入れられる。</p>
                      <small>{ownCard ? `所持 ${save.collection[rc.id]}枚` : '未所持'}</small>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
