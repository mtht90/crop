import { COST, CROP_IDS, CROPS, type CropId, EFFECT, MAX_FARMERS } from '../game/data';
import { formatDuration, formatMoney, stars } from '../game/format';
import {
  breedCrop,
  buyUpgrade,
  capacity,
  isRipe,
  price,
  sell,
  stock,
  stockValue,
  unlockCrop,
  upgradeCost,
  type UpgradeId,
} from '../game/logic';
import { FARM_HEXES, type GameState } from '../game/state';

type Tab = 'warehouse' | 'upgrades' | 'record';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface UiHooks {
  onReset: () => void;
  onSave: () => boolean;
  onPurchase: () => void;
}

/** DOM の UI。構造はタブを開いたときに作り、数値は refresh() で毎回書き換える。 */
export class Ui {
  private tab: Tab = 'warehouse';
  private refreshers: (() => void)[] = [];
  private seedButtons = new Map<CropId, HTMLButtonElement>();
  private earnLog: { t: number; v: number }[] = [];
  private lastToast = new Map<string, number>();
  private resetArmed = false;

  constructor(
    private s: () => GameState,
    private hooks: UiHooks,
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => this.openTab(b.dataset.tab as Tab)),
    );
    this.buildSeedbar();
    this.openTab('warehouse');
  }

  // ---- 共通 --------------------------------------------------------------

  openTab(tab: Tab) {
    this.tab = tab;
    this.resetArmed = false;
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.tab === tab)),
    );
    const body = $('tab-body');
    body.replaceChildren();
    this.refreshers = [];
    if (tab === 'warehouse') this.buildWarehouse(body);
    if (tab === 'upgrades') this.buildUpgrades(body);
    if (tab === 'record') this.buildRecord(body);
    this.refresh();
  }

  /** 構造が変わるとき（作物の解放など）に作り直す */
  rebuild() {
    this.buildSeedbar();
    this.openTab(this.tab);
  }

  recordEarning(v: number) {
    this.earnLog.push({ t: performance.now(), v });
  }

  toast(text: string, warn = false, key = text, cooldownMs = 4000) {
    const now = performance.now();
    if ((this.lastToast.get(key) ?? -Infinity) > now - cooldownMs) return;
    this.lastToast.set(key, now);
    const t = el('div', 'toast' + (warn ? ' warn' : ''), text);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 2700);
  }

  floater(x: number, y: number, crop: CropId, quality: number) {
    const f = el('div', 'floater');
    const st = el('span', `q${quality + 1}`, stars(quality));
    f.append(st, ` ${CROPS[crop].name}`);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    $('floaters').append(f);
    setTimeout(() => f.remove(), 1200);
  }

  // ---- 毎フレームではなく 0.2秒ごとの更新 ----------------------------------

  refresh() {
    const s = this.s();
    $('money').textContent = formatMoney(s.money);

    const now = performance.now();
    this.earnLog = this.earnLog.filter((e) => e.t > now - 60_000);
    const perMin = this.earnLog.reduce((a, e) => a + e.v, 0);
    $('rate').textContent = `直近1分 +${formatMoney(perMin)}円`;

    const n = stock(s);
    const cap = capacity(s);
    $('stock').textContent = n >= cap ? `${n} / ${cap} 満杯` : `${n} / ${cap}`;
    $('stock-fill').style.width = `${Math.min(100, (n / cap) * 100)}%`;
    $('meter').dataset.level = n >= cap ? 'full' : n / cap >= 0.8 ? 'warn' : 'ok';

    for (const [id, b] of this.seedButtons) {
      const def = CROPS[id];
      b.setAttribute('aria-pressed', String(s.selectedCrop === id));
      b.classList.toggle('affordable', !s.unlocked[id] && s.money >= def.unlockCost);
    }

    this.updateHint(s);
    for (const r of this.refreshers) r();
  }

  private updateHint(s: GameState) {
    const hint = $('hint');
    const anyPlanted = s.plots.some((p) => p.crop);
    const anyRipe = s.plots.some(isRipe);
    let text = '';
    if (s.totalEarned === 0 && stock(s) === 0 && !anyPlanted && s.stats.manualHarvests === 0)
      text = '空いている畑をクリックして、レタスの種を植えよう';
    else if (s.stats.manualHarvests === 0 && !anyRipe) text = '育つまで少し待とう。光ったら収穫できる';
    else if (s.stats.manualHarvests < 3 && anyRipe)
      text = '光っている畑をクリックして収穫。ドラッグでまとめて収穫もできる';
    else if (s.totalEarned === 0 && stock(s) > 0) text = '倉庫タブの「すべて売る」でお金にしよう';
    else if (s.farmers === 0 && s.money >= COST.hire(0))
      text = '強化タブで農夫を雇うと、収穫と植え直しを自動でしてくれる';
    hint.hidden = !text;
    hint.textContent = text;
  }

  // ---- 種の選択 ----------------------------------------------------------

  private buildSeedbar() {
    const bar = $('seedbar');
    bar.replaceChildren();
    this.seedButtons.clear();
    CROP_IDS.forEach((id, i) => {
      const s = this.s();
      const def = CROPS[id];
      const b = el('button', 'seed' + (s.unlocked[id] ? '' : ' locked')) as HTMLButtonElement;
      const dot = el('span', 'dot');
      dot.style.background = def.color;
      const name = el('span', 'name', def.name);
      name.append(el('span', 'key', String(i + 1)));
      const meta = s.unlocked[id]
        ? el('span', 'meta', `${formatDuration(def.growSec)} ・ ${formatMoney(price(s, id, 0))}円〜`)
        : el('span', 'meta', `解放 ${formatMoney(def.unlockCost)}円`);
      b.append(dot, name, meta);
      b.addEventListener('click', () => this.selectSeed(id));
      bar.append(b);
      this.seedButtons.set(id, b);
    });
  }

  selectSeed(id: CropId) {
    const s = this.s();
    if (!s.unlocked[id]) {
      if (unlockCrop(s, id)) {
        s.selectedCrop = id;
        this.toast(`${CROPS[id].name}を植えられるようになった`);
        this.hooks.onPurchase();
        this.rebuild();
      } else {
        this.toast(`解放には ${formatMoney(CROPS[id].unlockCost)}円 必要です`, true, 'unlock');
      }
      return;
    }
    s.selectedCrop = id;
    this.refresh();
  }

  // ---- 倉庫タブ ----------------------------------------------------------

  private buildWarehouse(body: HTMLElement) {
    body.append(el('div', 'section-title', '在庫'));
    for (const id of CROP_IDS) {
      const row = el('div', 'stock-row');
      const name = el('div', 'name');
      const dot = el('span', 'dot');
      dot.style.background = CROPS[id].color;
      name.append(dot, CROPS[id].name);
      const qty = el('div', 'qty');
      const right = el('div', 'right');
      const value = el('div', 'value');
      const btn = el('button', 'btn', '売る') as HTMLButtonElement;
      btn.addEventListener('click', () => this.doSell(id));
      right.append(value, btn);
      row.append(name, right, qty);
      body.append(row);
      this.refreshers.push(() => {
        const s = this.s();
        row.hidden = !s.unlocked[id];
        qty.replaceChildren(
          ...s.inventory[id].map((n, q) => {
            const span = el('span', undefined, `${stars(q)} `);
            span.append(el('b', undefined, String(n)));
            return span;
          }),
        );
        const v = stockValue(s, id);
        value.textContent = `${formatMoney(v)}円`;
        btn.disabled = v <= 0;
      });
    }

    const all = el('div', 'sell-all');
    const total = el('div', 'total');
    const totalV = el('b');
    total.append(el('span', undefined, '合計'), totalV);
    const btn = el('button', 'btn big', 'すべて売る') as HTMLButtonElement;
    btn.addEventListener('click', () => this.doSell());
    all.append(total, btn);
    body.append(all);
    body.append(
      el(
        'p',
        'note',
        '手で収穫すると★2以上、農夫の収穫は★1。倉庫がいっぱいになると収穫できなくなるので、こまめに売ろう。キーボードの S でもすべて売れる。',
      ),
    );
    this.refreshers.push(() => {
      const s = this.s();
      const v = CROP_IDS.reduce((a, id) => a + stockValue(s, id), 0);
      totalV.textContent = `${formatMoney(v)}円`;
      btn.disabled = v <= 0;
    });
  }

  doSell(crop?: CropId) {
    const earned = sell(this.s(), crop);
    if (earned <= 0) return;
    this.recordEarning(earned);
    this.toast(`+${formatMoney(earned)}円`, false, 'sell' + Math.random(), 0);
    this.refresh();
  }

  // ---- 強化タブ ----------------------------------------------------------

  private upgradeCard(
    body: HTMLElement,
    title: () => string,
    desc: () => string,
    cost: () => number | null,
    buy: () => boolean,
    visible: () => boolean = () => true,
  ) {
    const card = el('div', 'upgrade');
    const t = el('div', 'title');
    const d = el('div', 'desc');
    const btn = el('button', 'btn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (buy()) {
        this.hooks.onPurchase();
        this.refresh();
      }
    });
    card.append(t, btn, d);
    body.append(card);
    this.refreshers.push(() => {
      card.hidden = !visible();
      t.textContent = title();
      d.textContent = desc();
      const c = cost();
      btn.textContent = c === null ? '最大' : `${formatMoney(c)}円`;
      btn.disabled = c === null || this.s().money < c;
    });
  }

  private buildUpgrades(body: HTMLElement) {
    const s = this.s;
    const up = (id: UpgradeId) => () => buyUpgrade(s(), id);

    body.append(el('div', 'section-title', '農場'));
    this.upgradeCard(
      body,
      () => '畑を広げる',
      () =>
        s().plots.length >= FARM_HEXES.length
          ? `区画 ${s().plots.length}（最大）`
          : `区画 ${s().plots.length} → ${s().plots.length + 1}（光っている場所をクリックでも買える）`,
      () => upgradeCost(s(), 'expand'),
      up('expand'),
    );
    this.upgradeCard(
      body,
      () => '倉庫を広げる',
      () => `容量 ${capacity(s())} → ${EFFECT.warehouseCap(s().warehouseLv + 1)}`,
      () => upgradeCost(s(), 'warehouse'),
      up('warehouse'),
    );

    body.append(el('div', 'section-title', '農夫'));
    this.upgradeCard(
      body,
      () => '農夫を雇う',
      () =>
        s().farmers >= MAX_FARMERS
          ? `${s().farmers}人（最大）`
          : `${s().farmers}人 → ${s().farmers + 1}人　収穫と植え直しを自動でする`,
      () => upgradeCost(s(), 'hire'),
      up('hire'),
    );
    this.upgradeCard(
      body,
      () => '農夫の訓練',
      () =>
        `作業の速さ ×${EFFECT.farmerSpeed(s().farmerLv).toFixed(2)} → ×${EFFECT.farmerSpeed(s().farmerLv + 1).toFixed(2)}`,
      () => upgradeCost(s(), 'train'),
      up('train'),
      () => s().farmers > 0,
    );

    body.append(el('div', 'section-title', '品種改良'));
    for (const id of CROP_IDS) {
      this.upgradeCard(
        body,
        () => `${CROPS[id].name}　Lv${s().breed[id]}`,
        () =>
          `売値 ×${EFFECT.breedMult(s().breed[id]).toFixed(2)} → ×${EFFECT.breedMult(s().breed[id] + 1).toFixed(2)}`,
        () => COST.breed(id, s().breed[id]),
        () => {
          const ok = breedCrop(s(), id);
          if (ok) this.buildSeedbar();
          return ok;
        },
        () => s().unlocked[id],
      );
    }
  }

  // ---- 記録タブ ----------------------------------------------------------

  private buildRecord(body: HTMLElement) {
    const s = this.s;
    body.append(el('div', 'section-title', 'これまでの記録'));
    const dl = el('dl', 'stats');
    const rows: [string, () => string][] = [
      ['プレイ時間', () => formatDuration(s().stats.playSec)],
      ['これまでの売上', () => `${formatMoney(s().totalEarned)}円`],
      ['手で収穫した数', () => s().stats.manualHarvests.toLocaleString('ja-JP')],
      ['農夫が収穫した数', () => s().stats.autoHarvests.toLocaleString('ja-JP')],
      ['区画', () => `${s().plots.length} / ${FARM_HEXES.length}`],
      ['農夫', () => `${s().farmers}人`],
    ];
    for (const [label, value] of rows) {
      const dt = el('dt', undefined, label);
      const dd = el('dd');
      dl.append(dt, dd);
      this.refreshers.push(() => (dd.textContent = value()));
    }
    body.append(dl);

    body.append(el('div', 'section-title', 'セーブ'));
    body.append(el('p', 'note', '10秒ごとにこのブラウザへ自動で保存されます。'));
    const row = el('div', 'row');
    const save = el('button', 'btn ghost', '今すぐ保存') as HTMLButtonElement;
    save.addEventListener('click', () =>
      this.toast(this.hooks.onSave() ? '保存しました' : 'このブラウザでは保存できません', false, 'save', 0),
    );
    const reset = el('button', 'btn ghost', '最初からやり直す') as HTMLButtonElement;
    reset.addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        reset.className = 'btn danger';
        reset.textContent = 'もう一度押すとリセット';
        return;
      }
      this.hooks.onReset();
    });
    row.append(save, reset);
    body.append(row);

    body.append(el('div', 'section-title', 'クレジット'));
    const credits = el('div', 'credits');
    credits.innerHTML =
      '3Dモデル：KayKit by Kay Lousberg（CC0）<br>' +
      'Medieval Hexagon Pack / Restaurant Bits / Adventurers Character Pack<br>' +
      '<a href="https://www.kaylousberg.com" target="_blank" rel="noopener">kaylousberg.com</a><br>' +
      'フォント：Kiwi Maru / Zen Maru Gothic（SIL Open Font License）';
    body.append(credits);
  }
}
