import type { Difficulty } from '../ai/cpu';
import { STAGES, STAGE_IDS } from '../render/stages';
import { audio } from '../audio/audio';
import { characters, roster } from '../characters';
import { buildPortraits, getPortrait, paint } from './portraits';

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
  stage: string;
}

const touchHelp = `
<div class="touch-only" style="font-weight:800;font-size:14px;line-height:1.7">
  左側をドラッグ：移動 ／ 右側をドラッグ：視点<br>
  攻撃ボタン：押す・押しっぱなし（押したまま動かすと狙える。弓は離すと発射）<br>
  ジャンプ（空中でもう一度：上昇技）／ ダッシュ ／ ガード（攻撃の瞬間に出すとジャストガード）<br>
  スキル・必殺はボタンが光ったら使える。遠距離キャラは床や浮島を撃つと反動で戻れる<br>
  ジップは攻撃で吸盤フック：壁や浮島に刺さると飛び、相手に刺さると飛び膝蹴り、スキルで光る吸盤を当てると相手を振り回して投げ飛ばす（外すと不発）。アメリは攻撃で傘を開いて盾＋射撃（弾だけ防ぐ）、スキルで傘を投げて追尾（戻るまで傘なし）。ドンは攻撃で砲弾（長押しで重い弾：遅く近くに落ちるが爆発が大きい）、スキルで地面を叩いて周囲を爆破。トリックは攻撃でトランプ、スキルで分身を走らせて自分は透明化（分身は当たると爆発）。レイは長押しでスコープ（ズーム・レーザーで威力アップ）、スキルでマーカーを撃つと弾が追尾
</div>`;

const controlsHtml = touchHelp + `
<div class="controls kbd-only">
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
<p class="kbd-only" style="margin-top:8px;font-size:13px">※上昇技はスター・アロー以外（ジップはフック、アメリは傘で上昇し Space 長押しで滑空、ドンは真下に撃って爆風で上昇）。ドンは左クリック長押しで重い砲弾（遅く・近くに落ちるが爆発が大きい）、E で地面を叩いて周囲を爆破。トリックは E で分身が前へ走り、本人は横へ跳んで数秒透明に（分身は撃たれる・触れると爆発）。レイは左クリック長押しでスコープ（ズーム＋相手にも見えるレーザー、離すと強い一発）、E のマーカーが当たると5秒間弾が追尾。アメリは左クリック長押しで傘を開いて盾にしつつ先端から射撃（弾だけ防ぐ・開いた瞬間ならはね返す・傘は壊れると5秒開けない）、E で開いた傘を投げると相手を追尾して戻ってくる（戻るまで盾・攻撃なし）。ジップは E の光る吸盤が相手に当たると、頭上へ大きく振り回して投げ飛ばす（外れ・ガードは不発）。場外に飛ばされても縁まで戻れば登れる。弓は長押しで溜め撃ち。攻撃の瞬間に右クリックでジャストガード。着地の瞬間に <kbd>Shift</kbd> で受け身。</p>`;

