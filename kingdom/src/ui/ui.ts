import { ACHIEVEMENTS, BUILDINGS, JOBS, PERKS, PRESTIGE_MIN_GOLD, RESEARCH, RES_NAME, RIVALS, UNITS, type Cost, type Res } from '../core/data';
import { fmt, fmtRate, fmtTime } from '../core/format';
import type { Battle, Game, OfflineReport } from '../core/sim';

const UI = `${import.meta.env.BASE_URL}assets/sprites/`;
const RES_ICON: Record<Res, string> = { gold: 'ui/icons/icon_03', wood: 'ui/icons/icon_02', meat: 'ui/icons/icon_04' };
const avatar = (n: number) => `${UI}ui/avatars/avatars_${String(n).padStart(2, '0')}.png`;
const img = (p: string) => `${UI}${p}.png`;

type TabId = 'jobs' | 'build' | 'research' | 'army' | 'war' | 'crown';
const TABS: { id: TabId; name: string }[] = [
  { id: 'jobs', name: '人材' },
  { id: 'build', name: '建設' },
  { id: 'research', name: '研究' },
  { id: 'army', name: '兵' },
  { id: 'war', name: '遠征' },
  { id: 'crown', name: '王家' },
];

interface Item {
  key: string;
  icon: string;
  iconClass?: string;
  title: string;
  owned?: string;
  desc: string;
  stat?: string;
  cost?: Cost;
  label?: string;
  can: boolean;
  locked?: boolean;
  onBuy?: () => void;
  extra?: (el: HTMLElement) => void; // per-update hook
  secondary?: { label: string; can: boolean; on: () => void };
  progress?: { v: number; text: string };
  red?: boolean;
}

export interface UiHooks {
  sfx: (k: string, o?: { vol?: number; rate?: number }) => void;
  focusMain: () => void;
  focusWorld: () => void;
  focusRival: (id: string) => void;
  toggleMute: () => boolean;
  getSettings: () => { music: number; sfx: number; ambience: number; muted: boolean };
  setSettings: (s: Partial<{ music: number; sfx: number; ambience: number; muted: boolean }>) => void;
  exportSave: () => string;
  importSave: (s: string) => boolean;
  hardReset: () => void;
  skipTrack: () => void;
  beforePrestige: () => void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

function costHtml(g: Game, c: Cost | undefined) {
  if (!c) return '';
  return (['gold', 'wood', 'meat'] as Res[])
    .filter((r) => c[r])
    .map((r) => `<span class="${g.s.res[r] + 1e-9 < c[r]! ? 'no' : ''}"><img src="${img(RES_ICON[r])}" alt="${RES_NAME[r]}">${fmt(c[r]!)}</span>`)
    .join('');
}

export class Ui {
  g: Game;
  hooks: UiHooks;
  tab: TabId = 'jobs';
  amount: 1 | 10 | 'max' = 1;
  private nodes = new Map<string, HTMLElement>();
  private content!: HTMLElement;
  private tabsEl!: HTMLElement;
  private chips: Record<string, HTMLElement> = {};
  private heat!: HTMLElement;
  private frenzyEl!: HTMLElement;
  private advisor!: HTMLElement;
  private modalRoot!: HTMLElement;
  private toasts!: HTMLElement;
  private nowPlaying!: HTMLElement;
  private lastGold = 0;
  private seenTabs = new Set<TabId>(['jobs']);
  mineScreen: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  modalOpen = false;

  constructor(g: Game, hooks: UiHooks) {
    this.g = g;
    this.hooks = hooks;
  }

