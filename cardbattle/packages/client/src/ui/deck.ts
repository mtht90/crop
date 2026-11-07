import { TICK_RATE, UNIT, type CardStats, type GameContent } from '@cardbattle/sim';
import type { Profile } from '../profile';
import { escapeHtml, renderCard } from './hud';

const TYPE_LABEL: Record<string, string> = { troop: 'ユニット', building: '建物', spell: '呪文' };
const RARITY_LABEL: Record<string, string> = { common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド' };

function speedLabel(perTick: number): string {
  const tilesPerMin = (perTick * TICK_RATE * 60) / UNIT;
  if (tilesPerMin >= 110) return 'とても速い';
  if (tilesPerMin >= 80) return '速い';
  if (tilesPerMin >= 55) return '普通';
  return '遅い';
}

/** カードの性能（data/cards.json の値をそのまま表示） */
function details(c: CardStats): string {
  const rows: [string, string][] = [
    ['種類', TYPE_LABEL[c.type] ?? c.type],
    ['レアリティ', RARITY_LABEL[c.rarity] ?? c.rarity],
    ['コスト', String(c.cost)],
  ];
  if (c.type === 'spell') {
    rows.push(['ダメージ', String(c.damage)], ['タワーへのダメージ', String(c.crownTowerDamage)], ['範囲', `${c.spellRadius / UNIT} タイル`]);
    if (c.stunTicks) rows.push(['スタン', `${c.stunTicks / TICK_RATE} 秒`]);
  } else {
    rows.push(['HP', String(c.hitpoints)], ['ダメージ', String(c.damage)], ['攻撃間隔', `${c.hitTicks / TICK_RATE} 秒`], ['射程', `${c.range / UNIT} タイル`]);
    if (c.type === 'troop') rows.push(['速度', speedLabel(c.speed)], ['数', `${c.count} 体`]);
    if (c.lifetimeTicks) rows.push(['寿命', `${c.lifetimeTicks / TICK_RATE} 秒`]);
    rows.push(['攻撃対象', c.buildingsOnly ? '建物のみ' : c.hitsAir ? '地上・空中' : '地上のみ']);
    if (c.flying) rows.push(['移動', '空中']);
  }
  return `<div class="card-detail-name">${escapeHtml(c.name)}</div><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/**
 * デッキ編集：デッキ（8枚）のカードをタップして選び、控えのカードをタップすると入れ替わる。
 * 平均コストと各カードの性能も表示する。
 */
export function showDeckEditor(root: HTMLElement, content: GameContent, profile: Profile, onDone: () => void): void {
  const deck = profile.deck.slice();
  let selected = 0;

  const render = () => {
    const reserve = content.cards.all().filter((c) => !deck.includes(c.id));
    const avg = deck.reduce((n, id) => n + content.cards.require(id).cost, 0) / deck.length;
    root.innerHTML = `
      <div class="screen deck">
        <div class="panel wide">
          <div class="panel-title">デッキ（平均コスト ${avg.toFixed(1)}）</div>
          <div class="deck-grid" data-k="deck"></div>
          <div class="card-detail" data-k="detail"></div>
          <div class="panel-title small">控えのカード</div>
          <div class="deck-grid" data-k="reserve">${reserve.length ? '' : '<p class="hint">今は全8種類がデッキに入っています。カードが増えると、ここから入れ替えられます。</p>'}</div>
          <button class="btn" data-act="done">決定</button>
        </div>
      </div>`;
    const deckEl = root.querySelector<HTMLElement>('[data-k="deck"]')!;
    deck.forEach((id, i) => {
      const el = document.createElement('div');
      el.className = `card${i === selected ? ' selected' : ''}`;
      renderCard(el, content.cards.require(id));
      el.addEventListener('click', () => {
        selected = i;
        render();
      });
      deckEl.appendChild(el);
    });
    const resEl = root.querySelector<HTMLElement>('[data-k="reserve"]')!;
    for (const c of reserve) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCard(el, c);
      el.addEventListener('click', () => {
        deck[selected] = c.id; // 選んでいるデッキのカードと入れ替え
        render();
      });
      resEl.appendChild(el);
    }
    root.querySelector<HTMLElement>('[data-k="detail"]')!.innerHTML = details(content.cards.require(deck[selected]));
    root.querySelector('[data-act="done"]')!.addEventListener('click', () => {
      profile.deck = deck;
      onDone();
    });
  };
  render();
}
