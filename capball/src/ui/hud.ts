import * as THREE from 'three';
import { breakVector, grade, PITCHES, type PitchKind, POS_JP } from '../game/data';
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

/** 球種ボタンの軌道アイコン（向きははじき方で決まるので、形だけを表す） */
const PITCH_ICON: Record<PitchKind, string> = {
  straight: '<path d="M14 25 L14 5"/><circle cx="14" cy="5" r="3" class="ic-cap"/>',
  curve: '<path d="M8 4 C 26 6, 24 20, 14 25"/><circle cx="14" cy="25" r="3" class="ic-cap"/>',
  slider: '<path d="M8 4 L 9 17 Q 10 23 21 24"/><circle cx="21" cy="24" r="3" class="ic-cap"/>',
  rise: '<path d="M14 26 L14 14 Q 14 6 20 4"/><circle cx="20" cy="4" r="3" class="ic-cap"/>',
  knuckle: '<path d="M14 4 C 4 9, 24 13, 14 17 C 6 20, 20 23, 14 26"/><circle cx="14" cy="26" r="3" class="ic-cap"/>',
};
const pitchIcon = (k: PitchKind) => `<svg class="pic" viewBox="0 0 28 30" aria-hidden="true">${PITCH_ICON[k]}</svg>`;

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

/**
 * はじいた向きと速さから変化量の倍率を決める。
 * まっすぐ上（0°）で 60%、斜め 40° 以上で 150%。速くはじくほど少しキレが増す。
 */
export function flickStrength(dx: number, dy: number, speedNorm: number) {
  const ang = Math.atan2(Math.abs(dx), Math.max(1, -dy)) * (180 / Math.PI);
  const byAngle = 0.6 + 0.9 * THREE.MathUtils.clamp(ang / 40, 0, 1);
  return THREE.MathUtils.clamp(byAngle * (0.88 + 0.24 * speedNorm), 0.5, 1.6);
}

export class PitchControl {
  aim = new THREE.Vector2(0, (ZONE.y0 + ZONE.y1) / 2);
  sel = 0;
  private ring!: HTMLElement;
  private holding = false;
  private holdT = 0;
  private pts: { t: number; x: number; y: number }[] = [];
  private dragId: number | null = null;
  private last = { x: 0, y: 0 };
  private keys = new Set<string>();
  private disposed = false;
  private cleanup: (() => void)[] = [];
  private pitchBtns: HTMLButtonElement[] = [];

