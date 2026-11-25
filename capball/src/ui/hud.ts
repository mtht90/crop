import * as THREE from 'three';
import { grade, PITCHES, type PitchKind, POS_JP } from '../game/data';
import { ZONE } from '../game/geom';
import type { GameState } from '../game/rules';
import type { SwingMode } from '../game/batting';
import { audio } from '../core/audio';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface ZoneRect { x0: number; y0: number; x1: number; y1: number }


export class Hud {
  readonly root = h('div', 'layer');
  readonly input = h('div', 'layer');
  private board = h('div', 'board');
  private cards = h('div', 'cards');
  private zoneEl = h('div', 'zone', '<div class="grid"></div><div class="cells">' + '<i></i>'.repeat(9) + '</div>');
  private aimEl = h('div', 'aim hidden');
  private meetEl = h('div', 'meet hidden');
  private markEl = h('div', 'pitchmark hidden');
  private chipEl = h('div', 'chip hidden');
  private fbEl = h('div', 'swingfb hidden');
  private previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
  readonly controls = h('div', 'controls');
  private telopEl = h('div', 'telop');
  private flashEl = h('div', 'flash');
  private fadeEl = h('div', 'fade');
  readonly pauseBtn = h('button', 'iconbtn left', 'Ⅱ');
  readonly soundBtn = h('button', 'iconbtn right', '♪');
  zone: ZoneRect = { x0: 0, y0: 0, x1: 1, y1: 1 };

  constructor(parent: HTMLElement) {
    this.input.style.pointerEvents = 'auto';
    this.input.style.touchAction = 'none';
    this.root.style.pointerEvents = 'none';
    this.previewEl.setAttribute('class', 'breakpreview');
    this.root.append(this.previewEl, this.zoneEl, this.markEl, this.chipEl, this.fbEl, this.aimEl, this.meetEl, this.board, this.cards, this.telopEl, this.controls, this.pauseBtn, this.soundBtn, this.flashEl, this.fadeEl);
    for (const el of [this.zoneEl, this.chipEl, this.fbEl, this.markEl, this.aimEl, this.meetEl, this.board, this.cards, this.telopEl, this.flashEl, this.fadeEl]) el.style.pointerEvents = 'none';
    parent.append(this.input, this.root);
    this.soundBtn.onclick = () => {
      audio.setMuted(!audio.muted);
      this.soundBtn.style.opacity = audio.muted ? '0.45' : '1';
    };
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
    this.input.classList.toggle('hidden', !on);
  }

