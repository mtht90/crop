// シートの中身（街の区画・店・事業・研究・市場・財務）
import type { IndustryId } from '../config/buildings';
import { ACQUISITION, FINANCE, INDUSTRIES, LINKS, QUALITY, STORE, TIME } from '../config/economy';
import { PRODUCTS, productById } from '../config/products';
import { RESEARCH, researchById } from '../config/research';
import { PERSONALITIES } from '../config/rivals';
import type { IconKey } from '../config/icons';
import { formatCount, formatSigned, formatYen, minutesLabel, pct, realDuration } from '../core/format';
import * as A from '../sim/actions';
import { clock, unlockText } from '../sim/engine';
import { creditLimit, debtOf, loanPayment, loanRate, marketShares, nextQuarterDay, recent } from '../sim/finance';
import { buyableRadius, catchment, fairPrice, isStoreIndustry, layout, lotPrice, makeContext, playerCanBuyLot, productsFor, qualityCapFor, researchBonuses, storeHour } from '../sim/model';
import type { Company, GameState, Store } from '../sim/types';
import type { Game } from '../game';
import { h, icon, type Child } from './dom';

export interface PanelContent {
  title: string;
  icon: IconKey;
  body: (Node | null)[];
}

const IND_ICON: Record<IndustryId, IconKey> = { food: 'food', retail: 'retail', factory: 'factory', logistics: 'logistics', it: 'it' };
const LOT_NAME = (id: number) => {
  const l = layout.lots[id];
  return `${String.fromCharCode(65 + l.gx)}-${l.gz + 1}`;
};

export function storeLabel(st: Store) {
  const ind = INDUSTRIES[st.industry];
  return `${ind.shortName}・${LOT_NAME(st.lotId)}`;
}

function stars(q: number) {
  const n = Math.round(q / 20);
  return h('span', { class: 'stars', 'aria-label': `品質${Math.round(q)}` }, ...[0, 1, 2, 3, 4].map((i) => h('i', { class: i < n ? '' : 'off' })));
}

function bar(ratio: number, label?: string) {
  return h('div', { class: 'grow' },
    label ? h('div', { class: 'muted small' }, label) : null,
    h('div', { class: 'bar' }, h('i', { style: { width: `${Math.max(2, Math.min(100, ratio * 100))}%` } })));
}

function kpi(label: string, value: string, cls = '') {
  return h('div', { class: 'kpi' }, h('small', null, label), h('b', { class: cls }, value));
}

function btn(label: Child, onclick: () => void, opts: { cls?: string; disabled?: boolean; sub?: string; title?: string } = {}) {
  return h('button', { class: `btn ${opts.cls ?? ''}`, onclick: () => onclick(), disabled: opts.disabled, 'aria-label': opts.title },
    opts.sub ? h('span', { class: 'col' }, label, h('small', null, opts.sub)) : label);
}

function profitOf(d: Store['today'] | null) {
  return d ? d.revenue - d.cogs - d.wages - d.upkeep - d.ads : 0;
}

// ======================================================================= 街：区画

export function lotPanel(g: Game, lotId: number): PanelContent {
  const s = g.s;
  const lot = layout.lots[lotId];
  const owner = s.lotOwner[lotId];
  const st = s.stores.find((x) => x.lotId === lotId);
  if (lotId === s.hqLot) return hqPanel(g);
  if (st && st.company === 0) return storePanel(g, st);
  if (st) return rivalStorePanel(g, st);
  const info = h('div', { class: 'kpis' },
    kpi('地価', formatYen(lotPrice(s, lotId))),
    kpi('人通り', `${Math.round(lot.traffic * 100)}${lot.roadside ? '・道路沿い' : ''}`),
    kpi('集客力', `${Math.round(catchment[lotId] * 100)}`));
  const body: (Node | null)[] = [info];
  if (owner === -1) {
    if (playerCanBuyLot(s, lotId)) {
      body.push(h('div', { class: 'row' },
        btn([icon('cash'), '区画を買う'], () => g.act((x) => A.buyLot(x, lotId), 'buy'), { sub: formatYen(lotPrice(s, lotId)) })));
    } else {
      body.push(h('div', { class: 'card' }, h('h3', null, icon('lock'), 'まだ買えません'),
        h('p', { class: 'muted', style: { margin: 0 } }, `店を増やすと、買える範囲が中心から外側へ広がります（今は中心から${Math.floor(buyableRadius(s) - 0.5) + 1}区画まで）。`)));
    }
  } else if (owner === 0) {
    body.push(h('div', { class: 'card' }, h('h3', null, icon('build'), 'ここに建てる'),
      h('div', { class: 'list' }, ...(Object.keys(INDUSTRIES) as IndustryId[]).map((id) => {
        const ind = INDUSTRIES[id];
        const unlocked = s.unlocked.includes(id);
        const lv = ind.levels[0];
        return h('div', { class: 'item' }, icon(IND_ICON[id], 'ic big'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, ind.name),
            h('div', { class: 's' }, unlocked ? `${formatYen(lv.cost)}・工事 ${minutesLabel(lv.buildMinutes)}` : `解禁条件：${unlockText(id)}`)),
          unlocked ? btn('建てる', () => g.act((x) => A.build(x, lotId, id), 'bigBuy')) : icon('lock', 'ic big'));
      }))));
    body.push(h('div', { class: 'row end' }, btn([icon('sell'), '区画を売る'], () => g.act((x) => A.sellLot(x, lotId), 'buy'), { cls: 'ghost', sub: formatYen(lotPrice(s, lotId) * 0.8) })));
  }
  return { title: `区画 ${LOT_NAME(lotId)}`, icon: 'city', body };
}

