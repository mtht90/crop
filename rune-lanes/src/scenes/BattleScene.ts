import Phaser from 'phaser';
import type { CardDef, Difficulty } from '../core/types';
import { Rng } from '../core/Rng';
import { BALANCE, CARDS, DECKS, cardById } from '../data';
import { BattleWorld, type PlayFailure, type WorldEvent } from '../systems/BattleWorld';
import { TOWER_SLOTS } from '../systems/Arena';
import { CpuController } from '../ai/CpuController';
import type { MatchOutcome } from '../systems/MatchTimer';
import { buildArenaBackground } from '../ui/ArenaView';
import { TowerView, UnitView } from '../ui/EntityViews';
import { Hand } from '../ui/Hand';
import { DiscardPileView, DrawPileView, InfoHud, ManaBar } from '../ui/Hud';
import { addText, COLORS, CSS, GAME_H, GAME_W } from '../ui/theme';
import { CARD_Y, DISCARD_X, DRAW_PILE_X, HUD_Y, TILE, toScreen } from '../ui/layout';
import { Sound } from '../ui/Sound';

export interface BattleData {
  difficulty: Difficulty;
  deck?: string[];
}

export interface ResultData {
  outcome: MatchOutcome;
  crowns: [number, number];
  difficulty: Difficulty;
}

const FAIL_MSG: Record<PlayFailure, string> = {
  mana: 'マナが足りない！',
  position: 'そこには置けない',
  target: '味方ユニットに重ねて使おう',
  not_in_hand: '',
  not_running: '',
};

export class BattleScene extends Phaser.Scene {
  private world!: BattleWorld;
  private cpu!: CpuController;
  private hand!: Hand;
  private unitViews = new Map<number, UnitView>();
  private towerViews = new Map<number, TowerView>();
  private projViews = new Map<number, Phaser.GameObjects.Image>();
  private manaBar!: ManaBar;
  private drawPile!: DrawPileView;
  private discardPile!: DiscardPileView;
  private info!: InfoHud;
  private acc = 0;
  private difficulty: Difficulty = 'normal';
  private ended = false;
  private lastCountdown = -1;

  constructor() {
    super('Battle');
  }

  init(data: BattleData): void {
    this.difficulty = data.difficulty ?? 'normal';
    this.unitViews = new Map();
    this.towerViews = new Map();
    this.projViews = new Map();
    this.acc = 0;
    this.ended = false;
    this.lastCountdown = -1;
    this.world = new BattleWorld({
      cards: CARDS,
      balance: BALANCE,
      decks: [data.deck ?? DECKS.player, DECKS.cpu],
      seed: Date.now() & 0x7fffffff,
    });
    this.cpu = new CpuController(this.world, 1, BALANCE.cpu[this.difficulty], new Rng(Date.now() ^ 0x5eed));
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    buildArenaBackground(this);
    // HUD 背景
    this.add.rectangle(GAME_W / 2, HUD_Y + (GAME_H - HUD_Y) / 2, GAME_W, GAME_H - HUD_Y, 0x1a1410).setDepth(4900);
    this.add.rectangle(GAME_W / 2, HUD_Y + 1, GAME_W, 3, 0x6b4a2b).setDepth(4901);

    for (const c of this.world.combatants) {
      if (c.kind !== 'tower') continue;
      const slot = TOWER_SLOTS.find((s) => s.x === c.x && s.y === c.y)!;
      this.towerViews.set(c.id, new TowerView(this, c, slot.size));
    }

    this.manaBar = new ManaBar(this);
    this.drawPile = new DrawPileView(this);
    this.discardPile = new DiscardPileView(this, () => this.world.players[0].deck);
    this.info = new InfoHud(this);
    this.hand = new Hand(this, {
      world: this.world,
      team: 0,
      unitViews: () => this.unitViews,
      onPlayed: (card) => this.onPlayerPlayed(card),
      onFail: (reason, card) => this.onPlayFail(reason, card),
    });
    this.hand.enabled = false;
    this.registry.set('worldTime', 0);

    Sound.playBgm(this, 'bgm_battle');
    this.startCountdown();
  }

