import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { App } from '../core/App';
import { Scene, Scenes } from '../core/Scene';
import { Save } from '../core/Save';
import { Sound, haptic } from '../core/Audio';
import { Button, coinIcon, grad, txt } from '../core/UI';
import { Board, BOARD_TUNING, type PopCause, type PopInfo } from '../game/Board';
import { BossView } from '../game/BossView';
import { FairyBackdrop } from '../game/Backdrop';
import { Effects, fx } from '../game/Effects';
import { ComboLabel, JFever, JTimer, ScoreLine, SkillButton, banner, installBitmapFonts, jungle, num } from '../game/Hud';
import { COLORS, bigTexture, loadCharacterArt } from '../art/PieceArt';
import { loadFairy, tex, unloadFairy } from '../core/Loader';
import { CHARACTERS, CHAR_BY_ID, COIN_SKILL, RARITY_INFO, addExp, chainCoins, charAtk, charCharge, expForRound, growthOf, skillAt, type CharDef, type Growth, type ShapeId, type Skill } from '../data/characters';
import { FLOOR_SHARE, TA_TIME, taCoins, bossAttackCount, bossAttackInterval, bossForLevel, bossHp, enemyAtkInterval, enemyHit, floorEnemies, type BossDef } from '../data/bosses';
import { ResultScene, type BattleResult } from './ResultScene';
import { HomeScene } from './HomeScene';
import { battleTrack } from '../data/music';
import { GIMMICKS, gimmicksFor, type GimmickId } from '../data/gimmicks';
import { currentFrame, currentLine, currentWallpaper, frameTextures, loadWallpapers, wallpaperAlias } from '../data/cosmetics';
import { recordRound } from '../data/missions';
import { recordBingo } from '../data/bingo';
import type { Stats } from '../core/Save';
import { Dev, devFab } from '../core/Dev';
import { submitScore, weekKey } from '../core/Ranking';
import { ITEM_BY_ID, rollCoinBoost, spendLife, type ItemId } from '../data/play';
import { expectedScore } from '../data/rank';
import { Assets, type Texture as PTexture } from 'pixi.js';
import { loadObstacleArt, obstacleTexture, type ObstacleArt } from '../art/PieceArt';
import type { Texture } from 'pixi.js';
import { VS_ATTACKS, VS_TIME, type VsLink } from '../core/Versus';
import { MiniBoard, boardSnapshot } from '../game/MiniBoard';
import { rewardPopup } from './common';

export const BATTLE_TIME = 90;
/** A dungeon run: three floors and the boss, against one clock. */
export const DUNGEON_TIME = 100;
const PLAYER_HP = 1000;
/** What the boss throws for each piece status. */
const THROWN = { ice: 'crystal', bubble: 'qbox', web: 'shackle', slime: 'anchor', curse: 'skull', skullBomb: 'bomb', chameleon: 'qbox' } as const;
/** Diameter of the round board in design px. */
const BOWL_D = 696;
/** Tuned so a normal round lands around 100k–200k (rank D). */
const SCORE_SCALE = 3;
const COMBO_WINDOW = 2.4;
const FEVER_TIME = 6.5;

type Phase = 'intro' | 'play' | 'cutin' | 'timeup' | 'end';

interface Resolve {
  total: number;
  remaining: number;
  perPiece: number;
  n: number;
  seen: number;
  orbEvery: number;
  shown: boolean;
  crit: boolean;
  cause: PopCause;
  color: number;
}

interface Orb {
  s: Sprite;
  core: Sprite;
  t: number;
  dur: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  dmg: number;
  r: Resolve;
  color: number;
  trail: number;
}

interface Projectile {
  s: Sprite;
  t: number;
  dur: number;
  x0: number;
  y0: number;
  target: import('../game/Board').Piece;
  onLand: (p: import('../game/Board').Piece) => void;
}

export class BattleScene extends Scene {
  private def: CharDef;
  private growth: Growth;
  /** The character's skill at its skill level. */
  private skill: Skill;
  private coinSkill = { perPiece: 0, flat: 0 };
  private expected = 0;
  private atk: number;
  private chargeNeed: number;
  private bossLv: number;
  /** Fighting a boss that was already beaten (no progression). */
  private rematch = false;
  private bossDef: BossDef;
  private hp: number;

  private col = new Container();
  private backdrop!: FairyBackdrop;
  private stage = new Container();
  private boss: BossView;
  private boardFrame = new Container();
  private feverFrame = new Graphics();
  private board!: Board;
  private boardX = 360 - BOWL_D / 2;
  private boardY = 0;
  private fxTop = new Effects();
  private orbLayer = new Container();
  private hud = new Container();
  private overlay = new Container();
  private vignette = new Graphics();
  private stageH = 440;
  private bossScale = 1;
  private get bossH(): number {
    return this.boss.height2 * this.bossScale;
  }

  private timer = new JTimer();
  private scoreW: ScoreLine;
  private skillBtn: SkillButton;
  private feverG = new JFever(600);
  private comboL = new ComboLabel();
  private pauseBtn!: Container;

  private phase: Phase = 'intro';
  private paused = false;
  private timeLeft = DUNGEON_TIME;
  // ---- dungeon: floors of enemies, then the boss; the player has HP
  private floors: { def: BossDef; hp: number; boss: boolean }[] = [];
  private floor = 0;
  /** Damage dealt before the current floor (overflow carries into the next enemy). */
  private floorBase = 0;
  private floorBusy = false;
  private cleared = false;
  private playerHp = PLAYER_HP;
  private enemyAtkT = 6;
  private hpBar = new Container();
  private hpFill = new Graphics();
  private hpText = txt('', { size: 22, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 5 });
  private enemyInfo = new Container();
  private enemyFill = new Graphics();
  private enemyName = txt('', { size: 24, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 6 });
  private floorTag = txt('', { size: 26, font: 'dela', color: 0xfff27a, stroke: 0x2a1630, strokeWidth: 6 });
  private landed = 0;
  private committed = 0;
  private combo = 0;
  private comboT = 0;
  private maxCombo = 0;
  private maxChain = 0;
  private fever = 0;
  private feverOn = false;
  private feverT = 0;
  private feverCount = 0;
  private skillCharge = 0;
  /** Seconds left of group-tap mode (skills). */
  private tapT = 0;
  /** Seconds left of the trace skill, the stopped clock and the long-reach links. */
  private traceT = 0;
  private stopT = 0;
  private reachT = 0;
  /** Battle BGM to return to after fever. */
  private track = '';
  private stuckCheckT = 0.5;
  private stuckT = 0;
  private skillUses = 0;
  private bossAtkT = 0;
  private idleT = 0;
  private hintShown = false;
  private brokeLine = false;
  private resolves = new Map<number, Resolve>();
  private nextToken = 1;
  private orbs: Orb[] = [];
  private projectiles: Projectile[] = [];
  private pointerId: number | null = null;
  /** This boss's obstruction lineup and the timed ones currently running (seconds left). */
  private gimmicks: GimmickId[] = [];
  private effects = new Map<GimmickId, number>();
  private effectLabel = txt('', { size: 24, color: 0xffb8d8, stroke: 0x2a1630, strokeWidth: 6, anchor: [0, 0.5] });
  private seenGimmicks = new Set<GimmickId>();
  /** SSR passive: obstructions it can still bounce. */
  private guards = 0;
  private quakeT = 0;
  /** Coins picked up during the round. */
  private coinsEarned = 0;
  private devClockStopped = false;
  private removeFab = (): void => {};
  private fiveToFour = false;
  private coinLabel = txt('0', { size: 26, color: 0xffe36f, stroke: 0x2a1630, strokeWidth: 6, anchor: [1, 0.5] });
  /** Counters for missions. */
  private round = { pops: 0, broken: 0, bombs: 0, chains7: 0 };
  private lastSecond = 99;
  private t = 0;
  private domHandlers: [string, EventListener][] = [];
  private onVis = () => {
    if (document.hidden && !this.paused && (this.phase === 'play' || this.phase === 'cutin')) this.pause();
  };

  /** `vs`: a versus match (no boss attacks or defeat line; attacks go to and come from the opponent). */
  /** Time attack: fixed seconds, no floors or HP, just the highest score (it goes to the weekly ranking). */
  private ta = false;

  constructor(
    private items: ItemId[] = [],
    private vs?: VsLink,
    mode?: 'ta',
  ) {
    super();
    installBitmapFonts();
    if (items.includes('time')) this.timeLeft = DUNGEON_TIME + 5;
    this.fiveToFour = items.includes('five4');
    const sel = Save.data.selected;
    this.def = CHAR_BY_ID[sel] ?? CHARACTERS[0];
    this.growth = growthOf(Save.data.owned[this.def.id]);
    this.atk = charAtk(this.def, this.growth);
    this.chargeNeed = charCharge(this.def, this.growth);
    this.skill = skillAt(this.def, this.growth.skill);
    // the rank at the end is judged against this (set from the starting stats)
    this.expected = expectedScore(this.def, this.growth, bossHp(Save.fightLv()), items);
    // coin skill grows 10% per skill level
    const cs = COIN_SKILL[this.def.rarity];
    const k = 1 + (this.growth.skill - 1) * 0.1;
    this.coinSkill = { perPiece: cs.perPiece * k, flat: Math.round(cs.flat * k) };
    this.ta = mode === 'ta';
    this.bossLv = this.ta ? Save.data.bossLv : Save.fightLv();
    this.rematch = this.ta || this.bossLv < Save.data.bossLv;
    if (this.ta) this.timeLeft = TA_TIME + (items.includes('time') ? 5 : 0);
    this.bossDef = bossForLevel(this.bossLv);
    this.hp = bossHp(this.bossLv);
    // the defeat line is split over three floor enemies and the boss
    const ens = floorEnemies(this.bossLv);
    this.floors = FLOOR_SHARE.map((k, i) => ({ def: i < 3 ? ens[i] : this.bossDef, hp: Math.round(this.hp * k), boss: i === 3 }));
    this.boss = new BossView(vs || this.ta ? this.bossDef : this.floors[0].def);
    this.scoreW = new ScoreLine(this.hp);
    this.skillBtn = new SkillButton(this.def);
    this.gimmicks = gimmicksFor(this.bossLv);
    // the boss's obstructions only start on the boss floor
    this.bossAtkT = Infinity;
    this.enemyAtkT = enemyAtkInterval(this.bossLv, false) + 2;
    if (this.def.passive?.kind === 'guard') this.guards = 3;
    if (vs) {
      this.timeLeft = VS_TIME;
      this.bossAtkT = Infinity;
      this.scoreW.versus(vs.opponent.name + (vs.opponent.cpu ? '（CPU）' : ''));
      vs.onAttack = (id) => void this.vsIncoming(id);
      vs.onGone = () => this.floatText('あいてがいなくなった…', 360, this.boardY - 50, 0xffffff, 32);
    }
  }

  // ----------------------------------------------------------------- versus
  private vsSendT = 0;
  private vsBoardT = 0;
  private mini?: MiniBoard;

  /** The opponent's bowl in miniature, on the right of the stage. */
  private buildMini(): void {
    const vs = this.vs!;
    const opp = CHAR_BY_ID[vs.opponent.charId] ?? CHARACTERS[0];
    const aspect = this.board.h / this.board.w;
    const top = App.safeTop + 175;
    const D = Math.max(120, Math.min(230, (this.stageH - 40 - top) / aspect));
    this.mini = new MiniBoard(opp, D, aspect, this.board.r, this.board.w);
    this.mini.position.set(720 - D / 2 - 24, this.stageH - 30 - D * aspect);
    const name = txt(`${vs.opponent.name}${vs.opponent.cpu ? '（CPU）' : ''}`, { size: 20, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 6 });
    name.position.set(this.mini.x, this.mini.y - 18);
    if (name.width > D + 40) name.scale.set((D + 40) / name.width);
    this.stage.addChild(this.mini, name);
  }

  /** Our big moves (8+ chains, skills, fever) send an obstruction to the opponent (not too often). */
  private vsSend(why: string): void {
    if (!this.vs || this.phase !== 'play' || this.vsSendT > 0) return;
    this.vsSendT = 3;
    const id = VS_ATTACKS[Math.floor(Math.random() * VS_ATTACKS.length)];
    this.vs.sendAttack(id);
    this.floatText(`${why}　${GIMMICKS[id].name}をおくった！`, 360, this.boardY - 50, 0x8dff8a, 30);
    Sound.play('laser', { vol: 0.5, rate: 1.4 });
  }

  /** An obstruction from the opponent. */
  private vsQueued: GimmickId[] = [];
  private async vsIncoming(id: GimmickId): Promise<void> {
    // the other side may start a moment earlier: hold attacks until our round begins
    if (this.phase === 'intro') {
      this.vsQueued.push(id);
      return;
    }
    if (this.phase !== 'play' && this.phase !== 'cutin') return;
    const g = GIMMICKS[id];
    Sound.play('phaserUp', { vol: 0.5, rate: 0.8 });
    this.gimmickCallout(`${this.vs!.opponent.name}から「${g.name}」`, '');
    await wait(0.9);
    if (this.phase !== 'play' && this.phase !== 'cutin') return;
    if (this.guards > 0) {
      this.guards--;
      this.guardBounce();
      return;
    }
    this.applyGimmick(id);
  }

  /** Versus ending: compare final scores, pay out, back home. */
  private async vsEnd(): Promise<void> {
    const vs = this.vs!;
    const me = Math.round(this.landed);
    const wait1 = txt('けっかをまっています…', { size: 34, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 8 });
    wait1.position.set(360, this.boardY + this.board.h * 0.55);
    this.overlay.addChild(wait1);
    const opp = await vs.finish(me);
    wait1.destroy();
    vs.leave();
    const win = me > opp;
    const draw = me === opp;
    Sound.play(win ? 'jWin' : draw ? 'jLevel' : 'jLose', { vol: 0.85 });
    await banner(this.overlay, win ? 'WIN!!' : draw ? 'DRAW' : 'LOSE…', 360, this.boardY + this.board.h * 0.42, { size: 130, color: win ? 0xfff27a : 0xb8c0ff, stroke: win ? 0x8a1f00 : 0x1a1240, hold: 0.9 });
    // rewards: a win pays more against a real opponent
    const d = Save.data;
    const coins = win ? (vs.opponent.cpu ? 1500 : 3000) : draw ? 1200 : 600;
    d.coins += coins;
    const owned = d.owned[this.def.id];
    const exp = expForRound(me, false);
    if (owned) addExp(this.def, owned, exp);
    d.vs = { win: d.vs.win + (win ? 1 : 0), lose: d.vs.lose + (!win && !draw ? 1 : 0), draw: d.vs.draw + (draw ? 1 : 0) };
    d.plays++;
    const stats: Stats = { plays: 1, defeats: 0, ...this.round, fevers: this.feverCount, skills: this.skillUses, maxChain: this.maxChain, maxCombo: this.maxCombo };
    recordRound(stats);
    recordBingo(stats, this.def.id, me);
    Save.write();
    rewardPopup(this.overlay, win ? 'かち！' : draw ? 'ひきわけ' : 'まけ…', [`${me.toLocaleString('en-US')} vs ${opp.toLocaleString('en-US')}`, `あいて：${vs.opponent.name}${vs.opponent.cpu ? '（CPU）' : ''}`, '', `${coins.toLocaleString('en-US')}コイン`, `EXP +${exp}`, `通算 ${d.vs.win}勝 ${d.vs.lose}敗`], () => Scenes.go(() => new HomeScene()));
  }