function hqPanel(g: Game): PanelContent {
  const s = g.s;
  const cur = s.research.current;
  const r = cur ? researchById.get(cur.id) : null;
  return {
    title: '本社', icon: 'hq', body: [
      h('p', { class: 'muted', style: { margin: 0 } }, '研究はここで進めます。研究タブから始められます。'),
      r && cur ? h('div', { class: 'card' }, h('h3', null, icon('research'), `研究中：${r.name}`),
        h('div', { class: 'row' }, bar((cur.progressDays * 60) / r.minutes), h('span', { class: 'small' }, `残り ${realDuration((r.minutes - cur.progressDays * 60) / 60 / (1 + researchBonuses(s).researchSpeed))}`))) : h('div', { class: 'muted' }, '今は研究していません'),
    ],
  };
}

// ======================================================================= 自社の店

const AD_STEPS = [0, 10_000, 30_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 3_000_000];

export function storePanel(g: Game, st: Store): PanelContent {
  const s = g.s;
  const ind = INDUSTRIES[st.industry];
  const comp = s.companies[0];
  const bonus = researchBonuses(s);
  const body: (Node | null)[] = [];
  const building = st.buildUntil !== null;
  if (building) {
    const lv = ind.levels[(st.upgradeTo ?? st.level) - 1];
    const total = (lv.buildMinutes * 60) / TIME.realSecondsPerDay;
    const left = st.buildUntil! - s.day;
    body.push(h('div', { class: 'card' }, h('h3', null, icon('build'), st.upgradeTo ? `レベル${st.upgradeTo}に建て替え中` : '建設中'),
      h('div', { class: 'row' }, bar(1 - left / total), h('span', { class: 'small' }, `残り ${realDuration(left)}`))));
    if (!st.upgradeTo) return { title: storeLabel(st), icon: IND_ICON[st.industry], body };
  }
  const y = st.yesterday;
  const t = st.today;
  body.push(h('div', { class: 'kpis' },
    kpi('今日の売上', formatYen(t.revenue)),
    kpi('今日の利益', formatSigned(profitOf(t)), profitOf(t) >= 0 ? 'good' : 'bad'),
    isStoreIndustry(st.industry) ? kpi('今日の客数', formatCount(t.customers)) : kpi('従業員', `${st.staff}人`),
    kpi('昨日の売上', formatYen(y?.revenue ?? 0)),
    kpi('昨日の利益', formatSigned(profitOf(y)), profitOf(y) >= 0 ? 'good' : 'bad'),
    isStoreIndustry(st.industry) ? kpi('昨日の客数', formatCount(y?.customers ?? 0)) : kpi('レベル', `Lv${st.level}`)));

  if (isStoreIndustry(st.industry)) {
    // 売上が変わった理由
    if (st.reasons.length) body.push(h('div', { class: 'card' }, h('h3', null, icon('info'), '売上の変化の理由'), h('ul', { class: 'reasons' }, ...st.reasons.map((r) => h('li', null, r)))));
    // 今の時間の様子
    const ctx = makeContext(s);
    const hourRes = storeHour(s, st, ctx, clock(s.day).hour, 1);
    const links: string[] = [];
    if (ctx.factorySupplied.has(st.id)) links.push(`工場から仕入れ中（原価 -${pct(LINKS.factoryCostDiscount)}）`);
    if (ctx.logisticsCovered.has(st.id)) links.push(`物流センターが配送中（費用 -${pct(LINKS.logisticsOpexDiscount)}）`);
    else if (ctx.playerStoreCount > LINKS.stockoutFreeStores) links.push(`物流が届かず品切れぎみ（客 -${pct(LINKS.stockoutLoss)}）`);
    body.push(h('div', { class: 'card' }, h('h3', null, icon('people'), 'いまの様子'),
      h('div', { class: 'kpis' },
        kpi('来たい客/時', formatCount(hourRes.demand)),
        kpi('さばける客/時', formatCount(hourRes.served), hourRes.serviceRatio < 0.95 ? 'bad' : ''),
        kpi('シェア', pct(hourRes.share))),
      h('div', { class: 'row' }, bar(st.awareness, `知名度 ${pct(st.awareness)}`), bar(st.satisfaction, `満足度 ${pct(st.satisfaction)}`)),
      ...links.map((l) => h('div', { class: 'small muted' }, l))));
    // 商品と価格
    const prods = productsFor(s, 0, st.industry);
    body.push(h('div', { class: 'card' }, h('h3', null, icon('coins'), '商品と価格'),
      st.manager ? h('div', { class: 'small muted' }, '店長が毎日価格を見直しています。自分で変えても、翌日に店長が上書きします。') : null,
      h('div', { class: 'list' }, ...prods.map((p) => {
        const q = comp.quality[p.id] ?? QUALITY.start;
        const price = st.prices[p.id] ?? fairPrice(p, q);
        const fair = fairPrice(p, q);
        const ratio = price / fair;
        return h('div', { class: 'prod' },
          h('div', null, h('div', { class: 'name' }, p.name, ' ', stars(q)),
            h('div', { class: `small ${ratio > 1.15 ? 'bad' : ratio < 0.9 ? 'good' : 'muted'}` }, `ふつうの値段 ${formatYen(Math.round(fair / p.priceStep) * p.priceStep)}・${ratio > 1.15 ? '割高' : ratio < 0.9 ? '割安' : 'ちょうどよい'}`)),
          h('div', { class: 'stepper' },
            btn('−', () => g.act((x) => A.setPrice(x, st.id, p.id, price - p.priceStep * (price > 1000 ? 5 : 1))), { cls: 'square', title: '値下げ' }),
            h('span', { class: 'val' }, formatYen(price)),
            btn('＋', () => g.act((x) => A.setPrice(x, st.id, p.id, price + p.priceStep * (price > 1000 ? 5 : 1))), { cls: 'square', title: '値上げ' })));
      }))));
    // 広告
    const adIdx = AD_STEPS.findIndex((a) => a >= st.adsPerDay);
    body.push(h('div', { class: 'card' }, h('h3', null, icon('ads'), '広告（1日あたり）'),
      h('div', { class: 'stepper' },
        btn('−', () => g.act((x) => A.setAds(x, st.id, AD_STEPS[Math.max(0, adIdx - 1)])), { cls: 'square', title: '広告を減らす' }),
        h('span', { class: 'val grow' }, st.adsPerDay ? formatYen(st.adsPerDay) : 'なし'),
        btn('＋', () => g.act((x) => A.setAds(x, st.id, AD_STEPS[Math.min(AD_STEPS.length - 1, adIdx + 1)])), { cls: 'square', title: '広告を増やす' })),
      h('div', { class: 'small muted' }, '広告をかけると知名度が上がり、止めると少しずつ下がります。')));
  }
  // 従業員
  const maxStaff = ind.maxStaff[st.level - 1];
  body.push(h('div', { class: 'card' }, h('h3', null, icon('staff'), '従業員'),
    st.manager && isStoreIndustry(st.industry) ? h('div', { class: 'small muted' }, '店長が人数を調整しています。') : null,
    h('div', { class: 'stepper' },
      btn('−', () => g.act((x) => A.setStaff(x, st.id, st.staff - 1)), { cls: 'square', title: '減らす' }),
      h('span', { class: 'val grow' }, `${st.staff}人 / 最大${maxStaff}人`),
      btn('＋', () => g.act((x) => A.setStaff(x, st.id, st.staff + 1)), { cls: 'square', title: '増やす' })),
    h('div', { class: 'small muted' }, `時給 ${formatYen(ind.wagePerHour)}・1人の採用/退職に ${formatYen(STORE.hireCost)}`),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, `研修レベル ${st.training} / ${STORE.maxTraining}`),
      st.training < STORE.maxTraining ? btn([icon('training'), '研修する'], () => g.act((x) => A.trainStaff(x, st.id)), { sub: formatYen(A.trainingCost(s, st.id)) }) : h('span', { class: 'chip good' }, '最高レベル'))));
  // 店長
  if (isStoreIndustry(st.industry)) {
    body.push(h('div', { class: 'card' }, h('h3', null, icon('manager'), '店長'),
      bonus.manager
        ? h('div', { class: 'row' }, h('span', { class: 'grow small' }, st.manager ? `店長がいます（時給 ${formatYen(STORE.managerWagePerHour)}）。価格と人数を毎日自動で調整します。` : '店長を置くと、価格と人数を毎日自動で調整します。自分で調整した方が少し得です。'),
          btn(st.manager ? '外す' : '置く', () => g.act((x) => A.setManager(x, st.id, !st.manager)), { cls: st.manager ? 'ghost' : '' }))
        : h('div', { class: 'small muted' }, '研究「店長制度」で置けるようになります。')));
  }
  // 建て替え・取り壊し
  const next = ind.levels[st.level];
  body.push(h('div', { class: 'row' },
    next && !building ? btn([icon('upgrade'), `レベル${st.level + 1}に建て替え`], () => g.act((x) => A.upgrade(x, st.id), 'bigBuy'), { sub: `${formatYen(next.cost)}・${minutesLabel(next.buildMinutes)}` }) : null,
    h('span', { class: 'grow' }),
    btn('取り壊す', () => confirmThen(g, `${storeLabel(st)}を取り壊しますか？ 建設費の${pct(STORE.demolishRefund)}が戻ります。`, () => g.act((x) => A.demolish(x, st.id))), { cls: 'ghost' })));
  return { title: `${storeLabel(st)}  Lv${st.level}`, icon: IND_ICON[st.industry], body };
}

