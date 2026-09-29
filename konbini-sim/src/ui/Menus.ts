import type { Game } from '../game/Game';
import { product } from '../data/products';
import { RANKS, type DayStats } from '../game/State';
import { h, yen } from './dom';

/** Pause/settings/help, daily report, single-price editor, tutorial checklist. */
export class Menus {
  constructor(private g: Game) {}

  pause(): void {
    const g = this.g;
    if (g.mode !== 'play') return;
    g.enterUIMode('menu');
    const close = g.ui.modal(h('div', { class: 'modal', style: 'width:min(560px,94vw)' },
      h('header', {}, h('h2', {}, '⏸ 一時停止')),
      h('div', { class: 'body' },
        h('div', { class: 'menu', style: 'width:100%' },
          h('button', { class: 'primary', onclick: () => close() }, '▶ ゲームに戻る'),
          h('button', { onclick: () => { close(); this.settings(); } }, '⚙ 設定'),
          h('button', { onclick: () => { close(); this.help(); } }, '？ 操作説明'),
          h('button', { onclick: () => { g.save(); g.ui.notify('セーブしました', 'good'); } }, '💾 セーブ'),
          h('button', { onclick: () => { g.save(); location.reload(); } }, '⏏ セーブしてタイトルへ'),
        ),
      ),
    ), { onClose: () => g.exitUIMode() });
    const esc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Tab') {
        window.removeEventListener('keydown', esc);
        close();
      }
    };
    setTimeout(() => window.addEventListener('keydown', esc), 200);
  }

  help(back?: () => void): void {
    const g = this.g;
    const wasTitle = g.mode === 'title';
    if (!wasTitle) g.enterUIMode('menu');
    const close = g.ui.modal(h('div', { class: 'modal', style: 'width:min(640px,94vw)' },
      h('header', {}, h('h2', {}, '操作説明'), h('button', { onclick: () => close() }, '閉じる')),
      h('div', { class: 'body' }, g.ui.helpContent()),
    ), { onClose: () => (wasTitle ? back?.() : g.exitUIMode()) });
  }

  settings(back?: () => void): void {
    const g = this.g;
    const wasTitle = g.mode === 'title';
    if (!wasTitle) g.enterUIMode('menu');
    const st = g.settings;
    const range = (min: number, max: number, step: number, val: number, on: (v: number) => void) =>
      h('input', { type: 'range', min, max, step, value: val, oninput: (e: Event) => { on(Number((e.target as HTMLInputElement).value)); g.applySettings(); } });
    const sel = (opts: [string, string][], val: string, on: (v: string) => void) => {
      const s = h('select', { onchange: (e: Event) => { on((e.target as HTMLSelectElement).value); g.applySettings(); } }, ...opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
      return s;
    };
    const close = g.ui.modal(h('div', { class: 'modal', style: 'width:min(560px,94vw)' },
      h('header', {}, h('h2', {}, '⚙ 設定'), h('button', { onclick: () => close() }, '閉じる')),
      h('div', { class: 'body' },
        h('div', { class: 'settings-row' }, 'マウス感度', range(0.3, 2.5, 0.05, st.sensitivity, (v) => (st.sensitivity = v))),
        h('div', { class: 'settings-row' }, '全体音量', range(0, 1, 0.05, st.volume, (v) => (st.volume = v))),
        h('div', { class: 'settings-row' }, '店内BGM', range(0, 1, 0.05, st.music, (v) => (st.music = v))),
        h('div', { class: 'settings-row' }, 'グラフィック品質', sel([['high', '高（AO・影・高解像度）'], ['medium', '中'], ['low', '低（軽量）']], st.quality, (v) => (st.quality = v as 'high'))),
        h('div', { class: 'settings-row' }, '時間の流れ', sel([['1.3', 'ゆっくり（1日≒26分）'], ['1', 'ふつう（1日≒20分）'], ['0.7', 'はやい（1日≒14分）']], String(st.speed), (v) => (st.speed = Number(v)))),
      ),
    ), { onClose: () => (wasTitle ? back?.() : g.exitUIMode()) });
  }

  priceEditor(id: string): void {
    const g = this.g;
    const p = product(id);
    g.enterUIMode('menu');
    let price = g.state.price(id);
    const val = h('div', { style: 'font-size:40px;font-weight:900;text-align:center;margin:10px 0' }, yen(price));
    const info = h('div', { style: 'text-align:center;color:var(--muted);font-size:13px' });
    const upd = () => {
      val.textContent = yen(price);
      const margin = Math.round(((price - p.cost) / price) * 100);
      info.textContent = `原価 ${yen(p.cost)} ／ 相場 ${yen(p.price)} ／ 粗利率 ${margin}%`;
    };
    upd();
    const step = (d: number) => {
      price = Math.max(p.cost, Math.min(p.price * 2, price + d));
      upd();
    };
    const close = g.ui.modal(h('div', { class: 'modal', style: 'width:420px' },
      h('header', {}, h('h2', {}, `🏷 ${p.name}`)),
      h('div', { class: 'body' }, val, info,
        h('div', { style: 'display:flex;gap:6px;justify-content:center;margin-top:14px' },
          h('button', { onclick: () => step(-50) }, '−50'), h('button', { onclick: () => step(-10) }, '−10'),
          h('button', { onclick: () => { price = p.price; upd(); } }, '相場'),
          h('button', { onclick: () => step(10) }, '＋10'), h('button', { onclick: () => step(50) }, '＋50'))),
      h('footer', {}, h('button', { onclick: () => close() }, 'キャンセル'), h('button', {
        class: 'primary',
        onclick: () => {
          g.state.prices[id] = price;
          g.refreshTags();
          g.audio.uiConfirm();
          close();
        },
      }, '決定')),
    ), { onClose: () => g.exitUIMode() });
  }

  dayReport(st: DayStats, next: () => void): void {
    const g = this.g;
    g.enterUIMode('report');
    g.ui.setAlerts([]);
    const gross = st.sales - st.cogs;
    const net = gross - st.waste - st.theft - st.fixed - st.wages - st.refunds;
    const repD = Math.round((st.repEnd - st.repStart) * 10) / 10;
    const kpi = (l: string, v: string, cls = '') => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: `v ${cls}` }, v));
    const row = (l: string, v: number, neg = false) => [h('div', {}, l), h('div', { class: 'num', style: neg && v ? 'color:var(--bad)' : '' }, `${neg && v ? '−' : ''}${yen(Math.abs(v))}`)];
    const top = Object.entries(st.sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const events = st.events.slice(-8);
    const s = g.state;
    const close = g.ui.modal(h('div', { class: 'modal report' },
      h('header', {}, h('h2', {}, `📊 ${st.day}日目 営業報告`), h('span', { class: 'pill' }, `明日の天気: ${{ sunny: '☀ 晴れ', cloudy: '☁ くもり', rain: '☂ 雨' }[s.forecast]}`)),
      h('div', { class: 'body' },
        h('div', { class: 'kpis' },
          kpi('売上', yen(st.sales)), kpi('本日の損益', yen(net), net >= 0 ? 'pos' : 'neg'),
          kpi('来店客数', `${st.customers}人`), kpi('評判', `${Math.round(st.repEnd)} (${repD >= 0 ? '+' : ''}${repD})`, repD >= 0 ? 'pos' : 'neg')),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:24px' },
          h('div', { class: 'pl' },
            ...row('売上高', st.sales), ...row('売上原価', st.cogs, true), h('div', { class: 'sep' }),
            ...row('粗利益', gross), ...row('廃棄ロス', st.waste, true), ...row('万引き・棚卸差異', st.theft, true),
            ...row('家賃・光熱費', st.fixed, true), ...row('人件費', st.wages, true), ...row('お詫び・返金', st.refunds, true), h('div', { class: 'sep' }),
            h('div', { style: 'font-weight:900' }, '営業利益'), h('div', { class: 'num', style: `font-weight:900;color:${net >= 0 ? 'var(--good)' : 'var(--bad)'}` }, yen(net)),
            h('div', { style: 'color:var(--muted);font-size:12px' }, '（参考）仕入・設備投資'), h('div', { class: 'num', style: 'color:var(--muted);font-size:12px' }, yen(st.orders)),
          ),
          h('div', {},
            h('h4', { style: 'margin:0 0 6px' }, '売れ筋'),
            ...(top.length ? top.map(([id, n]) => h('div', { style: 'font-size:13px' }, `${product(id).name} × ${n}`)) : [h('div', { style: 'color:var(--muted)' }, '—')]),
            h('h4', { style: 'margin:12px 0 6px' }, '出来事'),
            ...(events.length ? events.map((e) => h('div', { style: 'font-size:12px;color:var(--muted)' }, e)) : [h('div', { style: 'color:var(--muted)' }, '平穏な一日でした')]),
            h('div', { style: 'margin-top:12px;font-size:13px' }, `帰ってしまった客: ${st.lost}人 ／ 廃棄: ${st.wasteItems}点`),
          ),
        ),
        h('p', { style: 'margin-top:16px;font-size:13px;color:var(--muted)' }, `所持金 ${yen(s.money)}　（夜間はオーナー代行が店番をします。明日は6:00開店）`),
      ),
      h('footer', {}, h('button', { class: 'primary', onclick: () => { close(); } }, '翌日へ ▶')),
    ), { onClose: () => { g.mode = 'play'; next(); } });
  }

  rankUp(rank: number): void {
    const r = RANKS[rank - 1];
    this.g.audio.cashIn();
    this.g.ui.notify(`🎉 店舗ランクアップ！ ★${rank}「${r.title}」 新しい商品・設備が解放されました`, 'good', 9000);
  }

  gameOver(): void {
    const g = this.g;
    g.enterUIMode('report');
    g.ui.modal(h('div', { class: 'modal', style: 'width:480px' },
      h('header', {}, h('h2', {}, '閉店…')),
      h('div', { class: 'body' }, h('p', {}, '資金繰りが悪化し、本部から契約解除を告げられました。'), h('p', { style: 'color:var(--muted)' }, `${g.state.day - 1}日間の営業でした。`)),
      h('footer', {}, h('button', { class: 'primary', onclick: () => { localStorage.removeItem('konbini-sim-save-v1'); location.reload(); } }, 'タイトルへ')),
    ));
  }

  /** Day-1 guided checklist, then a compact daily goal list. */
  updateTasks(): void {
    const g = this.g;
    const t = g.state.tutorial;
    if (g.mode === 'title') return;
    if (g.state.day <= 2 && (t & 127) !== 127) {
      g.ui.setTasks('はじめての仕事', ([
        { text: 'バックヤードの段ボールを持つ［E］', done: !!(t & 1) },
        { text: '売場の棚に陳列する［左クリック］', done: !!(t & 2) },
        { text: 'レジで接客する（レジで［E］）', done: !!(t & 4) },
        { text: 'PCで商品を発注する', done: !!(t & 8) },
        { text: 'フライヤーでホットスナックを揚げる', done: !!(t & 16) },
        { text: '期限切れ商品を撤去する［R］', done: !!(t & 32) },
        { text: 'モップで床を掃除する', done: !!(t & 64) },
      ] as { text: string; done: boolean }[]).map((x) => ({ ...x, text: g.ui.tx(x.text) })));
    } else g.ui.setTasks('', null);
  }
}
