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
  /** ゾーン座標（メートル）→ 画面座標 */
  toScreen(x: number, y: number) {
    const z = this.zone;
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
}

type ThrowGrade = 'EXCELLENT' | 'GREAT' | 'NICE' | 'NONE';
const GRADE_JP: Record<ThrowGrade, string> = { EXCELLENT: 'エクセレント！', GREAT: 'グレート！', NICE: 'ナイス！', NONE: '' };
/** 輪の判定ごとの効果（制球のぶれ・キレ・球速） */
const THROW_FX: Record<ThrowGrade, { timingErr: number; kire: number; speed: number }> = {
  EXCELLENT: { timingErr: 0, kire: 1.15, speed: 1.04 },
  GREAT: { timingErr: 0.08, kire: 1.07, speed: 1.02 },
  NICE: { timingErr: 0.18, kire: 1.0, speed: 1 },
  NONE: { timingErr: 0.35, kire: 0.9, speed: 0.97 },
};

/**
 * 投球操作（ポケモンGOのような投げ方）
 * - 画面下のキャップを押さえて、上にスワイプして投げる。向きで左右、長さで高さが決まる
 * - 投げる前にキャップをくるくる回すと変化球。右回り＝右へ、左回り＝左へ。少し＝スライダー、たくさん＝カーブ
 * - 回さずに投げると、速さで変わる：普通＝ストレート、速い＝ライズ（ホップ）、ゆっくり＝ナックル（無回転）
 * - ゾーンの輪が小さいときに投げるほど ナイス／グレート／エクセレント
 */
export class PitchControl {
  private capEl!: HTMLElement;
  private labelEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private holding = false;
  private pid: number | null = null;
  private pts: { t: number; x: number; y: number }[] = [];
  private center = { x: 0, y: 0 };
  private lastAng = 0;
  private spin = 0; // 回した量（回転数。+ = 右回り）
  private ringT = 0;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private result: ThrowInput | null = null;
  private levels: Map<PitchKind, number>;

