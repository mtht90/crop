// 画面の骨組み：上部バー・下部タブ・シート・お知らせ・ダイアログ（出来事・留守中のまとめ・設定・クレジット）
import { CREDITS, ICON_AUTHORS } from '../config/credits';
import { GAME_EVENTS } from '../config/events';
import type { IconKey } from '../config/icons';
import { ICON_DATA } from '../generated/icons';
import { audio } from '../audio';
import { formatSigned, formatYen, realDuration } from '../core/format';
import { clock, resolveEvent } from '../sim/engine';
import { exportString, importString } from '../sim/save';
import type { Game } from '../game';
import { h, icon, clear, morph } from './dom';
import { businessTab, financeTab, lotPanel, marketTab, researchTab, setConfirm, type PanelContent } from './panels';
import { debugPanel } from './debug';
import { GOALS } from '../config/goals';

type Tab = 'city' | 'business' | 'research' | 'market' | 'finance';
const TABS: { id: Tab; label: string; icon: IconKey }[] = [
  { id: 'city', label: '街', icon: 'city' },
  { id: 'business', label: '事業', icon: 'business' },
  { id: 'research', label: '研究', icon: 'research' },
  { id: 'market', label: '市場', icon: 'market' },
  { id: 'finance', label: '財務', icon: 'finance' },
];

export class UI {
  private tab: Tab = 'city';
  private readonly top: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly sheetTitle: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly modal: HTMLElement;
  private pointerInSheet = false;
  private modalKind: string | null = null;
  private shownEventId: string | null = null;
  private hudCells: Record<string, HTMLElement> = {};
  private readonly goalEl: HTMLButtonElement;
  private goalIndex = -1;

  constructor(private readonly g: Game, root: HTMLElement) {
    // 上部バー
    const cell = (key: string, ic: IconKey, cls = '') => {
      const b = h('b');
      const sm = h('small');
      const el = h('div', { class: `cell ${cls}` }, icon(ic), h('div', { style: { minWidth: '0', display: 'flex', flexDirection: 'column' } }, sm, b));
      this.hudCells[key] = b;
      this.hudCells[key + 'Label'] = sm;
      return el;
    };
    this.top = h('header', { id: 'top' },
      h('div', { class: 'hud' }, cell('cash', 'cash', 'cash'), cell('clock', 'clock'), cell('today', 'sales'), cell('cap', 'chart')),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('button', { class: 'btn square gear', 'aria-label': '設定', onclick: () => this.openSettings() }, icon('settings'))));
    // 下部タブ
    this.tabsEl = h('nav', { id: 'tabs' }, ...TABS.map((t) => h('button', { 'data-tab': t.id, onclick: () => this.setTab(t.id) }, icon(t.icon), t.label)));
    // シート
    this.sheetTitle = h('h2');
    this.sheetBody = h('div', { class: 'sheet-body' });
    this.sheet = h('section', { id: 'sheet', hidden: true },
      h('div', { class: 'sheet-head' }, this.sheetTitle, h('button', { class: 'btn square ghost xbtn', 'aria-label': '閉じる', onclick: () => this.closeSheet() }, '×')),
      this.sheetBody);
    this.sheet.addEventListener('pointerdown', () => (this.pointerInSheet = true));
    window.addEventListener('pointerup', () => setTimeout(() => (this.pointerInSheet = false), 50));
    this.toasts = h('div', { id: 'toasts', 'aria-live': 'polite' });
    this.modal = h('div', { id: 'modal', hidden: true });
    this.goalEl = h('button', { id: 'goal', hidden: true }) as HTMLButtonElement;
    this.goalEl.addEventListener('click', () => {
      const goal = GOALS[this.goalIndex];
      if (goal) this.setTab(goal.tab);
    });
    root.append(this.top, this.goalEl, this.sheet, this.tabsEl, this.toasts, this.modal);
    const cityHost = document.getElementById('city')!;
    g.onCoin = (lotId, amount) => {
      if (this.modalKind || cityHost.querySelectorAll('.coin').length > 12) return;
      const p = g.view.project(lotId);
      if (!p) return;
      const el = h('div', { class: 'coin', style: { left: `${p.x}px`, top: `${p.y}px` } }, icon('coins'), `+${formatYen(amount)}`);
      cityHost.append(el);
      setTimeout(() => el.remove(), 1700);
    };

