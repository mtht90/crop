import { fmt, fmtRate, fmtTime, setNotation } from '../core/format';
import type { Game } from '../core/game';
import { saveToStorage } from '../core/save';
import type { LayerId } from '../core/state';
import { ACH_MAP } from '../data/achievements';
import { CHALLENGE_MAP } from '../data/challenges';
import { pickNews } from '../data/news';
import { RESEARCH_MAP } from '../data/research';
import { BUFF_INFO, COMET_LIFETIME, catchComet } from '../logic/comets';
import { clickValue, doClick } from '../logic/economy';
import { applyOffline, type OfflineReport } from '../logic/offline';
import { LAYER_INFO, layerCurrency, layerUnlocked } from '../logic/prestige';
import { challengeGoal } from '../logic/challenges';
import { h, setClass, setShown, setText } from './dom';
import { floatText, initFx, modal, spawnComet, toast } from './fx';
import { startStarfield } from './starfield';
import { achievementsTab } from './tabs/achievements';
import { automationTab } from './tabs/automation';
import { buildingsTab } from './tabs/buildings';
import { challengesTab } from './tabs/challenges';
import { expeditionsTab } from './tabs/expeditions';
import { prestigeTab } from './tabs/prestige';
import { researchTab } from './tabs/research';
import { settingsTab } from './tabs/settings';
import { statsTab } from './tabs/stats';
import type { Tab } from './tabs/tab';
import { upgradesTab } from './tabs/upgrades';

const TABS: Tab[] = [
  buildingsTab,
  upgradesTab,
  researchTab,
  expeditionsTab,
  prestigeTab('sn'),
  prestigeTab('galaxy'),
  prestigeTab('crunch'),
  prestigeTab('mv'),
  challengesTab,
  automationTab,
  achievementsTab,
  statsTab,
  settingsTab,
];

const TICK_MS = 50;
const UI_MS = 100;

export function showOfflineReport(g: Game, rep: OfflineReport): void {
  if (!g.s.settings.offlinePopup) {
    toast(`おかえりなさい! 放置中に星屑 +${fmt(rep.gained)}`, 'good', 6000);
    return;
  }
  const lines = [
    `離れていた時間: ${fmtTime(rep.seconds)}`,
    `放置効率 ${(rep.efficiency * 100).toFixed(0)}% × ${fmtTime(rep.effectiveSeconds)}${rep.effectiveSeconds < rep.seconds ? ' (上限)' : ''}`,
    `獲得した星屑: ${fmt(rep.gained)}`,
  ];
  if (rep.researchDone > 0) lines.push(`完了した研究: ${rep.researchDone} 件`);
  void modal({ title: '🌙 おかえりなさい', body: lines.join('\n'), ok: '受け取る', cancel: null });
}