  async preload(): Promise<void> {
    await Promise.all([loadFairy(this.bossDef.bg), loadCharacterArt(this.vs ? [this.def.id, this.vs.opponent.charId] : [this.def.id], { strips: true }), loadObstacleArt(), loadSkillProps(), loadWallpapers([currentWallpaper().id, ...frameTextures(currentFrame())])]);
    this.backdrop = new FairyBackdrop(this.bossDef.bg);
  }

  enter(): void {
    const v = this.view;
    v.addChild(this.col);
    this.col.addChild(this.backdrop, this.stage, this.boardFrame);
    this.stage.addChild(this.boss);
    // layout is decided once from the current viewport; board physics depends on it
    const H = App.H;
    const top = App.safeTop;
    // round bowl pinned to the bottom; the boss stage takes whatever is left above it
    // a round bowl as wide as the screen allows, pinned to the bottom; the boss stage gets the rest
    // the fever gauge sits under the bowl
    const D = Math.min(BOWL_D, Math.round(H - App.safeBottom - 70 - (top + 412)));
    this.boardY = Math.round(H - App.safeBottom - 70 - D);
    this.stageH = this.boardY - 112;
    this.boardX = 360 - D / 2;
    this.board = new Board(this.def, D, D, {
      onResolve: (pops, cause, meta) => this.onResolve(pops, cause, meta),
      onPiecePop: (p, i, cause, token) => this.onPiecePop(p, i, cause, token),
      onChainChange: (len, eff) => this.onChainChange(len, eff),
      onInteract: () => {
        this.idleT = 0;
        this.hintShown = false;
      },
    }, true);
    // pivot on the bowl center so the "tilt" obstruction can rotate it
    this.board.view.pivot.set(D / 2, D / 2);
    this.board.view.position.set(this.boardX + D / 2, this.boardY + D / 2);
    this.board.onSkullBlow = (x, y) => this.skullBlow(x, y);
    this.board.lineStyle = currentLine();
    if (this.fiveToFour) this.board.colors = 4;
    this.board.onBroken = () => this.round.broken++;
    this.col.addChild(this.board.view, this.feverFrame, this.orbLayer, this.fxTop.view, this.hud, this.vignette, this.overlay);
    this.drawBoardFrame();
    // hud
    const bar = jungle('topbar');
    bar.anchor.set(0.5, 0);
    bar.width = App.W + 40;
    bar.height = top + 118;
    bar.position.set(360, -6);
    this.hud.addChild(bar);
    this.timer.position.set(205, top + 54);
    this.scoreW.position.set(560, top + 52);
    const nameTag = txt(`Lv.${this.bossLv} ${this.bossDef.name}`, { size: 26, color: 0xffffff, stroke: 0x3b2412, strokeWidth: 7, anchor: [0, 0.5] });
    nameTag.position.set(24, top + 140);
    this.hud.addChild(nameTag);
    if (this.gimmicks.length) {
      const lineup = txt(`妨害：${this.gimmicks.map((g) => GIMMICKS[g].name).join('・')}`, { size: 20, color: 0xd8c8ff, stroke: 0x2a1630, strokeWidth: 5, anchor: [0, 0.5] });
      lineup.position.set(24, top + 172);
      this.hud.addChild(lineup);
    }
    this.effectLabel.position.set(24, top + 204);
    if (this.items.length) {
      const it = txt(this.items.map((i) => ITEM_BY_ID[i].name).join('・'), { size: 18, color: 0x9be7ff, stroke: 0x2a1630, strokeWidth: 5, anchor: [1, 0.5] });
      it.position.set(696, top + 204);
      this.hud.addChild(it);
    }
    const coinIco = coinIcon(13);
    coinIco.position.set(600, top + 140);
    this.coinLabel.position.set(696, top + 140);
    this.hud.addChild(coinIco, this.coinLabel);
    this.hud.addChild(this.effectLabel);
    if (this.def.passive) {
      const ps = txt(`★${this.def.passive.name}`, { size: 20, color: 0xffe36f, stroke: 0x2a1630, strokeWidth: 5, anchor: [1, 0.5] });
      ps.position.set(696, top + 172);
      this.hud.addChild(ps);
    }
    this.skillBtn.position.set(84, this.stageH + 34);
    this.feverG.position.set(360, App.H - App.safeBottom - 34);
    this.comboL.position.set(590, this.stageH - 70);
    this.pauseBtn = jungle('pause');
    this.pauseBtn.scale.set(72 / 214);
    this.pauseBtn.eventMode = 'static';
    this.pauseBtn.cursor = 'pointer';
    this.pauseBtn.on('pointertap', () => {
      Sound.play('ui_tap');
      this.pause();
    });
    this.pauseBtn.position.set(58, top + 54);
    this.hud.addChild(this.timer, this.scoreW, this.skillBtn, this.feverG, this.comboL, this.pauseBtn);
    if (!this.vs && !this.ta) this.buildDungeonHud();
    if (this.ta) this.scoreW.setLine(`今週のベスト ${(Save.data.ta.week === weekKey() ? Save.data.ta.best : 0).toLocaleString('en-US')}`);
    // manual mode: tap the gauge when it is full
    this.skillBtn.on('pointertap', () => void this.activateSkill());
    this.timer.set(this.timeLeft);
    this.layoutStage();
    this.bindInput();
    document.addEventListener('visibilitychange', this.onVis);
    // developer mode hooks (obstruction tester, clock)
    if (Dev.on) {
      this.removeFab = devFab();
      Dev.battle = {
        gimmick: (id) => this.applyGimmick(id),
        setTime: (sec) => (this.timeLeft = Math.max(1, sec)),
        toggleClock: () => (this.devClockStopped = !this.devClockStopped),
        fillGauges: () => {
          this.skillCharge = this.chargeNeed;
          this.fever = 99.9;
        },
        win: () => {
          this.committed = Math.max(this.committed, this.hp);
          this.landed = Math.max(this.landed, this.hp);
        },
      };
    }
    this.track = battleTrack();
    Sound.music(this.track, 0.6);
    Sound.musicFilter(20000, 0.01);
    Sound.musicRate(1);
    this.intro();
  }