  // ---------- スコアボード ----------
  updateBoard(s: GameState, userIsAway: boolean) {
    const away = s.away, home = s.home;
    const dots = (n: number, max: number) => Array.from({ length: max }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('');
    const nm = (side: typeof away, isAway: boolean) => `<span class="t ${(s.half === 'top') === isAway ? 'bat' : ''}"><i style="background:${side.team.color}"></i>${isAway === userIsAway ? '★' : ''}${side.team.short}</span>`;
    this.board.innerHTML = `
      <div class="pill">
        <div class="inn">${s.inning}<small>回${s.half === 'top' ? '表' : '裏'}</small></div>
        <div class="score">${nm(away, true)}<b>${s.score(away)}</b>${nm(home, false)}<b>${s.score(home)}</b></div>
        <div class="bso"><span>B</span><div class="dots b">${dots(s.balls, 3)}</div><span>S</span><div class="dots s">${dots(s.strikes, 2)}</div><span>O</span><div class="dots o">${dots(s.outs, 2)}</div></div>
        <div class="diamond"><span class="b2 ${s.bases[1] ? 'on' : ''}"></span><span class="b3 ${s.bases[2] ? 'on' : ''}"></span><span class="b1 ${s.bases[0] ? 'on' : ''}"></span></div>
      </div>`;
  }

  updateCards(s: GameState, lastSpeed: number | null, pitchName = '') {
    const p = s.fielding.pitcher, b = s.batter;
    const g = (label: string, v: number) => `<span class="g g-${grade(v)}">${label}<b>${grade(v)}</b></span>`;
    const order = (s.batting.battingIndex % s.batting.team.players.length) + 1;
    const line = s.line(b);
    this.cards.innerHTML = `
      <div class="card"><div class="nm"><span class="role">投</span>${p.name}</div>
        <div class="st"><span class="stamina"><i style="width:${Math.round(s.fielding.stamina * 100)}%"></i></span>${lastSpeed ? `<span class="speed">${lastSpeed}</span><span class="pn">${pitchName}</span>` : `<span class="pn">${s.fielding.pitchCount}球</span>`}</div></div>
      <div class="card right"><div class="nm"><span class="role">${order}番</span>${b.name}<span class="pn"> ${POS_JP[b.pos]}・${b.bats === 'L' ? '左' : '右'} ${line.h}-${line.ab}</span></div>
        <div class="st">${g('ミ', b.meet)}${g('パ', b.power)}${g('守', b.field)}</div></div>`;
  }

  // ---------- ゾーン ----------
  setZone(r: ZoneRect) {
    this.zone = r;
    Object.assign(this.zoneEl.style, { left: r.x0 + 'px', top: r.y0 + 'px', width: r.x1 - r.x0 + 'px', height: r.y1 - r.y0 + 'px' });
  }
  showZone(on: boolean) {
    this.zoneEl.classList.toggle('hidden', !on);
  }
  /** 投手側から見ているとき（画面の右が -x） */
  mirrorX = false;
  /** ゾーン座標（メートル）→ 画面座標 */
  toScreen(x: number, y: number) {
    const z = this.zone;
    if (this.mirrorX) x = ZONE.x0 + ZONE.x1 - x;
    return { x: z.x0 + ((x - ZONE.x0) / (ZONE.x1 - ZONE.x0)) * (z.x1 - z.x0), y: z.y0 + ((ZONE.y1 - y) / (ZONE.y1 - ZONE.y0)) * (z.y1 - z.y0) };
  }
  pxPerMeter() {
    return (this.zone.x1 - this.zone.x0) / (ZONE.x1 - ZONE.x0);
  }
  showAim(v: THREE.Vector2 | null) {
    this.aimEl.classList.toggle('hidden', !v);
    if (!v) return;
    const p = this.toScreen(v.x, v.y);
    this.aimEl.style.left = p.x + 'px';
    this.aimEl.style.top = p.y + 'px';
  }
  showMeet(v: THREE.Vector2 | null, rx = 0.1, ry = 0.1, mode: SwingMode = 'meet') {
    this.meetEl.classList.toggle('hidden', !v);
    if (!v) return;
    const p = this.toScreen(v.x, v.y);
    const k = this.pxPerMeter();
    Object.assign(this.meetEl.style, { left: p.x - rx * k + 'px', top: p.y - ry * k + 'px', width: rx * 2 * k + 'px', height: ry * 2 * k + 'px' });
    this.meetEl.className = 'meet ' + mode;
  }
  /** 変化の予告線（ゾーン座標の点列。最後が狙い） */
  showBreakPreview(pts: THREE.Vector2[] | null) {
    const svg = this.previewEl as unknown as SVGSVGElement;
    if (!pts || pts.length < 2) {
      svg.innerHTML = '';
      return;
    }
    const sp = pts.map((p) => this.toScreen(p.x, p.y));
    const d = sp.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    // キャップの残像を、奥（小さく薄い）から手前（大きく濃い）へ並べる
    const ghosts = [0.12, 0.32, 0.52, 0.7, 0.86]
      .map((u, i) => {
        const p = sp[Math.round(u * (sp.length - 1))];
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(2.2 + i * 0.9).toFixed(1)}" class="bp-ghost" style="opacity:${(0.25 + i * 0.13).toFixed(2)}"/>`;
      })
      .join('');
    svg.innerHTML = `<defs><linearGradient id="bpg" gradientUnits="userSpaceOnUse" x1="${sp[0].x}" y1="${sp[0].y}" x2="${sp[sp.length - 1].x}" y2="${sp[sp.length - 1].y}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".85"/></linearGradient></defs><path d="${d}" class="bp-line" stroke="url(#bpg)"/>${ghosts}`;
  }

