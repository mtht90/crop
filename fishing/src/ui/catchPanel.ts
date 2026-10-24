import type { CatchResult } from '../core/progress';
import { releaseValue } from '../core/progress';
import { RARITY_LABEL, type Species } from '../data/types';
import type { FishPreview } from '../render/preview';
import { IV_LABEL, IV_MAX, formatWeight, type FishInstance, type IVs } from '../sim/individual';
import { bar, h, yen } from './dom';
import type { Modals } from './modal';

/** 釣果画面。'keep' = クーラーへ / 'release' = リリース */
export function showCatch(
  modals: Modals,
  preview: FishPreview,
  s: Species,
  fish: FishInstance,
  res: CatchResult,
  coolerFull: boolean,
): Promise<'keep' | 'release'> {
  return new Promise((resolve) => {
    let decided: 'keep' | 'release' = coolerFull ? 'release' : 'keep';
    const m = modals.open(res.newSpecies ? '新種発見！' : '釣り上げた！', {
      onClose: () => {
        preview.unmount();
        removeEventListener('keydown', onKey);
        resolve(decided);
      },
    });
    const color = s.colors.find((c) => c.id === fish.colorId);
    const pattern = s.patterns.find((p) => p.id === fish.patternId);
    const pv = h('div', { class: 'preview' });
    const badges = h('div', { class: 'badges' });
    if (res.newSpecies) badges.append(h('span', { class: 'badge new', text: 'NEW 図鑑登録' }));
    if (color) badges.append(h('span', { class: 'badge', text: `★ 色違い：${color.name}` }));
    if (pattern) badges.append(h('span', { class: 'badge', text: `◆ 模様違い：${pattern.name}` }));
    if (res.newColor || res.newPattern) badges.append(h('span', { class: 'badge new', text: '初発見のバリエーション' }));
    if (res.bestLength) badges.append(h('span', { class: 'badge', text: '最大体長 更新' }));
    if (res.bestWeight) badges.append(h('span', { class: 'badge', text: '最大重量 更新' }));
    if (res.bestGrade) badges.append(h('span', { class: 'badge', text: '最高グレード 更新' }));
    for (const r of res.rewards) badges.append(h('span', { class: 'badge new', text: `${r.label} +${yen(r.money)}` }));

    const ivRows: HTMLElement[] = [];
    (Object.keys(IV_LABEL) as (keyof IVs)[]).forEach((k) => {
      const v = fish.iv[k];
      ivRows.push(h('span', { text: IV_LABEL[k] }), bar(v / IV_MAX, v >= 28 ? 'var(--gold)' : 'var(--accent)'), h('b', { text: String(v) }));
    });
    const sum = fish.iv.power + fish.iv.stamina + fish.iv.speed + fish.iv.build;

    m.body.append(
      h(
        'div',
        { class: 'catch' },
        h('div', null, pv, badges),
        h(
          'div',
          null,
          h('span', { class: `rarity ${s.rarity}`, text: RARITY_LABEL[s.rarity] }),
          h('h3', { style: 'margin:6px 0 0;font-size:26px', text: s.name }),
          h('div', { class: 'sci', text: s.sci }),
          h('div', { style: 'display:flex;gap:16px;align-items:center;margin:14px 0' }, h('div', { class: `grade ${fish.grade}`, text: fish.grade }), h('div', null, h('div', { class: 'big', text: `${fish.length.toFixed(1)} cm` }), h('div', { class: 'muted', text: formatWeight(fish.weight) }))),
          h('h4', { text: `個体値（合計 ${sum} / ${IV_MAX * 4}）` }),
          h('div', { class: 'ivs' }, ...ivRows),
          h('h4', { text: '査定' }),
          h('div', null, '売値 ', h('span', { class: 'price', text: yen(res.price) }), h('span', { class: 'muted small', text: `　リリース協力金 ${yen(releaseValue(fish))}` })),
          coolerFull ? h('div', { class: 'small', style: 'color:var(--bad);margin-top:8px', text: 'クーラーが満杯です。小屋で売るか、リリースしてください。' }) : null,
        ),
      ),
    );
    const keep = h('button', {
      class: 'primary',
      text: 'クーラーに入れる (Enter)',
      disabled: coolerFull,
      onclick: () => {
        decided = 'keep';
        m.close();
      },
    });
    const rel = h('button', {
      text: 'リリース (R)',
      onclick: () => {
        decided = 'release';
        m.close();
      },
    });
    m.footer.append(rel, keep);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !coolerFull) keep.click();
      if (e.code === 'KeyR') rel.click();
    };
    addEventListener('keydown', onKey);
    requestAnimationFrame(() => preview.mount(pv, s, fish.colorId, fish.patternId, { sparkle: !!(color || pattern) }));
  });
}