  /** Wooden bowl rim with a gold edge around a dark felt (Puni Puni-style round board). */
  /** Wooden stadium-shaped rim with a gold edge around a dark felt (Puni Puni-style bowl). */
  private drawBoardFrame(): void {
    const { w, h } = this.board;
    const R = w / 2;
    const x = this.boardX;
    const y = this.boardY;
    const fr = currentFrame();
    const wp = currentWallpaper();
    const ring = (k: number) => [x - k, y - k, w + k * 2, h + k * 2, R + k] as const;
    const texOf = (alias: string) => (alias.startsWith('wp:') ? Assets.get<PTexture>(wallpaperAlias(alias.slice(3))) : tex(alias));
    const g = new Graphics();
    g.roundRect(...ring(26)).fill({ color: 0x000000, alpha: 0.35 });
    if (fr.rim.tex) g.roundRect(...ring(24)).fill({ texture: texOf(fr.rim.tex), textureSpace: 'local' });
    else g.roundRect(...ring(24)).fill(grad(fr.rim.stops!));
    g.roundRect(...ring(24)).stroke({ width: 5, color: fr.line });
    g.roundRect(...ring(10)).stroke({ width: 9, color: fr.edge });
    g.roundRect(...ring(10)).stroke({ width: 3, color: fr.line, alignment: 1, alpha: 0.6 });
    // the floor inside the bowl: plain felt or a wallpaper, darkened so the pieces stay readable
    if (wp.img) {
      g.roundRect(...ring(6)).fill({ texture: Assets.get<PTexture>(wallpaperAlias(wp.id)), textureSpace: 'local' });
      g.roundRect(...ring(6)).fill({ color: 0x0a0618, alpha: 0.38 });
    } else g.roundRect(...ring(6)).fill(grad([[0, '#2c4a2a'], [0.6, '#1d3320'], [1, '#132416']]));
    g.roundRect(...ring(6)).stroke({ width: 4, color: 0x0e1a0c });
    // rivets along the rim
    const rr = R + 17;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      pts.push([x + R + Math.cos(a) * rr, y + R + Math.sin(a) * rr]);
      pts.push([x + R + Math.cos(a + Math.PI) * rr, y + h - R + Math.sin(a + Math.PI) * rr]);
    }
    for (const [rx, ry] of pts) {
      g.circle(rx, ry + 2, 6).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(rx, ry, 6).fill(fr.rivet);
      g.circle(rx - 2, ry - 2, 2).fill(0xffffff);
    }
    this.boardFrame.addChild(g);
  }

  private layoutStage(): void {
    this.col.x = App.colX;
    const W = App.W;
    this.backdrop.position.set(-App.colX, 0);
    this.backdrop.layout(W, this.stageH + 20);
    // versus: the boss steps aside for the opponent's mini board
    this.boss.position.set(this.vs ? 210 : 360, this.stageH - 22);
    const avail = this.stageH - 22 - (App.safeTop + 165);
    this.bossScale = Math.min(this.vs ? 0.8 : 1, avail / this.boss.height2) * (this.vs || this.ta || this.floors[this.floor]?.boss ? 1 : 0.8);
    this.boss.scale.set(this.bossScale);
    if (this.vs && !this.mini) this.buildMini();
    // the band below the stage
    const ground = new Graphics();
    ground.rect(-App.colX, this.stageH, W, App.H - this.stageH).fill(grad([[0, '#4a2c14'], [1, '#22140a']]));
    const band = jungle('band');
    band.anchor.set(0.5, 0);
    band.width = W + 40;
    band.height = 132;
    band.position.set(360, this.stageH - 26);
    this.col.addChildAt(ground, 1);
    this.col.addChildAt(band, 2);
    this.vignette.clear();
    this.vignette.rect(-App.colX, 0, W, App.H).stroke({ width: 60, color: 0xff2040, alpha: 1 });
    this.vignette.alpha = 0;
  }

  resize(): void {
    this.col.x = App.colX;
  }

  // ------------------------------------------------------------------ flow
  private async intro(): Promise<void> {
    this.board.fillInitial();
    this.boss.scale.set(0.2);
    this.boss.alpha = 0;
    gsap.to(this.boss, { alpha: 1, duration: 0.2, delay: 0.25 });
    gsap.to(this.boss.scale, { x: this.bossScale, y: this.bossScale, duration: 0.7, delay: 0.25, ease: 'elastic.out(1,0.5)' });
    gsap.delayedCall(0.3, () => {
      Sound.play('bong', { vol: 0.6 });
      this.boss.shout(0.6);
    });
    for (const [i, o] of [this.timer, this.scoreW, this.skillBtn, this.feverG].entries()) {
      const y = o.y;
      o.y -= 40;
      o.alpha = 0;
      gsap.to(o, { y, alpha: 1, duration: 0.5, delay: 0.1 + i * 0.06, ease: 'back.out(2)' });
    }
    await wait(0.6);
    Sound.play('jStart', { vol: 0.7 });
    await banner(this.overlay, 'READY', 360, this.boardY + this.board.h * 0.42, { size: 100, hold: 0.35 });
    Sound.play('highUp', { vol: 0.7 });
    Sound.chord(7);
    void banner(this.overlay, 'GO!!', 360, this.boardY + this.board.h * 0.42, { size: 150, color: 0xfff27a, stroke: 0x8a1f00, hold: 0.25 });
    this.phase = 'play';
    this.board.inputEnabled = true;
    this.vs?.start();
    for (const [i, id] of this.vsQueued.splice(0).entries()) gsap.delayedCall(1 + i * 1.5, () => void this.vsIncoming(id));
    if (!Save.data.tutorialDone && !this.vs) this.showTutorialHint();
  }

  private showTutorialHint(): void {
    const t = txt('同じ色のぷにを3つ以上なぞろう！たくさんつなぐほど強い！', { size: 30, stroke: 0x2a1630, strokeWidth: 8, color: 0xfff27a });
    t.position.set(360, this.boardY + this.board.h * 0.86);
    this.overlay.addChild(t);
    gsap.fromTo(t, { alpha: 0 }, { alpha: 1, duration: 0.3, delay: 0.5 });
    gsap.to(t, { alpha: 0, duration: 0.5, delay: 4.5, onComplete: () => t.destroy() });
    gsap.delayedCall(1.2, () => this.board.showHint());
  }

  update(dt: number): void {
    if (this.paused) return;
    this.t += dt;
    const playing = this.phase === 'play';
    if (playing) {
      // the clock stops during fever
      // in versus the clock never stops, so both players' rounds end together
      if ((this.vs || !this.feverOn) && !this.devClockStopped && this.stopT <= 0) this.timeLeft -= dt * (this.effects.has('timeFast') ? 2 : 1);
      const sec = Math.ceil(this.timeLeft);
      if (sec !== this.lastSecond) {
        this.lastSecond = sec;
        if (sec <= 10 && sec > 0) {
          Sound.play('tick', { vol: sec <= 5 ? 1 : 0.6, rate: sec <= 5 ? 1.3 : 1 });
          if (sec <= 5) {
            this.vignette.alpha = 0.35;
            gsap.to(this.vignette, { alpha: 0, duration: 0.6 });
            haptic(8);
          }
        }
        if (sec === 10) {
          Sound.musicRate(this.feverOn ? 1.14 : 1.07);
          this.floatText('ラスト10秒！', 360, this.boardY - 50, 0xff8aa0, 34);
        }
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        void this.timeUp();
      }
      // combo decay
      if (this.combo > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
      }
            // a full gauge fires the skill by itself (setting), between traces so it never cuts a chain
      if (this.skillCharge >= this.chargeNeed && Save.data.settings.autoSkill && this.board.chain.length === 0) void this.activateSkill();
      if (this.tapT > 0) {
        this.tapT -= dt;
        if (this.tapT <= 0) this.board.tapPop = false;
      }
      if (this.traceT > 0) {
        this.traceT -= dt;
        if (this.traceT <= 0) this.board.tracePop = false;
      }
      if (this.stopT > 0) this.stopT -= dt;
      if (this.reachT > 0) {
        this.reachT -= dt;
        if (this.reachT <= 0) this.board.reachMod = Math.max(0, this.board.reachMod - 0.9);
      }
      // fever
      if (this.feverOn) {
        this.feverT -= dt;
        if (this.feverT <= 0) this.endFever();
      }
      this.updateEffects(dt);
      if (this.vs) {
        this.vsSendT -= dt;
        this.vs.update(dt, this.committed);
        this.scoreW.setOpp(this.vs.oppScore);
        // our board goes out ~3 times a second; theirs is drawn as it arrives
        this.vsBoardT -= dt;
        if (this.vsBoardT <= 0) {
          this.vsBoardT = 0.3;
          this.vs.sendBoard(boardSnapshot(this.board), this.feverOn);
          if (this.vs.oppBoard) this.mini?.set(this.vs.oppBoard, this.vs.oppFever);
        }
      }
      // floor enemies and the boss hit the player now and then (not during fever or between floors)
      if (!this.vs && !this.ta && !this.feverOn && !this.floorBusy) {
        this.enemyAtkT -= dt;
        if (this.enemyAtkT <= 0) {
          const boss = this.floors[this.floor].boss;
          this.enemyAtkT = enemyAtkInterval(this.bossLv, boss);
          this.enemyStrike(enemyHit(this.bossLv, boss));
        }
      }
      // boss attack (the boss holds off during fever)
      if (!this.feverOn) this.bossAtkT -= dt;
      if (this.bossAtkT <= 0) {
        this.bossAtkT = bossAttackInterval(this.bossLv);
        void this.bossAttack();
      }
      // a board with no group of 3 gets a nudge so play never dead-ends
      this.stuckCheckT -= dt;
      if (this.stuckCheckT <= 0 && this.board.chain.length === 0) {
        this.stuckCheckT = 0.5;
        this.stuckT = this.board.bestGroup().length < 3 ? this.stuckT + 0.5 : 0;
        if (this.stuckT >= 1.5) {
          this.stuckT = 0;
          this.board.unstick();
          this.floatText('シャッフル！', 360, this.boardY + this.board.h * 0.5, 0x9be7ff, 40);
          Sound.play('cardShuffle', { vol: 0.6 });
        }
      }
      // hint
      if (this.board.chain.length === 0) {
        this.idleT += dt;
        if (this.idleT > 4.5 && !this.hintShown) {
          this.hintShown = true;
          this.board.showHint();
        }
      }
    }
    this.board.update(this.phase === 'cutin' ? 0 : dt);
    this.boss.rage = this.landed >= this.hp * 0.7 ? 1 : 0;
    this.boss.update(dt);
    if (!this.vs && !this.ta) this.drawDungeonHud();
    this.mini?.update(dt);
    if (this.walkT > 0) this.walkT -= dt;
    this.backdrop.update(dt, this.walkT > 0 ? 10 : this.feverOn ? 6 : 1);
    this.updateOrbs(dt);
    this.updateProjectiles(dt);
    this.fxTop.update(dt);
    this.timer.set(this.timeLeft, this.feverOn);
    this.scoreW.target = this.landed;
    this.scoreW.update(dt);
    const wasReady = this.skillBtn.isReady;
    this.skillBtn.set(Math.min(1, this.skillCharge / this.chargeNeed));
    if (!wasReady && this.skillBtn.isReady && this.phase === 'play' && !Save.data.settings.autoSkill) {
      // the move is ready: say it loud next to the button
      this.floatText('わざOK!', this.skillBtn.x + 150, this.skillBtn.y - 10, 0xfff27a, 46);
      Sound.play('powerUp', { vol: 0.6, rate: 1.3 });
      haptic([15, 40, 15]);
    }
    this.skillBtn.update(dt);
    this.feverG.value = this.fever;
    this.feverG.active = this.feverOn;
    this.feverG.activeP = this.feverT / FEVER_TIME;
    this.feverG.update(dt);
    this.comboL.set(this.combo, Math.min(1, Math.max(0, this.comboT / COMBO_WINDOW)));
    this.drawFeverFrame();
  }

  private drawFeverFrame(): void {
    const g = this.feverFrame;
    g.clear();
    if (!this.feverOn) return;
    const hue = (this.t * 240) % 360;
    const c = hslToHex(hue, 1, 0.6);
    const c2 = hslToHex((hue + 120) % 360, 1, 0.6);
    const { w, h } = this.board;
    const R = w / 2;
    const pulse = 0.6 + Math.sin(this.t * 14) * 0.25;
    g.roundRect(this.boardX - 28, this.boardY - 28, w + 56, h + 56, R + 28).stroke({ width: 10, color: c, alpha: pulse });
    g.roundRect(this.boardX - 10, this.boardY - 10, w + 20, h + 20, R + 10).stroke({ width: 6, color: c2, alpha: pulse });
  }

  // ----------------------------------------------------------------- input
  private bindInput(): void {
    const canvas = App.pixi.canvas;
    const local = (e: PointerEvent) => {
      const d = App.toDesign(e.clientX, e.clientY);
      const bv = this.board.view;
      // undo the tilt: rotate around the bowl center
      const x = d.x - App.colX - bv.x;
      const y = d.y - bv.y;
      const c = Math.cos(-bv.rotation);
      const sn = Math.sin(-bv.rotation);
      return { x: x * c - y * sn + bv.pivot.x, y: x * sn + y * c + bv.pivot.y };
    };
    const inBoard = (p: { x: number; y: number }) => p.x > -20 && p.x < this.board.w + 20 && p.y > -10 && p.y < this.board.h + 20;
    const down = (ev: Event) => {
      const e = ev as PointerEvent;
      Sound.unlock();
      // a primary pointerdown means no other touch is active: a lost pointerup must not lock the board
      if (e.isPrimary && this.pointerId !== null) {
        this.board.forceRelease();
        this.pointerId = null;
      }
      if (this.pointerId !== null || this.paused || this.phase !== 'play') return;
      const p = local(e);
      if (!inBoard(p)) return;
      this.pointerId = e.pointerId;
      this.board.pointerDown(p.x, p.y);
    };
    const move = (ev: Event) => {
      const e = ev as PointerEvent;
      if (e.pointerId !== this.pointerId || this.paused) return;
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      if (events.length) for (const ce of events) this.board.pointerMove(local(ce).x, local(ce).y);
      else this.board.pointerMove(local(e).x, local(e).y);
    };
    const up = (ev: Event) => {
      const e = ev as PointerEvent;
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (this.phase !== 'play') return;
      if (e.type === 'pointercancel') return this.board.cancelChain();
      // take the last stretch of the swipe into account before committing
      const p = local(e);
      this.board.pointerMove(p.x, p.y);
      this.board.pointerUp();
    };
    this.domHandlers = [
      ['pointerdown', down],
      ['pointermove', move],
      ['pointerup', up],
      ['pointercancel', up],
    ];
    for (const [n, h] of this.domHandlers) (n === 'pointerdown' ? canvas : window).addEventListener(n, h, { passive: true });
  }

  exit(): void {
    const canvas = App.pixi.canvas;
    for (const [n, h] of this.domHandlers) (n === 'pointerdown' ? canvas : window).removeEventListener(n, h);
    document.removeEventListener('visibilitychange', this.onVis);
    this.removeFab();
    Dev.battle = null;
    gsap.globalTimeline.resume();
    this.board.destroy();
    void unloadFairy(this.bossDef.bg);
  }

  // --------------------------------------------------------------- scoring
  private comboMult(): number {
    return 1 + Math.min(this.combo, 60) * 0.025;
  }

  private onChainChange(len: number, eff: number): void {
    if (len > 0) {
      this.idleT = 0;
      if (eff >= BOARD_TUNING.bombAt) this.feverFrame.alpha = 1;
    }
  }

  private onResolve(pops: PopInfo[], cause: PopCause, meta: { chain: number; color: number; x: number; y: number; tap?: boolean }): number {
    const token = this.nextToken++;
    if (pops.length === 0) return token;
    let weight = pops.reduce((a, p) => a + p.weight, 0);
    let mult = 1;
    let crit = false;
    if (cause === 'chain' || cause === 'fever') {
      mult *= chainMult(meta.chain);
      this.maxChain = Math.max(this.maxChain, meta.chain);
      if (cause === 'chain' && meta.chain >= 5 && Math.random() < 0.12) {
        crit = true;
        mult *= 1.5;
      }
    } else if (cause === 'bomb') mult *= 1.15;
    // tap skills: each tap does 3/5 of what the same group would as a chain
    if (meta.tap) mult *= 0.6;
    else if (cause === 'skill') mult *= this.skill.power * 0.6;
    else if (cause === 'rock') weight = pops.length * 2;
    if ((cause === 'chain' || cause === 'fever') && pops.some((p) => p.cursed)) {
      mult *= 0.5;
      this.floatText('のろわれた…', this.boardX + meta.x, this.boardY + meta.y - 40, 0xc58cff, 30);
    }
    if (this.def.passive?.kind === 'guard' && cause === 'chain' && meta.chain >= 7) mult *= 1.3;
    if (this.def.passive?.kind === 'oath' && this.feverOn) mult *= 1.2;
    if (this.effects.has('barrier')) mult *= 0.5;
    for (const p of pops) {
      if (p.kind === 'rock') this.round.broken++;
      else if (p.kind === 'normal' || p.kind === 'big') this.round.pops++;
    }
    if (cause === 'bomb') this.round.bombs++;
    if (cause === 'chain' && meta.chain >= 7) this.round.chains7++;
    // Tsum Tsum-style coins: 4+ chains (growing fast with length) and the character's coin skill
    let drop = 0;
    if (cause === 'chain' || cause === 'fever') drop = chainCoins(meta.chain);
    else if (cause === 'skill') drop = Math.round(pops.length * this.coinSkill.perPiece);
    else if (cause === 'bomb') drop = 3;
    if (drop > 0) this.dropCoins(drop, meta.x, meta.y);
    if (cause !== 'rock') {
      this.combo++;
      this.comboT = COMBO_WINDOW * (this.def.passive?.kind === 'shadow' ? 2 : 1);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    mult *= this.comboMult();
    if (this.feverOn) mult *= 2;
    // the big stadium board makes long chains easy; points are scaled so ranks/lines keep their meaning
    if (this.items.includes('score')) mult *= 1.1;
    const total = Math.round(this.atk * weight * mult * SCORE_SCALE);
    this.committed += total;
    const orbEvery = Math.max(1, Math.ceil(pops.length / 22));
    this.resolves.set(token, { total, remaining: total, perPiece: total / pops.length, n: pops.length, seen: 0, orbEvery, shown: false, crit, cause, color: meta.color });
    // gauges
    // no skill charge during fever / tap mode, or skills would chain into each other
    // the skill gauge fills in fever too (not while tapping, so tap skills can't chain themselves)
    if (cause !== 'skill' && this.tapT <= 0) this.skillCharge = Math.min(this.chargeNeed * 2, this.skillCharge + weight);
    if (!this.feverOn && cause !== 'rock') {
      // fever stops the clock; ~200 pieces per fever gives a normal round 2–3 fevers
      this.fever = Math.min(100, this.fever + weight * (cause === 'skill' ? 0.28 : 0.72));
      if (this.fever >= 100 && this.phase === 'play') this.startFever();
    }
    if (this.vs && (cause === 'chain' || cause === 'fever') && meta.chain >= 8 && !meta.tap) this.vsSend(`${meta.chain}チェイン！`);
    // callouts
    if (cause === 'chain') {
      const words: [number, string, number][] = [[12, 'すごすぎ！！', 0xff4fd8], [9, 'すごい！', 0xffb020], [7, 'いいね！', 0x7cf0ff], [5, 'ナイス！', 0xffffff]];
      const w = words.find(([n]) => meta.chain >= n);
      if (w) this.floatText(w[1], this.boardX + meta.x, this.boardY + meta.y - 70, w[2], 30 + Math.min(meta.chain, 14) * 1.5);
      if (meta.chain >= BOARD_TUNING.bombAt) Sound.duck(0.5, 0.2, 0.4);
    }
    if (crit) this.floatText('CRITICAL!', this.boardX + meta.x, this.boardY + meta.y - 120, 0xff5577, 40);
    if (this.combo > 0 && this.combo % 10 === 0) {
      Sound.sparkle();
      Sound.play('jLevel', { vol: 0.5 });
    }
    return token;
  }

  private onPiecePop(p: PopInfo, _index: number, _cause: PopCause, token: number): void {
    const r = this.resolves.get(token);
    if (!r) return;
    r.seen++;
    const last = r.seen >= r.n;
    if (!last && (r.seen - 1) % r.orbEvery !== 0) return;
    const amount = last ? r.remaining : Math.min(r.remaining, r.perPiece * r.orbEvery);
    r.remaining -= amount;
    if (last) this.resolves.delete(token);
    this.spawnOrb(this.boardX + p.x, this.boardY + p.y, amount, p.color, r);
  }

  // ------------------------------------------------------------------ orbs
  private spawnOrb(x: number, y: number, dmg: number, color: number, r: Resolve): void {
    const tint = color >= 0 ? COLORS[color].glow : r.cause === 'rock' ? 0xc0c4d8 : 0xffd23f;
    const s = new Sprite(fx('circle_05'));
    s.anchor.set(0.5);
    s.tint = tint;
    s.blendMode = 'add';
    s.scale.set(0.34);
    const core = new Sprite(fx('star_06'));
    core.anchor.set(0.5);
    core.blendMode = 'add';
    core.scale.set(0.22);
    this.orbLayer.addChild(s, core);
    const aim = this.boss.aimPoint();
    const x1 = this.boss.x + aim.x * this.bossScale;
    const y1 = this.boss.y + aim.y * this.bossScale;
    const side = Math.random() < 0.5 ? -1 : 1;
    const cx = (x + x1) / 2 + side * (120 + Math.random() * 160);
    const cy = Math.min(y, y1) + (y - y1) * 0.25;
    this.orbs.push({ s, core, t: 0, dur: 0.42 + Math.random() * 0.14, x0: x, y0: y, cx, cy, x1, y1, dmg, r, color: tint, trail: 0 });
  }

  private updateOrbs(dt: number): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt / o.dur;
      const k = Math.min(1, o.t);
      const e = k * k * (1.6 - 0.6 * k); // ease-in with a slight push
      const u = 1 - e;
      const x = u * u * o.x0 + 2 * u * e * o.cx + e * e * o.x1;
      const y = u * u * o.y0 + 2 * u * e * o.cy + e * e * o.y1;
      o.s.position.set(x, y);
      o.core.position.set(x, y);
      o.core.rotation += dt * 12;
      o.trail -= dt;
      if (o.trail <= 0) {
        o.trail = 0.016;
        this.fxTop.burst(x, y, { count: 1, speed: [0, 20], size: [0.22, 0.26], grow: 0.1, gravity: 0, add: true, tint: o.color, life: [0.18, 0.26], alpha: 0.7 });
      }
      if (k >= 1) {
        this.orbs.splice(i, 1);
        o.s.destroy();
        o.core.destroy();
        this.orbHit(o, o.r);
      }
    }
  }

  private orbHit(o: Orb, r: Resolve): void {
    const before = this.landed;
    this.landed += o.dmg;
    const power = Math.min(1.6, 0.4 + o.dmg / (this.atk * 6));
    this.boss.hit(power);
    this.fxTop.burst(o.x1, o.y1, { count: 7, tex: 'star_06', tint: [0xffffff, o.color], add: true, speed: [150, 420], size: [0.08, 0.18], gravity: 300, life: [0.25, 0.5] });
    this.fxTop.ring(o.x1, o.y1, o.color, 0.45, 0.25);
    this.fxTop.burst(o.x1, o.y1, { count: 1, tex: 'muzzle_02', tint: o.color, add: true, speed: [0, 0], size: [0.3, 0.3], grow: 1.6, gravity: 0, life: [0.12, 0.12], spin: 0 });
    Sound.play(['hit1', 'hit2', 'hit3'][Math.floor(Math.random() * 3)], { vol: 0.4 + power * 0.25, rate: 0.9 + Math.random() * 0.3 });
    if (!r.shown) {
      r.shown = true;
      this.damageLabel(r.total, r.crit || r.cause === 'skill');
      this.scoreW.bump();
      if (r.total > this.atk * 25) this.shake(8, 0.25);
    }
    if (this.ta) return;
    if (this.vs) {
      if (before < this.hp && this.landed >= this.hp && !this.brokeLine) {
        this.brokeLine = true;
        this.onLineBroken();
      }
    } else this.checkFloor();
  }

  /** Coins pop out of the board and fly to the counter. */
  private dropCoins(n: number, x: number, y: number): void {
    this.coinsEarned += n;
    const tx = this.coinLabel.x - 70;
    const ty = this.coinLabel.y;
    for (let i = 0; i < Math.min(Math.ceil(n / 3), 6); i++) {
      const c = coinIcon(14);
      c.position.set(this.boardX + x + (Math.random() - 0.5) * 40, this.boardY + y);
      this.fxTop.view.addChild(c);
      gsap.to(c, { y: c.y - 60 - Math.random() * 40, duration: 0.25, delay: i * 0.05, ease: 'power2.out' });
      gsap.to(c, {
        x: tx, y: ty, duration: 0.45, delay: 0.25 + i * 0.05, ease: 'power2.in', onComplete: () => {
          c.destroy();
          Sound.coin(i);
          this.coinLabel.text = String(this.coinsEarned);
          this.coinLabel.scale.set(1.3);
          gsap.to(this.coinLabel.scale, { x: 1, y: 1, duration: 0.25 });
        },
      });
    }
  }

  private damageLabel(n: number, big: boolean): void {
    const t = num(n.toLocaleString('en-US'), big ? 72 : 52, big ? 'NumRed' : 'NumGold');
    const x = this.boss.x + (Math.random() - 0.5) * 200;
    const y = this.boss.y - this.bossH * 0.6 - Math.random() * 40;
    t.position.set(x, y);
    this.fxTop.view.addChild(t);
    t.scale.set(0.3);
    gsap.to(t.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
    gsap.to(t, { y: y - 70, duration: 0.9, ease: 'power2.out' });
    gsap.to(t, { alpha: 0, duration: 0.3, delay: 0.7, onComplete: () => t.destroy() });
  }

  private floatText(s: string, x: number, y: number, color: number, size = 34): void {
    const t = txt(s, { size, font: 'dela', color, stroke: 0x2a1630, strokeWidth: 9 });
    t.position.set(Math.max(120, Math.min(600, x)), y);
    this.overlay.addChild(t);
    t.scale.set(0.2);
    gsap.to(t.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
    gsap.to(t, { y: y - 50, duration: 0.9, ease: 'power1.out' });
    gsap.to(t, { alpha: 0, duration: 0.3, delay: 0.65, onComplete: () => t.destroy() });
  }

  private onLineBroken(): void {
    Sound.play('bell', { vol: 0.8 });
    Sound.sparkle();
    this.boss.dizzy = true;
    this.emote('emote_swirl', 1.6);
    void banner(this.overlay, '討伐ライン突破！', 360, this.stageH * 0.55, { size: 60, color: 0xfff27a, stroke: 0x8a1f00, hold: 0.6, sub: 'のこり時間でスコアをのばそう！' });
  }

  private shake(amp: number, dur: number): void {
    const o = { a: amp };
    gsap.to(o, {
      a: 0,
      duration: dur,
      onUpdate: () => {
        this.view.x = (Math.random() - 0.5) * o.a * 2;
        this.view.y = (Math.random() - 0.5) * o.a * 2;
      },
      onComplete: () => this.view.position.set(0, 0),
    });
  }

  private emote(name: string, dur = 1.2): void {
    const glyph: Record<string, string> = { emote_exclamation: '！', emote_swirl: '＠', emote_laugh: 'ケケケ', emote_anger: '＃' };
    const c = new Container();
    const t = txt(glyph[name] ?? '！', { size: 40, font: 'dela', color: 0x3b2412 });
    const bg = new Graphics();
    const w = Math.max(64, t.width + 28);
    bg.roundRect(-w / 2, -32, w, 64, 32).fill(0xfff8e8).stroke({ width: 5, color: 0x3b2412 });
    bg.poly([-10, 28, 6, 28, -14, 46]).fill(0xfff8e8);
    c.addChild(bg, t);
    c.position.set(this.boss.x + 100, this.boss.y - this.bossH * 0.95);
    this.fxTop.view.addChild(c);
    c.scale.set(0);
    gsap.to(c.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
    gsap.to(c, { alpha: 0, duration: 0.3, delay: dur, onComplete: () => c.destroy({ children: true }) });
  }


  // ----------------------------------------------------------------- fever
  private startFever(): void {
    this.vsSend('フィーバー！');
    this.feverOn = true;
    this.feverT = FEVER_TIME + (this.def.passive?.kind === 'oath' ? 2 : 0);
    this.feverCount++;
    if (!this.vs && !this.ta) this.healPlayer(Math.round(PLAYER_HP * 0.2));
    this.board.fever = true;
    this.board.forceRelease();
    Sound.play('jFever', { vol: 0.8 });
    Sound.chord(5);
    Sound.music('fever', 0.25, 1, true);
    haptic([20, 40, 20]);
    void banner(this.overlay, 'FEVER!!', 360, this.boardY + this.board.h * 0.4, { size: 130, color: 0xff7ad9, stroke: 0x4a0040, hold: 0.4, sub: 'スコア2倍＆つながりやすい！' });
    for (let i = 0; i < 4; i++) {
      gsap.delayedCall(i * 0.12, () =>
        this.fxTop.burst(this.boardX + Math.random() * 680, this.boardY - 20, { count: 12, tex: 'star_06', tint: COLORS.map((c) => c.glow), add: true, speed: [100, 400], size: [0.08, 0.2], gravity: 400, life: [0.6, 1.1], dir: Math.PI / 2, spread: 2.4 }),
      );
    }
  }

  private endFever(): void {
    this.feverOn = false;
    this.fever = 0;
    this.board.fever = false;
    Sound.music(this.track, 0.5);
    Sound.musicRate(this.timeLeft <= 10 ? 1.07 : 1);
    Sound.play('lowDown', { vol: 0.4 });
  }

  // ----------------------------------------------------------------- skill
  private async activateSkill(): Promise<void> {
    if (this.phase !== 'play' || this.paused || this.skillCharge < this.chargeNeed || this.effects.has('skillSeal')) return;
    this.phase = 'cutin';
    this.board.forceRelease();
    this.board.inputEnabled = false;
    this.pointerId = null;
    // pieces past a full gauge carry over to the next one
    this.skillCharge = Math.max(0, this.skillCharge - this.chargeNeed);
    this.skillUses++;
    this.vsSend('必殺技！');
    if (this.coinSkill.flat) gsap.delayedCall(1.1, () => this.dropCoins(this.coinSkill.flat, this.board.w / 2, this.board.h * 0.4));
    await this.cutIn();
    if (this.phase !== 'cutin') return;
    this.phase = 'play';
    this.board.inputEnabled = true;
    this.runSkill();
  }

  private cutIn(): Promise<void> {
    return new Promise((resolve) => {
      const W = App.W;
      const ov = new Container();
      this.overlay.addChild(ov);
      const dim = new Graphics().rect(-App.colX, 0, W, App.H).fill({ color: 0x0a0418, alpha: 0.65 });
      const cy = this.boardY + this.board.h * 0.35;
      const bandC = new Container();
      bandC.position.set(360, cy);
      bandC.rotation = -0.12;
      const rc = RARITY_INFO[this.def.rarity].color;
      const band = new Graphics().rect(-W, -130, W * 2, 260).fill(grad([[0, '#ffffff'], [0.08, hex(rc)], [0.92, hex(rc)], [1, '#ffffff']]));
      const lines = new Graphics();
      for (let i = 0; i < 40; i++) lines.rect(-W + Math.random() * W * 2, -125 + Math.random() * 250, 60 + Math.random() * 200, 3 + Math.random() * 4).fill({ color: 0xffffff, alpha: 0.6 });
      const lineMask = new Graphics().rect(-W, -130, W * 2, 260).fill(0xffffff);
      lines.mask = lineMask;
      const chara = new Sprite(bigTexture(this.def));
      chara.anchor.set(0.5, 0.55);
      chara.scale.set(1.4);
      chara.position.set(W, 0);
      chara.rotation = 0.12;
      const name = txt(this.def.skill.name, { size: 62, font: 'dela', color: 0xffffff, stroke: 0x2a1630, strokeWidth: 12 });
      name.anchor.set(0.5);
      name.position.set(-W, 40);
      name.rotation = 0.12;
      const who = txt(`${this.def.name}の必殺技！`, { size: 28, stroke: 0x2a1630, strokeWidth: 7 });
      who.position.set(-W, -40);
      who.rotation = 0.12;
      bandC.addChild(band, lines, lineMask, chara, who, name);
      // Puni Puni-style burst of rays behind the band
      const rays = new Graphics();
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * Math.PI * 2;
        rays.poly([0, 0, Math.cos(a0) * 1400, Math.sin(a0) * 1400, Math.cos(a0 + 0.12) * 1400, Math.sin(a0 + 0.12) * 1400]).fill({ color: i % 2 ? rc : 0xffffff, alpha: 0.35 });
      }
      rays.position.set(360, cy);
      rays.alpha = 0;
      const tag = txt('必殺技！', { size: 34, font: 'dela', color: rc, stroke: 0xffffff, strokeWidth: 8 });
      tag.position.set(-W, -96);
      tag.rotation = -0.05;
      bandC.addChild(tag);
      ov.addChild(dim, rays, bandC);
      dim.alpha = 0;
      bandC.scale.set(1, 0);
      Sound.whoosh(0.5);
      Sound.duck(0.25, 0.8, 0.5);
      Sound.musicFilter(900, 0.15);
      Sound.play('powerUp', { vol: 0.8 });
      haptic([15, 30, 15]);
      const tl = gsap.timeline({
        onComplete: () => {
          ov.destroy({ children: true });
          Sound.musicFilter(20000, 0.3);
          resolve();
        },
      });
      tl.to(dim, { alpha: 1, duration: 0.15 }, 0);
      tl.to(bandC.scale, { y: 1, duration: 0.22, ease: 'back.out(2)' }, 0);
      tl.to(chara, { x: 170, duration: 0.35, ease: 'power3.out' }, 0.05);
      tl.to(who, { x: -150, duration: 0.3, ease: 'power3.out' }, 0.1);
      tl.to(name, { x: -110, duration: 0.35, ease: 'power3.out' }, 0.14);
      tl.to(tag, { x: -200, duration: 0.3, ease: 'back.out(2)' }, 0.2);
      tl.to(rays, { alpha: 1, duration: 0.2 }, 0.05);
      tl.to(rays, { rotation: 0.8, duration: 1.0, ease: 'none' }, 0);
      tl.fromTo(name.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' }, 0.3);
      tl.to(rays, { alpha: 0, duration: 0.15 }, 0.8);
      tl.add(() => {
        Sound.chord(9);
        Sound.play('zap', { vol: 0.6 });
      }, 0.3);
      tl.to(lines, { x: -300, duration: 0.95, ease: 'none' }, 0);
      tl.to(chara.scale, { x: 1.55, y: 1.55, duration: 0.45, ease: 'sine.inOut' }, 0.3);
      tl.to(bandC.scale, { y: 0, duration: 0.16, ease: 'power2.in' }, 0.8);
      // white flash as the move fires
      const flash = new Graphics().rect(-App.colX, 0, W, App.H).fill(0xffffff);
      flash.alpha = 0;
      ov.addChild(flash);
      tl.to(flash, { alpha: 0.8, duration: 0.06 }, 0.86);
      tl.to(flash, { alpha: 0, duration: 0.14 }, 0.92);
      tl.to(dim, { alpha: 0, duration: 0.18 }, 0.8);
    });
  }

  // ----------------------------------------------------------- skill moves
  /** A rendered 3D prop (sword, axe…) sized to `h` px tall, on the overlay. */
  private prop(k: string, h: number): Sprite {
    const t = k.startsWith('obs:') ? obstacleTexture(k.slice(4) as ObstacleArt) : Assets.get<PTexture>(`fx3d:${k}`) ?? fx('star_06');
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.scale.set(h / Math.max(1, t.height));
    this.overlay.addChild(s);
    return s;
  }

  /** Glittering trail behind a moving prop. */
  private trail(s: Sprite, color: number, dur: number): void {
    const o = { t: 0 };
    gsap.to(o, {
      t: 1, duration: dur, onUpdate: () => {
        if (s.destroyed) return;
        this.fxTop.burst(s.x, s.y, { count: 2, tex: 'star_06', tint: [color, 0xffffff], add: true, speed: [20, 120], size: [0.08, 0.16], gravity: 0, life: [0.2, 0.4] });
      },
    });
  }

  /** A big prop sweeps along a line through the bowl; pieces pop in a wave behind it. */
  private slash(k: string, cx: number, cy: number, a: number, width: number, color: number): void {
    const b = this.board;
    const L = b.w * 0.62;
    const x0 = this.boardX + cx - Math.cos(a) * L;
    const y0 = this.boardY + cy - Math.sin(a) * L;
    const x1 = this.boardX + cx + Math.cos(a) * L;
    const y1 = this.boardY + cy + Math.sin(a) * L;
    const s = this.prop(k, Math.max(260, width * 2.6));
    s.position.set(x0, y0);
    s.rotation = a + Math.PI / 2 - 0.5;
    this.trail(s, color, 0.34);
    gsap.to(s, { x: x1, y: y1, rotation: a + Math.PI / 2 + 0.5, duration: 0.34, ease: 'power2.inOut' });
    gsap.to(s, { alpha: 0, duration: 0.15, delay: 0.32, onComplete: () => s.destroy() });
    Sound.whoosh(0.6);
    Sound.play('laser', { vol: 0.6, rate: 0.7 });
    // the beam and the wave start from where the prop enters
    gsap.delayedCall(0.08, () => {
      this.beam(this.boardX + cx, this.boardY + cy, a, width * 2);
      const sx = cx - Math.cos(a) * L;
      const sy = cy - Math.sin(a) * L;
      this.zap((x, y) => Math.abs(-(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)) < width, sx, sy, color);
    });
  }

  /** Inside the bowl (board coordinates). */
  private inBowl(x: number, y: number): boolean {
    const b = this.board;
    const R = b.w / 2;
    if (!b.round) return x >= 0 && x <= b.w && y >= 0 && y <= b.h;
    const cy = Math.max(R, Math.min(b.h - R, y));
    return Math.hypot(x - R, y - cy) < R - 2;
  }

  /**
   * Lights up exactly the area a move clears (a tiled silhouette over the bowl) and pops every piece
   * whose center is inside it, so the shape of each move reads at a glance.
   */
  private zap(inside: (x: number, y: number) => boolean, ox: number, oy: number, color: number): void {
    const b = this.board;
    const c = Math.max(6, b.r * 0.3);
    const g = new Graphics();
    const edge = new Graphics();
    const inn = (x: number, y: number): boolean => this.inBowl(x, y) && inside(x, y);
    for (let y = c / 2; y < b.h; y += c) {
      for (let x = c / 2; x < b.w; x += c) {
        if (!inn(x, y)) continue;
        g.rect(x - c / 2, y - c / 2, c + 0.5, c + 0.5);
        // cells on the border get a bright outline so the shape reads clearly
        if (!inn(x - c, y) || !inn(x + c, y) || !inn(x, y - c) || !inn(x, y + c)) edge.rect(x - c / 2, y - c / 2, c + 0.5, c + 0.5);
      }
    }
    g.fill({ color, alpha: 0.5 });
    edge.fill({ color: 0xffffff, alpha: 0.95 });
    const shape = new Container();
    shape.addChild(g, edge);
    shape.blendMode = 'add';
    shape.position.set(this.boardX, this.boardY);
    this.overlay.addChild(shape);
    shape.alpha = 0;
    gsap.to(shape, { alpha: 1, duration: 0.08 });
    gsap.to(shape, { alpha: 0, duration: 0.5, delay: 0.6, onComplete: () => shape.destroy({ children: true }) });
    b.popWhere((p) => inside(p.x, p.y), ox, oy);
  }

  /** Point-in-shape tests for the 'shape' move, in units of the shape's radius (v grows downward). */
  private shapeTest(shape: ShapeId, cx: number, cy: number, S: number): (x: number, y: number) => boolean {
    const b = this.board;
    const r = b.r;
    return (x, y) => {
      const u = (x - cx) / S;
      const v = (y - cy) / S;
      const d = Math.hypot(u, v);
      switch (shape) {
        case 'heart': {
          const hu = u * 1.15;
          const hv = -v * 1.15 + 0.25;
          return (hu * hu + hv * hv - 1) ** 3 - hu * hu * hv ** 3 <= 0;
        }
        case 'star': {
          const a = Math.atan2(u, -v);
          const seg = Math.PI / 5;
          const k = Math.abs(((a % (2 * seg)) + 2 * seg) % (2 * seg) - seg) / seg;
          return d <= 0.42 + 0.63 * k;
        }
        case 'diamond':
          return Math.abs(u) * 0.85 + Math.abs(v) * 0.75 <= 0.85;
        case 'triangle':
          return v <= 0.75 && Math.abs(u) <= (v + 1.05) * 0.62;
        case 'square':
          return Math.max(Math.abs(u), Math.abs(v)) <= 0.78;
        case 'plus':
          return (Math.abs(u) < 0.3 && Math.abs(v) < 1.15) || (Math.abs(v) < 0.3 && Math.abs(u) < 1.15);
        case 'x':
          return d < 1.25 && (Math.abs(u - v) < 0.38 || Math.abs(u + v) < 0.38);
        case 'zigzag': {
          const t = (((u * 1.4) % 2) + 2) % 2;
          return Math.abs(v - (Math.abs(t - 1) - 0.5) * 1.1) < 0.3;
        }
        case 'wave':
          return Math.abs(v - 0.5 * Math.sin(u * 2.6)) < 0.3;
        case 'spiral': {
          if (d > 1.25) return false;
          const turn = 0.62;
          const a = (Math.atan2(v, u) + Math.PI * 2) % (Math.PI * 2);
          const ph = (((d - (a / (Math.PI * 2)) * turn) % turn) + turn) % turn;
          return ph < 0.26 || d < 0.18;
        }
        case 'crescent':
          return d <= 1 && Math.hypot(u - 0.48, v + 0.18) > 0.8;
        case 'hourglass':
          return Math.abs(v) <= 1.05 && Math.abs(u) <= Math.abs(v) * 0.85 + 0.12;
        case 'chevron':
          return Math.abs(v - (Math.abs(u) * 0.85 - 0.45)) < 0.3 && Math.abs(u) < 1.2;
        case 'twin':
          return Math.hypot(u - 0.58, v) < 0.52 || Math.hypot(u + 0.58, v) < 0.52;
        case 'checker':
          return (Math.floor(x / (r * 2.6)) + Math.floor(y / (r * 2.6))) % 2 === 0;
        case 'top':
          return y < b.h * 0.42;
        case 'hline2':
          return Math.abs(v + 0.55) < 0.24 || Math.abs(v - 0.55) < 0.24;
        case 'smile':
          return Math.hypot(u + 0.42, v + 0.38) < 0.22 || Math.hypot(u - 0.42, v + 0.38) < 0.22 || (v > 0.05 && Math.abs(d - 0.75) < 0.2);
      }
      return false;
    };
  }

  /** A big prop drops onto (x, y) and blasts a circle. */
  private slam(k: string, x: number, y: number, radius: number, h: number, pop: () => void): void {
    const s = this.prop(k, h);
    const tx = this.boardX + x;
    const ty = this.boardY + y;
    s.position.set(tx, -h);
    s.rotation = -0.6;
    s.scale.set(s.scale.x * 1.6);
    const sc = s.scale.x / 1.6;
    Sound.whoosh(0.7, true);
    gsap.to(s, { y: ty, rotation: 0, duration: 0.38, ease: 'power3.in' });
    gsap.to(s.scale, {
      x: sc, y: sc, duration: 0.38, ease: 'power3.in', onComplete: () => {
        this.board.shockwave(x, y, radius * 1.2);
        this.fxTop.ring(tx, ty, 0xffffff, radius / 70, 0.4);
        this.fxTop.burst(tx, ty, { count: 24, tex: 'star_06', tint: [0xffffff, 0xfff27a], add: true, speed: [200, 700], size: [0.1, 0.22], gravity: 400 });
        Sound.explosion(true);
        Sound.play('hitHeavy', { vol: 0.9, rate: 0.7 });
        this.shake(12, 0.35);
        haptic([30, 20, 40]);
        pop();
        gsap.to(s.scale, { x: sc * 1.15, y: sc * 0.85, duration: 0.08, yoyo: true, repeat: 1 });
        gsap.to(s, { alpha: 0, duration: 0.3, delay: 0.25, onComplete: () => s.destroy() });
      },
    });
  }

  /** Props fly from the character gauge to each target; each target pops on arrival. */
  private volley(k: string, targets: import('../game/Board').Piece[], h: number, spin: boolean, gap = 0.05): void {
    const b = this.board;
    targets.forEach((q, i) => {
      gsap.delayedCall(i * gap, () => {
        if (q.state !== 'live') return;
        q.state = 'popping';
        const s = this.prop(k, h);
        const x0 = this.skillBtn.x + (Math.random() - 0.5) * 60;
        const y0 = this.skillBtn.y;
        s.position.set(x0, y0);
        const tx = this.boardX + q.x;
        const ty = this.boardY + q.y;
        s.rotation = Math.atan2(ty - y0, tx - x0) + Math.PI / 2;
        if (i % 3 === 0) Sound.play('laser', { vol: 0.35, rate: 1.4 + Math.random() * 0.4 });
        gsap.to(s, { x: tx, y: ty, rotation: spin ? s.rotation + 6 : s.rotation, duration: 0.24, ease: 'power1.in', onComplete: () => {
          s.destroy();
          q.state = 'live';
          this.fxTop.burst(tx, ty, { count: 6, tex: 'star_06', tint: 0xffffff, add: true, speed: [80, 260], size: [0.06, 0.14], life: [0.2, 0.4] });
          b.popWhere((p) => p === q, q.x, q.y);
        } });
      });
    });
  }

  /** Lightning (or any prop) flashes down onto each target. */
  private strikes(k: string, targets: import('../game/Board').Piece[], pop: () => void): void {
    const n = Math.min(targets.length, 14);
    for (let i = 0; i < n; i++) {
      const q = targets[Math.floor((i / n) * targets.length)];
      gsap.delayedCall(i * 0.04, () => {
        const s = this.prop(k, 150);
        s.position.set(this.boardX + q.x, this.boardY + q.y - 60);
        s.alpha = 0;
        gsap.to(s, { alpha: 1, duration: 0.05, yoyo: true, repeat: 3, onComplete: () => s.destroy() });
        if (i % 3 === 0) Sound.play('zap', { vol: 0.5, rate: 0.9 + Math.random() * 0.4 });
      });
    }
    gsap.delayedCall(n * 0.04 + 0.12, () => {
      this.flashBoard(0xffffff);
      this.shake(8, 0.3);
      pop();
    });
  }

  /** Props run once around the bowl's rim. */
  private orbit(k: string, count: number, dur: number): void {
    const b = this.board;
    const R = b.w / 2;
    for (let i = 0; i < count; i++) {
      const s = this.prop(k, 70);
      const o = { a: (i / count) * Math.PI * 2 };
      const place = () => s.position.set(this.boardX + R + Math.cos(o.a) * (R - 10), this.boardY + R + Math.sin(o.a) * (R - 10));
      place();
      gsap.to(o, { a: o.a + Math.PI * 2, duration: dur, ease: 'power1.inOut', onUpdate: () => {
        place();
        s.rotation += 0.3;
        this.fxTop.burst(s.x, s.y, { count: 1, tex: 'star_06', tint: 0xfff27a, add: true, speed: [0, 40], size: [0.1, 0.16], gravity: 0, life: [0.2, 0.3] });
      }, onComplete: () => s.destroy() });
    }
  }

  /** Which prop each character's move uses (rendered KayKit models). */
  private static PROPS: Record<string, string> = {
    kh_a: 'obs:bomb', kh_b: 'sword', kh_c: 'axe', rh_a: 'star', rh_b: 'star', rh_c: 'star', mh_a: 'staff', mh_b: 'sword', mh_c: 'staff',
    bh_a: 'hammer', bh_b: 'star', l_knight: 'shield', l_barbarian: 'obs:bomb', skull: 'obs:skull', skel_minion: 'obs:bone_a',
    knight: 'lightning', barbarian: 'hammer', rogue: 'dagger', hood: 'dagger', skel_warrior: 'sword', skel_rogue: 'dagger',
    c_student: 'obs:book', c_short: 'star', c_merchant: 'obs:sack', c_archer: 'arrow', c_ninja: 'dagger', c_knight: 'sword',
    c_kuro: 'lightning', c_pony: 'dagger', c_maskbob: 'star', c_maskT: 'shield', c_pumpkin: 'obs:bomb', b_chan: 'star', b_chanG: 'lightning',
    q_chicken: 'star', q_pigeon: 'star', q_dog: 'obs:bomb', q_cat: 'dagger', q_henry: 'star', q_anne: 'sword', q_yeti: 'shield', q_goleling: 'lightning', q_orc: 'shield', q_ninja: 'dagger', q_dragon: 'lightning', q_captain: 'obs:bomb',
    s_lp1: 'star', s_lp2: 'shield', s_lp3: 'star', s_lp4: 'star', s_neko: 'dagger', s_yste: 'arrow', s_priest: 'obs:book', s_mage: 'lightning', s_witch: 'obs:bomb', s_hound: 'lightning',
  };

  private runSkill(): void {
    const b = this.board;
    const s = this.skill;
    const r = b.r;
    const R = b.w / 2;
    const M = b.h / 2;
    const size = (s.size ?? 2) * r;
    const counts = b.colorCounts();
    const order = counts.map((c, i) => [c, i]).sort((a, z) => z[0] - a[0]).map(([, i]) => i);
    const prop = BattleScene.PROPS[this.def.id] ?? 'star';
    const glow = RARITY_INFO[this.def.rarity].color;
    const pieces = () => b.live().filter((p) => (p.kind === 'normal' || p.kind === 'big') && b.onBoard(p));
    switch (s.kind) {
      case 'bombs':
        for (let i = 0; i < (s.amount ?? 1); i++) {
          gsap.delayedCall(i * 0.18, () => {
            const bomb = b.spawnBomb(R + (Math.random() - 0.5) * R * 0.6, -r, i >= 1 && this.growth.skill >= 3);
            bomb.body.velocity.y = 900;
            this.fxTop.ring(this.boardX + bomb.x, this.boardY + 40, 0xfff27a, 1.2, 0.4);
          });
        }
        this.skillHit(10, 0xffd23f);
        break;
      case 'megaBombs':
        // big bombs only (each clears a wide area when tapped)
        for (let i = 0; i < (s.amount ?? 3); i++) {
          gsap.delayedCall(i * 0.2, () => {
            const bomb = b.spawnBomb(R + (Math.random() - 0.5) * R * 0.7, -r, true);
            bomb.body.velocity.y = 900;
            this.fxTop.ring(this.boardX + bomb.x, this.boardY + 40, 0xff9a1f, 1.4, 0.45);
          });
        }
        this.skillHit(12, 0xff9a1f);
        break;
      case 'hline':
        this.slash(prop, R, M + R * 0.2, 0, size, glow);
        break;
      case 'vline': {
        // the axe chops straight down
        const cx = R + (Math.random() - 0.5) * R * 0.5;
        this.slam(prop, cx, M, size, 300, () => {
          this.beam(this.boardX + cx, this.boardY + M, Math.PI / 2, size * 2);
          this.zap((x) => Math.abs(x - cx) < size, cx, 0, glow);
        });
        break;
      }
      case 'diag':
        this.slash(prop, R, M + R * 0.1, Math.random() < 0.5 ? Math.PI / 4 : -Math.PI / 4, size, 0xcfa3ff);
        break;
      case 'cross': {
        const cx = R + (Math.random() - 0.5) * R * 0.3;
        const cy = M + R * 0.15;
        this.slash(prop, cx, cy, 0, size, glow);
        gsap.delayedCall(0.18, () => this.slash(prop, cx, cy, Math.PI / 2, size, glow));
        break;
      }
      case 'random': {
        const pick = pieces().sort(() => Math.random() - 0.5).slice(0, s.amount ?? 8);
        this.volley(prop, pick, prop === 'dagger' ? 120 : 64, prop !== 'dagger', Math.min(0.05, 1.2 / Math.max(1, pick.length)));
        break;
      }
      case 'circle': {
        const cx = R;
        const cy = M + R * 0.15;
        this.slam(prop, cx, cy, size, prop === 'shield' ? 300 : 240, () => this.zap((x, y) => Math.hypot(x - cx, y - cy) < size, cx, cy, glow));
        break;
      }
      case 'bottom': {
        const top = b.h - size * 2;
        this.slam(prop, R, b.h - size, size * 1.4, 340, () => {
          this.flashBoard(0xffb070);
          b.shockwave(R, b.h, size * 2);
          this.zap((_x, y) => y > top, R, b.h, 0xffb070);
        });
        break;
      }
      case 'rim':
        this.orbit(prop, 6, 0.6);
        gsap.delayedCall(0.1, () => {
          this.flashBoard(0x9be7ff);
          this.zap((x, y) => Math.hypot(x - R, y - Math.max(R, Math.min(b.h - R, y))) > R - size * 1.25, R, 0, 0x9be7ff);
        });
        Sound.whoosh(0.6);
        break;
      case 'paint': {
        const target = order[0];
        const others = b.live().filter((p) => p.kind === 'normal' && p.color !== target).sort(() => Math.random() - 0.5).slice(0, s.amount ?? 10);
        // colored splashes fly to each piece before it turns
        others.forEach((q, i) => gsap.delayedCall(i * 0.04, () => {
          const d = new Sprite(fx('circle_05'));
          d.anchor.set(0.5);
          d.tint = COLORS[target].hex;
          d.scale.set(0.25);
          d.position.set(this.skillBtn.x, this.skillBtn.y);
          this.overlay.addChild(d);
          gsap.to(d, { x: this.boardX + q.x, y: this.boardY + q.y, duration: 0.25, ease: 'power1.in', onComplete: () => d.destroy() });
        }));
        gsap.delayedCall(0.28, () => b.recolor(others, target));
        this.skillHit(10, COLORS[target].glow);
        break;
      }
      case 'bigMaker': {
        const list = b.live().filter((p) => p.kind === 'normal').sort(() => Math.random() - 0.5).slice(0, s.amount ?? 6);
        list.forEach((q, i) => gsap.delayedCall(i * 0.1, () => {
          const st = this.prop('star', 90);
          st.position.set(this.boardX + q.x, this.boardY + q.y - 160);
          gsap.to(st, { y: this.boardY + q.y, rotation: 3, duration: 0.25, ease: 'power2.in', onComplete: () => st.destroy() });
        }));
        gsap.delayedCall(0.25, () => b.makeBig(list));
        this.skillHit(10, 0x9be7ff);
        break;
      }
      case 'tapPop':
        this.orbit(prop, 4, 1.2);
        this.startTapPop(s.dur ?? 5);
        this.skillHit(6, 0xff7ad9);
        break;
      case 'feverTap':
        this.orbit(prop, 6, 1);
        this.fever = 100;
        if (!this.feverOn) this.startFever();
        else this.feverT = FEVER_TIME;
        this.startTapPop(FEVER_TIME);
        this.skillHit(12, 0xff7ad9);
        break;
      case 'colorBlast': {
        const c = order[0];
        this.strikes(prop, pieces().filter((p) => p.color === c), () => b.popWhere((p) => p.color === c, R, M));
        break;
      }
      case 'twoColor': {
        // two giant swords cross the whole bowl, then both colors shatter
        this.slash(prop, R, M, Math.PI / 4, 1, 0xffd23f);
        gsap.delayedCall(0.12, () => this.slash(prop, R, M, -Math.PI / 4, 1, 0xffd23f));
        gsap.delayedCall(0.4, () => {
          this.flashBoard(0xffd23f);
          b.shockwave(R, M, b.h);
          b.popWhere((p) => p.color === order[0] || p.color === order[1], R, M);
          Sound.explosion(true);
          this.shake(12, 0.4);
        });
        break;
      }
      case 'timePlus': {
        // the clock gets extra seconds, then a few pieces pop
        this.timeLeft += s.dur ?? 2;
        this.floatText(`+${s.dur ?? 2}びょう！`, this.skillBtn.x, this.skillBtn.y - 80, 0x9be7ff, 44);
        Sound.play('powerUp2', { vol: 0.7 });
        const pick = pieces().sort(() => Math.random() - 0.5).slice(0, s.amount ?? 5);
        this.volley(prop, pick, 90, true, 0.08);
        break;
      }
      case 'ring': {
        // a donut around the middle: the very center survives
        const cx = R;
        const cy = M + R * 0.1;
        const inner = R * 0.28;
        const outer = inner + size * 2;
        this.orbit(prop, 5, 0.5);
        gsap.delayedCall(0.35, () => {
          this.flashBoard(0xffc0e8);
          this.fxTop.ring(this.boardX + cx, this.boardY + cy, 0xffc0e8, outer / 70, 0.45);
          b.shockwave(cx, cy, outer);
          this.zap((x, y) => {
            const d = Math.hypot(x - cx, y - cy);
            return d > inner && d < outer;
          }, cx, cy, 0xffc0e8);
          Sound.explosion(false);
        });
        break;
      }
      case 'bombMaker': {
        // pieces pop and leave bombs where they were
        const list = pieces().sort(() => Math.random() - 0.5).slice(0, s.amount ?? 3);
        list.forEach((q, i) => gsap.delayedCall(i * 0.15, () => {
          if (q.state !== 'live') return;
          const x = q.x;
          const y = q.y;
          const bag = this.prop(prop, 90);
          bag.position.set(this.boardX + x, this.boardY + y - 140);
          gsap.to(bag, { y: this.boardY + y, rotation: 0.6, duration: 0.22, ease: 'power2.in', onComplete: () => {
            bag.destroy();
            b.popWhere((p) => p === q, x, y);
            gsap.delayedCall(0.12, () => b.spawnBomb(x, y, i >= 2 && this.growth.skill >= 4));
          } });
        }));
        this.skillHit(8, 0xffd23f);
        break;
      }
      case 'arrows': {
        // thin vertical columns, spread across the bowl, each hit by a falling arrow
        const n = s.amount ?? 3;
        for (let i = 0; i < n; i++) {
          const cx = R + (((i + 0.5) / n) - 0.5) * R * 1.5 + (Math.random() - 0.5) * r;
          gsap.delayedCall(i * 0.16, () => this.slam(prop, cx, M, size, 220, () => {
            this.beam(this.boardX + cx, this.boardY + M, Math.PI / 2, size * 2);
            this.zap((x) => Math.abs(x - cx) < size, cx, 0, glow);
          }));
        }
        break;
      }
      case 'shuriken': {
        // small blasts at spread-out spots
        const spots = pieces().sort(() => Math.random() - 0.5);
        const picked: { x: number; y: number }[] = [];
        for (const q of spots) {
          if (picked.length >= (s.amount ?? 5)) break;
          if (picked.every((o) => Math.hypot(o.x - q.x, o.y - q.y) > size * 1.6)) picked.push({ x: q.x, y: q.y });
        }
        picked.forEach((o, i) => gsap.delayedCall(i * 0.1, () => {
          const st = this.prop(prop, 110);
          st.position.set(this.skillBtn.x, this.skillBtn.y);
          gsap.to(st, { x: this.boardX + o.x, y: this.boardY + o.y, rotation: 8, duration: 0.25, ease: 'power1.in', onComplete: () => {
            st.destroy();
            this.fxTop.ring(this.boardX + o.x, this.boardY + o.y, 0xfff27a, size / 70, 0.3);
            b.shockwave(o.x, o.y, size * 1.2);
            this.zap((x, y) => Math.hypot(x - o.x, y - o.y) < size, o.x, o.y, 0xfff27a);
            Sound.play('hitHeavy', { vol: 0.5, rate: 1.3 });
          } });
        }));
        break;
      }
      case 'xBlast': {
        // two wide slashes cross in the middle, and the fever gauge jumps
        this.slash(prop, R, M, Math.PI / 4, size, 0xff7ad9);
        gsap.delayedCall(0.16, () => this.slash(prop, R, M, -Math.PI / 4, size, 0xff7ad9));
        gsap.delayedCall(0.45, () => {
          this.shake(10, 0.35);
          if (!this.feverOn) {
            this.fever = Math.min(100, this.fever + 30);
            if (this.fever >= 100 && this.phase === 'play') this.startFever();
          }
        });
        break;
      }
      case 'shape': {
        // the shape is drawn in light over the bowl, then everything inside it pops
        const cx = R;
        const cy = M + R * 0.1;
        const S = size;
        const inside = this.shapeTest(s.shape ?? 'heart', cx, cy, S);
        const SHAPE_COLOR: Partial<Record<ShapeId, number>> = { heart: 0xff7ab8, star: 0xffe066, crescent: 0xfff2a0, spiral: 0x9be7ff, wave: 0x7ad7ff, checker: 0xc9a0ff };
        const col = SHAPE_COLOR[s.shape ?? 'heart'] ?? glow;
        // no prop in the way: the outline itself is the show
        Sound.whoosh(0.5, true);
        gsap.delayedCall(0.15, () => {
          b.shockwave(cx, cy, S * 1.4);
          Sound.explosion(false);
          Sound.play('powerUp2', { vol: 0.5, rate: 1.2 });
          this.shake(8, 0.3);
          haptic([20, 20, 30]);
          this.zap(inside, cx, cy, col);
        });
        break;
      }
      case 'trace':
        this.orbit(prop, 4, 1);
        this.traceT = s.dur ?? 4;
        b.tracePop = true;
        void banner(this.overlay, 'なぞって消せる！', 360, this.boardY + b.h * 0.45, { size: 60, color: 0x9be7ff, stroke: 0x003050, hold: 0.5 });
        this.skillHit(4, 0x9be7ff);
        break;
      case 'timeStop': {
        this.stopT = s.dur ?? 3;
        this.flashBoard(0x9be7ff);
        void banner(this.overlay, `時間停止 ${s.dur ?? 3}びょう！`, 360, this.boardY + b.h * 0.45, { size: 56, color: 0x9be7ff, stroke: 0x002040, hold: 0.4 });
        Sound.play('powerUp2', { vol: 0.7, rate: 0.8 });
        const cx = R;
        const cy = M + R * 0.1;
        gsap.delayedCall(0.3, () => this.zap((x, y) => Math.hypot(x - cx, y - cy) < size, cx, cy, 0x9be7ff));
        break;
      }
      case 'reach':
        this.reachT = s.dur ?? 5;
        b.reachMod += 0.9;
        this.orbit(prop, 5, 0.8);
        void banner(this.overlay, 'はなれててもつながる！', 360, this.boardY + b.h * 0.45, { size: 52, color: 0xfff27a, stroke: 0x4a2a00, hold: 0.5 });
        this.skillHit(6, 0xfff27a);
        break;
      case 'escalate': {
        // waves of pops that grow: 2, 4, 6, ...
        const waves = s.amount ?? 4;
        for (let w = 0; w < waves; w++) {
          gsap.delayedCall(w * 0.38, () => {
            const pick = pieces().sort(() => Math.random() - 0.5).slice(0, 2 + w * 2);
            this.volley(prop, pick, 80, true, 0.03);
            Sound.play('hitHeavy', { vol: 0.4 + w * 0.08, rate: 1.4 - w * 0.08 });
          });
        }
        break;
      }
      case 'cleanse': {
        // every obstruction is swept away, then a blast
        this.clearAllEffects();
        for (const p of b.live()) if (p.status) b.clearStatus(p, true);
        this.flashBoard(0xffffff);
        void banner(this.overlay, 'じゃまをかいじょ！', 360, this.boardY + b.h * 0.45, { size: 56, color: 0xffffff, stroke: 0x205040, hold: 0.4 });
        const cx = R;
        const cy = M + R * 0.1;
        gsap.delayedCall(0.3, () => this.zap((x, y) => Math.hypot(x - cx, y - cy) < size || false, cx, cy, 0xb0ffd0));
        gsap.delayedCall(0.35, () => b.popWhere((p) => p.kind === 'rock', cx, cy));
        break;
      }
      case 'vortex': {
        // a whirlpool drags the pieces in, then the middle pops
        const cx = R;
        const cy = M + R * 0.1;
        for (const p of pieces()) {
          const dx = cx - p.x;
          const dy = cy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.body.velocity.x += (dx / d) * 900;
          p.body.velocity.y += (dy / d) * 900;
        }
        this.orbit(prop, 8, 0.6);
        Sound.whoosh(0.8);
        gsap.delayedCall(0.55, () => this.zap((x, y) => Math.hypot(x - cx, y - cy) < size, cx, cy, 0xb48cff));
        break;
      }
      case 'colorLeast': {
        const c = order.filter((i) => counts[i] > 0).pop() ?? order[order.length - 1];
        this.strikes(prop, pieces().filter((p) => p.color === c), () => b.popWhere((p) => p.color === c, R, M));
        break;
      }
      case 'allClear':
        this.flashBoard(0xffffff);
        b.shockwave(R, M, b.h * 1.2);
        b.popWhere(() => true, R, M);
        Sound.explosion(true);
        this.shake(14, 0.5);
        break;
    }
  }

  /** For a few seconds every tap pops the whole same-color group under the finger. */
  private startTapPop(dur: number): void {
    this.tapT = dur;
    this.board.tapPop = true;
    void banner(this.overlay, 'タップでまとめて消せる！', 360, this.boardY + this.board.h * 0.45, { size: 56, color: 0xfff27a, stroke: 0x4a0040, hold: 0.5 });
  }

  /** Non-popping skills still land a hit on the boss. */
  private skillHit(weight: number, color: number): void {
    const total = Math.round(this.atk * weight * this.skill.power * 0.35 * this.comboMult() * (this.feverOn ? 2 : 1) * SCORE_SCALE);
    const r: Resolve = { total, remaining: 0, perPiece: total, n: 1, seen: 1, orbEvery: 1, shown: false, crit: false, cause: 'skill', color: -1 };
    this.committed += total;
    const x = this.skillBtn.x;
    const y = this.skillBtn.y;
    const s = new Sprite(fx('circle_05'));
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = 'add';
    s.scale.set(0.7);
    const core = new Sprite(fx('star_06'));
    core.anchor.set(0.5);
    core.blendMode = 'add';
    core.scale.set(0.5);
    this.orbLayer.addChild(s, core);
    this.orbs.push({ s, core, t: 0, dur: 0.6, x0: x, y0: y, cx: x + 100, cy: y - 250, x1: this.boss.x, y1: this.boss.y - this.bossH * 0.5, dmg: total, r, color, trail: 0 });
  }

  private flashBoard(color: number): void {
    const { w, h } = this.board;
    const g = new Graphics().roundRect(this.boardX - 6, this.boardY - 6, w + 12, h + 12, w / 2 + 6).fill({ color, alpha: 0.6 });
    g.blendMode = 'add';
    this.overlay.addChild(g);
    gsap.to(g, { alpha: 0, duration: 0.5, onComplete: () => g.destroy() });
  }

  /** A bright band through (x, y) at `angle` (0 = horizontal), drawn over the bowl. */
  private beam(x: number, y: number, angle: number, width: number): void {
    const g = new Graphics();
    const len = this.board.w + 120;
    g.roundRect(-len / 2, -width / 2, len, width, width / 2).fill({ color: 0xffffff, alpha: 0.85 });
    g.position.set(x, y);
    g.rotation = angle;
    g.blendMode = 'add';
    this.overlay.addChild(g);
    g.scale.set(0, 1);
    gsap.to(g.scale, { x: 1, duration: 0.15, ease: 'power2.out' });
    gsap.to(g, { alpha: 0, duration: 0.4, delay: 0.15, onComplete: () => g.destroy() });
    Sound.play('laser', { vol: 0.7, rate: 0.8 });
    Sound.whoosh(0.4);
  }

  // ----------------------------------------------------------- boss attack
  private async bossAttack(): Promise<void> {
    if (this.phase !== 'play' || !this.gimmicks.length) return;
    // timed effects don't stack: prefer something that isn't already running
    const fresh = this.gimmicks.filter((g) => !this.effects.has(g));
    const pool = fresh.length ? fresh : this.gimmicks;
    const id = pool[Math.floor(Math.random() * pool.length)];
    const g = GIMMICKS[id];
    this.emote('emote_exclamation', 0.9);
    this.boss.shout(1.0);
    Sound.play('laser', { vol: 0.5, rate: 0.6 });
    Sound.play('phaserUp', { vol: 0.5, rate: 0.8 });
    const first = !this.seenGimmicks.has(id);
    this.seenGimmicks.add(id);
    this.gimmickCallout(g.name, first ? g.desc : '');
    await wait(0.9);
    if (this.phase !== 'play' && this.phase !== 'cutin') return;
    if (this.guards > 0) {
      this.guards--;
      this.guardBounce();
      return;
    }
    this.applyGimmick(id);
  }

  /** Big name card for the incoming obstruction (with its explanation the first time). */
  private gimmickCallout(name: string, desc: string): void {
    const c = new Container();
    c.position.set(360, Math.max(App.safeTop + 250, this.stageH * 0.55));
    const t = txt(`${name}！`, { size: 40, font: 'dela', color: 0xd8c8ff, stroke: 0x2a1630, strokeWidth: 10 });
    c.addChild(t);
    if (desc) {
      const d = txt(desc, { size: 22, color: 0xffffff, stroke: 0x2a1630, strokeWidth: 6 });
      d.y = 40;
      c.addChild(d);
    }
    this.overlay.addChild(c);
    c.scale.set(0.3);
    gsap.to(c.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
    gsap.to(c, { alpha: 0, duration: 0.3, delay: desc ? 2.2 : 1.1, onComplete: () => c.destroy({ children: true }) });
  }

  /** SSR passive: the obstruction bounces off a shield. */
  private guardBounce(): void {
    const x = 360;
    const y = this.boardY - 10;
    this.fxTop.ring(x, y, 0xffe36f, 2.2, 0.4);
    this.fxTop.burst(x, y, { count: 16, tex: 'star_06', tint: [0xffe36f, 0xffffff], add: true, speed: [200, 500], size: [0.08, 0.16], gravity: 300 });
    Sound.play('glass', { vol: 0.7, rate: 1.2 });
    Sound.play('powerUp2', { vol: 0.5 });
    this.floatText(`ホネのよろい！はじいた！（のこり${this.guards}）`, 360, this.boardY + 30, 0xffe36f, 30);
  }

  /** Throws something at each target piece; `land` runs when it hits. */
  private throwAt(targets: import('../game/Board').Piece[], tex: Texture, land: (p: import('../game/Board').Piece) => void): void {
    targets.forEach((target, i) => {
      target.state = 'popping'; // reserved until the projectile lands
      gsap.delayedCall(i * 0.08, () => {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(0.35);
        this.orbLayer.addChild(s);
        this.projectiles.push({ s, t: 0, dur: 0.55, x0: this.boss.x + (Math.random() - 0.5) * 80, y0: this.boss.y - this.bossH * 0.4, target, onLand: land });
        Sound.play('drop', { vol: 0.5, rate: 0.7 + i * 0.05 });
      });
    });
  }

  private applyGimmick(id: GimmickId): void {
    const b = this.board;
    const n = bossAttackCount(this.bossLv);
    const g = GIMMICKS[id];
    const status = (st: import('../game/Board').PieceStatus, count: number) =>
      this.throwAt(b.targets(count), obstacleTexture(THROWN[st]), (p) => {
        p.state = 'live';
        b.setStatus(p, st);
      });
    if (g.dur) this.effects.set(id, g.dur * (this.def.passive?.kind === 'shadow' ? 0.5 : 1));
    switch (id) {
      case 'rock':
        this.throwAt(b.targets(n), obstacleTexture('rock'), (p) => b.applyRock(p));
        break;
      case 'hardRock':
        this.throwAt(b.targets(Math.max(2, n - 1)), obstacleTexture('hardrock'), (p) => b.applyRock(p, 'hardrock', 2));
        break;
      case 'bigRock':
        b.dropRocks(1 + Math.floor(n / 4), 3, 1.7, ['grave']);
        break;
      case 'junk':
        b.dropRocks(n + 1, 1, 1, ['bone_a', 'bone_b', 'ribcage']);
        break;
      case 'ice':
        status('ice', n + 2);
        break;
      case 'bubble':
        status('bubble', n + 4);
        break;
      case 'skullBomb':
        status('skullBomb', Math.max(1, Math.floor(n / 3)));
        break;
      case 'curse':
        status('curse', n + 2);
        break;
      case 'web':
        status('web', n + 1);
        break;
      case 'slime':
        status('slime', n + 4);
        break;
      case 'chameleon':
        status('chameleon', n + 2);
        break;
      case 'shuffle':
        b.shuffleColors();
        Sound.play('cardShuffle', { vol: 0.7 });
        break;
      case 'dark':
        b.dark = true;
        break;
      case 'mono':
        b.setMono(true);
        break;
      case 'ink':
        b.ink(2 + Math.floor(n / 2), this.effects.get('ink') ?? 8);
        break;
      case 'invisible':
        b.setGhosts(n * 3, this.effects.get('invisible') ?? 8);
        break;
      case 'seal': {
        const counts = b.colorCounts();
        b.sealColor = counts.indexOf(Math.max(...counts));
        if (b.chain.some((p) => p.color === b.sealColor)) b.cancelChain();
        break;
      }
      case 'min4':
        b.minExtra = 1;
        break;
      case 'weak':
        b.reachMod = -0.22;
        break;
      case 'quake':
        this.quakeT = 0;
        break;
      case 'wind':
        b.world.o.gravityX = (Math.random() < 0.5 ? -1 : 1) * 1700;
        break;
      case 'float':
        b.world.o.gravity = BOARD_TUNING.gravity * 0.18;
        b.kick(500);
        break;
      case 'tilt': {
        const a = (Math.random() < 0.5 ? -1 : 1) * 0.42;
        gsap.to(b.view, { rotation: a, duration: 0.8, ease: 'back.out(1.5)' });
        break;
      }
      case 'freeze':
        b.frozen = true;
        this.flashBoard(0x9fe8ff);
        Sound.play('glass', { vol: 0.6, rate: 0.7 });
        break;
      case 'timeSteal':
        this.timeLeft = Math.max(1, this.timeLeft - 5);
        this.timerHit('−5秒');
        break;
      case 'timeFast':
        this.timerHit('2倍速！');
        break;
      case 'skillDrain':
        this.skillCharge = Math.max(0, this.skillCharge - this.chargeNeed * 0.4);
        this.skillBtn.scale.set(0.8);
        gsap.to(this.skillBtn.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
        break;
      case 'feverDrain':
        this.fever *= 0.5;
        break;
      case 'barrier':
        this.boss.alpha = 1;
        break;
      case 'skillSeal':
        break;
      case 'comboBreak':
        this.combo = 0;
        this.comboT = 0;
        break;
    }
  }

  /** Ticks timed obstructions and undoes them when they run out. */
  private updateEffects(dt: number): void {
    if (this.effects.has('quake')) {
      this.quakeT -= dt;
      if (this.quakeT <= 0) {
        this.quakeT = 0.9;
        this.board.kick(380);
        this.shake(7, 0.25);
        Sound.play('hitHeavy', { vol: 0.35, rate: 0.6 });
      }
    }
    if (this.effects.has('barrier')) {
      // a pulsing bubble around the boss
      const k = 0.5 + Math.sin(this.t * 6) * 0.2;
      this.boss.tint = 0xb8a0ff;
      this.boss.alpha = 0.75 + k * 0.25;
    }
    const parts: string[] = [];
    for (const [id, left] of this.effects) {
      const t = left - dt;
      if (t <= 0) {
        this.effects.delete(id);
        this.endEffect(id);
      } else {
        this.effects.set(id, t);
        parts.push(`${GIMMICKS[id].name} ${Math.ceil(t)}`);
      }
    }
    const label = parts.length ? `⚠ ${parts.join('  ')}` : '';
    if (this.effectLabel.text !== label) this.effectLabel.text = label;
  }

  private endEffect(id: GimmickId): void {
    const b = this.board;
    switch (id) {
      case 'dark':
        b.dark = false;
        break;
      case 'mono':
        b.setMono(false);
        break;
      case 'seal':
        b.sealColor = -1;
        break;
      case 'min4':
        b.minExtra = 0;
        break;
      case 'weak':
        b.reachMod = 0;
        break;
      case 'wind':
        b.world.o.gravityX = 0;
        break;
      case 'float':
        b.world.o.gravity = BOARD_TUNING.gravity;
        break;
      case 'tilt':
        gsap.to(b.view, { rotation: 0, duration: 0.6, ease: 'back.out(1.5)' });
        break;
      case 'freeze':
        b.frozen = false;
        break;
      case 'barrier':
        this.boss.tint = 0xffffff;
        this.boss.alpha = 1;
        break;
    }
  }

  private clearAllEffects(): void {
    for (const id of [...this.effects.keys()]) this.endEffect(id);
    this.effects.clear();
    this.board.clearEffects();
    this.board.view.rotation = 0;
    this.effectLabel.text = '';
  }

  private timerHit(label: string): void {
    this.floatText(label, this.timer.x + 40, this.timer.y + 60, 0xff8aa0, 36);
    this.timer.scale.set(1.3);
    gsap.to(this.timer.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
    Sound.play('tick', { vol: 1, rate: 0.8 });
    haptic(20);
  }

  /** A skull bomb went off: the clock pays for it. */
  private skullBlow(x: number, y: number): void {
    this.timeLeft = Math.max(1, this.timeLeft - 5);
    this.timerHit('ドクロばくだん！ −5秒');
    Sound.explosion(false);
    this.shake(8, 0.3);
    this.fxTop.burst(this.boardX + x, this.boardY + y, { count: 16, tex: 'flame_04', tint: [0x9a3aff, 0xff3355], add: true, speed: [150, 450], size: [0.12, 0.25], gravity: -60, life: [0.3, 0.6] });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt / p.dur;
      const k = Math.min(1, p.t);
      const tx = this.boardX + p.target.x;
      const ty = this.boardY + p.target.y;
      const x = p.x0 + (tx - p.x0) * k;
      const y = p.y0 + (ty - p.y0) * k - Math.sin(k * Math.PI) * 160;
      p.s.position.set(x, y);
      p.s.rotation += dt * 10;
      p.s.scale.set(0.35 + k * 0.2);
      if (k >= 1) {
        this.projectiles.splice(i, 1);
        p.s.destroy();
        p.onLand(p.target);
        this.shake(4, 0.15);
      }
    }
  }

  // ---------------------------------------------------------------- ending
  private async timeUp(why: 'time' | 'clear' | 'down' = 'time'): Promise<void> {
    if (this.phase === 'timeup' || this.phase === 'end') return;
    const wasCutin = this.phase === 'cutin';
    this.phase = 'timeup';
    if (!wasCutin) this.board.forceRelease();
    this.board.inputEnabled = false;
    if (this.feverOn) this.endFever();
    this.clearAllEffects();
    Sound.stopMusic(1.0);
    if (why !== 'clear') Sound.play('jTimeUp', { vol: 0.8 });
    haptic([30, 50, 30]);
    const text = why === 'clear' ? 'ダンジョンクリア！' : why === 'down' ? 'やられた…' : 'TIME UP!';
    await banner(this.overlay, text, 360, this.boardY + this.board.h * 0.4, { size: why === 'time' ? 120 : 86, color: why === 'clear' ? 0xfff27a : 0xff8aa0, stroke: why === 'clear' ? 0x8a1f00 : 0x4a0018, hold: 0.6 });
    // let every pending orb land
    const t0 = performance.now();
    while ((this.orbs.length || this.resolves.size || this.projectiles.length) && performance.now() - t0 < 4000) await wait(0.05);
    this.landed = Math.max(this.landed, this.committed);
    await wait(0.3);
    this.phase = 'end';
    if (this.vs) return this.vsEnd();
    if (this.ta) return this.finish(false);
    const defeated = this.cleared;
    if (defeated) await this.defeatSequence();
    else await this.failSequence();
    this.finish(defeated);
  }

  // --------------------------------------------------------------- dungeon
  private buildDungeonHud(): void {
    // player HP where the fever gauge used to be (next to the skill button)
    const w = 420;
    const bg = new Graphics().roundRect(-w / 2 - 6, -20, w + 12, 40, 20).fill(0x2a1630).stroke({ width: 3, color: 0xffffff });
    const heart = new Sprite(tex('ui:heart'));
    heart.anchor.set(0.5);
    heart.scale.set(46 / Math.max(1, heart.texture.width));
    heart.x = -w / 2 - 6;
    this.hpText.position.set(0, 0);
    this.hpBar.addChild(bg, this.hpFill, heart, this.hpText);
    this.hpBar.position.set(430, this.stageH + 58);
    // the enemy's name, floor and HP over the stage
    const ew = 300;
    const ebg = new Graphics().roundRect(-ew / 2 - 4, -11, ew + 8, 22, 11).fill(0x2a1630).stroke({ width: 3, color: 0xffffff });
    this.enemyName.y = -30;
    this.floorTag.anchor.set(0, 0.5);
    this.floorTag.position.set(-ew / 2 - 4, -62);
    this.enemyInfo.addChild(ebg, this.enemyFill, this.enemyName, this.floorTag);
    this.enemyInfo.position.set(360, App.safeTop + 262);
    this.hud.addChild(this.hpBar, this.enemyInfo);
    this.setEnemyLabels();
  }

  private setEnemyLabels(): void {
    const f = this.floors[this.floor];
    this.enemyName.text = f.boss ? `BOSS  ${f.def.name}` : f.def.name;
    this.floorTag.text = f.boss ? 'ボスのへや' : `${this.floor + 1}F / ${this.floors.length - 1}F`;
  }

  private drawDungeonHud(): void {
    const w = 420;
    const k = Math.max(0, this.playerHp / PLAYER_HP);
    this.hpFill.clear();
    if (k > 0) this.hpFill.roundRect(-w / 2, -14, w * k, 28, 14).fill(k > 0.5 ? 0x5fd068 : k > 0.25 ? 0xffc31f : 0xff4f5f);
    this.hpText.text = `HP ${Math.max(0, Math.ceil(this.playerHp))}`;
    const f = this.floors[this.floor];
    const ew = 300;
    const left = this.floorBusy ? 0 : Math.max(0, 1 - (this.landed - this.floorBase) / f.hp);
    this.enemyFill.clear();
    if (left > 0) this.enemyFill.roundRect(-ew / 2, -8, ew * left, 16, 8).fill(f.boss ? 0xff4fd8 : 0xff7a3a);
  }

  /** An enemy hits the player: a shot from the enemy to the HP bar. */
  private enemyStrike(dmg: number): void {
    if (this.phase !== 'play') return;
    this.boss.shout(0.5);
    Sound.play('hitHeavy', { vol: 0.6, rate: 0.8 });
    const shot = new Sprite(fx('circle_05'));
    shot.anchor.set(0.5);
    shot.tint = 0xff4f5f;
    shot.blendMode = 'add';
    shot.scale.set(0.5);
    shot.position.set(this.boss.x, this.boss.y - this.bossH * 0.5);
    this.overlay.addChild(shot);
    gsap.to(shot, { x: this.hpBar.x - 150, y: this.hpBar.y, duration: 0.35, ease: 'power2.in', onComplete: () => {
      shot.destroy();
      if (this.phase !== 'play') return;
      this.playerHp = Math.max(0, this.playerHp - dmg);
      this.floatText(`-${dmg}`, this.hpBar.x, this.hpBar.y - 40, 0xff6a7a, 40);
      this.vignette.alpha = 0.45;
      gsap.to(this.vignette, { alpha: 0, duration: 0.5 });
      this.shake(10, 0.3);
      haptic([30, 30, 30]);
      gsap.fromTo(this.hpBar.scale, { x: 1.08, y: 1.25 }, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1.2,0.4)' });
      if (this.playerHp <= 0) void this.playerDown();
    } });
  }

  private healPlayer(n: number): void {
    const before = this.playerHp;
    this.playerHp = Math.min(PLAYER_HP, this.playerHp + n);
    if (this.playerHp > before) this.floatText(`+${Math.round(this.playerHp - before)}`, this.hpBar.x, this.hpBar.y - 40, 0x7aff9a, 40);
  }

  /** Moves on when the current enemy's share of damage has landed. */
  private checkFloor(): void {
    if (this.floorBusy || this.cleared || this.phase !== 'play') return;
    const f = this.floors[this.floor];
    if (this.landed - this.floorBase < f.hp) return;
    if (f.boss) void this.dungeonClear();
    else void this.nextFloor();
  }

  private async nextFloor(): Promise<void> {
    this.floorBusy = true;
    const old = this.boss;
    const f = this.floors[this.floor];
    this.floorBase += f.hp;
    old.die();
    Sound.explosion(false);
    Sound.play('bell', { vol: 0.6 });
    this.coinBurst(old.x, old.y - 100);
    gsap.to(old, { alpha: 0, x: old.x + 60, duration: 0.6, delay: 0.4, onComplete: () => old.destroy({ children: true }) });
    void banner(this.overlay, `${this.floor + 1}F クリア！`, 360, this.stageH * 0.5, { size: 70, color: 0xfff27a, stroke: 0x8a1f00, hold: 0.4 });
    // walk on: the backdrop scrolls while the next enemy steps in
    await wait(0.7);
    this.floor++;
    const next = this.floors[this.floor];
    this.boss = new BossView(next.def);
    this.stage.addChild(this.boss);
    const avail = this.stageH - 22 - (App.safeTop + 165);
    this.bossScale = Math.min(1, avail / this.boss.height2) * (next.boss ? 1 : 0.8);
    this.boss.scale.set(this.bossScale);
    this.boss.position.set(900, this.stageH - 22);
    this.walkT = 0.9;
    gsap.to(this.boss, { x: 360, duration: 0.8, ease: 'power2.out' });
    this.setEnemyLabels();
    if (next.boss) {
      Sound.play('bong', { vol: 0.8 });
      void banner(this.overlay, 'ボス登場！', 360, this.stageH * 0.5, { size: 90, color: 0xff7ad9, stroke: 0x4a0040, hold: 0.5, sub: this.gimmicks.length ? 'ボスは妨害もしてくるよ' : undefined });
      this.bossAtkT = this.gimmicks.length ? bossAttackInterval(this.bossLv) || Infinity : Infinity;
    }
    this.enemyAtkT = enemyAtkInterval(this.bossLv, next.boss) + 1.5;
    await wait(0.8);
    this.boss.shout(0.6);
    this.floorBusy = false;
    // overflow may already be enough for this one too
    this.checkFloor();
  }

  private walkT = 0;

  private async dungeonClear(): Promise<void> {
    this.cleared = true;
    this.floorBusy = true;
    // what is left on the clock and of the HP becomes bonus score
    const bonus = Math.round((this.timeLeft * 0.006 + (this.playerHp / PLAYER_HP) * 0.15) * this.hp);
    this.landed += bonus;
    this.committed += bonus;
    this.floatText(`クリアボーナス +${bonus.toLocaleString('en-US')}`, 360, this.stageH * 0.35, 0xfff27a, 40);
    // coins for the time left, so a fast clear pays at least as well as a full round
    this.dropCoins(Math.round(300 + this.timeLeft * 12), 360, this.stageH * 0.45);
    await this.timeUp('clear');
  }

  private async playerDown(): Promise<void> {
    if (this.phase !== 'play') return;
    await this.timeUp('down');
  }

  private async zoomToBoss(): Promise<void> {
    const px = this.boss.x;
    const py = this.boss.y - this.bossH * 0.5;
    gsap.to(this.board.view, { alpha: 0.35, duration: 0.4 });
    gsap.to([this.hud], { alpha: 0, duration: 0.3 });
    this.stage.pivot.set(px, py);
    this.stage.position.set(px, py);
    await new Promise<void>((res) => gsap.to(this.stage.scale, { x: 1.25, y: 1.25, duration: 0.6, ease: 'power2.inOut', onComplete: () => res() }));
  }

  private async defeatSequence(): Promise<void> {
    await this.zoomToBoss();
    const boss = this.boss;
    boss.still = true;
    boss.dizzy = false;
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = boss.aimPoint();
      const x = boss.x + a.x * 1.6 * this.bossScale;
      const y = boss.y + a.y * this.bossScale;
      this.fxTop.burst(x, y, { count: 10, tex: 'flame_04', tint: [0xffd23f, 0xff8a1f, 0xffffff], add: true, speed: [100, 400], size: [0.12, 0.25], gravity: -50, life: [0.25, 0.5] });
      this.fxTop.ring(x, y, 0xffffff, 0.6, 0.3);
      boss.hit(1.2);
      Sound.play(i % 2 ? 'hit3' : 'hitHeavy', { vol: 0.7, rate: 0.8 + i * 0.05 });
      if (i % 3 === 0) Sound.explosion(false);
      haptic(12);
      this.shake(6 + i, 0.12);
      await wait(Math.max(0.06, 0.2 - i * 0.012));
    }
    // white out
    const W = App.W;
    const flash = new Graphics().rect(-App.colX, 0, W, App.H).fill(0xffffff);
    this.overlay.addChild(flash);
    flash.alpha = 0;
    Sound.explosion(true);
    Sound.play('bell', { vol: 0.8 });
    haptic([60, 40, 80]);
    await new Promise<void>((res) => gsap.to(flash, { alpha: 1, duration: 0.12, onComplete: () => res() }));
    this.fxTop.burst(boss.x, boss.y - 120, { count: 40, tex: 'star_06', tint: [0xffffff, 0xfff27a, 0xff7ad9, 0x7cf0ff], add: true, speed: [300, 900], size: [0.1, 0.3], gravity: 500, life: [0.8, 1.5] });
    this.coinBurst(boss.x, boss.y - 100);
    gsap.to(flash, { alpha: 0, duration: 0.6, onComplete: () => flash.destroy() });
    boss.die();
    // fly away into the sky with a twinkle
    gsap.to(boss, { y: -200, x: boss.x + 140, duration: 0.9, ease: 'power2.in' });
    gsap.to(boss, { rotation: Math.PI * 4, duration: 0.9, ease: 'power1.in' });
    gsap.to(boss.scale, { x: 0.1, y: 0.1, duration: 0.9, ease: 'power2.in' });
    Sound.whoosh(0.8, true);
    await wait(0.9);
    const star = new Sprite(fx('star_06'));
    star.anchor.set(0.5);
    star.blendMode = 'add';
    star.position.set(boss.x, 80);
    star.scale.set(0);
    this.fxTop.view.addChild(star);
    Sound.sparkle();
    Sound.play('glass', { vol: 0.7, rate: 1.5 });
    gsap.to(star.scale, { x: 1.4, y: 1.4, duration: 0.18, yoyo: true, repeat: 1 });
    gsap.to(star, { rotation: 2, duration: 0.4 });
    Sound.play('jWin', { vol: 0.85 });
    await banner(this.overlay, '討伐成功！！', 360, this.stageH * 0.55, { size: 92, color: 0xfff27a, stroke: 0x8a1f00, hold: 1.1 });
  }

  private async failSequence(): Promise<void> {
    await this.zoomToBoss();
    this.boss.laugh(1.6);
    this.emote('emote_laugh', 1.6);
    Sound.play('jLose', { vol: 0.8 });
    await banner(this.overlay, '討伐失敗…', 360, this.stageH * 0.55, { size: 80, color: 0xb8c0ff, stroke: 0x1a1240, hold: 1.0, sub: `あと ${Math.max(0, this.hp - this.landed).toLocaleString('en-US')} ダメージ！` });
    gsap.to(this.boss, { x: 900, duration: 0.6, ease: 'back.in(2)' });
    Sound.whoosh(0.5);
    await wait(0.5);
  }

  private coinBurst(x: number, y: number): void {
    for (let i = 0; i < 18; i++) {
      gsap.delayedCall(i * 0.03, () => {
        Sound.coin(i);
      });
    }
    this.fxTop.burst(x, y, { count: 30, tex: 'circle_05', tint: 0xffd23f, speed: [300, 700], size: [0.08, 0.12], gravity: 1200, life: [0.8, 1.3], drag: 0.5 });
  }

  private finish(defeated: boolean): void {
    if (this.ta) return this.taFinish();
    const d = Save.data;
    const score = Math.round(this.landed);
    // coins come from play (chains, coin skills) plus a small boss bonus; +Coin rolls a multiplier
    const bossCoins = defeated ? (this.rematch ? 10 : 20 + Math.min(this.bossLv, 50) * 4) : 0;
    const bonus = bossCoins;
    const coinBoost = this.items.includes('coin') ? rollCoinBoost() : 1;
    // パンプキン's passive: Halloween treats (+30% coins)
    const treat = this.def.passive?.kind === 'treat' ? 1.3 : 1;
    const coins = Math.round((this.coinsEarned + bonus) * coinBoost * treat);
    // character growth: EXP from playing, rare skill tickets from bosses
    const owned = d.owned[this.def.id];
    const exp = expForRound(score, defeated);
    const before = owned ? owned.lv : 1;
    const expBefore = owned ? owned.exp : 0;
    const ups = owned ? addExp(this.def, owned, exp) : 0;
    let skillTickets = 0;
    // skill tickets are meant to be very rare
    if (defeated && !this.rematch && this.bossLv % 20 === 0) skillTickets++;
    if (defeated && Math.random() < (this.rematch ? 0.001 : 0.003)) skillTickets++;
    d.skillTickets += skillTickets;
    const newBest = score > d.best;
    const result: BattleResult = {
      score,
      hp: this.hp,
      defeated,
      bossLv: this.bossLv,
      rematch: this.rematch,
      expected: this.expected,
      bossName: this.bossDef.name,
      maxCombo: this.maxCombo,
      maxChain: this.maxChain,
      fevers: this.feverCount,
      skills: this.skillUses,
      coins,
      newBest,
      prevBest: d.best,
      charId: this.def.id,
      exp,
      expBefore,
      expAfter: owned ? owned.exp : 0,
      coinParts: { play: this.coinsEarned, boss: bossCoins, boost: coinBoost },
      lvBefore: before,
      lvAfter: before + ups,
      skillTickets,
      coinBonus: bonus,
    };
    d.plays++;
    d.coins += coins;
    if (newBest) d.best = score;
    if (defeated) {
      d.defeats++;
      if (!this.rematch) {
        d.bossLv++;
        d.fightLv = 0;
      }
    }
    d.tutorialDone = true;
    const stats: Stats = { plays: 1, defeats: defeated ? 1 : 0, ...this.round, fevers: this.feverCount, skills: this.skillUses, maxChain: this.maxChain, maxCombo: this.maxCombo };
    recordRound(stats);
    recordBingo(stats, this.def.id, score);
    Save.write();
    Scenes.go(() => new ResultScene(result));
  }

  /** Time attack result: score, this week's and all-time bests, coins; the score goes to the weekly ranking. */
  private taFinish(): void {
    const d = Save.data;
    const score = Math.round(this.landed);
    const wk = weekKey();
    if (d.ta.week !== wk) d.ta = { ...d.ta, week: wk, best: 0, runs: 0 };
    d.ta.runs++;
    const newWeek = score > d.ta.best;
    const newAll = score > d.ta.allBest;
    if (newWeek) d.ta.best = score;
    if (newAll) d.ta.allBest = score;
    const coinBoost = this.items.includes('coin') ? rollCoinBoost() : 1;
    const treat = this.def.passive?.kind === 'treat' ? 1.3 : 1;
    const coins = Math.round((this.coinsEarned + taCoins(score)) * coinBoost * treat);
    d.coins += coins;
    const owned = d.owned[this.def.id];
    const exp = expForRound(score, false);
    const ups = owned ? addExp(this.def, owned, exp) : 0;
    d.plays++;
    if (score > d.best) d.best = score;
    d.tutorialDone = true;
    const stats: Stats = { plays: 1, defeats: 0, ...this.round, fevers: this.feverCount, skills: this.skillUses, maxChain: this.maxChain, maxCombo: this.maxCombo };
    recordRound(stats);
    recordBingo(stats, this.def.id, score);
    void submitScore(score, this.def.id);
    Save.write();
    const f = (n: number) => n.toLocaleString('en-US');
    if (newWeek || newAll) {
      Sound.play('jLevel', { vol: 0.7 });
      Sound.sparkle();
    }
    rewardPopup(this.overlay, 'タイムアタック', [
      `スコア ${f(score)}${newWeek ? '  NEW!' : ''}`,
      `今週のベスト ${f(d.ta.best)}`,
      `じこベスト ${f(d.ta.allBest)}${newAll ? '  NEW!' : ''}`,
      '',
      `${f(coins)}コイン`,
      `EXP +${exp}${ups ? '  Lv.UP!' : ''}`,
    ], () => Scenes.go(() => new HomeScene()));
  }

  // ----------------------------------------------------------------- pause
  private pause(): void {
    if (this.paused || (this.phase !== 'play' && this.phase !== 'cutin')) return;
    this.paused = true;
    this.board.forceRelease();
    this.pointerId = null;
    Sound.musicFilter(500, 0.2);
    const ov = new Container();
    const dim = new Graphics().rect(-App.colX, 0, App.W, App.H).fill({ color: 0x0a0418, alpha: 0.7 });
    dim.eventMode = 'static';
    ov.addChild(dim);
    const title = txt('ポーズ', { size: 64, font: 'dela', stroke: 0x2a1630, strokeWidth: 12 });
    title.position.set(360, App.H * 0.3);
    ov.addChild(title);
    const close = () => {
      ov.destroy({ children: true });
      this.paused = false;
      gsap.globalTimeline.resume();
      Sound.musicFilter(20000, 0.3);
    };
    const resume = new Button({ w: 380, h: 100, label: 'つづける', color: 'pink', onTap: close });
    resume.position.set(360, App.H * 0.45);
    const retry = new Button({
      w: 380, h: 90, label: 'やりなおす', color: 'blue', onTap: () => {
        close();
        this.phase = 'end';
        // a retry is a new round: it costs a life (items are not carried over)
        if (!spendLife()) return Sound.play('ui_error');
        Scenes.go(() => new BattleScene());
      },
    });
    retry.position.set(360, App.H * 0.45 + 130);
    const home = new Button({
      w: 380, h: 90, label: 'ホームにもどる', color: 'grey', onTap: () => {
        close();
        this.phase = 'end';
        Sound.stopMusic(0.5);
        Scenes.go(() => new HomeScene());
      },
    });
    home.position.set(360, App.H * 0.45 + 250);
    ov.addChild(resume, retry, home);
    this.overlay.addChild(ov);
    gsap.globalTimeline.pause();
  }
}

/** Damage per piece by chain length: grows faster than linearly, so long traces are what pay. */
export function chainMult(n: number): number {
  const k = Math.max(0, n - 3);
  return 1 + 0.15 * k + 0.008 * k * k + (n >= BOARD_TUNING.bombAt ? 0.3 : 0);
}

/** Rendered KayKit props used by the special moves (public/assets/fx3d). */
async function loadSkillProps(): Promise<void> {
  const list = ['sword', 'axe', 'hammer', 'shield', 'staff', 'dagger', 'lightning', 'star', 'arrow'].map((k) => ({ alias: `fx3d:${k}`, src: `./assets/fx3d/${k}.webp` }));
  for (const a of list) if (!Assets.resolver.hasKey(a.alias)) Assets.add(a);
  await Assets.load(list.map((a) => a.alias));
}

function wait(s: number): Promise<void> {
  return new Promise((r) => gsap.delayedCall(s, r));
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