/** 確認ダイアログ（UI 側で差し込む） */
export let confirmThen: (g: Game, text: string, ok: () => void) => void = (_g, _t, ok) => ok();
export function setConfirm(fn: typeof confirmThen) {
  confirmThen = fn;
}

// ======================================================================= ライバルの店

function rivalStorePanel(g: Game, st: Store): PanelContent {
  const s = g.s;
  const c = s.companies[st.company];
  const price = A.storePrice(s, st.id);
  const y = st.yesterday;
  return {
    title: `${c.name}の店`, icon: IND_ICON[st.industry], body: [
      h('div', { class: 'row' }, h('span', { class: 'swatch', style: { background: c.color } }), h('b', null, c.name),
        h('span', { class: 'chip' }, PERSONALITIES[c.personality ?? 'steady'].name), h('span', { class: 'chip' }, `${INDUSTRIES[st.industry].shortName} Lv${st.level}`)),
      h('div', { class: 'kpis' },
        kpi('昨日の売上', formatYen(y?.revenue ?? 0)),
        kpi('昨日の客数', formatCount(y?.customers ?? 0)),
        kpi('知名度', pct(st.awareness))),
      h('div', { class: 'card' }, h('h3', null, icon('acquire'), 'この店を買収する'),
        h('div', { class: 'small muted' }, `土地・建物・利益から計算した値段に、${pct(ACQUISITION.storePremium - 1)}上乗せした額です。`),
        h('div', { class: 'row' }, btn('買収する', () => confirmThen(g, `${c.name}の店を ${formatYen(price)} で買収しますか？`, () => g.act((x) => A.acquireStore(x, st.id), 'bigBuy')), { sub: formatYen(price), disabled: !s.unlocked.includes(st.industry) }),
          !s.unlocked.includes(st.industry) ? h('span', { class: 'small bad' }, 'この業種はまだ解禁されていません') : null)),
      h('div', { class: 'small muted' }, '会社ごと買収するには、市場タブで株を買い進めます。'),
    ],
  };
}

