import { Game } from '../src/core/game';
import { defaultState } from '../src/core/state';

/** 時刻と乱数を固定したゲームを作る */
export function makeGame(start = 1_000_000): { g: Game; advance: (sec: number) => void; setTime: (ms: number) => void } {
  let t = start;
  const g = new Game(defaultState(t), () => t, () => 0.5);
  return {
    g,
    advance: (sec: number) => {
      t += sec * 1000;
    },
    setTime: (ms: number) => {
      t = ms;
    },
  };
}
