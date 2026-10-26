import { currentRequest, deliver, matchingFish, requestLabel } from '../core/requests';
import type { SaveData } from '../core/save';
import type { NpcDef } from '../data/npcs';
import { h, yen } from './dom';
import type { Modals } from './modal';

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** 釣り場の人と話す：今日の依頼を聞き、揃っていればクーラーの魚を渡す */
export function openNpc(modals: Modals, save: SaveData, npc: NpcDef, day: number, cb: { onDeliver(reward: number): void }): void {
  const m = modals.open(npc.name, { small: true, closeKey: 'KeyE' });
  const render = (justDelivered: number | null) => {
    const st = currentRequest(save, npc, day);
    const label = requestLabel(st.req);
    const have = matchingFish(save, st.req).length;
    const seed = day * 7 + st.total;
    const say = (t: string) => t.replace('{fish}', `「${label}」`);
    const line = justDelivered !== null ? pick(npc.lines.thanks, seed) : st.done ? pick(npc.lines.done, seed) : have >= st.req.count ? say(pick(npc.lines.ask, seed)) : st.total === 0 && have === 0 ? say(pick(npc.lines.ask, seed)) : say(pick(npc.lines.waiting, seed));
    m.body.replaceChildren(
      h('div', { class: 'muted small', text: npc.title }),
      h('p', { class: 'npc-line', text: line }),
      st.done
        ? justDelivered !== null
          ? h('div', { class: 'npc-req done' }, h('b', { text: '依頼達成' }), h('span', { class: 'price', text: `+${yen(justDelivered)}` }))
          : ''
        : h(
            'div',
            { class: 'npc-req' },
            h('div', { class: 'muted small', text: '今日の依頼' }),
            h('b', { text: label }),
            h('div', { class: 'small', text: `クーラーの該当 ${Math.min(have, st.req.count)} / ${st.req.count}` }),
            h('div', null, '報酬 ', h('span', { class: 'price', text: yen(st.req.reward) })),
          ),
    );
    m.footer.replaceChildren(
      h('button', { class: 'ghost', text: '閉じる', onclick: () => m.close() }),
      !st.done
        ? h('button', {
            class: 'primary',
            text: have >= st.req.count ? '魚を渡す' : 'まだ揃っていない',
            disabled: have < st.req.count,
            onclick: () => {
              const r = deliver(save, npc, day);
              if (r !== null) {
                cb.onDeliver(r);
                render(r);
              }
            },
          })
        : '',
    );
  };
  render(null);
}