  private startCountdown(): void {
    const big = addText(this, GAME_W / 2, 520, '', 120, CSS.gold).setDepth(9000);
    const steps = ['3', '2', '1', 'はじめ！'];
    steps.forEach((s, i) => {
      this.time.delayedCall(i * 750, () => {
        big.setText(s).setScale(1.6).setAlpha(1).setFontSize(i === 3 ? 84 : 120);
        this.tweens.add({ targets: big, scale: 1, duration: 300, ease: 'Back.Out' });
        Sound.se(this, 'se_countdown', i === 3 ? 0.8 : 0.5);
        if (i === 3) {
          this.world.start();
          this.hand.enabled = true;
          this.tweens.add({ targets: big, alpha: 0, delay: 500, duration: 300, onComplete: () => big.destroy() });
        }
      });
    });
  }

  update(_time: number, delta: number): void {
    const dt = 1 / BALANCE.sim.tickRate;
    if (this.world.isRunning) {
      this.acc += Math.min(delta / 1000, 0.25);
      let steps = 0;
      while (this.acc >= dt && steps < 8) {
        this.cpu.update(dt);
        this.world.update(dt);
        this.acc -= dt;
        steps++;
      }
    }
    this.registry.set('worldTime', this.world.time);
    for (const e of this.world.drainEvents()) this.handleEvent(e);
    this.syncViews();
    const now = this.time.now;
    const p = this.world.players[0];
    this.manaBar.update(p.mana, this.world.timer.isDoubleMana, now);
    this.drawPile.update(p.deck);
    this.discardPile.update(p.deck);
    this.info.update(this.world.timer, [this.world.players[0].crowns, this.world.players[1].crowns], this.world.players[1].deck.hand.length, now);
    this.hand.update(now);

    // 残り10秒のカウントダウン音
    const r = Math.ceil(this.world.timer.remaining);
    if (this.world.isRunning && r <= 10 && r !== this.lastCountdown) {
      this.lastCountdown = r;
      Sound.se(this, 'se_countdown', 0.35);
    }
  }

  private syncViews(): void {
    const now = this.time.now;
    const alive = new Set<number>();
    for (const c of this.world.combatants) {
      if (c.kind === 'tower') {
        this.towerViews.get(c.id)?.update(now);
        continue;
      }
      alive.add(c.id);
      let v = this.unitViews.get(c.id);
      if (!v) {
        v = new UnitView(this, c, cardById(c.cardId!));
        this.unitViews.set(c.id, v);
      }
      v.update(now);
    }
    for (const [id, v] of this.unitViews) {
      if (!alive.has(id)) {
        v.destroy();
        this.unitViews.delete(id);
      }
    }
    const projAlive = new Set<number>();
    for (const pr of this.world.projectiles) {
      projAlive.add(pr.id);
      let img = this.projViews.get(pr.id);
      if (!img) {
        img = this.add.image(0, 0, pr.texture).setScale(pr.isSpell ? 3 : 1.6).setDepth(3500);
        this.projViews.set(pr.id, img);
      }
      const s = toScreen(pr.x, pr.y);
      const ang = Math.atan2(pr.ty - pr.y, pr.tx - pr.x);
      img.setPosition(s.x, s.y - (pr.isSpell ? 0 : 10));
      // 矢の画像は右上向きなので 45° 補正
      if (pr.texture === 'fx_arrow') img.setRotation(ang + Math.PI / 4);
      else img.setRotation(img.rotation + 0.2);
    }
    for (const [id, img] of this.projViews) {
      if (!projAlive.has(id)) {
        img.destroy();
        this.projViews.delete(id);
      }
    }
  }