// ======================================================================= 事業タブ

export function businessTab(g: Game): PanelContent {
  const s = g.s;
  const comp = s.companies[0];
  const mine = s.stores.filter((x) => x.company === 0);
  const ctx = makeContext(s);
  const body: (Node | null)[] = [];
  // 業種
  body.push(h('div', { class: 'card' }, h('h3', null, icon('business'), '業種'),
    h('div', { class: 'list' }, ...(Object.keys(INDUSTRIES) as IndustryId[]).map((id) => {
      const n = mine.filter((x) => x.industry === id).length;
      const unlocked = s.unlocked.includes(id);
      return h('div', { class: 'item' }, icon(IND_ICON[id], 'ic big'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, INDUSTRIES[id].name),
          h('div', { class: 's' }, unlocked ? `${n}つ持っています` : `解禁条件：${unlockText(id)}`)),
        unlocked ? h('span', { class: 'chip good' }, '解禁済み') : icon('lock', 'ic big'));
    }))));
  // つながり
  const fac = mine.filter((x) => x.industry === 'factory' && x.buildUntil === null);
  const logi = mine.filter((x) => x.industry === 'logistics' && x.buildUntil === null);
  const it = mine.filter((x) => x.industry === 'it' && x.buildUntil === null);
  const shops = mine.filter((x) => isStoreIndustry(x.industry) && x.buildUntil === null);
  body.push(h('div', { class: 'card' }, h('h3', null, icon('chart'), '業種どうしのつながり'),
    h('div', { class: 'diagram' },
      h('div', { class: `node ${fac.length ? '' : 'off'}` }, icon('factory'), `工場 ${fac.length}`, h('span', { class: 'small' }, `卸し先 ${ctx.factorySupplied.size}店`)),
      h('div', { class: 'arrow' }, '→'),
      h('div', { class: `node ${logi.length ? '' : 'off'}` }, icon('logistics'), `物流 ${logi.length}`, h('span', { class: 'small' }, `配送先 ${ctx.logisticsCovered.size}`)),
      h('div', { class: 'arrow' }, '→'),
      h('div', { class: 'node' }, icon('food'), `店 ${shops.length}`, h('span', { class: 'small' }, `原価 -${pct(LINKS.factoryCostDiscount)}（卸し先）`))),
    h('div', { class: 'small muted' }, `工場は自社の店（飲食・小売）に安く卸し、原価を下げます。物流センターは店と工場をつなぎ、費用と品切れを減らします。ITオフィスは全事業の売上を上げます（今 +${pct(ctx.itEfficiency)}${it.length ? '' : '：オフィスなし'}）。`)));
  // 商品の品質
  const prods = PRODUCTS.filter((p) => s.unlocked.includes(p.industry));
  body.push(h('div', { class: 'card' }, h('h3', null, icon('quality'), '商品の品質（全店共通）'),
    h('div', { class: 'small muted' }, '品質を上げると満足度と口コミが増え、高めの値段でも売れます。上限は研究で上がります。'),
    h('div', { class: 'list' }, ...prods.map((p) => {
      const q = comp.quality[p.id] ?? QUALITY.start;
      const cap = qualityCapFor(s, 0, p.industry);
      const sold = productsFor(s, 0, p.industry).some((x) => x.id === p.id);
      return h('div', { class: 'prod' },
        h('div', null, h('div', { class: 'name' }, p.name, ' ', stars(q), sold ? '' : h('span', { class: 'chip' }, '未発売')),
          h('div', { class: 'small muted' }, `品質 ${Math.round(q)} / 上限 ${cap}`)),
        q < cap ? btn('＋5', () => g.act((x) => A.investQuality(x, p.id, 5), 'buy'), { sub: formatYen(A.qualityInvestCost(s, p.id, Math.min(5, cap - q))) }) : h('span', { class: 'chip' }, '上限'));
    }))));
  // 店の一覧
  body.push(h('div', { class: 'card' }, h('h3', null, icon('city'), `自社の店・施設（${mine.length}）`),
    mine.length === 0 ? h('div', { class: 'muted' }, 'まだありません。街タブで区画を買って建てましょう。') : null,
    h('div', { class: 'list' }, ...mine.map((st) => h('div', { class: 'item tap', onclick: () => { g.view.focusLot(st.lotId); g.selectLot(st.lotId); g.onShowCity(); } },
      icon(IND_ICON[st.industry], 'ic big'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${storeLabel(st)} Lv${st.level}`, st.manager ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, '店長') : null),
        h('div', { class: 's' }, st.buildUntil !== null ? `工事中（残り ${realDuration(st.buildUntil - s.day)}）` : st.reasons[0] ?? `昨日の利益 ${formatSigned(profitOf(st.yesterday))}`)),
      h('b', { class: profitOf(st.yesterday) >= 0 ? 'good' : 'bad' }, formatSigned(profitOf(st.yesterday))))))));
  return { title: '事業', icon: 'business', body };
}

// ======================================================================= 研究タブ

const CAT_NAME: Record<string, string> = { quality: '品質', product: '新商品', cost: 'コスト・広告', automation: '自動化・研究所', industry: '業種ごとの強化' };

export function researchTab(g: Game): PanelContent {
  const s = g.s;
  const cur = s.research.current;
  const speed = 1 + researchBonuses(s).researchSpeed;
  const body: (Node | null)[] = [];
  if (cur) {
    const r = researchById.get(cur.id)!;
    const leftMin = (r.minutes - cur.progressDays * 60 * speed / speed) / speed;
    body.push(h('div', { class: 'card' }, h('h3', null, icon('research'), `研究中：${r.name}`),
      h('div', { class: 'small' }, r.desc),
      h('div', { class: 'row' }, bar((cur.progressDays * 60) / r.minutes), h('span', { class: 'small' }, `残り ${realDuration(Math.max(0, r.minutes - cur.progressDays * 60) / 60 / speed)}`)),
      h('div', { class: 'row end' }, btn('中止する', () => confirmThen(g, '研究を中止しますか？ 費用の半分が戻ります。', () => g.act((x) => A.cancelResearch(x))), { cls: 'ghost' }))));
    void leftMin;
  } else {
    body.push(h('div', { class: 'muted' }, '研究は本社で1つずつ進めます。選んで始めましょう。'));
  }
  const cats = ['product', 'quality', 'cost', 'automation', 'industry'];
  for (const cat of cats) {
    const list = RESEARCH.filter((r) => r.category === cat);
    body.push(h('div', { class: 'card' }, h('h3', null, icon('research'), CAT_NAME[cat]),
      h('div', { class: 'list' }, ...list.map((r) => {
        const done = s.research.done.includes(r.id);
        const why = A.canResearch(s, r.id);
        const active = cur?.id === r.id;
        return h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { class: 't' }, r.name),
            h('div', { class: 's' }, r.desc),
            !done && !active ? h('div', { class: 's' }, `${formatYen(r.cost)}・${minutesLabel(Math.round(r.minutes / speed))}${why ? `・${why}` : ''}`) : null),
          done ? h('span', { class: 'chip good' }, '完了') : active ? h('span', { class: 'chip warn' }, '研究中')
            : btn('始める', () => g.act((x) => A.startResearch(x, r.id), 'research'), { disabled: !!why || !!cur }));
      }))));
  }
  return { title: '研究', icon: 'research', body };
}

// ======================================================================= 市場タブ

export const marketState = { industry: 'food' as 'food' | 'retail' };

function pie(slices: { value: number; color: string; label: string }[]) {
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-110 -110 220 220');
  svg.setAttribute('role', 'img');
  let a0 = -Math.PI / 2;
  for (const sl of slices) {
    const a1 = a0 + (sl.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = document.createElementNS(ns, 'path');
    if (sl.value / total > 0.999) {
      p.setAttribute('d', 'M0 -100 A100 100 0 1 1 -0.01 -100 Z');
    } else {
      p.setAttribute('d', `M0 0 L${Math.cos(a0) * 100} ${Math.sin(a0) * 100} A100 100 0 ${large} 1 ${Math.cos(a1) * 100} ${Math.sin(a1) * 100} Z`);
    }
    p.setAttribute('fill', sl.color);
    p.setAttribute('stroke', '#fff');
    p.setAttribute('stroke-width', '2');
    svg.append(p);
    a0 = a1;
  }
  const hole = document.createElementNS(ns, 'circle');
  hole.setAttribute('r', '48');
  hole.setAttribute('fill', '#fff');
  svg.append(hole);
  return svg;
}

export function marketTab(g: Game): PanelContent {
  const s = g.s;
  const ms = marketShares(s);
  const ind = marketState.industry;
  const m = ms[ind];
  let total = 0;
  for (const v of m.values()) total += v;
  const rows = [...m.entries()].map(([cid, v]) => ({ c: s.companies[cid], v })).sort((a, b) => b.v - a.v);
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((a, r) => a + r.v, 0);
  const slices = top.map((r) => ({ value: r.v, color: r.c.color, label: r.c.name }));
  if (rest > 0) slices.push({ value: rest, color: '#c7d3df', label: 'その他' });
  const body: (Node | null)[] = [];
  body.push(h('div', { class: 'row' },
    btn([icon('food'), '飲食'], () => { marketState.industry = 'food'; g.onUpdate(); }, { cls: ind === 'food' ? 'on' : 'ghost' }),
    btn([icon('retail'), '小売'], () => { marketState.industry = 'retail'; g.onUpdate(); }, { cls: ind === 'retail' ? 'on' : 'ghost' })));
  body.push(h('div', { class: 'card' }, h('h3', null, icon('market'), `${INDUSTRIES[ind].shortName}のシェア（直近の売上）`),
    total > 0 ? h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('div', { class: 'chart', style: { width: '42%', flex: 'none' } }, pie(slices)),
      h('div', { class: 'legend', style: { flexDirection: 'column' } }, ...slices.map((sl) => h('span', null, h('i', { class: 'swatch', style: { background: sl.color } }), `${sl.label} ${pct(sl.value / total, 1)}`))))
      : h('div', { class: 'muted' }, 'まだ売上がありません')));
  // 企業ランキング
  const ranking = s.companies.filter((c) => !c.bankrupt || c.isPlayer).sort((a, b) => b.marketCap - a.marketCap);
  body.push(h('div', { class: 'card' }, h('h3', null, icon('rank'), '企業ランキング（時価総額）'),
    h('table', { class: 't' }, h('tr', null, h('th', null, '#'), h('th', null, '会社'), h('th', { class: 'n' }, '店'), h('th', { class: 'n' }, '時価総額')),
      ...ranking.map((c, i) => h('tr', { style: c.isPlayer ? { fontWeight: '800', background: '#fff7d6' } : undefined },
        h('td', null, i + 1), h('td', null, h('span', { class: 'swatch', style: { background: c.color, marginRight: '4px' } }), c.name),
        h('td', { class: 'n' }, s.stores.filter((x) => x.company === c.id).length), h('td', { class: 'n' }, formatYen(c.marketCap)))))));
  // ライバル企業と買収
  const rivals = s.companies.filter((c) => !c.isPlayer && !c.bankrupt);
  body.push(h('div', { class: 'card' }, h('h3', null, icon('acquire'), 'ライバル企業と買収'),
    h('div', { class: 'small muted' }, `株を${pct(ACQUISITION.shareStep)}ずつ買い進め、${pct(ACQUISITION.controlShare)}を超えると会社ごと（店とブランドすべて）手に入ります。店を1つずつ買うときは、街で店をタップします。`),
    h('div', { class: 'list' }, ...rivals.map((c) => rivalRow(g, c)))));
  const fallen = s.companies.filter((c) => !c.isPlayer && c.bankrupt);
  if (fallen.length) body.push(h('div', { class: 'small muted' }, `いなくなった会社：${fallen.map((c) => c.name).join('、')}`));
  return { title: '市場', icon: 'market', body };
}

function rivalRow(g: Game, c: Company) {
  const s = g.s;
  const n = s.stores.filter((x) => x.company === c.id).length;
  const price = A.sharePrice(s, c.id);
  return h('div', { class: 'item' }, h('span', { class: 'swatch', style: { background: c.color, width: '18px', height: '18px' } }),
    h('div', { class: 'grow' }, h('div', { class: 't' }, c.name, ' ', h('span', { class: 'chip' }, PERSONALITIES[c.personality ?? 'steady'].name)),
      h('div', { class: 's' }, `店 ${n}・時価総額 ${formatYen(c.marketCap)}・持ち株 ${pct(c.playerShares)}`)),
    btn('株を買う', () => confirmThen(g, `${c.name}の株を${pct(ACQUISITION.shareStep)}、${formatYen(price)}で買いますか？`, () => g.act((x) => A.buyShares(x, c.id), 'bigBuy')), { sub: formatYen(price) }));
}

// ======================================================================= 財務タブ

export const financeState = { borrowQuarters: 4 };

export function financeTab(g: Game): PanelContent {
  const s = g.s;
  const c = s.companies[0];
  const body: (Node | null)[] = [];
  const debt = debtOf(s, c);
  const limit = creditLimit(s);
  body.push(h('div', { class: 'kpis' },
    kpi('資金', formatYen(c.cash), c.cash < 0 ? 'bad' : ''),
    kpi('借金', formatYen(debt)),
    kpi('時価総額', formatYen(c.marketCap)),
    kpi('30日の売上', formatYen(recent(c.dailyRevenue, 30))),
    kpi('30日の利益', formatSigned(recent(c.dailyProfit, 30)), recent(c.dailyProfit, 30) >= 0 ? 'good' : 'bad'),
    kpi('累計売上', formatYen(c.cumulativeSales))));
  // 次の支払い
  const due = s.loans.map((l) => ({ l, p: loanPayment(l) })).sort((a, b) => a.l.nextDueDay - b.l.nextDueDay);
  body.push(h('div', { class: 'card' }, h('h3', null, icon('loan'), '借入'),
    due.length === 0 ? h('div', { class: 'muted' }, '借金はありません') : null,
    h('div', { class: 'list' }, ...due.map(({ l, p }) => {
      const dc = clock(l.nextDueDay);
      return h('div', { class: 'item' }, h('div', { class: 'grow' },
        h('div', { class: 't' }, l.name, l.graceUntil !== null ? h('span', { class: 'chip bad', style: { marginLeft: '6px' } }, '延滞中') : null),
        h('div', { class: 's' }, `残り ${formatYen(l.remaining)}・年利 ${(l.annualRate * 100).toFixed(1)}%・あと${l.quartersLeft}回`),
        h('div', { class: `s ${l.graceUntil !== null ? 'bad' : ''}` }, l.graceUntil !== null
          ? `猶予の期限まで ${realDuration(l.graceUntil - s.day)}。払えないと倒産します`
          : `次の返済：${dc.year}年${dc.month}月${dc.date}日（あと${realDuration(l.nextDueDay - s.day)}） ${formatYen(p.principal + p.interest)}`)),
        btn('全額返す', () => confirmThen(g, `「${l.name}」の残り ${formatYen(l.remaining)} を返しますか？`, () => g.act((x) => A.repay(x, l.id, l.remaining), 'buy')), { cls: 'ghost', disabled: c.cash < l.remaining }));
    }))));
  // 借りる
  const presets = [0.25, 0.5, 1].map((f) => Math.floor((limit * f) / 1_000_000) * 1_000_000).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  body.push(h('div', { class: 'card' }, h('h3', null, icon('finance'), '銀行から借りる'),
    h('div', { class: 'small muted' }, `借りられる額 ${formatYen(limit)}・年利 ${(loanRate(s) * 100).toFixed(1)}%・四半期ごと（現実で約${Math.round(TIME.daysPerQuarter / 24)}日ごと）に分割で返します。返せないと延滞になり、猶予の${FINANCE.graceDays}日を過ぎると倒産します。`),
    h('div', { class: 'row' }, ...FINANCE.loanQuarters.map((q) => btn(`${q / 4}年で返す`, () => { financeState.borrowQuarters = q; g.onUpdate(); }, { cls: financeState.borrowQuarters === q ? 'on' : 'ghost' }))),
    h('div', { class: 'row' }, ...presets.map((v) => btn(formatYen(v), () => confirmThen(g, `${formatYen(v)}を${financeState.borrowQuarters / 4}年で借りますか？`, () => g.act((x) => A.borrow(x, v, financeState.borrowQuarters), 'bigBuy')))),
      presets.length === 0 ? h('span', { class: 'muted' }, '今は借りられません') : null)));
  // 上場
  const ratio = c.marketCap / FINANCE.ipoMarketCap;
  body.push(h('div', { class: 'card' }, h('h3', null, icon('trophy'), '上場'),
    s.ipo.done
      ? h('div', { class: 'good' }, `上場済み（${clock(s.ipo.day ?? 0).year}年${clock(s.ipo.day ?? 0).month}月）。全業種のシェア1位と、時価総額ランキング1位を目指しましょう。`)
      : h('div', null, h('div', { class: 'small muted' }, `時価総額が ${formatYen(FINANCE.ipoMarketCap)} を超えると上場できます。上場すると時価総額の${pct(FINANCE.ipoFloat)}分の資金が入ります。`),
        h('div', { class: 'row' }, bar(ratio, `${pct(Math.min(1, ratio))}`)),
        h('div', { class: 'row' }, btn([icon('trophy'), '上場する'], () => confirmThen(g, '上場しますか？', () => g.act((x) => A.ipo(x), 'complete')), { disabled: ratio < 1 })))));
  // 決算
  body.push(h('div', { class: 'card' }, h('h3', null, icon('chart'), '四半期の決算'),
    s.reports.length === 0 ? h('div', { class: 'muted' }, `最初の決算は ${clock(nextQuarterDay(s.day)).month}月1日です`) : null,
    s.reports.length ? reportChart(s) : null,
    s.reports.length ? h('table', { class: 't' }, h('tr', null, h('th', null, '期'), h('th', { class: 'n' }, '売上'), h('th', { class: 'n' }, '利益'), h('th', { class: 'n' }, '時価総額'), h('th', { class: 'n' }, 'シェア')),
      ...s.reports.slice(-8).reverse().map((r) => h('tr', null, h('td', null, `第${r.quarter}期`), h('td', { class: 'n' }, formatYen(r.revenue)),
        h('td', { class: `n ${r.profit >= 0 ? 'good' : 'bad'}` }, formatYen(r.profit)), h('td', { class: 'n' }, formatYen(r.marketCap)),
        h('td', { class: 'n' }, `${r.share.food !== undefined ? '飲' + pct(r.share.food) : ''} ${r.share.retail !== undefined ? '小' + pct(r.share.retail) : ''}`))))
      : null));
  return { title: '財務', icon: 'finance', body };
}

function reportChart(s: GameState) {
  const reps = s.reports.slice(-8);
  const ns = 'http://www.w3.org/2000/svg';
  const W = 320;
  const H = 150;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const max = Math.max(1, ...reps.map((r) => r.revenue));
  const minP = Math.min(0, ...reps.map((r) => r.profit));
  const range = max - minP;
  const y = (v: number) => pad.t + ((max - v) / range) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / reps.length;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const mk = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.append(e);
    return e;
  };
  mk('line', { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), stroke: '#c8d6e5', 'stroke-width': 1 });
  reps.forEach((r, i) => {
    const x = pad.l + i * bw;
    mk('rect', { x: x + bw * 0.12, width: bw * 0.36, y: y(r.revenue), height: Math.max(1, y(0) - y(r.revenue)), fill: '#519ee6', rx: 3 });
    const py = r.profit >= 0 ? y(r.profit) : y(0);
    mk('rect', { x: x + bw * 0.52, width: bw * 0.36, y: py, height: Math.max(1, Math.abs(y(r.profit) - y(0))), fill: r.profit >= 0 ? '#2e9d5b' : '#d4513d', rx: 3 });
    const t = mk('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#5f7189' });
    t.textContent = `第${r.quarter}期`;
  });
  // シェアの推移（折れ線）
  const pts = reps.map((r, i) => `${pad.l + i * bw + bw / 2},${pad.t + (1 - (r.share.food ?? 0)) * (H - pad.t - pad.b)}`).join(' ');
  mk('polyline', { points: pts, fill: 'none', stroke: '#f2a13b', 'stroke-width': 2.5 });
  const wrap = h('div', { class: 'chart' });
  wrap.append(svg);
  return h('div', null, wrap, h('div', { class: 'legend' },
    h('span', null, h('i', { class: 'swatch', style: { background: '#519ee6' } }), '売上'),
    h('span', null, h('i', { class: 'swatch', style: { background: '#2e9d5b' } }), '利益'),
    h('span', null, h('i', { class: 'swatch', style: { background: '#f2a13b' } }), '飲食シェア')));
}

export { productById };