  mount() {
    const root = document.body;
    // HUD
    const hud = h('div');
    hud.id = 'hud';
    const bar = h('div', 'bar frame-wood');
    const chip = (id: string, icon: string, title: string) => {
      const c = h('div', 'chip', `<img src="${icon}" alt=""><div class="stack"><span class="v">0</span><span class="r"></span></div>`);
      c.title = title;
      bar.appendChild(c);
      this.chips[id] = c;
    };
    chip('gold', img(RES_ICON.gold), '金貨');
    chip('wood', img(RES_ICON.wood), '木材');
    chip('meat', img(RES_ICON.meat), '肉');
    chip('pop', avatar(5), '住民（作業員の数 / 住める人数）');
    chip('army', img('ui/icons/icon_05'), '軍事力');
    chip('crown', avatar(11), '王冠（永続ボーナス）');
    hud.appendChild(bar);
    root.appendChild(hud);

    this.frenzyEl = h('div');
    this.frenzyEl.id = 'frenzy';
    root.appendChild(this.frenzyEl);

    // panel
    const panel = h('div', 'frame-banner');
    panel.id = 'panel';
    const scroll = h('div', 'scroll');
    this.tabsEl = h('div');
    this.tabsEl.id = 'tabs';
    this.content = h('div');
    this.content.id = 'content';
    scroll.append(this.tabsEl, this.content);
    panel.appendChild(scroll);
    root.appendChild(panel);

    // dock
    const dock = h('div');
    dock.id = 'dock';
    const round = (icon: string, tip: string, on: (b: HTMLButtonElement) => void, red = false) => {
      const b = h('button', 'round' + (red ? ' red' : ''), `<img src="${img(icon)}" alt=""><span class="tip">${tip}</span>`) as HTMLButtonElement;
      b.addEventListener('click', () => {
        this.hooks.sfx('click');
        on(b);
      });
      dock.appendChild(b);
      return b;
    };
    round('ui/icons/icon_10', '設定', () => this.openSettings());
    round('ui/icons/icon_11', '実績・記録', () => this.openAchievements());
    const mute = round('ui/icons/icon_12', '音のオン/オフ', (b) => b.classList.toggle('off', this.hooks.toggleMute()));
    mute.classList.toggle('off', this.hooks.getSettings().muted);
    round('ui/icons/icon_08', '自分の島へ', () => this.hooks.focusMain());
    round('ui/icons/icon_07', '世界を見渡す', () => this.hooks.focusWorld());
    root.appendChild(dock);

    this.nowPlaying = h('div');
    this.nowPlaying.id = 'nowplaying';
    this.nowPlaying.addEventListener('click', () => this.hooks.skipTrack());
    root.appendChild(this.nowPlaying);

    this.heat = h('div', '', `<div class="lbl">熱気 ×1.0</div><div class="bar-wrap"><div class="fill" style="width:0%"></div></div>`);
    this.heat.id = 'heat';
    root.appendChild(this.heat);

    this.toasts = h('div');
    this.toasts.id = 'toasts';
    root.appendChild(this.toasts);

    this.advisor = h('div');
    this.advisor.id = 'advisor';
    root.appendChild(this.advisor);

    this.modalRoot = h('div');
    this.modalRoot.id = 'modal-root';
    this.modalRoot.addEventListener('pointerdown', (e) => {
      if (e.target === this.modalRoot && this.modalRoot.dataset.dismiss === '1') this.closeModal();
    });
    root.appendChild(this.modalRoot);

    this.renderTabs();
    this.renderContent(true);
  }

