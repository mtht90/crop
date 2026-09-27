import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useBattle } from './controller';
import { artUrl } from '../lib/assets';
import { Icon } from '../ui/Icon';
import { foley, playMusic, sfx } from '../audio/audio';
import { particles } from './particles';

export function ResultOverlay() {
  const result = useBattle((s) => s.result);
  const cfg = useStore((s) => s.battle);
  const update = useStore((s) => s.update);
  const go = useStore((s) => s.go);
  const startBattle = useStore((s) => s.startBattle);
  const applied = useRef(false);
  const [reward, setReward] = useState(0);
  const [firstClear, setFirstClear] = useState(false);

  useEffect(() => {
    if (!result || !cfg || applied.current) return;
    applied.current = true;
    const win = result.winner === 0;
    let coins = win ? cfg.reward : Math.round(cfg.reward * 0.2);
    let first = false;
    if (cfg.spectate) coins = 0;
    else update((s) => {
      if (win) {
        s.wins++;
        if (cfg.rival && !s.beaten.includes(cfg.rival.id)) {
          s.beaten.push(cfg.rival.id);
          coins += 200;
          first = true;
        }
      } else s.losses++;
      s.coins += coins;
    });
    setReward(coins);
    setFirstClear(first);
    playMusic(win ? 'victory' : 'defeat', false);
    if (win) {
      sfx('fanfare-short', 0.8);
      const iv = setInterval(() => particles.shower('rainbow', 12), 120);
      setTimeout(() => clearInterval(iv), 2400);
    }
  }, [result, cfg, update]);

  if (!result || !cfg) return null;
  const win = result.winner === 0;
  const draw = result.winner === -1;
  return (
    <motion.div className={`result ${win ? 'win' : 'lose'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <motion.div className="result-title" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}>
        {draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'}
      </motion.div>
      <div className="result-reason">{result.reason}</div>
      <motion.div className="result-rival" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>
        <img src={artUrl(cfg.oppPortrait)} alt="" />
        <div className="bubble">
          <b>{cfg.oppName}</b>
          <p>{cfg.rival ? (win ? cfg.rival.lose : cfg.rival.win) : win ? '参りました！' : '私の勝ちですね。'}</p>
        </div>
      </motion.div>
      <motion.div className="result-reward" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.1 }} onAnimationComplete={() => foley.chime(7)}>
        <Icon name="coin" size="1.4em" /> +{reward} コイン
        {firstClear && <span className="first-clear">初勝利ボーナス込み！</span>}
      </motion.div>
      <motion.div className="result-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
        <button
          className="btn ghost big"
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            startBattle({ ...cfg });
          }}
        >
          もう一度
        </button>
        <button
          className="btn big"
          onClick={() => {
            sfx('button');
            useBattle.setState({ result: null, view: null, prompt: null });
            go(cfg.rival ? 'rivals' : 'home');
          }}
        >
          {cfg.rival ? '対戦相手を選ぶ' : 'ホームへ'}
        </button>
      </motion.div>
    </motion.div>
  );
}