  /** 捕手の構え（狙ったコース）：9マスのうち1つを薄く塗る */
  showMitt(v: THREE.Vector2 | null) {
    this.showPredict(v, 1);
  }
  /** 着弾予測：9マスのうち、今の向きのまま来たら通るマスを薄く塗る（ゾーン外なら塗らない） */
  showPredict(v: THREE.Vector2 | null, strength = 1) {
    const cells = this.zoneEl.querySelectorAll<HTMLElement>('.cells i');
    let idx = -1;
    if (v && v.x >= ZONE.x0 && v.x <= ZONE.x1 && v.y >= ZONE.y0 && v.y <= ZONE.y1) {
      const cx = Math.min(2, Math.floor(((v.x - ZONE.x0) / (ZONE.x1 - ZONE.x0)) * 3));
      const cy = Math.min(2, Math.floor(((ZONE.y1 - v.y) / (ZONE.y1 - ZONE.y0)) * 3));
      idx = cy * 3 + cx;
    }
    cells.forEach((c, i) => {
      c.classList.toggle('on', i === idx);
      c.style.opacity = i === idx ? String(Math.min(1, strength)) : '';
    });
  }
  private tcircleEl = h('div', 'tcircle hidden');
  private gradeEl = h('div', 'tgrade hidden');
  /** 投球タイミングの輪（狙いの位置に、scale=1 で狙いの円と重なる） */
  timingCircle(v: THREE.Vector2 | null, scale: number, tone = '') {
    if (!this.tcircleEl.isConnected) this.root.append(this.tcircleEl, this.gradeEl);
    this.tcircleEl.classList.toggle('hidden', !v);
    if (!v) return;
    const p = this.toScreen(v.x, v.y);
    const d = 30 * scale;
    Object.assign(this.tcircleEl.style, { left: p.x - d / 2 + 'px', top: p.y - d / 2 + 'px', width: d + 'px', height: d + 'px' });
    this.tcircleEl.className = 'tcircle' + (tone ? ' t-' + tone : '');
  }
  timingGrade(g: string, label = g) {
    if (!this.gradeEl.isConnected) this.root.append(this.tcircleEl, this.gradeEl);
    this.gradeEl.className = 'tgrade g-' + g.toLowerCase();
    this.gradeEl.textContent = label;
    const z = this.zone;
    this.gradeEl.style.left = (z.x0 + z.x1) / 2 + 'px';
    this.gradeEl.style.top = z.y0 - 34 + 'px';
    window.setTimeout(() => this.gradeEl.classList.add('hidden'), 900);
  }

  /** 球種と球速（投球後） */
  showChip(text: string | null) {
    this.chipEl.classList.toggle('hidden', !text);
    if (!text) return;
    this.chipEl.textContent = text;
    const z = this.zone;
    this.chipEl.style.left = (z.x0 + z.x1) / 2 + 'px';
    this.chipEl.style.top = z.y0 - 10 + 'px';
  }
  /** スイングの振り返り（タイミングと上下のずれ） */
  showSwingFeedback(html: string | null) {
    this.fbEl.classList.toggle('hidden', !html);
    if (!html) return;
    this.fbEl.innerHTML = html;
    const z = this.zone;
    this.fbEl.style.left = (z.x0 + z.x1) / 2 + 'px';
    this.fbEl.style.top = z.y1 + 14 + 'px';
  }

  showMark(v: THREE.Vector2 | null) {
    this.markEl.classList.toggle('hidden', !v);
    if (!v) return;
    const p = this.toScreen(v.x, v.y);
    this.markEl.style.left = p.x + 'px';
    this.markEl.style.top = p.y + 'px';
    this.markEl.style.animation = 'none';
    void this.markEl.offsetWidth;
    this.markEl.style.animation = '';
  }

