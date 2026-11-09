import { CardFace } from '../ui/Card';
import { card } from '../engine/cards';
import type { MonsterCard } from '../engine/types';
import type { StageResult, RaidResult } from '../state/store';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, episodeLabel, episodeNo } from '../story';
import { claimableCount, CPU_FIRST_GEMS, storyFirstClear, expToNext, levelGems, levelReward, bump } from '../state/progress';
import { extCtx, grantRecipe, useStore, type BattleRewardResult } from '../state/store';
import { useBattle } from './controller';
import { artUrl, asset } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from './particles';
import { useFx } from './fx';
import { RARITY_SYMBOL } from '../engine/cards';
import { online, useOnline } from '../online/client';
import { RankChange, RankEmblem } from '../ui/Rank';
import { chapterById } from '../story';
import { finishChapter, retryChapter } from '../story/flow';
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
  const rankChange = useOnline((s) => s.rankChange);
  const [raidRes, setRaidRes] = useState<RaidResult | null>(null);
  const [stageRes, setStageRes] = useState<StageResult | null>(null);
  const [missionsReady, setMissionsReady] = useState(0);

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
    if (cfg.placement) {
      // ランクマッチの認定戦: the result decides the starting rank (no rewards)
      const stP = useBattle.getState().stats;
      online.submitPlacement({ win, prizes: stP.prizes, prizesLost: stP.prizesLost, turns: useBattle.getState().view?.turn ?? 30 });
      if (result.surrendered) useStore.getState().recordSurrender();
      return;
    }
    if (result.surrendered) {
      // giving up pays nothing, whatever the battle
      useStore.getState().recordSurrender();
      setRes({ lines: [{ label: '降参したため報酬はありません', coins: 0, gems: 0 }], total: 0, gems: 0, levelGems: 0, exp: 0, levelBefore: useStore.getState().save.progress.level, expBefore: useStore.getState().save.progress.exp, levelUps: [], levelCoins: 0 });
      return;
    }
    if (cfg.online) {
      // online: coins and progress are paid here
      if (draw0(result.winner)) return;
      const kind = cfg.online.kind;
      const st0 = useBattle.getState().stats;
      const before0 = claimableCount(useStore.getState().save.progress, extCtx(useStore.getState().save));
      const r0 = recordBattle(
        { win, level: 'normal', baseReward: kind !== 'friend' ? 60 : 0, prizesTaken: st0.prizes, prizesLost: st0.prizesLost, firstClear: false },
        { kos: st0.kos, damage: st0.damage, prizes: st0.prizes, evolves: st0.evolves, trainers: st0.trainers },
      );
      setRes(r0);
      if (win) update((s) => bump(s.progress, { onlineWins: 1 }));
      const after0 = claimableCount(useStore.getState().save.progress, extCtx(useStore.getState().save));
      setMissionsReady(Math.max(0, after0 - before0));
      return;
    }
    if (cfg.stage) {
      // a stage of the stage event: first clears pay gems, wins may drop shards
      const stS = useBattle.getState().stats;
      const base = recordBattle(
        { win, level: cfg.level, baseReward: 0, prizesTaken: stS.prizes, prizesLost: stS.prizesLost, firstClear: false },
        { kos: stS.kos, damage: stS.damage, prizes: stS.prizes, evolves: stS.evolves, trainers: stS.trainers },
      );
      const sr = useStore.getState().recordStage({ win, index: cfg.stage.index, key: cfg.stage.key });
      const lines = [...base.lines];
      if (sr.winGems) lines.push({ label: 'ステージ勝利', coins: 0, gems: sr.winGems });
      if (sr.gems) lines.push({ label: '初回クリア報酬', coins: 0, gems: sr.gems });
      setStageRes(sr);
      setRes({ ...base, lines, gems: base.gems + sr.gems + sr.winGems });
      return;
    }
    if (cfg.raid) {
      // a raid: the damage done stays on the boss; bringing it to 0 clears the lap
      const v = useBattle.getState().view;
      const bossSlot = v?.players[1].active;
      const hp = cfg.raid.hp;
      const dealt = Math.max(0, (win ? hp : Math.min(hp, bossSlot?.damage ?? 0)) - cfg.raid.startDamage);
      const stR = useBattle.getState().stats;
      const base = recordBattle(
        { win, level: 'hard', baseReward: 0, prizesTaken: 0, prizesLost: stR.prizesLost, firstClear: false },
        { kos: stR.kos, damage: stR.damage, prizes: stR.prizes, evolves: stR.evolves, trainers: stR.trainers },
      );
      const rr = useStore.getState().recordRaid({ win, dealt });
      const lines = win ? [{ label: '討伐報酬', coins: 0, gems: rr.lapGems }] : [];
      setRaidRes(rr);
      setRes({ ...base, lines, total: base.total, gems: base.gems + rr.gems + rr.lapGems });
      return;
    }
    const before = claimableCount(useStore.getState().save.progress, extCtx(useStore.getState().save));
    const st = useBattle.getState().stats;
    // a story episode's first clear is the episode's, even when its rival was met before
    const storyCh = cfg.story ? CHAPTERS.find((c) => c.id === cfg.story!.chapterId) : undefined;
    const storyFirst = !!storyCh && win && !useStore.getState().save.story.cleared.includes(storyCh.id);
    if (cfg.story && win) useStore.getState().clearChapter(cfg.story.chapterId);
    const sv = useStore.getState().save;
    const cpu = cfg.cpuLevel && !cfg.rival ? cfg.cpuLevel : 0;
    const firstClear = storyFirst || (win && ((!!cfg.rival && !sv.beaten.includes(cfg.rival.id)) || (!!cpu && !(sv.cpuBeaten ?? []).includes(cpu))));
    const storyPay = storyCh
      ? storyFirstClear(episodeNo(storyCh), episodeNo(storyCh) === CHAPTERS.filter((c) => c.part === storyCh.part).length, storyCh.part)
      : null;
    if (firstClear && cfg.rival) update((s) => void s.beaten.push(cfg.rival!.id));
    if (firstClear && cpu) update((s) => void (s.cpuBeaten = [...(s.cpuBeaten ?? []), cpu]));
    // a first win brings a デッキレシピ (a story rival's: their own deck)
    if (firstClear) update((s) => void grantRecipe(s, cfg.rival ? `pre:${cfg.rival.deck}` : undefined));
    const r = recordBattle(
      {
        win,
        level: cfg.level,
        baseReward: cfg.reward,
        prizesTaken: st.prizes,
        prizesLost: st.prizesLost,
        firstClear,
        ...(cpu ? { firstClearGems: CPU_FIRST_GEMS[cpu - 1], firstClearLabel: `CPUレベル${cpu} 初勝利` } : {}),
        ...(storyFirst && storyPay ? { firstClearCoins: storyPay.coins, firstClearGems: storyPay.gems, firstClearLabel: `${episodeLabel(storyCh!)} 初回クリア` } : {}),
      },
      { kos: st.kos, damage: st.damage, prizes: st.prizes, evolves: st.evolves, trainers: st.trainers },
    );
    setRes(r);
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
        {cfg.raid ? (win ? '討伐！' : 'RAID END') : draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'}
      </motion.div>
      <div className="result-reason">{result.reason}</div>
      {((cfg.online?.kind === 'ranked' && rankChange && !rankChange.placement) || (cfg.placement && rankChange?.placement)) && <RankChange before={rankChange!.before} after={rankChange!.after} placement={!!cfg.placement} />}
      {cfg.placement && !rankChange?.placement && <div className="result-reason">認定結果をサーバーに送っています…</div>}
      {raidRes && (
        <motion.div className="raid-result-bar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="rrb-head">
            <b>{cfg.oppName}</b>
            <span>{raidRes.win ? '討伐！ ボスは強くなって復活する' : `残りHP ${(raidRes.hp - raidRes.damage).toLocaleString()} / ${raidRes.hp.toLocaleString()}`}</span>
          </div>
          <div className="rrb-track">
            <motion.div className="rrb-fill" initial={{ width: `${(100 * (raidRes.hp - raidRes.damage + raidRes.dealt)) / raidRes.hp}%` }} animate={{ width: `${(100 * (raidRes.hp - raidRes.damage)) / raidRes.hp}%` }} transition={{ delay: 0.9, duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </motion.div>
      )}
      {raidRes?.drop && <RaidDrop cid={raidRes.drop} />}
      {stageRes && stageRes.win && (
        <motion.div className="stage-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          {stageRes.first && <b>ステージクリア！ 次のステージが開きました</b>}
          <span>
            <img src={asset('ui/shard.svg')} alt="" /> イベントのかけら {stageRes.shards > 0 ? `+${stageRes.shards}` : 'ドロップなし'}
          </span>
        </motion.div>
      )}
      {stageRes?.drop && <RaidDrop cid={stageRes.drop} />}
      <div className="result-row">
      {<motion.div className="result-rival" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>
        <img src={artUrl(cfg.oppPortrait)} alt="" />
        <div className="bubble">
          <b>
            {cfg.online?.opp.rank && <RankEmblem v={cfg.online.opp.rank} size={22} />}
            {cfg.oppName}
          </b>
          <p>{cfg.raid ? (win ? '……グ、オォ……' : '……まだ倒れぬ') : cfg.online ? 'ありがとうございました！' : cfg.rival ? (win ? cfg.rival.lose : cfg.rival.win) : win ? '参りました！' : '私の勝ちですね。'}</p>
        </div>
      </motion.div>}

      {res && (
        <div className="reward-panel panel">
          {res.lines.length === 0 && <div className="reward-none">{win ? '今回は報酬なし' : '負けたため報酬はありません'}</div>}
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
              {(l.gems ?? 0) + l.coins > 0 && (
                <b>
                  {(l.gems ?? 0) > 0 && (
                    <span className="rl-gem">
                      <Icon name="gem" /> +{(l.gems ?? 0).toLocaleString()}
                    </span>
                  )}
                  {l.coins > 0 && (
                    <span className="rl-coin">
                      <Icon name="coin" /> +{l.coins.toLocaleString()}
                    </span>
                  )}
                </b>
              )}
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
              <span className="rl-gem">
                <Icon name="gem" /> {res.gems.toLocaleString()}
              </span>
              {res.total > 0 && (
                <span className="rl-coin">
                  <Icon name="coin" /> {res.total.toLocaleString()}
                </span>
              )}
            </b>
          </motion.div>
          <ExpBar res={res} delay={lineDelay + nLines * 0.18 + 0.5} />
        </div>
      )}
      {!res && cfg.spectate && <div className="result-reason">CPU同士の対戦では報酬はありません</div>}
      </div>

      <motion.div className="result-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lineDelay + nLines * 0.18 + 1.2 }}>
        <button
          className={`btn big ${cfg.story && win ? 'red' : 'ghost'}`}
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            if (cfg.story) {
              const ch = chapterById(cfg.story.chapterId)!;
              if (win) finishChapter(ch);
              else retryChapter(ch);
            } else if (cfg.online || cfg.placement) {
              online.clearMatch();
              go('lobby');
            } else if (cfg.raid) go('raid');
            else if (cfg.stage && win) go('stage');
            else startBattle({ ...cfg });
          }}
        >
          {cfg.story ? (win ? '物語をつづける' : 'もう一度挑む') : cfg.online || cfg.placement ? 'ロビーへ' : cfg.raid ? 'レイドへ' : cfg.stage && win ? 'イベントマップへ' : 'もう一度'}
        </button>
        {missionsReady > 0 && !(cfg.story && win) && (
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
        {/* a won story duel always goes on to the scene after it (that is where the card is handed over) */}
        {!(cfg.story && win) && !(cfg.stage && win) && (
        <button
          className="btn big"
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            if (cfg.online) online.clearMatch();
            go(cfg.story ? 'story' : cfg.online || cfg.placement ? 'arena' : cfg.raid ? 'arena' : cfg.stage ? 'stage' : cfg.rival ? 'rivals' : 'home');
          }}
        >
          {cfg.story ? 'ストーリーへ' : cfg.online || cfg.placement ? 'バトルメニューへ' : cfg.stage ? 'イベントマップへ' : cfg.rival ? '対戦相手を選ぶ' : 'ホームへ'}
        </button>
        )}
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
            レベルアップ！ Lv.{up} ・ ボーナス +{levelReward(up) + levelGems(up)} ジェム
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** the raid card dropped: a moment of its own */
function RaidDrop({ cid }: { cid: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    sfx('magic-holy-2', 0.9);
    const t = setTimeout(() => sfx('fanfare-short', 0.9), 700);
    return () => clearTimeout(t);
  }, []);
  if (!open) return null;
  return (
    <motion.div className="raid-drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setOpen(false)}>
      <motion.div className="rd-title gold-title" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
        RAID CARD 獲得！
      </motion.div>
      <motion.div className="rd-card" initial={{ rotateY: 540, scale: 0.4, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }} transition={{ duration: 1.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <CardFace cid={cid} />
      </motion.div>
      <small>タップで閉じる ・ コレクションの「レイド」に記録されました</small>
    </motion.div>
  );
}