  constructor(private hud: Hud, pitches: [PitchKind, number][], private onStart: (t: ThrowInput) => void) {
    this.levels = new Map(pitches);
    const c = hud.controls;
    c.innerHTML = '';
    const pad = h('div', 'gopad');
    this.labelEl = h('div', 'golabel', '');
    this.capEl = h('div', 'gocap', '<div class="gocap-face">CAP</div>');
    pad.append(this.labelEl, this.capEl);
    this.hintEl = h('div', 'hint', 'キャップを上にスワイプして投げる（向き＝左右、長さ＝高さ）<br>投げる前にくるくる回すと変化球。回さず速く＝ライズ、ゆっくり＝ナックル');
    c.append(pad, this.hintEl);

    const down = (e: PointerEvent) => {
      if (this.result) return;
      e.preventDefault();
      e.stopPropagation();
      this.capEl.setPointerCapture(e.pointerId);
      this.pid = e.pointerId;
      this.holding = true;
      const r = this.capEl.getBoundingClientRect();
      this.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.pts = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      this.lastAng = Math.atan2(e.clientY - this.center.y, e.clientX - this.center.x);
      this.spin = 0;
      this.capEl.classList.add('held');
    };
    const move = (e: PointerEvent) => {
      if (!this.holding || e.pointerId !== this.pid) return;
      this.pts.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      const dx = e.clientX - this.center.x, dy = e.clientY - this.center.y;
      const dist = Math.hypot(dx, dy);
      // キャップのまわりで指を回した分だけ回転をためる（離れたスワイプ中は数えない）
      if (dist > 10 && dist < 95) {
        const ang = Math.atan2(dy, dx);
        let d = ang - this.lastAng;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.spin += d / (Math.PI * 2);
        this.lastAng = ang;
      } else this.lastAng = Math.atan2(dy, dx);
      this.capEl.style.transform = `translate(${THREE.MathUtils.clamp(dx, -40, 40) * 0.4}px, ${THREE.MathUtils.clamp(dy, -60, 30) * 0.4}px) rotate(${this.spin * 360}deg)`;
      this.updateLabel();
    };
    const up = (e: PointerEvent) => {
      if (!this.holding || e.pointerId !== this.pid) return;
      this.pts.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      this.holding = false;
      this.capEl.classList.remove('held');
      this.release();
    };
    this.capEl.addEventListener('pointerdown', down);
    this.capEl.addEventListener('pointermove', move);
    this.capEl.addEventListener('pointerup', up);
    this.capEl.addEventListener('pointercancel', () => this.reset());
    const kd = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !this.result) {
        this.throwWith(0, 120, 0.6, 0);
      }
    };
    window.addEventListener('keydown', kd);
    this.cleanup.push(() => window.removeEventListener('keydown', kd));
    this.updateLabel();
  }

  private reset() {
    this.holding = false;
    this.spin = 0;
    this.capEl.classList.remove('held');
    this.capEl.style.transform = '';
    this.updateLabel();
  }

  /** 回した量から球種と向き */
  private spinPitch(): { kind: PitchKind; side: number; amount: number } | null {
    const t = Math.abs(this.spin);
    if (t < 0.5) return null;
    const side = this.spin > 0 ? 1 : -1;
    const kind: PitchKind = t < 1.4 ? 'slider' : 'curve';
    return { kind, side, amount: THREE.MathUtils.clamp((t - 0.5) / 2, 0, 1) };
  }

  private updateLabel() {
    const sp = this.spinPitch();
    this.capEl.classList.toggle('spin-s', sp?.kind === 'slider');
    this.capEl.classList.toggle('spin-c', sp?.kind === 'curve');
    this.labelEl.innerHTML = sp ? `<b>${PITCHES[sp.kind].name}</b> ${sp.side > 0 ? '右へ ▶' : '◀ 左へ'}<span class="gobar"><i style="width:${Math.round(sp.amount * 100)}%"></i></span>` : this.holding ? '回すと変化球' : '';
  }

  private release() {
    const pts = this.pts;
    const b = pts[pts.length - 1];
    // フリック部分：最後に上へ動き続けた区間（回していた部分は含めない）
    let i = pts.length - 1;
    while (i > 0 && pts[i - 1].y >= pts[i].y - 2) i--;
    const a = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dt = Math.max(16, b.t - a.t);
    if (dy > -35) {
      this.reset();
      return; // 上に投げていない
    }
    const speed = THREE.MathUtils.clamp((-dy / dt - 0.35) / 1.7, 0, 1);
    // 上へ払った長さで高さ
    const len = -dy;
    this.throwWith(Math.atan2(dx, -dy), len, speed, this.spin);
  }

  /** 向き（ラジアン、右が+）・スワイプの長さ（px）・速さ（0..1）・回転から投球を作る */
  private throwWith(angle: number, lengthPx: number, speed: number, spin: number) {
    const ringScale = this.ringScale();
    const grade: ThrowGrade = ringScale < 0.35 ? 'EXCELLENT' : ringScale < 0.6 ? 'GREAT' : ringScale < 0.85 ? 'NICE' : 'NONE';
    const fx = THROW_FX[grade];
    if (grade !== 'NONE') this.hud.timingGrade(grade, GRADE_JP[grade]);
    this.hud.timingCircle(null, 1);
    // コース：向き ±25° でゾーンの外まで、長さ 60〜300px で低め〜高め
    const cx = (ZONE.x0 + ZONE.x1) / 2;
    const x = cx + THREE.MathUtils.clamp(Math.tan(angle) / Math.tan(THREE.MathUtils.degToRad(25)), -1.4, 1.4) * 0.42;
    const hNorm = THREE.MathUtils.clamp((lengthPx - 60) / 240, 0, 1);
    const y = ZONE.y0 - 0.22 + hNorm * (ZONE.y1 - ZONE.y0 + 0.44);
    this.spin = spin;
    const sp = this.spinPitch();
    let kind: PitchKind, side = -1, strength = 1;
    if (sp) {
      kind = sp.kind;
      side = sp.side;
      strength = (0.65 + sp.amount * 0.85) * fx.kire;
    } else if (speed > 0.82) {
      kind = 'rise';
      strength = (0.6 + (speed - 0.82) * 3) * fx.kire;
    } else if (speed < 0.22) {
      kind = 'knuckle';
      strength = (1.2 - speed * 2) * fx.kire;
    } else kind = 'straight';
    // 持っていない球種は変化が弱い（変化量 2 相当）
    const level = kind === 'straight' ? 0 : this.levels.get(kind) ?? 2;
    this.result = { kind, level, aim: new THREE.Vector2(x, y), timingErr: fx.timingErr, speedNorm: THREE.MathUtils.clamp(speed * fx.speed, 0, 1), bend: 0, strength: THREE.MathUtils.clamp(strength, 0.4, 1.6), side };
    this.capEl.classList.add('thrown');
    this.labelEl.innerHTML = `<b>${PITCHES[kind].name}</b>`;
    audio.play('throw', { volume: 0.35, rate: 1.3 });
    this.onStart(this.result);
  }

  /** 輪の大きさ（1=ゾーン幅いっぱい → 小さくなって繰り返す） */
  private ringScale() {
    const cyc = 1.5;
    return 1 - 0.85 * ((this.ringT % cyc) / cyc);
  }

  windup(_t: number, _releaseT: number) {}

  finalize(): ThrowInput {
    return this.result!;
  }

  update(dt: number) {
    if (this.disposed || this.result) return;
    this.ringT += dt;
    const s = this.ringScale();
    const w = this.hud.zone.x1 - this.hud.zone.x0;
    const zc = new THREE.Vector2((ZONE.x0 + ZONE.x1) / 2, (ZONE.y0 + ZONE.y1) / 2);
    this.hud.timingCircle(zc, (w * 1.15 * s) / 30, s < 0.35 ? 'ex' : s < 0.6 ? 'gr' : s < 0.85 ? 'ni' : '');
  }

  dispose() {
    this.disposed = true;
    for (const f of this.cleanup) f();
    this.hud.clearControls();
    this.hud.timingCircle(null, 1);
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