export function mountApp(root: HTMLElement, g: Game): void {
  const canvas = h('canvas', { class: 'starfield', attrs: { 'aria-hidden': 'true' } });
  root.append(canvas);
  startStarfield(canvas, () => g.s.settings.lowFx);
  initFx(document.body);

  // ---- ヘッダー ----
  const title = h('h1', { class: 'title', text: '星海開拓記' });
  title.addEventListener('click', () => g.flags.add('title'));
  const dustEl = h('div', { class: 'dust' });
  const spsEl = h('div', { class: 'sps' });
  const chips: Array<{ layer: LayerId; el: HTMLElement; val: HTMLElement }> = [];
  const chipRow = h('div', { class: 'cur-chips' });
  for (const layer of ['sn', 'galaxy', 'crunch', 'mv'] as LayerId[]) {
    const val = h('span');
    const el = h('span', { class: `cur-chip chip-${layer}`, title: LAYER_INFO[layer].currency }, h('span', { text: LAYER_INFO[layer].icon }), val);
    chips.push({ layer, el, val });
    chipRow.append(el);
  }
  const header = h('header', { class: 'header' }, h('div', { class: 'brand' }, title, h('div', { class: 'subtitle', text: 'Stellar Frontier' })), h('div', { class: 'wallet' }, dustEl, spsEl), chipRow);

  // ---- 左: 星 ----
  const star = h('button', { class: 'star', attrs: { type: 'button', 'aria-label': '星をクリックして星屑を集める' } }, h('span', { class: 'star-glow' }), h('span', { class: 'star-core' }));
  const clickEl = h('div', { class: 'click-val' });
  const buffsEl = h('div', { class: 'buffs' });
  const challengeEl = h('div', { class: 'challenge-banner' });
  const newsEl = h('div', { class: 'news' });
  star.addEventListener('click', (e) => {
    const v = doClick(g);
    star.classList.remove('pulse');
    void star.offsetWidth;
    star.classList.add('pulse');
    if (g.s.settings.floatingText && v.gt(0)) {
      const x = e.clientX || star.getBoundingClientRect().left + star.offsetWidth / 2;
      const y = e.clientY || star.getBoundingClientRect().top + star.offsetHeight / 2;
      floatText(x, y, `+${fmt(v)}`);
    }
  });
  const left = h('section', { class: 'left' }, challengeEl, h('div', { class: 'star-wrap' }, star), clickEl, buffsEl, newsEl);

  // ---- 右: タブ ----
  const nav = h('nav', { class: 'tabs', attrs: { role: 'tablist' } });
  const content = h('div', { class: 'tab-content' });
  const tabBtns = new Map<string, HTMLButtonElement>();
  let active: Tab = TABS[0];
  const open = (tab: Tab) => {
    active = tab;
    content.innerHTML = '';
    tab.mount(content, g);
    tab.update(g);
    for (const [id, b] of tabBtns) setClass(b, 'active', id === tab.id);
  };
  for (const tab of TABS) {
    const b = h('button', { class: 'tab', attrs: { role: 'tab', type: 'button' } }, h('span', { class: 'tab-icon', text: tab.icon }), h('span', { class: 'tab-label', text: tab.label }), h('span', { class: 'badge' }));
    b.addEventListener('click', () => open(tab));
    tabBtns.set(tab.id, b);
    nav.append(b);
  }
  const right = h('section', { class: 'right' }, nav, content);
  root.append(header, h('main', { class: 'layout' }, left, right));
  open(TABS[0]);

  // ---- ゲームイベント ----
  // 実績は一度に大量に解除されることがあるので、まとめて 1 つの通知にする
  let achQueue: string[] = [];
  const flushAch = () => {
    const names = achQueue.map((id) => ACH_MAP.get(id)?.name ?? id);
    achQueue = [];
    if (names.length === 1) toast(`🏅 実績解除: ${names[0]}`, 'ach');
    else if (names.length > 1) toast(`🏅 実績を ${names.length} 個解除: ${names.slice(0, 3).join('、')}${names.length > 3 ? ' ほか' : ''}`, 'ach', 5000);
  };
  g.events.on((e) => {
    switch (e.type) {
      case 'achievement': {
        if (achQueue.length === 0) window.setTimeout(flushAch, 300);
        achQueue.push(e.id);
        break;
      }
      case 'research-done': {
        const r = RESEARCH_MAP.get(e.id);
        if (r) toast(`🔬 研究完了: ${r.name}`, 'good');
        break;
      }
      case 'expedition-done':
        toast(e.text, 'good', 7000);
        break;
      case 'challenge-done': {
        const c = CHALLENGE_MAP.get(e.id);
        if (c) toast(`🏆 チャレンジ達成: ${c.name} (${e.comp}段階目)`, 'good', 7000);
        break;
      }
      case 'comet-spawn':
        spawnComet(COMET_LIFETIME, (x, y) => {
          const text = catchComet(g);
          floatText(x, y, '☄️', 'big');
          toast(text, 'good', 6000);
        });
        break;
      case 'reset':
        setNotation(g.s.settings.notation);
        open(TABS.find((t) => t.visible(g)) ?? TABS[0]);
        break;
      case 'prestige':
        if (!active.visible(g)) open(TABS[0]);
        break;
      default:
        break;
    }
  });

  // ---- ループ ----
  window.setInterval(() => {
    if (!g.tick()) {
      const rep = applyOffline(g, 0);
      if (rep) showOfflineReport(g, rep);
    }
  }, TICK_MS);

  let lastUi = 0;
  const stage = () => (g.s.stats.mvTotal > 0 ? 4 : g.s.stats.crunchTotal > 0 ? 3 : g.s.stats.galaxyTotal > 0 ? 2 : g.s.stats.snTotal > 0 ? 1 : 0);
  const uiFrame = (t: number) => {
    if (t - lastUi >= UI_MS) {
      lastUi = t;
      setText(dustEl, `${fmt(g.s.stardust)} 星屑`);
      const buff = g.prodBuffMult();
      setText(spsEl, `毎秒 ${fmtRate(g.effectiveSps())}${buff > 1 ? ` (×${buff.toFixed(1)})` : ''}`);
      for (const c of chips) {
        const shown = layerUnlocked(g, c.layer) || layerCurrency(g, c.layer).gt(0);
        setShown(c.el, shown);
        if (shown) setText(c.val, fmt(layerCurrency(g, c.layer)));
      }
      setText(clickEl, g.mods.noClick ? 'クリック封印中' : `1クリック +${fmt(clickValue(g))}`);
      const now = g.now();
      const buffText = g.s.buffs
        .filter((b) => b.end > now)
        .map((b) => `${BUFF_INFO[b.id]?.icon ?? ''} ${BUFF_INFO[b.id]?.name ?? b.id} ${fmtTime((b.end - now) / 1000)}`)
        .join('\n');
      setText(buffsEl, buffText);
      const ch = g.s.challenges.active ? CHALLENGE_MAP.get(g.s.challenges.active) : undefined;
      setShown(challengeEl, !!ch);
      if (ch) setText(challengeEl, `${ch.icon} チャレンジ中: ${ch.name} — 目標 ${fmt(challengeGoal(g, ch))}`);
      star.dataset.stage = String(stage());
      for (const tab of TABS) {
        const b = tabBtns.get(tab.id)!;
        const vis = tab.visible(g);
        setShown(b, vis);
        if (vis) setClass(b, 'has-badge', tab !== active && !!tab.badge?.(g));
      }
      if (!active.visible(g)) open(TABS[0]);
      active.update(g);
    }
    requestAnimationFrame(uiFrame);
  };
  requestAnimationFrame(uiFrame);

  // ---- ニュース ----
  const showNews = () => {
    newsEl.classList.remove('news-in');
    void newsEl.offsetWidth;
    setText(newsEl, pickNews(g));
    newsEl.classList.add('news-in');
    g.newsCount++;
  };
  showNews();
  window.setInterval(() => {
    if (!document.hidden) showNews();
  }, 15000);

  // ---- セーブ ----
  let lastSave = Date.now();
  const save = () => {
    lastSave = Date.now();
    saveToStorage(g.s);
  };
  window.setInterval(() => {
    if (Date.now() - lastSave >= g.s.settings.autosaveSec * 1000) save();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    g.visible = !document.hidden;
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
      toast('セーブしました', 'good');
    }
  });
}