/** DOM menus: title, character select, pause and result screens. */
export class Menus {
  private el: HTMLDivElement;
  selection: Selection = { player: 'blaze', cpu: 'star', difficulty: 'normal', stage: 'sky' };

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
        <div class="blink">クリック / タップでスタート</div>
      </div>`;
    this.el.querySelector('.screen')!.addEventListener('click', () => {
      audio.unlock();
      audio.play('select');
      onStart();
    });
  }

  /**
   * Smash-style select: two big preview panels (1P / CPU) over a grid of face
   * tiles. Clicking a tile assigns it to the active side; clicking a panel
   * switches which side you are choosing for.
   */
  select(onFight: (s: Selection) => void, onBack: () => void, onStage?: (id: string) => void) {
    const s = this.selection;
    buildPortraits();
    let side: 'player' | 'cpu' = 'player';
    const weaponOf = (id: string) => roster.find((r) => r.id === id)?.weapon ?? '';
    const slot = (which: 'player' | 'cpu') => {
      const def = characters[s[which]];
      const active = side === which ? 'active' : '';
      const diff = which === 'cpu'
        ? `<div class="slot-diff">${(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => `<button class="btn ${s.difficulty === d ? 'on' : ''}" data-diff="${d}">${{ easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[d]}</button>`).join('')}</div>`
        : '';
      return `<div class="slot ${which} ${active}" data-slot="${which}" style="--el:${hex(def.element.color)};--el2:${hex(def.element.color2)}">
        <div class="slot-tag">${which === 'player' ? '1P' : 'CPU'}</div>
        <canvas class="slot-img" data-bust="${def.id}"></canvas>
        <div class="slot-info"><div class="slot-name">${def.name}</div><div class="slot-title">${def.title}・${weaponOf(def.id)}</div></div>
        ${diff}
      </div>`;
    };
    const tile = (id: string) => {
      const def = characters[id];
      const tags = `${s.player === id ? '<span class="tok p1">1P</span>' : ''}${s.cpu === id ? '<span class="tok cpu">CPU</span>' : ''}`;
      return `<button class="tile ${s[side] === id ? 'sel' : ''}" data-id="${id}" style="--el:${hex(def.element.color)};--el2:${hex(def.element.color2)}">
        <canvas data-face="${id}"></canvas><span class="tile-name">${def.name}</span><span class="toks">${tags}</span></button>`;
    };
    const render = () => {
      this.el.innerHTML = `
      <div class="screen select-screen">
        <h2 class="title-h">キャラクター選択</h2>
        <div class="vs-row">${slot('player')}<div class="vs">VS</div>${slot('cpu')}</div>
        <div class="pick-hint">${side === 'player' ? '<b class="p1c">1P</b> のキャラを選んでください' : '<b class="cpuc">CPU</b> のキャラを選んでください'}（上のパネルをクリックで切り替え）</div>
        <div class="roster">${roster.map((r) => tile(r.id)).join('')}<button class="tile rand" data-id="?"><span class="q">?</span><span class="tile-name">おまかせ</span></button></div>
        <div class="stage-row">ステージ ${STAGE_IDS.map((id) => `<button class="btn ${s.stage === id ? 'on' : ''}" data-stage="${id}">${STAGES[id].name}</button>`).join('')}</div>
        <div class="row">
          <button class="btn" data-act="back">もどる</button>
          <button class="btn" data-act="help">操作説明</button>
          <button class="btn primary fight" data-act="fight">FIGHT!</button>
        </div>
        <div class="panel help" hidden>${controlsHtml}</div>
      </div>`;
      this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach((c) => paint(c, getPortrait(c.dataset.face!)?.face));
      this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-bust]').forEach((c) => paint(c, getPortrait(c.dataset.bust!)?.bust));
      this.el.querySelectorAll<HTMLElement>('.tile').forEach((t) =>
        t.addEventListener('click', () => {
          let id = t.dataset.id!;
          if (id === '?') id = roster[Math.floor(Math.random() * roster.length)].id;
          s[side] = id;
          audio.play('select');
          // After choosing your own fighter, move on to the opponent.
          if (side === 'player') side = 'cpu';
          render();
        }),
      );
      this.el.querySelectorAll<HTMLElement>('[data-slot]').forEach((p) =>
        p.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('[data-diff]')) return;
          side = p.dataset.slot as 'player' | 'cpu';
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
      this.el.querySelectorAll<HTMLElement>('[data-stage]').forEach((b) =>
        b.addEventListener('click', () => {
          s.stage = b.dataset.stage!;
          audio.play('select');
          onStage?.(s.stage);
          render();
        }),
      );
      this.el.querySelector('[data-act="help"]')!.addEventListener('click', () => {
        const h = this.el.querySelector<HTMLElement>('.help')!;
        h.hidden = !h.hidden;
      });
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
          <label>タップ操作の視点補正 <input type="checkbox" ${settings.aimAssist ? 'checked' : ''} data-k="aimAssist"></label>
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
