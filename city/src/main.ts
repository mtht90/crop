import './style.css';
import { CITY } from './config/city';
import { buildLayout, type Lot } from './core/layout';
import { formatYen } from './core/format';
import { CityView, type LotState } from './render/cityView';
import type { IndustryId } from './config/buildings';

// 段階1：土台の確認用。区画の状態と建物は仮の配置（経済の仕組みは段階2で入れる）
const layout = buildLayout();
const view = new CityView(document.getElementById('city')!, layout);
const half = (CITY.size - 1) / 2;
const states: LotState[] = layout.lots.map((l) =>
  Math.max(Math.abs(l.gx - half), Math.abs(l.gz - half)) <= CITY.initialBuyableRadius + 0.5 ? 'buyable' : 'locked');
states.forEach((s, i) => view.setLotState(i, s));

const demo: [number, number, IndustryId, number][] = [
  [4, 4, 'food', 1], [5, 4, 'food', 2], [4, 5, 'retail', 1], [5, 5, 'it', 2], [3, 6, 'factory', 1], [6, 3, 'food', 3],
];
const buildings = new Map<number, { industry: IndustryId; level: number }>();
const missing: string[] = [];
async function placeDemo() {
await view.buildStatic();
for (const [gx, gz, ind, lv] of demo) {
  const id = gz * CITY.size + gx;
  buildings.set(id, { industry: ind, level: lv });
  view.setLotState(id, 'owned');
  if (!(await view.setBuilding(id, ind, lv))) missing.push(`${ind} Lv${lv}`);
}
if (view.models.missing.size || view.models.packError) {
  const n = document.getElementById('notice')!;
  n.hidden = false;
  n.textContent = `素材が未取り込みです（${view.models.packError ?? [...view.models.missing].join(', ')}）。assets_src/ に素材を置いて npm run import-assets を実行してください。`;
}
}
void placeDemo();

const INDUSTRY_NAME: Record<IndustryId, string> = { food: '飲食', retail: '小売', factory: '製造', logistics: '物流', it: 'IT' };
const panel = document.getElementById('detail')!;
function showLot(lot: Lot | null) {
  view.select(lot ? lot.id : null);
  if (!lot) { panel.hidden = true; return; }
  const b = buildings.get(lot.id);
  const state = states[lot.id];
  panel.hidden = false;
  panel.innerHTML = `
    <h2>区画 ${String.fromCharCode(65 + lot.gx)}-${lot.gz + 1}</h2>
    <dl>
      <dt>状態</dt><dd>${state === 'owned' ? '自社' : state === 'buyable' ? '購入できる' : 'まだ買えない'}</dd>
      <dt>地価</dt><dd>${formatYen(lot.landPrice)}</dd>
      <dt>人通り</dt><dd>${Math.round(lot.traffic * 100)}${lot.roadside ? '（道路沿い）' : ''}</dd>
      ${b ? `<dt>建物</dt><dd>${INDUSTRY_NAME[b.industry]} Lv${b.level}</dd>` : ''}
    </dl>
    <div class="row">${b ? '<button id="lv">建て替え（Lv+1）</button>' : ''}<button class="secondary" id="close">閉じる</button></div>`;
  panel.querySelector('#close')!.addEventListener('click', () => showLot(null));
  panel.querySelector('#lv')?.addEventListener('click', async () => {
    b!.level = b!.level % 3 + 1;
    await view.setBuilding(lot.id, b!.industry, b!.level);
    showLot(lot);
  });
}
view.onLotTap = showLot;
void missing;