  // ---------- 演出 ----------
  telop(text: string, cls = '', sub = '', ms = 1300) {
    const el = h('div', '', `<span class="t ${cls}">${text}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`);
    this.telopEl.innerHTML = '';
    this.telopEl.append(el);
    window.setTimeout(() => el.remove(), ms);
  }
  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }
  fade(on: boolean) {
    this.fadeEl.classList.toggle('on', on);
  }
  clearControls() {
    this.controls.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// 投球操作：球種を選ぶ → ゾーンをドラッグして狙う → キャップを上にスワイプ（リングが重なる瞬間に離す）
// ---------------------------------------------------------------------------
export interface ThrowInput {
  kind: PitchKind;
  level: number;
  aim: THREE.Vector2;
  timingErr: number; // 0=ぴったり
  speedNorm: number; // 0..1 スワイプの速さ
  bend: number; // -1..1 スワイプの曲がり（+ = 右）
  /** 変化の向き（はじいた方向。-1=左、+1=右） */
  side: number;
  /** 変化量の倍率（0.5=弱 〜 1.5=強）。強いほど曲がるが、遅くなり制球も乱れやすい */
  strength: number;
  /** 投手目線で投げたとき、指で払った線の先（画面座標）。キャップはこの方向へまっすぐ飛び出す */
  screenAim?: { x: number; y: number };
}

/** 投球中のキャップの様子（試合側が3Dのキャップを描くのに使う） */
export interface HandCapState {
  /** 指でつまんで動かした量（-1..1、画面比） */
  ox: number;
  oy: number;
  /** 横回転（+ = 右回り、回転数）と縦回転（+ = 下から上） */
  spinZ: number;
  spinV: number;
  holding: boolean;
  thrown: boolean;
}

/**
 * 投球操作（ポケモンGOのように、投手の目線でキャップを投げる）
 * - 画面下のキャップをつまんで上にスワイプ。向き＝左右、長さ＝高さ、速さ＝球速
 * - 投げる前にキャップを回す
 *   ・くるくる回す（横回転）：右回り＝右へ、左回り＝左へ。少し＝スライダー、たくさん＝カーブ
 *   ・下から上へこする（下から上への回転）：手元で浮き上がるライズ
 *   ・上から下へこする（その反対）：手前で落ちるドロップ
 * - 回さずに投げるとストレート。ゆっくり投げるとナックル
 */
export class PitchControl {
  private padEl!: HTMLElement;
  private labelEl!: HTMLElement;
  private holding = false;
  private pid: number | null = null;
  private pts: { t: number; x: number; y: number }[] = [];
  private center = { x: 0, y: 0 };
  private radius = 100;
  private spinZ = 0;
  private spinV = 0;
  /** 回している間の指の軌跡（形で球種を見分ける） */
  private ring: { t: number; x: number; y: number }[] = [];
  /** 払う直前まで回していたときの球種（払う動きで形が崩れないように固定しておく） */
  private locked: { kind: PitchKind; side: number; amount: number } | null = null;
  private leftCap = false;
  private lastHead: number | null = null;
  private straightRun = 0;
  private straightLen = 0;
  private spinHist: number[] = [];
  private padTop = 0;
  private ox = 0;
  private oy = 0;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private result: ThrowInput | null = null;
  private levels: Map<PitchKind, number>;

  constructor(private hud: Hud, pitches: [PitchKind, number][], private onStart: (t: ThrowInput) => void) {
    this.levels = new Map(pitches);
    const c = hud.controls;
    c.innerHTML = '';
    this.padEl = h('div', 'fpspad');
    this.labelEl = h('div', 'fpslabel', '');
    const hint = h('div', 'hint fpshint', 'キャップをつまんで、投げたい所まで払って指を離す<br>先に回すと変化球：右回り＝右へ・左回り＝左へ／縦長に左回り＝ライズ・右回り＝ドロップ');
    this.padEl.append(this.labelEl, hint);
    c.append(this.padEl);

    const down = (e: PointerEvent) => {
      if (this.result) return;
      e.preventDefault();
      this.padEl.setPointerCapture(e.pointerId);
      this.pid = e.pointerId;
      this.holding = true;
      const r = this.padEl.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
      this.radius = Math.min(r.width, r.height) * 0.42;
      this.pts = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      if (Math.abs(this.spinZ) < 0.2) this.ring = [];
      this.locked = this.spinPitch();
      this.leftCap = false;
      this.lastHead = null;
      this.straightRun = 0;
      this.straightLen = 0;
      this.spinHist = this.ring.map(() => 0);
      this.padTop = r.top;
    };
    const move = (e: PointerEvent) => {
      if (!this.holding || e.pointerId !== this.pid) return;
      const prev = this.pts[this.pts.length - 1];
      const now = performance.now();
      this.pts.push({ t: now, x: e.clientX, y: e.clientY });
      const rx = e.clientX - this.center.x, ry = e.clientY - this.center.y;
      const dist = Math.hypot(rx, ry);
      const ddx = e.clientX - prev.x, ddy = e.clientY - prev.y;
      const dt = Math.max(8, now - prev.t);
      // 指がキャップの操作エリアから上へ出たら投げ始め：そこまでの回し方で球種を固定する
      if (!this.leftCap && e.clientY < this.padTop - 8) this.leftCap = true;
      if (!this.leftCap) {
        // 回転：指の進む向きがどれだけ回ったか（円の中心がずれていても、円を描けば1周＝1回転）
        const seg = Math.hypot(ddx, ddy);
        if (seg > 2.5) {
          const head = Math.atan2(ddy, ddx);
          let d = 0;
          if (this.lastHead !== null) {
            d = head - this.lastHead;
            d = Math.atan2(Math.sin(d), Math.cos(d));
          }
          // 上へまっすぐ払い始めたか（上向き±40°で曲がらずに続く）
          const up = Math.abs(Math.atan2(ddx, -ddy)) < 0.7 && ddy < 0;
          // 払いは速く長い：1区間が短い（ゆっくり回している）ものは数えない
          if (up && Math.abs(d) < 0.2 && seg > 14) { this.straightRun++; this.straightLen += seg; }
          else { this.straightRun = 0; this.straightLen = 0; }
          // 折り返し（こする動き）は回転に数えない
          if (Math.abs(d) < 1.7) {
            this.spinZ += d / (Math.PI * 2);
            this.spinHist.push(d / (Math.PI * 2));
          } else this.spinHist.push(0);
          this.lastHead = head;
          this.ring.push({ t: now, x: e.clientX, y: e.clientY });
          while (this.ring.length > 60) {
            this.ring.shift();
          }
          while (this.spinHist.length > this.ring.length) this.spinHist.shift();
          if (this.straightRun >= 2 && this.straightLen > 55) {
            // 払い始め：まっすぐな部分を円の形と回転から外して、球種を固定する
            for (let k = 0; k < this.straightRun && this.ring.length; k++) {
              this.ring.pop();
              this.spinZ -= this.spinHist.pop() ?? 0;
            }
            this.leftCap = true;
          }
        }
        void dist; void dt;
        this.locked = this.spinPitch();
      }
      this.ox = THREE.MathUtils.clamp(rx / this.radius, -1, 1);
      this.oy = THREE.MathUtils.clamp(ry / this.radius, -1.6, 1);
      this.updateLabel();
    };
    const up = (e: PointerEvent) => {
      if (!this.holding || e.pointerId !== this.pid) return;
      this.pts.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      this.holding = false;
      this.release();
    };
    this.padEl.addEventListener('pointerdown', down);
    this.padEl.addEventListener('pointermove', move);
    this.padEl.addEventListener('pointerup', up);
    this.padEl.addEventListener('pointercancel', () => {
      this.holding = false;
      this.ox = this.oy = 0;
    });
    const kd = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !this.result) this.throwWith(0, 150, 0.6);
    };
    window.addEventListener('keydown', kd);
    this.cleanup.push(() => window.removeEventListener('keydown', kd));
    this.updateLabel();
  }

  get state(): HandCapState {
    const sp = this.spinPitch();
    const vertical = sp && (sp.kind === 'rise' || sp.kind === 'drop');
    return { ox: this.ox, oy: this.oy, spinZ: vertical ? 0 : this.spinZ, spinV: vertical ? (sp!.kind === 'rise' ? 1 : -1) * Math.abs(this.spinZ) : 0, holding: this.holding, thrown: !!this.result };
  }

  /** 回した形の縦横比（縦長ほど大きい） */
  private ringAspect(before = Infinity) {
    const ring = this.ring.filter((p) => p.t < before);
    if (ring.length < 4) return 1;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of ring) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return (y1 - y0 + 1) / (x1 - x0 + 1);
  }

  /**
   * 回し方から球種と向き
   * - 縦長に左回り → ライズ、縦長に右回り → ドロップ
   * - それ以外（大きめに回す）→ 右回り＝右へ、左回り＝左へ（少し＝スライダー、たくさん＝カーブ）
   */
  private spinPitch(before = Infinity): { kind: PitchKind; side: number; amount: number } | null {
    const z = Math.abs(this.spinZ);
    if (z < 0.3) return null;
    const amount = THREE.MathUtils.clamp((z - 0.3) / 1.5, 0, 1);
    if (this.ringAspect(before) > 1.45) return { kind: this.spinZ < 0 ? 'rise' : 'drop', side: -1, amount };
    return { kind: z < 1.2 ? 'slider' : 'curve', side: this.spinZ > 0 ? 1 : -1, amount };
  }

  private updateLabel() {
    const sp = this.spinPitch();
    const dir = !sp ? '' : sp.kind === 'rise' ? '浮き上がる' : sp.kind === 'drop' ? '手前で落ちる' : sp.side > 0 ? '右へ ▶' : '◀ 左へ';
    this.labelEl.innerHTML = sp
      ? `<b>${PITCHES[sp.kind].name}</b> ${dir}<span class="gobar"><i style="width:${Math.round(20 + sp.amount * 80)}%"></i></span>`
      : this.holding ? '<b>ストレート</b>' : '';
  }

  private release() {
    const pts = this.pts;
    const b = pts[pts.length - 1];
    // 離す直前 160ms の動きをフリックとみなす（回しながらそのまま払っても投げられる）
    let i = pts.length - 1;
    while (i > 0 && b.t - pts[i - 1].t < 160) i--;
    // 窓の外の点は、止めていた時間を含むことがあるので使わない（止めてから払うとナックルになってしまう）
    const a = i < pts.length - 1 ? pts[i] : pts[Math.max(0, i - 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dt = THREE.MathUtils.clamp(b.t - a.t, 16, 160);
    const vy = -dy / dt; // 上向きの速さ px/ms
    const above = this.center.y - b.y > this.radius * 0.55;
    if (!(vy > 0.35 && -dy > 25) && !above) {
      this.ox = this.oy = 0; // 回しただけで離した：回転は残す
      return;
    }
    const speed = THREE.MathUtils.clamp((vy - 0.35) / 1.7, 0, 1);
    // 高さ：指を離した位置がキャップからどれだけ上か
    const len = Math.max(0, this.center.y - b.y) + Math.max(0, -dy) * 0.5;
    // 狙い：指を離した点に、払った勢いの分を足した先（ゆっくり離せばその点、勢いよく払えば先まで届く）
    const vx = dx / dt, vyy = dy / dt; // px/ms
    const carry = 65; // 勢いを何 ms 分先へ延ばすか
    const screenAim = { x: b.x + vx * carry, y: Math.max(30, b.y + vyy * carry) };
    this.throwWith(Math.atan2(dx, Math.max(1, -dy)), len, speed, a.t, screenAim);
  }

  /** 向き（ラジアン、右が+）・上へ払った長さ（px）・速さ（0..1）から投球を作る */
  private throwWith(angle: number, lengthPx: number, speed: number, flickStart = Infinity, screenAim?: { x: number; y: number }) {
    const cx = (ZONE.x0 + ZONE.x1) / 2;
    // 投手側から見ているので、画面の右は本塁側から見た左（-x）
    const x = cx - THREE.MathUtils.clamp(Math.tan(angle) / Math.tan(THREE.MathUtils.degToRad(22)), -1.5, 1.5) * 0.42;
    const hNorm = THREE.MathUtils.clamp((lengthPx - 90) / 300, 0, 1);
    const y = ZONE.y0 - 0.24 + hNorm * (ZONE.y1 - ZONE.y0 + 0.48);
    void flickStart;
    const sp = this.locked ?? this.spinPitch();
    let kind: PitchKind, side = -1, strength = 1;
    if (sp) {
      kind = sp.kind;
      side = -sp.side; // 画面で右回り＝画面の右へ曲がる（投手側から見て）
      strength = 1.0 + sp.amount * 0.6;
    } else if (speed < 0.18) {
      kind = 'knuckle';
      strength = 1.2 - speed * 2;
    } else kind = 'straight';
    // 持っていない球種は変化が弱い（変化量 2 相当）
    const level = kind === 'straight' ? 0 : this.levels.get(kind) ?? 2;
    const z = this.hud.zone;
    this.result = { kind, level, aim: new THREE.Vector2(x, y), timingErr: 0.12, speedNorm: speed, bend: 0, strength: THREE.MathUtils.clamp(strength, 0.4, 1.7), side, screenAim: screenAim ?? { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 } };
    this.labelEl.innerHTML = `<b>${PITCHES[kind].name}</b>`;
    this.onStart(this.result);
  }

  windup(_t: number, _releaseT: number) {}

  finalize(): ThrowInput {
    return this.result!;
  }

  update(dt: number) {
    if (this.disposed || this.result) return;
    // 指を離している間は回転が少しずつ収まる
    if (!this.holding) {
      const k = Math.exp(-dt * 0.5);
      this.spinZ *= k;
      this.spinV *= k;
      if (Math.abs(this.spinZ) < 0.05) this.spinZ = 0;
      if (Math.abs(this.spinV) < 0.05) this.spinV = 0;
      this.updateLabel();
    }
  }

  dispose() {
    this.disposed = true;
    for (const f of this.cleanup) f();
    this.hud.clearControls();
  }
}

// ---------------------------------------------------------------------------
// 打撃操作：画面をドラッグしてカーソルを動かし、指を離すとスイング
// ---------------------------------------------------------------------------
export class BatControl {
  cursor = new THREE.Vector2(0, (ZONE.y0 + ZONE.y1) / 2);
  mode: SwingMode = 'meet';
  private dragId: number | null = null;
  private last = { x: 0, y: 0 };
  private keys = new Set<string>();
  private cleanup: (() => void)[] = [];
  private btns: Record<SwingMode, HTMLElement> = {} as Record<SwingMode, HTMLElement>;
  onRelease: () => void = () => {};
  size = { rx: 0.1, ry: 0.1 };

  constructor(private hud: Hud, private sizeOf: (m: SwingMode) => { rx: number; ry: number }) {
    const c = hud.controls;
    c.innerHTML = '';
    const modes = h('div', 'modes');
    for (const [m, label] of [['meet', 'ミート'], ['power', '強振'], ['bunt', 'バント']] as [SwingMode, string][]) {
      const b = h('button', 'mbtn m-' + m + (m === 'meet' ? ' sel' : ''), label);
      b.onpointerdown = (e) => {
        e.stopPropagation();
        this.setMode(m);
        audio.play('ui_move', { volume: 0.6 });
      };
      this.btns[m] = b;
      modes.append(b);
    }
    const hint = h('div', 'hint', '画面をドラッグでカーソル移動 → 指を離してスイング');
    c.append(modes, hint);
    const inp = hud.input;
    const pd = (e: PointerEvent) => {
      if (this.dragId !== null) return;
      this.dragId = e.pointerId;
      this.last = { x: e.clientX, y: e.clientY };
    };
    const pm = (e: PointerEvent) => {
      if (e.pointerId !== this.dragId) return;
      const k = 1 / hud.pxPerMeter();
      this.cursor.x += (e.clientX - this.last.x) * k * 1.0;
      this.cursor.y -= (e.clientY - this.last.y) * k * 1.0;
      this.clamp();
      this.last = { x: e.clientX, y: e.clientY };
    };
    const pu = (e: PointerEvent) => {
      if (e.pointerId !== this.dragId) return;
      this.dragId = null;
      this.onRelease();
    };
    inp.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    const kd = (e: KeyboardEvent) => {
      this.keys.add(e.key);
      if (e.key === ' ' || e.key === 'Enter') this.onRelease();
      if (e.key === 'q') this.setMode('meet');
      if (e.key === 'e') this.setMode('power');
      if (e.key === 'r') this.setMode('bunt');
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.cleanup.push(() => {
      inp.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
    this.setMode('meet');
  }

  setMode(m: SwingMode) {
    this.mode = m;
    for (const [k, b] of Object.entries(this.btns)) b.classList.toggle('sel', k === m);
    this.size = this.sizeOf(m);
  }

  private clamp() {
    this.cursor.x = THREE.MathUtils.clamp(this.cursor.x, ZONE.x0 - 0.25, ZONE.x1 + 0.25);
    this.cursor.y = THREE.MathUtils.clamp(this.cursor.y, ZONE.y0 - 0.2, ZONE.y1 + 0.2);
  }

  get dragging() {
    return this.dragId !== null;
  }

  update(dt: number) {
    const sp = 0.9 * dt;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.cursor.x -= sp;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.cursor.x += sp;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) this.cursor.y += sp;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) this.cursor.y -= sp;
    this.clamp();
    this.hud.showMeet(this.cursor, this.size.rx, this.size.ry, this.mode);
  }

  dispose() {
    for (const f of this.cleanup) f();
    this.hud.clearControls();
    this.hud.showMeet(null);
  }
}