  constructor(private hud: Hud, pitches: [PitchKind, number][], private onThrow: (t: ThrowInput) => void) {
    const c = hud.controls;
    c.innerHTML = '';
    const row = h('div', 'pitches');
    const all: [PitchKind, number][] = [['straight', 0], ...pitches];
    all.forEach(([k, lv], i) => {
      const def = PITCHES[k];
      const b = h('button', 'pbtn' + (i === 0 ? ' sel' : ''), `${pitchIcon(k)}${def.name}<span class="lv">${k === 'straight' ? '' : Array.from({ length: 7 }, (_, j) => `<i class="${j < lv ? 'on' : ''}"></i>`).join('')}</span>`) as HTMLButtonElement;
      b.onpointerdown = (e) => {
        e.stopPropagation();
        this.select(i);
        audio.play('ui_move', { volume: 0.6 });
      };
      this.pitchBtns.push(b);
      row.append(b);
    });
    this.allPitches = all;
    queueMicrotask(() => this.select(0));
    const pad = h('div', 'throwpad');
    const cap = h('div', 'capbtn', 'CAP');
    this.ring = h('div', 'ring');
    const target = h('div', 'ring target');
    for (const r of [this.ring, target]) cap.append(r);
    target.style.width = target.style.height = '66px';
    this.ring.style.display = 'none';
    pad.append(cap);
    const hint = h('div', 'hint', '');
    this.hintEl = hint;
    this.brkEl = h('div', 'brklive', '');
    pad.append(this.brkEl);
    c.append(row, pad, hint);

    cap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cap.setPointerCapture(e.pointerId);
      this.holding = true;
      this.holdT = 0;
      this.pts = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      this.ring.style.display = 'block';
    });
    cap.addEventListener('pointermove', (e) => {
      if (!this.holding) return;
      this.pts.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      // はじく途中の向きで変化量を見せる（予告線もその場で変わる）
      const a = this.pts[0];
      if (a.y - e.clientY > 12) {
        this.liveStrength = flickStrength(e.clientX - a.x, e.clientY - a.y, 0.5);
        if (Math.abs(e.clientX - a.x) > 4) this.liveSide = Math.sign(e.clientX - a.x);
        this.syncStrength();
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.holding) return;
      this.pts.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      this.release();
    };
    cap.addEventListener('pointerup', up);
    cap.addEventListener('pointercancel', () => this.cancel());

    // 狙い（画面のどこでも相対ドラッグ）
    const inp = hud.input;
    const pd = (e: PointerEvent) => {
      if (this.dragId !== null) return;
      this.dragId = e.pointerId;
      this.last = { x: e.clientX, y: e.clientY };
    };
    const pm = (e: PointerEvent) => {
      if (e.pointerId !== this.dragId) return;
      const k = 1 / hud.pxPerMeter();
      this.aim.x += (e.clientX - this.last.x) * k * 0.9;
      this.aim.y -= (e.clientY - this.last.y) * k * 0.9;
      this.clampAim();
      this.last = { x: e.clientX, y: e.clientY };
    };
    const pu = (e: PointerEvent) => {
      if (e.pointerId === this.dragId) this.dragId = null;
    };
    inp.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    const kd = (e: KeyboardEvent) => {
      this.keys.add(e.key);
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.allPitches.length) this.select(n - 1);
      if (e.key === ' ' && !this.holding) {
        this.holding = true;
        this.holdT = 0;
        this.pts = [];
        this.ring.style.display = 'block';
      }
    };
    const ku = (e: KeyboardEvent) => {
      this.keys.delete(e.key);
      if (e.key === ' ' && this.holding) {
        const now = performance.now();
        this.pts = [{ t: now - 100, x: 0, y: 200 }, { t: now, x: 0, y: 0 }];
        this.release();
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.cleanup.push(() => {
      inp.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
  }
  private allPitches: [PitchKind, number][] = [];

  private clampAim() {
    this.aim.x = THREE.MathUtils.clamp(this.aim.x, ZONE.x0 - 0.4, ZONE.x1 + 0.4);
    this.aim.y = THREE.MathUtils.clamp(this.aim.y, ZONE.y0 - 0.32, ZONE.y1 + 0.32);
  }

  private hintEl: HTMLElement | null = null;
  private brkEl: HTMLElement | null = null;
  /** はじく向き・速さで決まる変化量（はじく前は 100% で予告） */
  private liveStrength = 1;
  /** はじく向き（-1=左、+1=右）。前回の向きを覚えておく */
  private liveSide = -1;
  select(i: number) {
    this.sel = i;
    this.pitchBtns.forEach((b, j) => b.classList.toggle('sel', j === i));
    const def = PITCHES[this.allPitches[i][0]];
    const straight = def.kind === 'straight';
    if (this.hintEl) this.hintEl.innerHTML = `<b>${def.name}</b>：${def.grip}<br>${straight ? 'はじく速さで球速が上がる' : 'はじいた向きに曲がる。斜めにはじくほど大きく曲がる'}`;
    this.liveStrength = 1;
    this.syncStrength();
  }
  private get strength() {
    return this.allPitches[this.sel]?.[0] === 'straight' ? 1 : this.liveStrength;
  }
  private syncStrength() {
    if (!this.brkEl) return;
    const straight = this.allPitches[this.sel][0] === 'straight';
    const v = Math.round(this.strength * 100);
    this.brkEl.classList.toggle('hidden', straight);
    this.brkEl.classList.toggle('big', v >= 130);
    this.brkEl.classList.toggle('small', v <= 75);
    this.brkEl.innerHTML = `変化 <b>${v}%</b>${v >= 130 ? '<br>制球難' : ''}`;
  }

  /** 選んだ球種・変化量・狙いから、曲がり方の予告線を作る */
  private previewPoints(): THREE.Vector2[] {
    const [kind, level] = this.allPitches[this.sel];
    const def = PITCHES[kind];
    const lv = Math.max(level, 1) * this.strength;
    const bv = breakVector(kind, lv, this.liveSide);
    const bend = new THREE.Vector2(bv.x, bv.y);
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const f = Math.pow(u, 1.4 + def.late * 3.6);
      const p = this.aim.clone().sub(bend).add(bend.clone().multiplyScalar(f));
      if (kind === 'knuckle') p.x += Math.sin(u * Math.PI * 3.2) * 0.07 * u * (1 - u * 0.6) * this.strength;
      pts.push(p);
    }
    return pts;
  }

  /** 輪の大きさ（1.0 で重なる） */
  ringScale() {
    const t = this.holdT;
    const cyc = 1.15;
    const u = (t % cyc) / cyc;
    return 2.1 - 1.6 * u;
  }

  update(dt: number) {
    if (this.disposed) return;
    const sp = 0.9 * dt;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) this.aim.x -= sp;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) this.aim.x += sp;
    if (this.keys.has('ArrowUp') || this.keys.has('w')) this.aim.y += sp;
    if (this.keys.has('ArrowDown') || this.keys.has('s')) this.aim.y -= sp;
    this.clampAim();
    this.hud.showAim(this.aim);
    this.hud.showBreakPreview(this.previewPoints());
    if (this.holding) {
      this.holdT += dt;
      const s = this.ringScale();
      this.ring.style.width = this.ring.style.height = 66 * s + 'px';
      this.ring.style.borderColor = Math.abs(s - 1) < 0.1 ? '#3fd07a' : '#fff';
    }
  }

  private cancel() {
    this.holding = false;
    this.ring.style.display = 'none';
  }

  private release() {
    const s = this.ringScale();
    this.cancel();
    const pts = this.pts;
    if (pts.length < 2) return;
    const a = pts[0], b = pts[pts.length - 1];
    const dy = b.y - a.y;
    if (dy > -40) return; // 上にはじいていない → 投げない
    // 直近の速さ
    let i = pts.length - 1;
    while (i > 0 && b.t - pts[i - 1].t < 110) i--;
    const p0 = pts[Math.max(0, i - 1)];
    const vy = -(b.y - p0.y) / Math.max(16, b.t - p0.t); // px/ms
    const speedNorm = THREE.MathUtils.clamp((vy - 0.35) / 1.5, 0, 1);
    // 曲がり：始点→終点の直線からの最大のずれ
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let dev = 0;
    for (const p of pts) {
      const cross = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
      if (Math.abs(cross) > Math.abs(dev)) dev = cross;
    }
    void dev;
    // 変化量：はじく向き（斜めほど大きい）と速さ（速いほどキレる）
    const strength = this.allPitches[this.sel][0] === 'straight' ? 1 : flickStrength(b.x - a.x, b.y - a.y, speedNorm);
    const side = Math.abs(b.x - a.x) > 4 ? Math.sign(b.x - a.x) : this.liveSide;
    const [kind, level] = this.allPitches[this.sel];
    this.liveStrength = 1;
    this.liveSide = side;
    this.onThrow({ kind, level, aim: this.aim.clone(), timingErr: Math.abs(s - 1), speedNorm, bend: 0, strength, side });
  }

  dispose() {
    this.disposed = true;
    for (const f of this.cleanup) f();
    this.hud.clearControls();
    this.hud.showAim(null);
    this.hud.showBreakPreview(null);
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
