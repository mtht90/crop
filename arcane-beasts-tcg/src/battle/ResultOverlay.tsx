import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { claimableCount, expToNext, levelReward } from '../state/progress';
import { extCtx, useStore, type BattleRewardResult } from '../state/store';
import { useBattle } from './controller';
import { artUrl } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from './particles';
import { useFx } from './fx';
import { PROMOTE_AT, MEIJIN, RANKS, type RankChange } from '../state/ranked';
import { RankEmblem } from '../ui/RankEmblem';
import { RARITY_SYMBOL } from '../engine/cards';
import type { Rarity } from '../engine/types';

const draw0 = (w: number) => w === -1;

export function ResultOverlay() {
  const result = useBattle((s) => s.result);
  const cfg = useStore((s) => s.battle);
  const recordBattle = useStore((s) => s.recordBattle);
  const update = useStore((s) => s.update);
  const go = useStore((s) => s.go);
  const startBattle = useStore((s) => s.startBattle);
  const applied = useRef(false);
  const [res, setRes] = useState<BattleRewardResult | null>(null);
  const [missionsReady, setMissionsReady] = useState(0);
  const [rank, setRank] = useState<RankChange | null>(null);

  useEffect(() => {
    if (!result || !cfg || applied.current) return;
    applied.current = true;
    useFx.setState({ banner: null, attack: null, coin: null, toast: null });
    const win = result.winner === 0;
    playMusic(win ? 'victory' : 'defeat', false);
    if (win) {
      sfx('fanfare-short', 0.8);
      const iv = setInterval(() => particles.shower('glint', 8), 140);
      setTimeout(() => clearInterval(iv), 2200);
    }
    if (cfg.spectate) return;
    const before = claimableCount(useStore.getState().save.progress, extCtx(useStore.getState().save));
    const st = useBattle.getState().stats;
    const firstClear = win && !!cfg.rival && !useStore.getState().save.beaten.includes(cfg.rival.id);
    if (firstClear) update((s) => void s.beaten.push(cfg.rival!.id));
    const r = recordBattle(
      { win, level: cfg.level, baseReward: cfg.reward, prizesTaken: st.prizes, prizesLost: st.prizesLost, firstClear },
      { kos: st.kos, damage: st.damage, prizes: st.prizes, evolves: st.evolves, trainers: st.trainers },
    );
    setRes(r);
    if (cfg.ranked && !draw0(result.winner)) setRank(useStore.getState().recordRanked(win));
    const after = claimableCount(useStore.getState().save.progress, extCtx(useStore.getState().save));
    setMissionsReady(Math.max(0, after - before));
  }, [result, cfg, update, recordBattle]);

  if (!result || !cfg) return null;
  const win = result.winner === 0;
  const draw = result.winner === -1;
  const lineDelay = 1.0;
  const nLines = res?.lines.length ?? 0;
  return (
    <motion.div className={`result ${win ? 'win' : 'lose'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <motion.div className="result-title" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}>
        {draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'}
      </motion.div>
      <div className="result-reason">{result.reason}</div>
      <div className="result-row">
      <motion.div className="result-rival" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>
        <img src={artUrl(cfg.oppPortrait)} alt="" />
        <div className="bubble">
          <b>{cfg.oppName}</b>
          <p>{cfg.rival ? (win ? cfg.rival.lose : cfg.rival.win) : win ? '参りました！' : '私の勝ちですね。'}</p>
        </div>
      </motion.div>

      {res && (
        <div className="reward-panel panel">
          {res.lines.map((l, i) => (
            <motion.div
              key={l.label}
              className="reward-line"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: lineDelay + i * 0.18, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() => foley.tick()}
            >
              <span>{l.label}</span>
              <b>+{l.coins}</b>
            </motion.div>
          ))}
          <motion.div
            className="reward-total"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: lineDelay + nLines * 0.18 + 0.15, duration: 0.45 }}
            onAnimationComplete={() => foley.chime(7)}
          >
            <span>合計</span>
            <b>
              <Icon name="coin" /> {res.total.toLocaleString()}
            </b>
          </motion.div>
          <ExpBar res={res} delay={lineDelay + nLines * 0.18 + 0.5} />
        </div>
      )}
      {rank && <RankPanel rc={rank} delay={lineDelay + 0.4} />}
      {!res && cfg.spectate && <div className="result-reason">観戦モードでは報酬はありません</div>}
      </div>

      <motion.div className="result-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lineDelay + nLines * 0.18 + 1.2 }}>
        <button
          className="btn ghost big"
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            if (cfg.ranked) go('ranked');
            else startBattle({ ...cfg });
          }}
        >
          {cfg.ranked ? '次の対戦へ' : 'もう一度'}
        </button>
        {missionsReady > 0 && (
          <button
            className="btn blue big"
            onClick={() => {
              sfx('button');
              useBattle.setState({ result: null, view: null, prompt: null });
              go('missions');
            }}
          >
            ミッション達成 {missionsReady}
          </button>
        )}
        <button
          className="btn big"
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            go(cfg.ranked ? 'home' : cfg.rival ? 'rivals' : 'home');
          }}
        >
          {cfg.rival ? '対戦相手を選ぶ' : 'ホームへ'}
        </button>
      </motion.div>
    </motion.div>
  );
}

/** EXP bar that fills (and wraps on level up) after the coin lines. */
function ExpBar({ res, delay }: { res: BattleRewardResult; delay: number }) {
  const [lv, setLv] = useState(res.levelBefore);
  const [pct, setPct] = useState(res.expBefore / expToNext(res.levelBefore));
  const [up, setUp] = useState<number | null>(null);
  useEffect(() => {
    let exp = res.expBefore + res.exp;
    let level = res.levelBefore;
    const steps: { lv: number; pct: number; up?: number }[] = [];
    while (exp >= expToNext(level)) {
      exp -= expToNext(level);
      steps.push({ lv: level, pct: 1 });
      level++;
      steps.push({ lv: level, pct: 0, up: level });
    }
    steps.push({ lv: level, pct: exp / expToNext(level) });
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((st, i) =>
      timers.push(
        setTimeout(() => {
          setLv(st.lv);
          setPct(st.pct);
          if (st.up) {
            setUp(st.up);
            foley.rarity(4);
          }
        }, (delay + i * 0.7) * 1000),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [res, delay]);
  return (
    <motion.div className="exp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay - 0.2 }}>
      <div className="exp-head">
        <span className="lv">Lv.{lv}</span>
        <span className="gain">EXP +{res.exp}</span>
      </div>
      <div className="exp-bar">
        <motion.div className="exp-fill" animate={{ width: `${pct * 100}%` }} transition={{ duration: pct === 0 ? 0 : 0.6, ease: [0.65, 0, 0.35, 1] }} />
      </div>
      <AnimatePresence>
        {up && (
          <motion.div key={up} className="lvup" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            レベルアップ！ Lv.{up} ・ ボーナス +{levelReward(up)} コイン
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** ranked: points bar that moves, the crest that changes on promotion, and first-reach rewards */
function RankPanel({ rc, delay }: { rc: RankChange; delay: number }) {
  const [shown, setShown] = useState(rc.before);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const t1 = setTimeout(() => {
      if (rc.promoted.length) {
        setShown({ rank: rc.before.rank, pts: PROMOTE_AT });
        setTimeout(() => {
          setShown(rc.after);
          setFlash('up');
          foley.rarity(5);
          sfx('fanfare-short', 0.7);
        }, 700);
      } else if (rc.demoted) {
        setShown({ rank: rc.before.rank, pts: 0 });
        setTimeout(() => {
          setShown(rc.after);
          setFlash('down');
        }, 700);
      } else setShown(rc.after);
    }, delay * 1000);
    return () => clearTimeout(t1);
  }, [rc, delay]);
  const pct = shown.rank >= MEIJIN ? 1 : Math.max(0, Math.min(1, shown.pts / PROMOTE_AT));
  return (
    <motion.div className={`rank-panel panel ${flash ?? ''}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay - 0.3, duration: 0.5 }}>
      <div className="rp-head">ランクマッチ</div>
      <motion.div key={shown.rank} className="rp-crest" initial={{ scale: flash ? 1.4 : 1, opacity: flash ? 0 : 1 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <RankEmblem rank={shown.rank} size="calc(var(--u) * 8)" />
      </motion.div>
      <div className="rp-name">{RANKS[shown.rank]}</div>
      <div className="rp-bar">
        <motion.div className="rp-fill" animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }} />
      </div>
      <div className={`rp-delta ${rc.delta > 0 ? 'up' : rc.delta < 0 ? 'down' : ''}`}>{rc.delta > 0 ? `+${rc.delta}pt` : rc.delta < 0 ? `${rc.delta}pt` : '±0pt'}</div>
      {flash === 'up' && <div className="rp-banner">{rc.after.rank >= 10 ? '昇段' : '昇級'}！</div>}
      {flash === 'down' && <div className="rp-banner down">降段…</div>}
      {flash === 'up' &&
        rc.rewards.map(({ rank, reward }) => (
          <div key={rank} className="rp-reward">
            {RANKS[rank]}到達報酬：<Icon name="coin" /> {reward.coins}
            {Object.entries(reward.shards ?? {}).map(([k, n]) => ` ・ ${RARITY_SYMBOL[k as Rarity]}のかけら×${n}`)}
          </div>
        ))}
    </motion.div>
  );
}