    g.onUpdate = () => this.update();
    g.onToast = (m, k) => this.toast(m, k);
    g.onShowCity = () => this.setTab('city', true);
    g.onLog = (from) => {
      for (const e of g.s.log.slice(from)) {
        if (e.kind === 'good' || e.kind === 'bad') this.toast(e.text, e.kind);
        if (e.text.includes('完了') || e.text.includes('完成')) void audio.play('complete');
      }
    };
    setConfirm((_g, text, ok) => this.confirm(text, ok));
    this.update();
    if (g.offline) this.showOffline();
  }

  setTab(t: Tab, keepSelection = false) {
    if (this.tab !== t) void audio.play('tab');
    this.tab = t;
    if (t !== 'city' || !keepSelection) {
      if (!keepSelection) this.g.selectLot(null);
    }
    this.renderSheet(true);
    this.update();
  }

  private closeSheet() {
    if (this.tab === 'city') this.g.selectLot(null);
    else this.setTab('city');
  }

  private panel(): PanelContent | null {
    const g = this.g;
    switch (this.tab) {
      case 'city': return g.selectedLot !== null ? lotPanel(g, g.selectedLot) : null;
      case 'business': return businessTab(g);
      case 'research': return researchTab(g);
      case 'market': return marketTab(g);
      case 'finance': return financeTab(g);
    }
  }

  private lastSheetKey = '';
  private renderSheet(force = false) {
    if (!force && this.pointerInSheet) return;
    void force;
    const p = this.panel();
    if (!p) {
      this.sheet.hidden = true;
      this.lastSheetKey = '';
      return;
    }
    const key = `${this.tab}|${this.g.selectedLot}`;
    const same = key === this.lastSheetKey;
    this.lastSheetKey = key;
    this.sheet.hidden = false;
    this.sheet.classList.toggle('full', this.tab !== 'city');
    morph(this.sheetTitle, [icon(p.icon), h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.title)]);
    if (!same) {
      // 別の画面に切り替わったときだけ作り直す
      clear(this.sheetBody);
      for (const n of p.body) if (n) this.sheetBody.append(n);
      this.sheetBody.scrollTop = 0;
    } else {
      morph(this.sheetBody, p.body.filter((n): n is Node => !!n));
    }
  }

  update() {
    const s = this.g.s;
    const c = s.companies[0];
    const ck = clock(s.day);
    this.hudCells.cashLabel.textContent = '資金';
    this.hudCells.cash.textContent = formatYen(c.cash);
    this.hudCells.cash.parentElement!.parentElement!.classList.toggle('neg', c.cash < 0);
    this.hudCells.clockLabel.textContent = `${ck.year}年目 ${ck.month}月${ck.date}日`;
    this.hudCells.clock.textContent = `${String(ck.hour).padStart(2, '0')}:${String(ck.minute).padStart(2, '0')}${s.debug.speed > 1 ? ` ×${s.debug.speed}` : ''}`;
    let today = 0;
    for (const st of s.stores) if (st.company === 0) today += st.today.revenue;
    this.hudCells.todayLabel.textContent = '本日の売上';
    this.hudCells.today.textContent = formatYen(today);
    this.hudCells.capLabel.textContent = '時価総額';
    this.hudCells.cap.textContent = formatYen(c.marketCap);
    for (const b of this.tabsEl.querySelectorAll('button')) {
      const id = b.getAttribute('data-tab');
      b.classList.toggle('on', id === this.tab);
      b.querySelector('.dot')?.remove();
      if (id === 'research' && !s.research.current && s.stores.some((x) => x.company === 0)) b.append(h('i', { class: 'dot' }));
      if (id === 'finance' && s.loans.some((l) => l.graceUntil !== null)) b.append(h('i', { class: 'dot' }));
    }
    this.renderSheet();
    this.updateGoal();
    // 出来事
    if (s.pendingEvent && !this.modalKind && this.shownEventId !== s.pendingEvent.id + s.pendingEvent.autoDay) this.showEvent();
    if (!s.pendingEvent && this.modalKind === 'event') this.closeModal();
    if (s.gameOver && this.modalKind !== 'gameover') this.showGameOver();
  }

  private updateGoal() {
    const s = this.g.s;
    const idx = GOALS.findIndex((goal) => {
      const [cur, target] = goal.progress(s);
      return cur < target;
    });
    // シートを大きく開いているときは目標を隠す
    this.goalEl.hidden = idx < 0 || (!this.sheet.hidden && this.tab !== 'city');
    if (idx < 0) return;
    if (this.goalIndex >= 0 && idx > this.goalIndex) {
      this.goalEl.classList.remove('done');
      void this.goalEl.offsetWidth;
      this.goalEl.classList.add('done');
      this.toast(`目標を達成：${GOALS[this.goalIndex].text}`, 'good');
      void audio.play('complete');
    }
    this.goalIndex = idx;
    const goal = GOALS[idx];
    const [cur, target] = goal.progress(s);
    clear(this.goalEl);
    this.goalEl.append(icon('trophy'), h('span', { style: { minWidth: '0' } }, h('span', null, goal.text),
      target > 1 ? h('div', { class: 'gbar' }, h('i', { style: { width: `${Math.min(100, (cur / target) * 100)}%` } })) : null));
  }

  toast(msg: string, kind: 'good' | 'bad' | 'info' = 'info') {
    if (!msg) return;
    const t = h('div', { class: `toast ${kind}` }, msg);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), 3500);
  }

  // ---------------------------------------------------------- ダイアログ
  private openModal(kind: string, title: string | (string | Node)[], body: (Node | null)[], foot: (Node | null)[]) {
    this.modalKind = kind;
    clear(this.modal);
    this.modal.append(h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'head' }, ...(Array.isArray(title) ? title : [title])),
      h('div', { class: 'body' }, ...body),
      foot.length ? h('div', { class: 'foot' }, ...foot) : null));
    this.modal.hidden = false;
    void audio.play('open');
  }

  closeModal() {
    this.modal.hidden = true;
    this.modalKind = null;
    clear(this.modal);
  }

  confirm(text: string, ok: () => void) {
    this.openModal('confirm', '確認', [h('p', { style: { margin: 0 } }, text)], [
      h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, 'やめる'),
      h('button', { class: 'btn', onclick: () => { this.closeModal(); ok(); } }, 'はい'),
    ]);
  }

  private showEvent() {
    const s = this.g.s;
    const pe = s.pendingEvent!;
    const ev = GAME_EVENTS.find((e) => e.id === pe.id);
    if (!ev) return;
    this.shownEventId = pe.id + pe.autoDay;
    void audio.play('event');
    this.openModal('event', [icon('event'), ev.title], [
      h('p', { style: { margin: 0 } }, ev.text),
      ...ev.choices.map((ch, i) => h('button', { class: 'btn choice', onclick: () => { resolveEvent(s, i); this.closeModal(); this.g.onUpdate(); void audio.play('click'); } },
        h('span', { class: 'col' }, ch.label, h('small', null, ch.desc + (i === ev.safe ? '（答えないとこれになります）' : ''))))),
      h('div', { class: 'small muted' }, `答えないまま${realDuration(pe.autoDay - s.day)}たつと、自動で選ばれます。`),
    ], [h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, 'あとで決める')]);
  }

  private showOffline() {
    const r = this.g.offline!;
    this.g.offline = null;
    const s = this.g.s;
    const logs = s.log.slice(Math.max(r.logsFrom, s.log.length - 12));
    this.openModal('offline', [icon('clock'), '留守中のまとめ'], [
      h('p', { style: { margin: 0 } }, `${realDuration(r.awayHours)}留守にしていました（ゲーム内では${r.days}日）。${r.cappedHours < r.awayHours ? `（進めるのは最大${Math.round(r.cappedHours)}時間までです）` : ''}`),
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('small', null, '売上'), h('b', null, formatYen(r.revenue))),
        h('div', { class: 'kpi' }, h('small', null, '利益'), h('b', { class: r.profit >= 0 ? 'good' : 'bad' }, formatSigned(r.profit))),
        h('div', { class: 'kpi' }, h('small', null, '進んだ日数'), h('b', null, `${r.days}日`))),
      r.quarters ? h('div', { class: 'card' }, h('h3', null, icon('chart'), `決算が${r.quarters}回ありました`), h('div', { class: 'small' }, '財務タブで決算レポートを見られます。')) : null,
      logs.length ? h('div', { class: 'card' }, h('h3', null, icon('event'), '起きたこと'), h('ul', { class: 'reasons' }, ...logs.map((l) => h('li', { class: l.kind === 'bad' ? 'bad' : '' }, l.text)))) : null,
    ], [h('button', { class: 'btn', onclick: () => { this.closeModal(); void audio.play('income'); } }, 'OK')]);
  }

  private showGameOver() {
    const s = this.g.s;
    this.openModal('gameover', [icon('loan'), '倒産しました'], [
      h('p', { style: { margin: 0 } }, s.gameOver!.reason),
      h('p', { class: 'muted', style: { margin: 0 } }, `最終的な累計売上：${formatYen(s.companies[0].cumulativeSales)}`),
    ], [h('button', { class: 'btn', onclick: () => this.g.reset() }, '新しく始める')]);
  }

  openSettings() {
    const s = this.g.s;
    const vol = (label: string, key: 'bgm' | 'sfx') => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.settings[key]), id: `vol-${key}`, 'aria-label': label }) as HTMLInputElement;
      input.addEventListener('input', () => {
        s.settings[key] = Number(input.value);
        audio.setVolumes(s.settings);
      });
      return h('label', { for: `vol-${key}` }, h('div', { class: 'small' }, label), input);
    };
    const exportArea = h('textarea', { class: 'code', readonly: true, id: 'save-export' }) as HTMLTextAreaElement;
    const importArea = h('textarea', { class: 'code', id: 'save-import', placeholder: 'ここに書き出した文字列を貼り付け' }) as HTMLTextAreaElement;
    this.openModal('settings', [icon('settings'), '設定'], [
      h('div', { class: 'card' }, h('h3', null, icon('music'), '音量'), vol('BGM', 'bgm'), vol('効果音', 'sfx'),
        h('button', { class: `btn ${s.settings.muted ? '' : 'ghost'}`, onclick: () => { s.settings.muted = !s.settings.muted; audio.setVolumes(s.settings); this.openSettings(); } }, icon(s.settings.muted ? 'mute' : 'sound'), s.settings.muted ? '消音中（タップで解除）' : 'すべての音を消す')),
      h('div', { class: 'card' }, h('h3', null, icon('logistics'), '街の動き'),
        h('div', { class: 'row' }, h('span', { class: 'grow small muted' }, '車を走らせます。オフにすると電池が長持ちします。'),
          h('button', { class: `btn ${s.settings.motion ?? true ? '' : 'ghost'}`, onclick: () => { this.g.setMotion(!(s.settings.motion ?? true)); this.openSettings(); } }, (s.settings.motion ?? true) ? 'オン' : 'オフ'))),
      h('div', { class: 'card' }, h('h3', null, icon('save'), 'セーブデータ'),
        h('div', { class: 'small muted' }, '30秒ごと、および画面を閉じるときに自動で保存しています。別の端末に移すときは書き出した文字列を使います。'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: async () => {
            this.g.save();
            exportArea.value = exportString(this.g.s);
            exportArea.select();
            try { await navigator.clipboard.writeText(exportArea.value); this.toast('コピーしました', 'good'); } catch { this.toast('文字列を選択しました。コピーしてください'); }
          } }, '書き出す（コピー）')),
        exportArea,
        importArea,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => {
          try {
            const st = importString(importArea.value);
            this.confirm('今のデータを上書きして読み込みますか？', () => this.g.replaceState(st));
          } catch (e) {
            this.toast(String((e as Error).message ?? e), 'bad');
          }
        } }, '読み込む'))),
      h('div', { class: 'card' }, h('h3', null, icon('info'), 'このゲームについて'),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => this.openCredits() }, 'クレジット'),
          h('button', { class: 'btn ghost', onclick: () => this.openDebug() }, icon('debug'), 'デバッグ'),
          h('button', { class: 'btn danger', onclick: () => this.confirm('セーブデータを消して最初からやり直しますか？ 元に戻せません。', () => this.g.reset()) }, '最初から'))),
    ], [h('button', { class: 'btn', onclick: () => { this.g.save(); this.closeModal(); } }, '閉じる')]);
  }

  openCredits() {
    const authors = new Map<string, string[]>();
    for (const d of Object.values(ICON_DATA)) {
      if (!authors.has(d.author)) authors.set(d.author, []);
      authors.get(d.author)!.push(d.name);
    }
    this.openModal('credits', [icon('info'), 'クレジット'], [
      h('div', { class: 'credits' },
        ...CREDITS.map((c) => h('div', null, h('h4', null, c.title), h('p', null, `${c.author}`), h('p', null, c.url), h('p', { class: 'muted' }, c.license), c.note ? h('p', { class: 'muted' }, c.note) : null)),
        h('h4', null, 'アイコン：Game-icons.net（CC BY 3.0）'),
        h('p', null, 'https://game-icons.net/ ・ https://creativecommons.org/licenses/by/3.0/'),
        ...[...authors.entries()].map(([a, names]) => h('p', null, `${ICON_AUTHORS[a]?.name ?? a}（${ICON_AUTHORS[a]?.url ?? ''}）：${names.join(', ')}`)),
        h('p', { class: 'muted' }, '各素材のライセンス文書は、ソースの licenses/ フォルダにあります。')),
    ], [h('button', { class: 'btn', onclick: () => this.openSettings() }, '戻る')]);
  }

  openDebug() {
    this.openModal('debug', [icon('debug'), 'デバッグ'], debugPanel(this.g, () => this.openDebug()), [h('button', { class: 'btn', onclick: () => this.closeModal() }, '閉じる')]);
  }
}