  // ------------------------------------------------------------ tabs
  private tabUnlocked(id: TabId) {
    const s = this.g.s;
    switch (id) {
      case 'jobs': case 'build': return true;
      case 'research': return this.g.researchAvailable().length > 0 || s.research.length > 0;
      case 'army': return s.buildings.house >= 3 || s.buildings.barracks > 0;
      case 'war': return s.buildings.barracks > 0;
      case 'crown': return s.reignGold >= PRESTIGE_MIN_GOLD * 0.1 || s.crownsTotal > 0;
    }
  }
  private tabBadge(id: TabId): number {
    const g = this.g;
    switch (id) {
      case 'research': return g.researchAvailable().filter((r) => g.canAfford(r.cost)).length;
      case 'build': return BUILDINGS.filter((b) => b.unlock(g.unlockCtx()) && g.buildingAvailable(b) && g.canAfford(g.buildingCost(b))).length;
      case 'crown': return g.crownsOnPrestige() > 0 || PERKS.some((p) => !g.hasPerk(p.id) && g.s.crownsTotal - g.s.crownsSpent >= p.cost) ? 1 : 0;
      case 'war': return RIVALS.some((r) => g.rivalUnlocked(r) && g.s.forts[r.id] < 5 && g.winChance(g.d.armyPower, g.fortRequirement(r, g.s.forts[r.id])) >= 0.95) ? 1 : 0;
      default: return 0;
    }
  }
  renderTabs() {
    this.tabsEl.innerHTML = '';
    for (const t of TABS) {
      if (!this.tabUnlocked(t.id)) continue;
      const b = h('button', 'tab' + (t.id === this.tab ? ' active' : ''), `<span>${t.name}</span>`);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        if (this.tab === t.id) return;
        this.tab = t.id;
        this.seenTabs.add(t.id);
        this.hooks.sfx(`page${1 + ((Math.random() * 3) | 0)}`, { vol: 0.8 });
        this.renderTabs();
        this.renderContent(true);
      });
      this.tabsEl.appendChild(b);
    }
  }
  private updateTabs() {
    const want = TABS.filter((t) => this.tabUnlocked(t.id)).map((t) => t.id).join(',');
    const have = [...this.tabsEl.children].map((c) => (c as HTMLElement).dataset.tab).join(',');
    if (want !== have) {
      const newly = TABS.filter((t) => this.tabUnlocked(t.id) && !have.split(',').includes(t.id));
      this.renderTabs();
      for (const t of newly) if (have) this.toast(`「${t.name}」が開放されました`, 'yellow');
    }
    for (const el of this.tabsEl.children) {
      const id = (el as HTMLElement).dataset.tab as TabId;
      const n = id === this.tab ? 0 : this.tabBadge(id);
      let b = el.querySelector('.badge') as HTMLElement | null;
      if (n > 0) {
        if (!b) {
          b = h('span', 'badge');
          el.appendChild(b);
        }
        b.textContent = id === 'crown' || id === 'war' ? '!' : String(n);
      } else b?.remove();
    }
  }

  // ------------------------------------------------------------ content items
  private amountFor(maxN: number) {
    return this.amount === 'max' ? Math.max(1, maxN) : this.amount;
  }

  private items(): { head?: string; amount?: boolean; items: Item[]; foot?: string } {
    const g = this.g;
    const s = g.s;
    const ctx = g.unlockCtx();
    switch (this.tab) {
      case 'jobs': {
        const items: Item[] = [];
        const room = g.d.popCap - g.d.pawns;
        for (const j of JOBS) {
          if (!j.unlock(ctx)) {
            items.push({ key: 'lock-' + j.id, icon: `sheet:units/blue/pawn_idle_${JOB_TOOL[j.id]}:8`, title: '？？？', desc: lockHint(j.id), can: false, locked: true });
            break;
          }
          const n = this.amountFor(g.jobMax(j));
          const cost = g.jobCost(j, n);
          const rate = g.d.jobRate[j.id];
          items.push({
            key: j.id, icon: `sheet:units/blue/pawn_idle_${JOB_TOOL[j.id]}:8`, title: j.name, owned: String(s.jobs[j.id]), desc: j.desc,
            stat: j.produces ? `1人 ${fmtRate(rate)}/秒 ・ 合計 ${fmtRate(rate * s.jobs[j.id])}/秒` : `建設速度 ×${g.d.buildSpeed.toFixed(1)}`,
            cost, label: n > 1 ? `雇う ×${n}` : '雇う', can: room >= n && g.canAfford(cost),
            onBuy: () => g.hire(j.id, n),
            secondary: { label: '－', can: s.jobs[j.id] > 0, on: () => g.fire(j.id, 1) },
          });
        }
        const head = `<span>住民 <b>${g.d.pawns} / ${g.d.popCap}</b></span>`;
        const foot = room <= 0 ? '住める人数がいっぱいです。<span class="hl">「建設」で家を建てましょう</span>。' : '';
        return { head, amount: true, items, foot };
      }
      case 'build': {
        const items: Item[] = [];
        for (const c of s.constructions) {
          const b = BUILDINGS.find((x) => x.id === c.building)!;
          const left = ((1 - c.progress) * c.time) / g.d.buildSpeed;
          items.push({ key: 'con-' + c.id, icon: img(`buildings/blue/${b.id === 'house' ? 'house1' : b.id}`), iconClass: 'wide',
            title: `${b.name}を建設中`, desc: `大工が増えるほど早く完成します。`, can: false,
            progress: { v: c.progress, text: `残り ${fmtTime(left)}` } });
        }
        let lockedShown = false;
        for (const b of BUILDINGS) {
          if (!b.unlock(ctx)) {
            if (!lockedShown) items.push({ key: 'lock-' + b.id, icon: img(`buildings/blue/${b.id === 'house' ? 'house1' : b.id}`), iconClass: 'wide',
              title: '？？？', desc: '王国が育つと建てられるようになります。', can: false, locked: true });
            lockedShown = true;
            continue;
          }
          const avail = g.buildingAvailable(b);
          const cost = avail ? g.buildingCost(b) : undefined;
          items.push({
            key: b.id, icon: img(`buildings/blue/${b.id === 'house' ? 'house2' : b.id}`), iconClass: 'wide', title: b.name,
            owned: b.max > 1 ? `${s.buildings[b.id]}/${b.max}` : s.buildings[b.id] ? '済' : '', desc: b.desc,
            stat: `建設時間 ${fmtTime(b.time / g.d.buildSpeed)}`,
            cost, label: avail ? '建てる' : '完成', can: avail && g.canAfford(cost!), onBuy: () => g.build(b.id),
          });
        }
        return { head: `<span>建物は島に建ちます。<b>大工</b>がいると早く完成。</span>`, items };
      }
      case 'research': {
        const avail = g.researchAvailable().sort((a, b) => costValue(a.cost) - costValue(b.cost));
        const items: Item[] = avail.map((r) => ({
          key: r.id, icon: img(r.icon), title: r.name, desc: r.desc, cost: r.cost, label: '研究', can: g.canAfford(r.cost), onBuy: () => g.doResearch(r.id),
        }));
        const head = `<span>研究済み <b>${s.research.length} / ${RESEARCH.length}</b></span>`;
        return { head, items, foot: items.length ? '' : '今は研究できるものがありません。作業員や建物を増やすと新しい研究が現れます。' };
      }
      case 'army': {
        const items: Item[] = [];
        for (const u of UNITS) {
          const ok = s.buildings[u.requires] > 0;
          const reqName = BUILDINGS.find((b) => b.id === u.requires)!.name;
          if (!ok) {
            items.push({ key: 'lock-' + u.id, icon: `sheet:units/blue/${u.id}_idle:${UNIT_FRAMES[u.id]}`, iconClass: u.id === 'lancer' ? 'lancer' : '', title: u.name, desc: `${reqName}が必要です。`, can: false, locked: true });
            continue;
          }
          const n = this.amountFor(g.unitMax(u));
          const cost = g.unitCost(u, n);
          items.push({ key: u.id, icon: `sheet:units/blue/${u.id}_idle:${UNIT_FRAMES[u.id]}`, iconClass: u.id === 'lancer' ? 'lancer' : '', title: u.name, owned: String(s.units[u.id]), desc: u.desc,
            stat: u.power ? `戦力 ${fmt(u.power * g.d.armyMult)} / 人` : '', cost, label: n > 1 ? `訓練 ×${n}` : '訓練', can: g.canAfford(cost), onBuy: () => g.train(u.id, n) });
        }
        return { head: `<span>軍事力 <b>${fmt(g.d.armyPower)}</b>（倍率 ×${g.d.armyMult.toFixed(2)}）</span>`, amount: true, items };
      }
      case 'war': {
        const items: Item[] = [];
        for (const r of RIVALS) {
          const done = g.rivalDone(r.id);
          const unlocked = g.rivalUnlocked(r);
          const fort = s.forts[r.id];
          if (!unlocked) {
            items.push({ key: r.id, icon: avatar(r.ruler), title: r.name, desc: '前の国を制圧すると攻め込めます。', can: false, locked: true });
            continue;
          }
          const req = done ? 0 : g.fortRequirement(r, fort);
          const ch = done ? 1 : g.winChance(g.d.armyPower, req);
          const fighting = g.battle?.rival.id === r.id;
          items.push({
            key: r.id, icon: avatar(r.ruler), title: r.name,
            desc: done ? `制圧済み。<span class="good">${r.bonusDesc}</span>` : `次の拠点: <b>${r.forts[fort]}</b>　必要な軍事力の目安 <b>${fmt(req)}</b><br>制圧ボーナス: ${r.bonusDesc}`,
            stat: done ? '' : `勝率 ${Math.round(ch * 100)}%`,
            label: fighting ? '交戦中…' : done ? '制圧済' : '出陣', can: !done && !g.battle && g.d.armyPower > 0,
            red: true,
            onBuy: () => g.startBattle(r.id),
            secondary: { label: '見る', can: true, on: () => this.hooks.focusRival(r.id) },
            extra: (el) => {
              let pips = el.querySelector('.pips');
              if (!pips) {
                pips = h('div', 'pips');
                el.querySelector('.card-body')!.appendChild(pips);
              }
              pips.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="pip ${i < fort ? 'on' : ''}"></i>`).join('');
              const st = el.querySelector('.card-stat') as HTMLElement;
              if (st) st.style.color = ch >= 0.8 ? '#2f6b2f' : ch >= 0.4 ? '#9a6a12' : '#b13a22';
            },
          });
        }
        const head = `<span>軍事力 <b>${fmt(g.d.armyPower)}</b>　攻略した拠点 <b>${g.fortsTotal}</b>（全生産 +${g.fortsTotal * 10}%）</span>`;
        return { head, items, foot: '勝つと金貨・木材と、拠点ごとに全生産 +10% を得ます。負けると兵の一部を失います。' };
      }
      case 'crown': {
        const items: Item[] = [];
        const crowns = g.crownsOnPrestige();
        const unspent = s.crownsTotal - s.crownsSpent;
        items.push({
          key: 'prestige', icon: avatar(11), title: `王位継承（${s.kingName}代目 → ${s.kingName + 1}代目）`,
          desc: crowns > 0
            ? `いま継承すると <b class="hl">王冠 ${crowns} 個</b>を得ます。王国は最初からやり直しになりますが、王冠1個につき全生産と軍事力が <b>+${g.hasPerk('dynasty') ? 15 : 10}%</b> されます。`
            : `この治世で金貨を <b>${fmt(PRESTIGE_MIN_GOLD)}</b> 枚稼ぐと継承できます（あと ${fmt(Math.max(0, PRESTIGE_MIN_GOLD - s.reignGold))} 枚）。`,
          stat: `この治世の金貨 ${fmt(s.reignGold)} 枚`,
          label: '継承する', can: crowns > 0, red: true, onBuy: () => this.confirmPrestige(),
        });
        for (const p of PERKS) {
          const has = g.hasPerk(p.id);
          items.push({
            key: p.id, icon: avatar(p.avatar), title: p.name, desc: p.desc, owned: has ? '習得' : '',
            label: has ? '習得済' : `王冠 ${p.cost}`, can: !has && unspent >= p.cost, onBuy: () => g.buyPerk(p.id),
          });
        }
        const head = `<span>王冠 <b>${s.crownsTotal}</b>（未使用 ${unspent}）・ 全生産 +${Math.round(g.d.crownBonus * 100)}%</span>`;
        return { head, items, foot: '王家の遺産は王位を継いでも失われません。' };
      }
    }
  }

  renderContent(rebuild = false) {
    if (rebuild) {
      this.content.innerHTML = '';
      this.nodes.clear();
      this.content.scrollTop = 0;
    }
    const { head, amount, items, foot } = this.items();
    // head
    let headEl = this.content.querySelector('.section-head') as HTMLElement | null;
    if (!headEl) {
      headEl = h('div', 'section-head', '<div class="h"></div>');
      if (amount) {
        const a = h('div', 'amount');
        for (const v of [1, 10, 'max'] as const) {
          const b = h('button', v === this.amount ? 'on' : '', v === 'max' ? '最大' : `×${v}`);
          b.addEventListener('click', () => {
            this.amount = v;
            this.hooks.sfx('select');
            a.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
            b.classList.add('on');
            this.renderContent();
          });
          a.appendChild(b);
        }
        headEl.appendChild(a);
      }
      this.content.prepend(headEl);
    }
    headEl.querySelector('.h')!.innerHTML = head ?? '';
    // items
    const keys = new Set(items.map((i) => i.key));
    for (const [k, el] of this.nodes) {
      if (!keys.has(k)) {
        el.remove();
        this.nodes.delete(k);
      }
    }
    let prev: HTMLElement = headEl;
    for (const it of items) {
      let el = this.nodes.get(it.key);
      if (!el) {
        el = this.createCard(it);
        this.nodes.set(it.key, el);
      }
      if (prev.nextSibling !== el) prev.after(el);
      this.updateCard(el, it);
      prev = el;
    }
    let footEl = this.content.querySelector('.note.foot') as HTMLElement | null;
    if (foot) {
      if (!footEl) footEl = h('div', 'note foot');
      footEl.innerHTML = foot;
      if (prev.nextSibling !== footEl) prev.after(footEl);
    } else footEl?.remove();
  }

  private createCard(it: Item): HTMLElement {
    const el = h('div', 'card');
    el.innerHTML = `<div class="card-icon ${it.iconClass ?? ''}"><img alt=""></div>
      <div class="card-body"><div class="card-title"><span class="t"></span><span class="owned"></span></div><div class="card-desc"></div><div class="card-stat"></div></div>
      <div class="card-actions"></div>`;
    this.setIcon(el, it.icon);
    const actions = el.querySelector('.card-actions')!;
    if (it.onBuy || it.label) {
      const b = h('button', 'btn buy' + (it.red ? ' red' : ''), `<span class="label"></span><span class="cost"></span>`) as HTMLButtonElement;
      b.addEventListener('click', () => {
        const fn = (el as HTMLElement & { _buy?: () => void })._buy;
        if (fn) {
          fn();
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
          this.renderContent();
          this.refreshHud();
        }
      });
      actions.appendChild(b);
    }
    if (it.secondary) {
      const b = h('button', 'btn small', it.secondary.label) as HTMLButtonElement;
      b.addEventListener('click', () => {
        const fn = (el as HTMLElement & { _sec?: () => void })._sec;
        if (fn) {
          fn();
          this.hooks.sfx('click');
          this.renderContent();
        }
      });
      actions.appendChild(b);
    }
    if (it.progress) {
      const p = h('div', 'progress bar-wrap', '<div class="fill"></div><div class="txt"></div>');
      el.appendChild(p);
    }
    return el;
  }

  private setIcon(el: HTMLElement, icon: string) {
    el.dataset.icon = icon;
    const box = el.querySelector('.card-icon') as HTMLElement;
    const im = box.querySelector('img') as HTMLImageElement;
    if (icon.startsWith('sheet:')) {
      const [, path, frames] = icon.split(':');
      im.style.display = 'none';
      let f = box.querySelector('.frame') as HTMLElement | null;
      if (!f) {
        f = h('div', 'frame');
        box.appendChild(f);
      }
      f.style.backgroundImage = `url(${img(path)})`;
      f.style.backgroundSize = `${Number(frames) * 100}% 100%`;
    } else {
      im.style.display = '';
      box.querySelector('.frame')?.remove();
      im.src = icon;
    }
  }

  private updateCard(el: HTMLElement, it: Item) {
    const set = (sel: string, html: string) => {
      const n = el.querySelector(sel) as HTMLElement | null;
      if (n && n.innerHTML !== html) n.innerHTML = html;
    };
    set('.t', it.title);
    set('.owned', it.owned ?? '');
    set('.card-desc', it.desc);
    set('.card-stat', it.stat ?? '');
    el.classList.toggle('locked', !!it.locked);
    if (el.dataset.icon !== it.icon) this.setIcon(el, it.icon);
    const buy = el.querySelector('.btn.buy') as HTMLButtonElement | null;
    if (buy) {
      buy.disabled = !it.can;
      buy.style.display = it.locked ? 'none' : '';
      set('.btn.buy .label', it.label ?? '');
      set('.btn.buy .cost', costHtml(this.g, it.cost));
      (el as HTMLElement & { _buy?: () => void })._buy = it.can ? it.onBuy : () => this.hooks.sfx('error', { vol: 0.6 });
    }
    if (it.secondary) {
      const sb = el.querySelectorAll('.btn.small')[0] as HTMLButtonElement | undefined;
      if (sb) {
        sb.disabled = !it.secondary.can;
        (el as HTMLElement & { _sec?: () => void })._sec = it.secondary.on;
      }
    }
    if (it.progress) {
      (el.querySelector('.progress .fill') as HTMLElement).style.width = `${Math.round(it.progress.v * 100)}%`;
      set('.progress .txt', it.progress.text);
    }
    it.extra?.(el);
  }

  // ------------------------------------------------------------ per-frame / periodic
  refreshHud() {
    const g = this.g;
    const s = g.s;
    const setChip = (id: string, v: string, r: string) => {
      const c = this.chips[id];
      const ve = c.querySelector('.v')!;
      if (ve.textContent !== v) ve.textContent = v;
      const re = c.querySelector('.r')!;
      if (re.textContent !== r) re.textContent = r;
    };
    setChip('gold', fmt(s.res.gold), `+${fmtRate(g.d.rates.gold)}/秒`);
    setChip('wood', fmt(s.res.wood), `+${fmtRate(g.d.rates.wood)}/秒`);
    setChip('meat', fmt(s.res.meat), `+${fmtRate(g.d.rates.meat)}/秒`);
    setChip('pop', `${g.d.pawns}/${g.d.popCap}`, '住民');
    setChip('army', fmt(g.d.armyPower), '軍事力');
    setChip('crown', String(s.crownsTotal), `+${Math.round(g.d.crownBonus * 100)}%`);
    this.chips.wood.style.display = s.jobs.lumberjack > 0 || s.res.wood > 0 ? '' : 'none';
    this.chips.meat.style.display = s.jobs.hunter > 0 || s.res.meat > 0 ? '' : 'none';
    this.chips.army.style.display = s.buildings.barracks > 0 ? '' : 'none';
    this.chips.crown.style.display = s.crownsTotal > 0 ? '' : 'none';
    this.chips.pop.style.display = s.reignGold > 5 ? '' : 'none';
    if (s.res.gold > this.lastGold * 1.5 && s.res.gold - this.lastGold > 100) {
      this.chips.gold.classList.remove('pulse');
      void this.chips.gold.offsetWidth;
      this.chips.gold.classList.add('pulse');
    }
    this.lastGold = s.res.gold;
    // frenzy
    if (g.frenzy) {
      this.frenzyEl.className = 'on';
      this.frenzyEl.innerHTML = `<div class="ribbon yellow"><span>黄金の祭り 生産×7　残り${Math.ceil(s.frenzyUntil - s.time)}秒</span></div>`;
    } else this.frenzyEl.className = '';
  }

  frame() {
    // heat gauge follows the mine
    const p = this.mineScreen();
    const heat = this.g.heat;
    this.heat.style.left = `${p.x}px`;
    this.heat.style.top = `${p.y}px`;
    this.heat.style.opacity = heat > 0.02 ? '1' : '0';
    (this.heat.querySelector('.fill') as HTMLElement).style.width = `${heat * 100}%`;
    const lbl = this.heat.querySelector('.lbl')!;
    const t = `熱気 ×${(1 + heat).toFixed(1)}`;
    if (lbl.textContent !== t) lbl.textContent = t;
  }

  tick() {
    this.refreshHud();
    this.updateTabs();
    this.renderContent();
    this.updateAdvisor();
  }

  // ------------------------------------------------------------ toasts
  toast(text: string, color: 'blue' | 'red' | 'yellow' | 'purple' | 'black' = 'blue', sub?: string) {
    const t = h('div', 'toast', `<div class="ribbon ${color === 'blue' ? '' : color}"><span>${text}</span></div>${sub ? `<div class="sub">${sub}</div>` : ''}`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > (window.innerWidth <= 820 ? 2 : 4)) this.toasts.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, 2600);
  }

  showTrack(title: string) {
    this.nowPlaying.textContent = `♪ ${title} — RandomMind`;
    this.nowPlaying.classList.add('show');
    clearTimeout((this.nowPlaying as HTMLElement & { _t?: number })._t);
    (this.nowPlaying as HTMLElement & { _t?: number })._t = window.setTimeout(() => this.nowPlaying.classList.remove('show'), 5000);
  }

  // ------------------------------------------------------------ advisor (tutorial)
  private advisorSteps: { id: number; when: (g: Game) => boolean; text: string }[] = [
    { id: 1, when: () => true, text: 'ようこそ、陛下。まずは島の東にある<b>金鉱石</b>を叩いて、金貨を集めましょう。続けて叩くと<b>熱気</b>が高まり、稼ぎが増えます。' },
    { id: 2, when: (g) => g.s.reignGold >= 12, text: '金貨がたまりました。<b>「人材」</b>で<b>鉱夫</b>を雇えば、陛下の代わりに掘り続けてくれます。' },
    { id: 3, when: (g) => g.s.jobs.miner >= 3, text: '住める人数には限りがあります。<b>「建設」</b>で<b>家</b>を建てると、もっと人を雇えます。' },
    { id: 4, when: (g) => g.s.reignGold >= 60 && g.s.jobs.lumberjack === 0, text: '<b>木こり</b>を雇いましょう。木材がないと大きな建物は建てられません。' },
    { id: 5, when: (g) => g.researchAvailable().length > 0, text: '<b>「研究」</b>が開けました。道具を良くすれば、同じ人数でも生産が倍になります。' },
    { id: 6, when: (g) => g.s.buildings.barracks > 0, text: '兵舎が完成しました。<b>「兵」</b>で剣士を訓練し、<b>「遠征」</b>で隣国の拠点を攻めましょう。勝つたびに王国全体が豊かになります。' },
    { id: 7, when: (g) => g.crownsOnPrestige() > 0, text: '陛下、<b>王位継承</b>の時が来ました。<b>「王家」</b>で次の王に位を譲ると、王冠が永続の力をもたらします。' },
  ];
  private updateAdvisor() {
    if (this.modalOpen) return;
    const s = this.g.s;
    if (this.advisor.classList.contains('show')) {
      // auto-advance when the current goal is satisfied
      const cur = Number(this.advisor.dataset.step);
      const next = this.advisorSteps.find((x) => x.id === cur + 1);
      if (cur === 1 && s.stats.clicks >= 15) this.dismissAdvisor();
      else if (next && next.when(this.g) && cur !== 7) this.dismissAdvisor();
      return;
    }
    const step = this.advisorSteps.find((x) => x.id === s.tutorial + 1);
    if (step && step.when(this.g)) {
      this.advisor.dataset.step = String(step.id);
      this.advisor.innerHTML = `<img class="face" src="${avatar(4)}" alt=""><div class="bubble frame-paper"><div class="who">大臣</div>${step.text}<br><button class="btn small">わかった</button></div>`;
      this.advisor.querySelector('button')!.addEventListener('click', () => {
        this.hooks.sfx('click');
        this.dismissAdvisor();
      });
      this.advisor.classList.add('show');
      this.hooks.sfx('open', { vol: 0.5 });
    }
  }
  private dismissAdvisor() {
    const id = Number(this.advisor.dataset.step);
    if (id > this.g.s.tutorial) this.g.s.tutorial = id;
    this.advisor.classList.remove('show');
  }

  // ------------------------------------------------------------ modals
  modal(opts: { title: string; color?: string; body: string | HTMLElement; buttons?: { label: string; red?: boolean; on?: () => void }[]; dismiss?: boolean; dark?: boolean }) {
    this.modalRoot.innerHTML = '';
    const m = h('div', 'modal ' + (opts.dark ? 'frame-dark' : 'frame-banner'));
    m.innerHTML = `<div class="ribbon ${opts.color ?? ''}"><span>${opts.title}</span></div>`;
    const body = h('div', 'body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else body.appendChild(opts.body);
    m.appendChild(body);
    if (opts.buttons?.length) {
      const row = h('div', 'row');
      for (const b of opts.buttons) {
        const btn = h('button', 'btn' + (b.red ? ' red' : ''), `<span class="label" style="font-size:16px">${b.label}</span>`);
        btn.style.minWidth = '140px';
        btn.addEventListener('click', () => {
          this.hooks.sfx('click');
          this.closeModal();
          b.on?.();
        });
        row.appendChild(btn);
      }
      body.appendChild(row);
    }
    this.modalRoot.appendChild(m);
    this.modalRoot.dataset.dismiss = opts.dismiss === false ? '0' : '1';
    this.modalRoot.classList.add('show');
    this.modalOpen = true;
    this.hooks.sfx('open', { vol: 0.7 });
  }
  closeModal() {
    if (!this.modalOpen) return;
    this.modalRoot.classList.remove('show');
    this.modalRoot.innerHTML = '';
    this.modalOpen = false;
    this.hooks.sfx('close', { vol: 0.6 });
  }

  showOffline(r: OfflineReport) {
    const gains = (['gold', 'wood', 'meat'] as Res[]).filter((k) => r.gains[k] > 0)
      .map((k) => `<span><img src="${img(RES_ICON[k])}" alt="">+${fmt(r.gains[k])}</span>`).join('');
    this.modal({
      title: 'おかえりなさい、陛下',
      body: `<img class="portrait" src="${avatar(4)}" alt=""><p style="text-align:center">陛下が留守の <b>${fmtTime(r.seconds)}</b> の間も、民は働き続けました。${r.capped ? '<br><small>（記録できるのは最大時間までです）</small>' : ''}</p>
        <div class="gains">${gains || '<span>—</span>'}</div><p class="note">放置中の効率 ${Math.round(r.efficiency * 100)}%</p>`,
      buttons: [{ label: '受け取る' }],
    });
  }

  showBattleResult(b: Battle) {
    const lost = UNITS.filter((u) => b.losses[u.id] > 0).map((u) => `${u.name} ${fmt(b.losses[u.id])}`).join('、') || 'なし';
    const reward = (['gold', 'wood', 'meat'] as Res[]).filter((k) => (b.reward[k] ?? 0) > 0)
      .map((k) => `<span><img src="${img(RES_ICON[k])}" alt="">+${fmt(b.reward[k]!)}</span>`).join('');
    const done = b.win && b.fort === 4;
    this.modal({
      title: b.win ? (done ? `${b.rival.name} 制圧！` : '勝利！') : '敗北…',
      color: b.win ? 'yellow' : 'red',
      body: `<img class="portrait" src="${avatar(b.rival.ruler)}" alt="">
        <p style="text-align:center">${b.win ? `<b>${b.rival.forts[b.fort]}</b>を攻め落としました。全生産 <b>+10%</b>。` : `<b>${b.rival.forts[b.fort]}</b>の守りは固く、兵は退きました。`}
        ${done ? `<br><b class="hl">制圧ボーナス: ${b.rival.bonusDesc}</b>` : ''}</p>
        ${reward ? `<div class="gains">${reward}</div>` : ''}
        <p class="note">失った兵: ${lost}</p>`,
      buttons: [{ label: '王国へ戻る', on: () => this.hooks.focusMain() }, { label: 'このまま見る' }],
    });
  }

  confirmPrestige() {
    const g = this.g;
    const c = g.crownsOnPrestige();
    this.modal({
      title: '王位継承',
      color: 'purple',
      body: `<img class="portrait" src="${avatar(11)}" alt=""><p style="text-align:center"><b>${g.s.kingName}代目</b>の治世を終え、次の王に位を譲りますか？</p>
        <div class="big">王冠 +${c}</div>
        <p class="note">金貨・作業員・建物・研究・兵・遠征はすべて最初からになります。<br>王冠・王家の遺産・実績は引き継がれます。<br>王冠の効果: 全生産と軍事力 +${Math.round((g.s.crownsTotal + c) * (g.hasPerk('dynasty') ? 15 : 10))}%</p>`,
      buttons: [{ label: 'やめておく' }, { label: '継承する', red: true, on: () => { this.hooks.beforePrestige(); g.prestige(); } }],
    });
  }

  showCoronation(crowns: number) {
    this.modal({
      title: `${this.g.s.kingName}代目の王、即位`,
      color: 'yellow',
      body: `<img class="portrait" src="${avatar(1)}" alt=""><div class="big">王冠 +${crowns}</div>
        <p style="text-align:center">新しい王のもとで、王国はふたたび歩み始めます。<br>「王家」で遺産を選び、さらに強くなりましょう。</p>`,
      buttons: [{ label: '治世を始める' }],
      dismiss: false,
    });
  }

  openAchievements() {
    const g = this.g;
    const s = g.s;
    const grid = ACHIEVEMENTS.map((a) => {
      const on = s.achievements.includes(a.id);
      return `<div class="ach ${on ? '' : 'off'}"><b>${on || !a.hidden ? a.name : '？？？'}</b>${on || !a.hidden ? a.desc : '秘密の実績'}</div>`;
    }).join('');
    const st = s.stats;
    this.modal({
      title: `実績 ${s.achievements.length} / ${ACHIEVEMENTS.length}`,
      color: 'yellow',
      body: `<p class="note">実績1つにつき全生産 +2%（現在 +${Math.round(g.d.achBonus * 100)}%）</p><div class="ach-grid">${grid}</div>
        <p class="note" style="margin-top:14px">総獲得金貨 ${fmt(st.allGold)}・クリック ${fmt(st.clicks)}回・会心 ${fmt(st.crits)}回・黄金の輝き ${st.goldens}回<br>
        勝利 ${st.battlesWon}・敗北 ${st.battlesLost}・王位継承 ${st.prestiges}回・プレイ時間 ${fmtTime(st.playTime)}</p>`,
      buttons: [{ label: '閉じる' }],
    });
  }

  openSettings() {
    const st = this.hooks.getSettings();
    const body = h('div');
    body.innerHTML = `
      <label><span>音楽</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music"></label>
      <label><span>効果音</span><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx"></label>
      <label><span>波の音</span><input type="range" min="0" max="1" step="0.05" value="${st.ambience}" data-k="ambience"></label>
      <div class="row"><button class="btn" data-a="export"><span class="label">データを書き出す</span></button><button class="btn" data-a="import"><span class="label">データを読み込む</span></button></div>
      <textarea placeholder="ここに書き出したデータが表示されます / 読み込むデータを貼り付けてください"></textarea>
      <div class="row"><button class="btn red" data-a="reset"><span class="label">最初からやり直す</span></button></div>
      <div class="credits frame-paper" style="margin-top:14px">
        <b>素材クレジット</b><br>
        グラフィック: <a href="https://pixelfrog-assets.itch.io/tiny-swords" target="_blank" rel="noopener">Tiny Swords</a> — Pixel Frog<br>
        音楽: RandomMind（OpenGameArt, CC0）<br>
        効果音: Kenney（CC0）、artisticdude（CC0）、wobbleboxx（CC0）、Ogrebane（CC-BY 3.0）、themightyglider（CC0）<br>
        環境音: RandomMind「Sea and River Wave Sounds」（CC0）<br>
        フォント: Dela Gothic One、M PLUS Rounded 1c（SIL OFL）
      </div>`;
    body.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        this.hooks.setSettings({ [t.dataset.k!]: Number(t.value) });
      });
      inp.addEventListener('change', () => this.hooks.sfx('coin1'));
    });
    const ta = body.querySelector('textarea')!;
    body.querySelector('[data-a=export]')!.addEventListener('click', () => {
      ta.value = this.hooks.exportSave();
      ta.select();
      navigator.clipboard?.writeText(ta.value).then(() => this.toast('データをコピーしました'), () => {});
    });
    body.querySelector('[data-a=import]')!.addEventListener('click', () => {
      if (this.hooks.importSave(ta.value)) {
        this.closeModal();
        this.toast('データを読み込みました');
      } else this.toast('読み込めませんでした', 'red');
    });
    body.querySelector('[data-a=reset]')!.addEventListener('click', () => {
      this.modal({
        title: '本当にやり直しますか？', color: 'red',
        body: '<p style="text-align:center">王冠・実績を含むすべての記録が消えます。<br>この操作は取り消せません。</p>',
        buttons: [{ label: 'やめる' }, { label: 'すべて消す', red: true, on: () => this.hooks.hardReset() }],
      });
    });
    this.modal({ title: '設定', body, buttons: [{ label: '閉じる' }] });
  }
}

const JOB_TOOL: Record<string, string> = { miner: 'pickaxe', lumberjack: 'axe', hunter: 'knife', builder: 'hammer' };
const UNIT_FRAMES: Record<string, number> = { warrior: 8, lancer: 12, archer: 6, monk: 6 };

function costValue(c: Cost) {
  return (c.gold ?? 0) + (c.wood ?? 0) * 3 + (c.meat ?? 0) * 8;
}

function lockHint(job: string) {
  switch (job) {
    case 'lumberjack': return 'もう少し金貨を稼ぐと雇えるようになります。';
    case 'hunter': return '家を1軒建てると雇えるようになります。';
    case 'builder': return '家を2軒建てると雇えるようになります。';
    default: return '';
  }
}
