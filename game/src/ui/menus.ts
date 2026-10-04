import type { Difficulty } from '../ai/cpu';
import { audio } from '../audio/audio';
import { characters, roster } from '../characters';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export interface Settings {
  sensitivity: number;
  volume: number;
  shake: boolean;
  /** Gentle aim pull toward the opponent for melee fighters. */
  aimAssist: boolean;
}

export interface Selection {
  player: string;
  cpu: string;
  difficulty: Difficulty;
}

const controlsHtml = `
<div class="controls">
  <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>移動</span>
  <span><kbd>マウス</kbd></span><span>視点</span>
  <span><kbd>左クリック</kbd></span><span>攻撃（長押し連射）</span>
  <span><kbd>右クリック</kbd></span><span>ガード</span>
  <span><kbd>Space</kbd></span><span>ジャンプ（空中でもう一度：上昇技※）</span>
  <span><kbd>Shift</kbd></span><span>ダッシュ/回避（中にクリックでダッシュ攻撃）</span>
  <span><kbd>E</kbd></span><span>固有スキル</span>
  <span><kbd>Q</kbd></span><span>必殺技（ゲージMAX）</span>
  <span><kbd>R</kbd></span><span>リロード</span>
  <span><kbd>Esc</kbd></span><span>ポーズ</span>
</div>
<p style="margin-top:8px;font-size:13px">※上昇技はブレイズ・ピコのみ。場外に飛ばされても縁まで戻れば登れる。弓は長押しで溜め撃ち。着地の瞬間に <kbd>Shift</kbd> で受け身。</p>`;

/** DOM menus: title, character select, pause and result screens. */
export class Menus {
  private el: HTMLDivElement;
  selection: Selection = { player: 'blaze', cpu: 'star', difficulty: 'normal' };

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    container.appendChild(this.el);
  }

  hide() {
    this.el.innerHTML = '';
  }

  title(onStart: () => void) {
    this.el.innerHTML = `
      <div class="screen">
        <div class="logo">STAR ARENA<small>スター・アリーナ</small></div>
        <div class="blink">クリックでスタート</div>
      </div>`;
    this.el.querySelector('.screen')!.addEventListener('click', () => {
      audio.unlock();
      audio.play('select');
      onStart();
    });
  }

  select(onFight: (s: Selection) => void, onBack: () => void) {
    const s = this.selection;
    const card = (id: string | null, label: string, weapon: string, which: 'player' | 'cpu') => {
      const def = id ? characters[id] : null;
      const color = def ? hex(def.element.color) : '#999';
      const icon = !def ? '?' : { fists: '✊', guns: '★', bow: '➶', hammer: '♪' }[def.weapon];
      const sel = id && s[which] === id ? 'sel' : '';
      return `<div class="card ${def ? '' : 'locked'} ${sel}" data-id="${id ?? ''}" data-which="${which}">
        <div class="emblem" style="background:${color}">${icon}</div>
        <div class="nm">${label}</div><div class="wp">${def ? def.title : weapon + '（開発中）'}</div></div>`;
    };
    const render = () => {
      this.el.innerHTML = `
      <div class="screen">
        <h2 class="title-h">キャラクター選択</h2>
        <div class="grid">${roster.map((r) => card(r.id, r.label, r.weapon, 'player')).join('')}</div>
        <div class="row panel">
          <b>相手 (CPU)</b>
          ${roster.filter((r) => r.id).map((r) => `<button class="btn ${s.cpu === r.id ? 'on' : ''}" data-cpu="${r.id}">${r.label}</button>`).join('')}
          <b style="margin-left:12px">強さ</b>
          ${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="btn ${s.difficulty === d ? 'on' : ''}" data-diff="${d}">${{ easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[d]}</button>`).join('')}
        </div>
        <div class="panel">${controlsHtml}</div>
        <div class="row">
          <button class="btn" data-act="back">もどる</button>
          <button class="btn primary" data-act="fight">FIGHT!</button>
        </div>
      </div>`;
      this.el.querySelectorAll<HTMLElement>('.card').forEach((c) =>
        c.addEventListener('click', () => {
          if (!c.dataset.id) return;
          s.player = c.dataset.id;
          audio.play('select');
          render();
        }),
      );
      this.el.querySelectorAll<HTMLElement>('[data-cpu]').forEach((b) =>
        b.addEventListener('click', () => {
          s.cpu = b.dataset.cpu!;
          audio.play('select');
          render();
        }),
      );
      this.el.querySelectorAll<HTMLElement>('[data-diff]').forEach((b) =>
        b.addEventListener('click', () => {
          s.difficulty = b.dataset.diff as Difficulty;
          audio.play('select');
          render();
        }),
      );
      this.el.querySelector('[data-act="fight"]')!.addEventListener('click', () => {
        audio.play('select');
        onFight({ ...s });
      });
      this.el.querySelector('[data-act="back"]')!.addEventListener('click', onBack);
    };
    render();
  }

  pause(settings: Settings, onResume: () => void, onQuit: () => void, onChange: (s: Settings) => void) {
    this.el.innerHTML = `
      <div class="screen dim">
        <h2 class="title-h">PAUSE</h2>
        <div class="panel settings">
          <label>マウス感度 <input type="range" min="0.3" max="2.5" step="0.05" value="${settings.sensitivity}" data-k="sensitivity"></label>
          <label>音量 <input type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-k="volume"></label>
          <label>画面の揺れ <input type="checkbox" ${settings.shake ? 'checked' : ''} data-k="shake"></label>
          <label>近距離キャラの視点吸着 <input type="checkbox" ${settings.aimAssist ? 'checked' : ''} data-k="aimAssist"></label>
        </div>
        <div class="panel">${controlsHtml}</div>
        <div class="row">
          <button class="btn" data-act="quit">タイトルへ</button>
          <button class="btn primary" data-act="resume">再開（クリック）</button>
        </div>
      </div>`;
    this.el.querySelectorAll<HTMLInputElement>('input').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Settings;
        const next = { ...settings };
        if (k === 'shake' || k === 'aimAssist') next[k] = inp.checked;
        else next[k] = Number(inp.value);
        Object.assign(settings, next);
        onChange(settings);
      }),
    );
    this.el.querySelector('[data-act="resume"]')!.addEventListener('click', onResume);
    this.el.querySelector('[data-act="quit"]')!.addEventListener('click', onQuit);
  }

  result(won: boolean, score: string, onRematch: () => void, onSelect: () => void, onTitle: () => void) {
    this.el.innerHTML = `
      <div class="screen dim">
        <div class="logo" style="color:${won ? 'var(--gold)' : '#8ab4ff'}">${won ? 'VICTORY!' : 'DEFEAT'}<small>${score}</small></div>
        <div class="row">
          <button class="btn primary" data-act="rematch">もう一度</button>
          <button class="btn" data-act="select">キャラ選択へ</button>
          <button class="btn" data-act="title">タイトルへ</button>
        </div>
      </div>`;
    this.el.querySelector('[data-act="rematch"]')!.addEventListener('click', onRematch);
    this.el.querySelector('[data-act="select"]')!.addEventListener('click', onSelect);
    this.el.querySelector('[data-act="title"]')!.addEventListener('click', onTitle);
  }
}