  private handleEvent(e: WorldEvent): void {
    switch (e.type) {
      case 'deck':
        if (e.team !== 0) break;
        if (e.event.type === 'draw') {
          Sound.se(this, 'se_draw', 0.5);
          this.hand.sync();
        } else {
          Sound.se(this, 'se_shuffle', 0.7);
          this.shuffleAnim();
        }
        break;
      case 'deploy': {
        const card = cardById(e.cardId);
        if (card.type === 'unit' || card.type === 'building') Sound.se(this, 'se_deploy', 0.5);
        if (e.team === 1) this.showCpuPlay(card, e.x, e.y);
        if (card.type === 'spell') Sound.se(this, card.sfx.attack, 0.6);
        break;
      }
      case 'attack':
        Sound.se(this, e.sfx, 0.25, 0.08);
        break;
      case 'damage': {
        this.unitViews.get(e.id)?.flash();
        this.towerViews.get(e.id)?.flash();
        this.floatText(e.x, e.y, `-${Math.round(e.amount)}`, e.toShield > 0 ? '#bfe6ff' : '#ff6b6b', 16);
        break;
      }
      case 'heal': {
        this.floatText(e.x, e.y, `+${Math.round(e.amount)}`, '#7dff8a', 22);
        for (let i = 0; i < 5; i++) {
          const s = toScreen(e.x, e.y);
          const h = this.add.image(s.x + Phaser.Math.Between(-16, 16), s.y, 'fx_heart').setScale(1.5).setDepth(4100);
          this.tweens.add({ targets: h, y: s.y - 50 - i * 6, alpha: 0, delay: i * 60, duration: 700, onComplete: () => h.destroy() });
        }
        break;
      }
      case 'support': {
        const card = cardById(e.cardId);
        Sound.se(this, card.sfx.attack, 0.7);
        const v = this.unitViews.get(e.id);
        if (v) {
          const ring = this.add.circle(v.root.x, v.root.y, 10).setStrokeStyle(4, e.kind === 'shield' ? 0xffffff : e.kind === 'attack' ? 0xff6040 : e.kind === 'haste' ? 0x60e0ff : 0x7dff8a).setDepth(4100);
          this.tweens.add({ targets: ring, radius: 40, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
          const icon = this.add.image(v.root.x, v.root.y - 30, card.cardArtKey).setScale(2.5).setDepth(4100);
          this.tweens.add({ targets: icon, y: icon.y - 40, alpha: 0, duration: 800, onComplete: () => icon.destroy() });
        }
        break;
      }
      case 'death': {
        const s = toScreen(e.x, e.y);
        if (e.kind === 'tower') break;
        Sound.se(this, 'se_unit_die', 0.35);
        this.explosion(s.x, s.y, 1.2);
        break;
      }
      case 'impact': {
        const s = toScreen(e.x, e.y);
        this.explosion(s.x, s.y, Math.max(1.2, (e.radius * TILE * 2) / 32));
        Sound.se(this, e.sfx ?? 'se_explosion', e.isSpell ? 0.7 : 0.3);
        if (e.isSpell) this.cameras.main.shake(150, 0.006);
        break;
      }
      case 'tower_destroyed': {
        const t = this.world.byId(e.id)!;
        const s = toScreen(t.x, t.y);
        for (let i = 0; i < 4; i++) {
          this.time.delayedCall(i * 120, () => this.explosion(s.x + Phaser.Math.Between(-30, 30), s.y + Phaser.Math.Between(-30, 30), 2.5));
        }
        this.cameras.main.shake(450, 0.015);
        Sound.se(this, 'se_tower_destroy', 0.9);
        this.banner(e.team === 1 ? '塔を撃破！' : '塔が壊された…', e.team === 1 ? CSS.gold : CSS.bad);
        break;
      }
      case 'king_awake':
        this.banner(e.team === 0 ? '王の塔が目覚めた' : '敵の王の塔が目覚めた', CSS.dim, 34);
        break;
      case 'double_mana':
        this.banner('残り1分！ マナ回復2倍', CSS.mana);
        Sound.playBgm(this, 'bgm_battle_final');
        break;
      case 'overtime':
        this.banner('延長戦！ 先に塔を壊せば勝ち', CSS.gold);
        break;
      case 'match_end':
        this.finish(e.outcome);
        break;
      default:
        break;
    }
  }

  private onPlayerPlayed(card: CardDef): void {
    Sound.se(this, 'se_card_play', 0.7);
    void card;
  }

  private onPlayFail(reason: PlayFailure, _card: CardDef): void {
    if (reason === 'mana') Sound.se(this, 'se_no_mana', 0.7);
    const msg = FAIL_MSG[reason];
    if (msg) this.toast(msg);
  }

  private showCpuPlay(card: CardDef, x: number, y: number): void {
    const s = toScreen(x, y);
    const tag = addText(this, s.x, s.y - 40, card.name, 16, CSS.cpu).setDepth(4200);
    this.tweens.add({ targets: tag, y: tag.y - 24, alpha: 0, duration: 1200, onComplete: () => tag.destroy() });
  }

  private shuffleAnim(): void {
    for (let i = 0; i < 5; i++) {
      const back = this.add.nineslice(DISCARD_X, CARD_Y, 'ui_panel_card_back', undefined, 50, 74, 10, 10, 10, 10).setDepth(5200);
      this.tweens.add({
        targets: back,
        x: DRAW_PILE_X,
        y: CARD_Y - 20 - i * 4,
        angle: 360,
        delay: i * 70,
        duration: 420,
        ease: 'Cubic.InOut',
        onComplete: () => back.destroy(),
      });
    }
    this.toast('捨て札をシャッフルして山札へ');
  }

  private explosion(x: number, y: number, scale: number): void {
    if (!this.anims.exists('explode')) return;
    const ex = this.add.sprite(x, y, 'fx_explosion', 0).setScale(scale).setDepth(4500);
    ex.play('explode');
    ex.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => ex.destroy());
  }

  private floatText(wx: number, wy: number, text: string, color: string, size: number): void {
    const s = toScreen(wx, wy);
    const t = addText(this, s.x + Phaser.Math.Between(-8, 8), s.y - 24, text, size, color).setDepth(4600);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 700, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  private toastText: Phaser.GameObjects.Text | null = null;
  private toast(msg: string): void {
    this.toastText?.destroy();
    const t = addText(this, GAME_W / 2, HUD_Y - 40, msg, 24, '#ffffff').setDepth(8000);
    this.toastText = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  private banner(msg: string, color: string, size = 40): void {
    const bg = this.add.rectangle(GAME_W / 2, 520, GAME_W, 80, 0x000000, 0.55).setDepth(8500);
    const t = addText(this, GAME_W / 2, 520, msg, size, color).setDepth(8501);
    t.setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 250, ease: 'Back.Out' });
    this.tweens.add({
      targets: [bg, t],
      alpha: 0,
      delay: 1500,
      duration: 400,
      onComplete: () => {
        bg.destroy();
        t.destroy();
      },
    });
  }

  private finish(outcome: MatchOutcome): void {
    if (this.ended) return;
    this.ended = true;
    this.hand.enabled = false;
    Sound.stopBgm();
    const msg = outcome.winner === 0 ? '勝利！' : outcome.winner === 1 ? '敗北…' : '引き分け';
    this.banner(msg, outcome.winner === 0 ? CSS.gold : outcome.winner === 1 ? CSS.bad : '#ffffff', 64);
    const data: ResultData = {
      outcome,
      crowns: [this.world.players[0].crowns, this.world.players[1].crowns],
      difficulty: this.difficulty,
    };
    this.time.delayedCall(2200, () => this.scene.start('Result', data));
  }
}
