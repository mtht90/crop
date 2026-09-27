import { audio } from '../core/audio';
import { input } from '../core/input';
import { el, escapeHtml, yen } from '../core/util';
import type { Quality } from '../core/engine';
import type { Game } from '../game/game';
import { GameModel } from '../game/model';
import { Modal, icon } from './ui';

// ───── 設定 ─────
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  quality: Quality;
  dayLength: number;
}

const SETTINGS_KEY = 'recycle-shop-sim/settings';
export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.35, sfx: 0.9, sensitivity: 1, invertY: false, quality: 'high', dayLength: 1 };

export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* noop */ } }

export class SettingsUI extends Modal {
  constructor(private g: Game) { super('settings'); }

  onOpen() {
    const s = this.g.settings;
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<label class="set-row"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><b data-v="${key}">${fmt(s[key] as number)}</b></label>`;
    const pctF = (v: number) => `${Math.round(v * 100)}%`;
    this.el.innerHTML = `
      <div class="menu-card">
        <h2>${icon('laptop')} 設定</h2>
        ${slider('master', '全体音量', 0, 1, 0.05, pctF)}
        ${slider('music', 'BGM', 0, 1, 0.05, pctF)}
        ${slider('sfx', '効果音', 0, 1, 0.05, pctF)}
        ${slider('sensitivity', 'マウス感度', 0.3, 2.5, 0.05, (v) => v.toFixed(2))}
        ${slider('dayLength', '1日の長さ', 0.5, 2, 0.25, (v) => `×${v} (約${Math.round(9 * v)}分)`)}
        <label class="set-row"><span>上下反転</span><input type="checkbox" data-k="invertY" ${s.invertY ? 'checked' : ''}><b></b></label>
        <div class="set-row"><span>画質</span><div class="seg">${(['low', 'medium', 'high'] as Quality[]).map((q) => `<button data-q="${q}" class="${s.quality === q ? 'on' : ''}">${{ low: '軽量', medium: '標準', high: '高画質' }[q]}</button>`).join('')}</div><b></b></div>
        <div class="btns"><button class="primary done">閉じる</button></div>
      </div>`;
    this.el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      const i = inp as HTMLInputElement;
      const k = i.dataset.k as keyof Settings;
      (s as any)[k] = Number(i.value);
      const lab = this.el.querySelector(`[data-v="${k}"]`)!;
      lab.textContent = k === 'sensitivity' ? Number(i.value).toFixed(2) : k === 'dayLength' ? `×${i.value} (約${Math.round(9 * Number(i.value))}分)` : `${Math.round(Number(i.value) * 100)}%`;
      this.g.applySettings();
    }));
    this.el.querySelector('input[type=checkbox]')!.addEventListener('change', (e) => { s.invertY = (e.target as HTMLInputElement).checked; this.g.applySettings(); });
    this.el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      s.quality = (b as HTMLElement).dataset.q as Quality;
      this.el.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      this.g.applySettings(true);
    }));
    this.el.querySelector('.done')!.addEventListener('click', () => this.close());
  }

  onClose() { saveSettings(this.g.settings); }
}

// ───── クレジット ─────
export class CreditsUI extends Modal {
  constructor() {
    super('credits');
  }
  onOpen() {
    this.el.innerHTML = `
      <div class="menu-card wide">
        <h2>${icon('trophy-cup')} クレジット</h2>
        <p>このゲームの 3D モデル・効果音・アイコン・環境光は、すべて外部のオープンライセンス素材を使用しています。</p>
        <table class="tbl">
          <tr><td>3D モデル (店舗・家具・雑貨・街・客)</td><td>KayKit by <b>Kay Lousberg</b> (CC0)</td></tr>
          <tr><td>3D モデル (看板・ラジコン・トロフィー等)・効果音・フォント</td><td><b>Kenney</b> Starter Kits (CC0 / MIT)</td></tr>
          <tr><td>高級品・目玉商品の実写系モデル</td><td>Khronos glTF Sample Assets — Eric Chadwick, Microsoft, Shopify, Maximillan Kamps, Guido Odendahl, Loic Norgeot, Sean Thomas, Fran Calvente, Rico Cilliers 他 (CC0 / CC-BY 4.0)</td></tr>
          <tr><td>HDRI (環境光・空)</td><td><b>Poly Haven</b> (CC0)</td></tr>
          <tr><td>BGM「Project Utopia」</td><td>congusbongus / OpenGameArt (CC0)</td></tr>
          <tr><td>UI 効果音</td><td>three.js examples (MIT)</td></tr>
          <tr><td>UI アイコン</td><td>game-icons.net — Lorc, Delapouite, Skoll, Sbed 他 (CC-BY 3.0)</td></tr>
          <tr><td>日本語フォント</td><td>M PLUS Rounded 1c (SIL OFL 1.1)</td></tr>
          <tr><td>エンジン</td><td>three.js (MIT)</td></tr>
        </table>
        <p class="dim small">詳細なファイル単位のライセンスは同梱の CREDITS.md を参照してください。ゲーム内のブランド名はすべて架空のものです。</p>
        <div class="btns"><button class="primary done">閉じる</button></div>
      </div>`;
    this.el.querySelector('.done')!.addEventListener('click', () => this.close());
  }
}

// ───── ポーズ ─────
export class PauseUI extends Modal {
  constructor(private g: Game) {
    super('pause');
    this.pausesTime = true;
  }
  onOpen() {
    this.el.innerHTML = `
      <div class="menu-card">
        <h2>一時停止</h2>
        <div class="menu-btns">
          <button class="primary resume">${icon('sun')} 再開</button>
          <button class="save">${icon('save')} セーブ</button>
          <button class="set">${icon('laptop')} 設定</button>
          <button class="help">${icon('newspaper')} 操作方法</button>
          <button class="cred">${icon('trophy-cup')} クレジット</button>
          <button class="title">${icon('exit-door')} タイトルへ</button>
        </div>
      </div>`;
    const q = (s: string) => this.el.querySelector(s)!;
    q('.resume').addEventListener('click', () => this.close());
    q('.save').addEventListener('click', () => { this.g.save(true); });
    q('.set').addEventListener('click', () => this.ui.open(this.g.settingsUI));
    q('.help').addEventListener('click', () => this.ui.open(new HelpUI()));
    q('.cred').addEventListener('click', () => this.ui.open(new CreditsUI()));
    q('.title').addEventListener('click', () => { this.g.save(false); location.reload(); });
  }
}

export class HelpUI extends Modal {
  constructor() { super('help'); }
  onOpen() {
    this.el.innerHTML = `
      <div class="menu-card wide">
        <h2>遊び方</h2>
        <div class="help-grid">
          <div><h3>操作</h3>
            <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 ・ <kbd>Shift</kbd> 走る ・ マウス 視点</p>
            <p><kbd>クリック</kbd> 商品を持つ / 置く</p>
            <p><kbd>E</kbd> 使う (レジ・査定・作業台・在庫・看板)</p>
            <p><kbd>F</kbd> 値札をつける ・ <kbd>Q</kbd> 持っている品を在庫へ</p>
            <p><kbd>Tab</kbd> 店長タブレット (相場・什器・設備) ・ <kbd>G</kbd> 什器を移動</p>
          </div>
          <div><h3>1日の流れ</h3>
            <p>① 開店前に在庫置き場から商品を出して棚に並べ、値札をつける</p>
            <p>② 入口の看板を「営業中」にして開店</p>
            <p>③ 持ち込み客が来たら<b>買取カウンター</b>で査定。傷を探し、動作や真贋を確かめて買取額を交渉</p>
            <p>④ 買い物客がレジに並んだら<b>レジ打ち</b>。お釣りは正確に！</p>
            <p>⑤ 汚れた品・壊れた品は<b>作業台</b>で清掃・修理すると高く売れる</p>
            <p>⑥ 閉店後に精算。利益で什器や設備を増やしてお店を大きくしよう</p>
          </div>
        </div>
        <div class="btns"><button class="primary done">OK</button></div>
      </div>`;
    this.el.querySelector('.done')!.addEventListener('click', () => this.close());
  }
}

// ───── 日次サマリー ─────
export class SummaryUI extends Modal {
  constructor(private g: Game) {
    super('summary');
    this.pausesTime = true;
    this.closable = false;
  }
  onOpen() {
    const s = this.g.model.state;
    const t = s.today;
    const costs = this.g.model.dailyCosts();
    const fixed = costs.reduce((a, b) => a + b.amount, 0);
    const profit = t.sales - t.purchases - t.expenses;
    const rep = s.reputation - t.repStart;
    this.el.innerHTML = `
      <div class="menu-card wide summary-card">
        <h2>${icon('calendar')} ${s.day}日目 の営業結果</h2>
        <div class="stat-tiles">
          <div class="tile"><div class="lbl">売上</div><div class="val good">${yen(t.sales)}</div><div class="sub">${t.sold} 点</div></div>
          <div class="tile"><div class="lbl">買取</div><div class="val">${yen(t.purchases)}</div><div class="sub">${t.bought} 点</div></div>
          <div class="tile"><div class="lbl">経費</div><div class="val">${yen(t.expenses)}</div><div class="sub">固定費 ${yen(fixed)} 含む</div></div>
          <div class="tile hero"><div class="lbl">本日の収支</div><div class="val ${profit >= 0 ? 'good' : 'bad'}">${profit >= 0 ? '+' : ''}${yen(profit)}</div></div>
        </div>
        <table class="tbl kv">
          <tr><td>来店客</td><td>${t.customers} 人 <span class="dim">(怒って帰った客 ${t.lostCustomers} 人)</span></td></tr>
          <tr><td>評判</td><td>${Math.round(s.reputation)} <span class="${rep >= 0 ? 'good' : 'bad'}">(${rep >= 0 ? '+' : ''}${rep.toFixed(1)})</span></td></tr>
          <tr><td>獲得経験値</td><td>${t.xp} XP ・ 店舗 Lv.${s.level}</td></tr>
          <tr><td>所持金</td><td><b>${yen(s.money)}</b></td></tr>
          ${costs.map((c) => `<tr><td class="dim">${escapeHtml(c.label)}</td><td class="dim">−${yen(c.amount)}</td></tr>`).join('')}
        </table>
        ${s.money < 0 ? '<div class="warn-note">所持金がマイナスです！ 在庫を業者に売るなどして立て直しましょう。</div>' : ''}
        <div class="btns"><button class="primary next">${icon('save')} セーブして翌日へ</button></div>
      </div>`;
    this.el.querySelector('.next')!.addEventListener('click', () => { this.ui.close(this); this.g.nextDay(); });
  }
}

/** 朝のニュース */
export class MorningUI extends Modal {
  constructor(private g: Game, private notes: string[]) {
    super('morning');
    this.pausesTime = true;
  }
  onOpen() {
    const s = this.g.model.state;
    const news = s.market.news.map((n) => `<div class="news ${n.effect > 0 ? 'up' : n.effect < 0 ? 'down' : ''}">${icon('newspaper')}<span>${escapeHtml(n.text)}</span></div>`).join('');
    this.el.innerHTML = `
      <div class="menu-card">
        <h2>${icon('sun')} ${s.day}日目の朝</h2>
        ${this.notes.map((n) => `<div class="warn-note">${escapeHtml(n)}</div>`).join('')}
        <h3>今朝のニュース</h3>${news}
        <p class="dim small">相場の詳細は店舗PC (Tab) で確認できます。準備ができたら入口の看板を「営業中」に。</p>
        <div class="btns"><button class="primary ok">開店準備をはじめる</button></div>
      </div>`;
    this.el.querySelector('.ok')!.addEventListener('click', () => this.close());
  }
}

// ───── タイトル ─────
export class TitleUI extends Modal {
  constructor(private g: Game) {
    super('title');
    this.closable = false;
    this.pausesTime = true;
  }
  onOpen() {
    const has = GameModel.hasSave();
    const save = has ? GameModel.load() : null;
    this.el.innerHTML = `
      <div class="title-wrap">
        <div class="logo"><div class="logo-sub">♻ RECYCLE SHOP SIMULATOR</div><div class="logo-main">リサイクルショップ<br>シミュレーター</div><div class="logo-tag">買って、磨いて、値をつけて。目利きの店主になろう。</div></div>
        <div class="title-btns">
          ${save ? `<button class="primary cont">${icon('shop')} つづきから <small>${escapeHtml(save.state.shopName)} ・ ${save.state.day}日目 ・ ${yen(save.state.money)}</small></button>` : ''}
          <button class="${save ? '' : 'primary'} new">${icon('stars-stack')} はじめから</button>
          <button class="set">${icon('laptop')} 設定</button>
          <button class="cred">${icon('trophy-cup')} クレジット</button>
        </div>
        <div class="title-foot">マウスとキーボードで遊ぶ PC ブラウザ向けゲームです</div>
      </div>`;
    this.el.querySelector('.cont')?.addEventListener('click', async () => { await audio.init(); this.close(); this.g.startGame(save!); });
    this.el.querySelector('.new')!.addEventListener('click', async () => { await audio.init(); this.ui.open(new NewGameUI(this.g, this, !!save)); });
    this.el.querySelector('.set')!.addEventListener('click', () => this.ui.open(this.g.settingsUI));
    this.el.querySelector('.cred')!.addEventListener('click', () => this.ui.open(new CreditsUI()));
  }
}

export class NewGameUI extends Modal {
  constructor(private g: Game, private title: TitleUI, private overwrite: boolean) { super('newgame'); }
  onOpen() {
    const names = ['ふくろう堂', 'まるごと屋', 'たからばこ', 'めぐり屋', 'リユース本舗', 'ことぶき商店'];
    this.el.innerHTML = `
      <div class="menu-card">
        <h2>${icon('wooden-sign')} お店の名前</h2>
        <p>看板に掲げる店名を決めましょう。</p>
        <input class="shop-name" maxlength="12" value="${names[Math.floor(Math.random() * names.length)]}">
        <div class="chips">${names.map((n) => `<button class="chip">${n}</button>`).join('')}</div>
        ${this.overwrite ? '<div class="warn-note">既存のセーブデータは上書きされます。</div>' : ''}
        <div class="btns"><button class="primary go">開業する</button><button class="back">戻る</button></div>
      </div>`;
    const inp = this.el.querySelector('.shop-name') as HTMLInputElement;
    this.el.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => { inp.value = b.textContent!; }));
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.querySelector('.back')!.addEventListener('click', () => this.close());
    this.el.querySelector('.go')!.addEventListener('click', () => {
      const name = inp.value.trim() || 'ふくろう堂';
      GameModel.deleteSave();
      this.close();
      this.title.close();
      this.g.startGame(GameModel.create(name), true);
    });
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  }
}

export { el, input };
