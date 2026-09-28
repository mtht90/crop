import { fmt } from '../../core/format';
import type { Game } from '../../core/game';
import { CHALLENGES, CHALLENGE_TIERS } from '../../data/challenges';
import { challengeGoal, challengesUnlocked, completions, enterChallenge, exitChallenge } from '../../logic/challenges';
import { h, setClass, setDisabled, setText, setWidth } from '../dom';
import { modal } from '../fx';
import type { Tab } from './tab';

let cards: Array<{ id: string; comp: HTMLElement; goal: HTMLElement; reward: HTMLElement; btn: HTMLButtonElement; el: HTMLElement; bar: HTMLElement }> = [];

export const challengesTab: Tab = {
  id: 'challenges',
  label: 'チャレンジ',
  icon: '🏆',
  visible: (g) => challengesUnlocked(g),
  mount(root, g) {
    cards = [];
    root.append(h('p', { class: 'hint', text: `チャレンジに挑むと現在の周回がリセットされ、制約付きで目標の星屑を目指します。達成すると永続的な報酬を得て、通常の超新星として周回を終えます。各チャレンジは ${CHALLENGE_TIERS} 段階まで挑戦でき、段階が上がるほど目標は高くなります。` }));
    const grid = h('div', { class: 'ch-grid' });
    for (const c of CHALLENGES) {
      const comp = h('span', { class: 'ch-comp' });
      const goal = h('div', { class: 'small' });
      const reward = h('div', { class: 'small good' });
      const bar = h('div', { class: 'bar-fill' });
      const btn = h('button', { class: 'btn' });
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        if (g.s.challenges.active === c.id) {
          const ok = await modal({ title: 'チャレンジを中断', body: '中断すると現在の周回はリセットされ、報酬は得られません。', ok: '中断する', danger: true });
          if (ok) exitChallenge(g);
          return;
        }
        const ok = await modal({ title: `${c.icon} ${c.name}`, body: `制約: ${c.rule}\n現在の周回をリセットしてチャレンジを開始します。`, ok: '挑戦する' });
        if (ok) enterChallenge(g, c.id);
      });
      const el = h('div', { class: 'ch-card' },
        h('div', { class: 'ch-head' }, h('span', { class: 'ch-icon', text: c.icon }), h('span', { class: 'ch-name', text: c.name }), comp),
        h('div', { class: 'ch-rule', text: `制約: ${c.rule}` }),
        h('div', { class: 'small', text: `報酬: ${c.rewardDesc}` }),
        reward,
        goal,
        h('div', { class: 'bar' }, bar),
        btn,
      );
      cards.push({ id: c.id, comp, goal, reward, btn, el, bar });
      grid.append(el);
    }
    root.append(grid);
  },
  update(g: Game) {
    const active = g.s.challenges.active;
    for (const card of cards) {
      const c = CHALLENGES.find((x) => x.id === card.id)!;
      const n = completions(g, c.id);
      const done = n >= CHALLENGE_TIERS;
      setText(card.comp, `${n}/${CHALLENGE_TIERS}`);
      setText(card.reward, `現在の報酬: ${n > 0 ? c.rewardEffect(n * g.mods.challengeReward) : 'なし'}`);
      const goal = challengeGoal(g, c);
      setText(card.goal, done ? '全段階クリア!' : `目標: この周回で星屑 ${fmt(goal)} を獲得`);
      const isActive = active === c.id;
      setWidth(card.bar, isActive ? g.s.run.earned.max(1).log10() / goal.log10() : 0);
      setText(card.btn, isActive ? '中断する' : done ? '制覇済み' : '挑戦する');
      setDisabled(card.btn, done && !isActive);
      setClass(card.el, 'active', isActive);
      setClass(card.el, 'done', done);
    }
  },
};
