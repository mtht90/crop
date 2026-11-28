// カードバトルの本体（1対1）。描画（BattleView）と判断（BattleController）は外から差し込むので、
// 画面なしのシミュレーション（CPU どうしのバトル）でも同じコードで動く。
import { BATTLE, CARDS } from '../data/defs.ts';
import { Rng } from './rng.ts';
import type { CardDef, Effect, HeroId, Keyword } from './types.ts';

export interface Unit {
  uid: number;
  card: string;
  side: 0 | 1;
  atk: number;
  hp: number;
  maxHp: number;
  kw: Keyword[];
  shield: boolean;
  ready: boolean; // このターンに攻撃できる
}

export interface Side {
  name: string;
  hero: HeroId | null; // null は中立の魔物
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  deck: string[];
  hand: string[];
  field: Unit[];
  fatigue: number;
  turns: number;
  damageThisTurn: number;
  bestTurnDamage: number;
}

export type Target = { kind: 'face'; side: 0 | 1 } | { kind: 'unit'; uid: number };
export type BAction = { type: 'play'; hand: number; target?: Target } | { type: 'attack'; uid: number; target: Target } | { type: 'end' };

export interface BattleView {
  turnStart(side: 0 | 1): Promise<void>;
  draw(side: 0 | 1, cards: string[], burned: string[]): Promise<void>;
  play(side: 0 | 1, card: string, target?: Target): Promise<void>;
  summon(u: Unit): Promise<void>;
  attack(u: Unit, target: Target): Promise<void>;
  damage(target: Target, n: number, blocked: boolean): Promise<void>;
  heal(side: 0 | 1, n: number): Promise<void>;
  buff(u: Unit): Promise<void>;
  death(u: Unit): Promise<void>;
  fatigue(side: 0 | 1, n: number): Promise<void>;
  end(winner: 0 | 1): Promise<void>;
  sync(): void;
}
export interface BattleController {
  act(b: Battle, side: 0 | 1): Promise<BAction>;
}

export interface BattleSetup {
  sides: [
    { name: string; hero: HeroId | null; hp: number; deck: string[]; extraCards?: number; manaBonus?: number },
    { name: string; hero: HeroId | null; hp: number; deck: string[]; extraCards?: number; manaBonus?: number },
  ];
  seed: number;
}

export const noopBattleView: BattleView = {
  turnStart: async () => {}, draw: async () => {}, play: async () => {}, summon: async () => {}, attack: async () => {},
  damage: async () => {}, heal: async () => {}, buff: async () => {}, death: async () => {}, fatigue: async () => {}, end: async () => {}, sync: () => {},
};

/** side 0 が攻める側（先攻）、side 1 が守る側 */
export class Battle {
  sides: [Side, Side];
  turn: 0 | 1 = 0;
  over = false;
  winner: 0 | 1 | null = null;
  rng: Rng;
  view: BattleView;
  ctrl: [BattleController, BattleController];
  private nextUid = 1;

  constructor(setup: BattleSetup, view: BattleView, ctrl: [BattleController, BattleController]) {
    this.rng = new Rng(setup.seed);
    this.view = view;
    this.ctrl = ctrl;
    this.sides = setup.sides.map((s) => ({
      name: s.name,
      hero: s.hero,
      hp: s.hp,
      maxHp: s.hp,
      mana: 0,
      maxMana: 0,
      deck: this.shuffle(s.deck.filter((c) => CARDS[c] && !CARDS[c].token)),
      hand: [],
      field: [],
      fatigue: 0,
      turns: 0,
      damageThisTurn: 0,
      bestTurnDamage: 0,
    })) as unknown as [Side, Side];
    setup.sides.forEach((s, i) => {
      const n = (i === 0 ? BATTLE.firstHand : BATTLE.secondHand) + (s.hero === 'merchant' ? 1 : 0) + (s.extraCards ?? 0);
      for (let k = 0; k < n; k++) this.drawRaw(this.sides[i]);
      this.sides[i].maxMana = s.manaBonus ?? 0;
    });
  }

  private shuffle<T>(a: T[]): T[] {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  private drawRaw(s: Side): string | null {
    const c = s.deck.pop();
    if (!c) return null;
    s.hand.push(c);
    return c;
  }

  // ---------- 計算 ----------
  other(side: 0 | 1): 0 | 1 {
    return side === 0 ? 1 : 0;
  }
  unit(uid: number): Unit | undefined {
    return this.sides[0].field.find((u) => u.uid === uid) ?? this.sides[1].field.find((u) => u.uid === uid);
  }
  /** 呪文のダメージ（魔女は +1） */
  spellDamage(side: 0 | 1, n: number) {
    return n + (this.sides[side].hero === 'mage' ? 1 : 0);
  }
  hasGuard(side: 0 | 1) {
    return this.sides[side].field.some((u) => u.kw.includes('guard'));
  }
  /** 兵 u が攻撃できる相手 */
  attackTargets(u: Unit): Target[] {
    if (!u.ready || u.atk <= 0) return [];
    const foe = this.other(u.side);
    const units = this.sides[foe].field;
    const guards = units.filter((x) => x.kw.includes('guard'));
    if (guards.length) return guards.map((x) => ({ kind: 'unit', uid: x.uid }));
    return [{ kind: 'face', side: foe }, ...units.map((x) => ({ kind: 'unit' as const, uid: x.uid }))];
  }
  /** カードの対象として選べるもの（対象のいらないカードは空配列） */
  cardTargets(side: 0 | 1, card: string): Target[] {
    const c = CARDS[card];
    const f = c.fx?.[0];
    if (!f) return [];
    const foe = this.other(side);
    if (f.kind === 'damage' && f.target === 'enemyAny') return [{ kind: 'face', side: foe }, ...this.sides[foe].field.map((u) => ({ kind: 'unit' as const, uid: u.uid }))];
    if (f.kind === 'damage' && f.target === 'enemyUnit') return this.sides[foe].field.map((u) => ({ kind: 'unit' as const, uid: u.uid }));
    if (f.kind === 'buff') return this.sides[side].field.map((u) => ({ kind: 'unit' as const, uid: u.uid }));
    return [];
  }
  needsTarget(card: string) {
    const f = CARDS[card].fx?.[0];
    return !!f && ((f.kind === 'damage' && f.target !== 'enemyFace') || f.kind === 'buff');
  }
  canPlay(side: 0 | 1, hand: number): boolean {
    const s = this.sides[side];
    const card = s.hand[hand];
    if (!card) return false;
    const c = CARDS[card];
    if (c.cost > s.mana) return false;
    if (c.type === 'unit' && s.field.length >= BATTLE.field) return false;
    if (c.type === 'spell') {
      if (this.needsTarget(card) && !this.cardTargets(side, card).length) return false;
      const sm = c.fx?.find((f) => f.kind === 'summon');
      if (sm && s.field.length >= BATTLE.field) return false;
    }
    return true;
  }
  sameTarget(a: Target, b: Target) {
    return a.kind === b.kind && (a.kind === 'face' ? a.side === (b as { side: number }).side : a.uid === (b as { uid: number }).uid);
  }

  // ---------- 進行 ----------
  async run(): Promise<0 | 1> {
    this.view.sync();
    while (!this.over) {
      await this.startTurn(this.turn);
      if (this.over) break;
      for (let guard = 0; guard < 60 && !this.over; guard++) {
        const a = await this.ctrl[this.turn].act(this, this.turn);
        if (a.type === 'end') break;
        await this.apply(this.turn, a);
        this.view.sync();
      }
      if (this.over) break;
      await this.endTurn(this.turn);
    }
    return this.winner!;
  }

  private async startTurn(side: 0 | 1) {
    const s = this.sides[side];
    s.turns++;
    s.damageThisTurn = 0;
    s.maxMana = Math.min(BATTLE.maxMana, s.maxMana + 1);
    s.mana = s.maxMana;
    for (const u of s.field) u.ready = true;
    await this.view.turnStart(side);
    await this.draw(side, 1);
  }

  async draw(side: 0 | 1, n: number) {
    const s = this.sides[side];
    const got: string[] = [];
    const burned: string[] = [];
    for (let k = 0; k < n; k++) {
      const c = s.deck.pop();
      if (!c) {
        s.fatigue++;
        await this.view.fatigue(side, s.fatigue);
        await this.hitFace(side, s.fatigue);
        if (this.over) return;
        continue;
      }
      if (s.hand.length >= BATTLE.handMax) burned.push(c);
      else {
        s.hand.push(c);
        got.push(c);
      }
    }
    if (got.length || burned.length) await this.view.draw(side, got, burned);
    this.view.sync();
  }

  private async endTurn(side: 0 | 1) {
    const s = this.sides[side];
    // 投石機など：ターンの終わりに敵の城を撃つ
    for (const u of [...s.field]) {
      for (const f of CARDS[u.card].fx ?? []) {
        if (f.kind !== 'siege' || this.over) continue;
        await this.view.attack(u, { kind: 'face', side: this.other(side) });
        await this.hitFace(this.other(side), f.n, side);
      }
    }
    if (this.over) return;
    // 決着がつかなければ守る側の勝ち
    if (this.sides[0].turns >= BATTLE.turnLimit && this.sides[1].turns >= BATTLE.turnLimit) {
      await this.finish(1);
      return;
    }
    this.turn = this.other(side);
  }

  async apply(side: 0 | 1, a: BAction) {
    if (a.type === 'play') {
      if (!this.canPlay(side, a.hand)) return;
      const s = this.sides[side];
      const card = s.hand[a.hand];
      const c = CARDS[card];
      if (this.needsTarget(card)) {
        if (!a.target || !this.cardTargets(side, card).some((t) => this.sameTarget(t, a.target!))) {
          // 兵の登場時効果は、対象がなければ効果なしで出せる
          if (c.type === 'spell') return;
          if (this.cardTargets(side, card).length) return;
        }
      }
      s.hand.splice(a.hand, 1);
      s.mana -= c.cost;
      await this.view.play(side, card, a.target);
      if (c.type === 'unit') {
        const u = await this.summon(side, card);
        if (u) for (const f of c.fx ?? []) if (f.kind !== 'siege') await this.effect(side, f, a.target, u);
      } else for (const f of c.fx ?? []) await this.effect(side, f, a.target, null, true);
      await this.cleanup();
      return;
    }
    if (a.type === 'attack') {
      const u = this.unit(a.uid);
      if (!u || u.side !== side) return;
      if (!this.attackTargets(u).some((t) => this.sameTarget(t, a.target))) return;
      u.ready = false;
      await this.view.attack(u, a.target);
      if (a.target.kind === 'face') {
        const bonus = this.sides[side].hero === 'barbarian' ? 1 : 0;
        await this.hitFace(a.target.side, u.atk + bonus, side);
      } else {
        const t = this.unit(a.target.uid);
        if (!t) return;
        const back = u.kw.includes('ranged') ? 0 : t.atk;
        await this.hitUnit(t, u.atk);
        if (back > 0) await this.hitUnit(u, back);
      }
      await this.cleanup();
    }
  }

  async summon(side: 0 | 1, card: string): Promise<Unit | null> {
    const s = this.sides[side];
    if (s.field.length >= BATTLE.field) return null;
    const c = CARDS[card];
    const kw = [...(c.kw ?? [])];
    let atk = c.atk ?? 0;
    let hp = c.hp ?? 1;
    // キャラの得意
    if (s.hero === 'knight' && kw.includes('guard')) hp += 1;
    if (s.hero === 'ranger' && kw.includes('ranged')) atk += 1;
    if (s.hero === 'assassin' && kw.includes('rush')) atk += 1;
    const u: Unit = { uid: this.nextUid++, card, side, atk, hp, maxHp: hp, kw, shield: kw.includes('shield'), ready: kw.includes('rush') };
    s.field.push(u);
    await this.view.summon(u);
    return u;
  }

  private async effect(side: 0 | 1, f: Effect, target: Target | undefined, self: Unit | null, spell = false) {
    if (this.over) return;
    const foe = this.other(side);
    const dmg = (n: number) => (spell ? this.spellDamage(side, n) : n);
    switch (f.kind) {
      case 'damage': {
        if (f.target === 'enemyFace') return this.hitFace(foe, dmg(f.n), side);
        if (!target) return;
        if (target.kind === 'face') {
          if (target.side !== foe) return;
          return this.hitFace(foe, dmg(f.n), side);
        }
        const t = this.unit(target.uid);
        if (t && t.side === foe) await this.hitUnit(t, dmg(f.n));
        return;
      }
      case 'aoe':
        for (const t of [...this.sides[foe].field]) await this.hitUnit(t, dmg(f.n));
        return;
      case 'heal': {
        const s = this.sides[side];
        const n = Math.min(f.n, s.maxHp - s.hp);
        s.hp += n;
        await this.view.heal(side, n);
        return;
      }
      case 'buff': {
        if (!target || target.kind !== 'unit') return;
        const t = this.unit(target.uid);
        if (!t || t.side !== side) return;
        t.atk += f.atk;
        t.hp += f.hp;
        t.maxHp += f.hp;
        if (f.shield) t.shield = true;
        await this.view.buff(t);
        return;
      }
      case 'buffAll':
        for (const t of this.sides[side].field) {
          if (t === self) continue;
          t.atk += f.atk;
          t.hp += f.hp;
          t.maxHp += f.hp;
          await this.view.buff(t);
        }
        return;
      case 'draw':
        return this.draw(side, f.n);
      case 'summon':
        for (let k = 0; k < f.count; k++) await this.summon(side, f.card);
        return;
      case 'siege':
        return;
    }
  }

  private async hitUnit(t: Unit, n: number) {
    if (n <= 0) return;
    if (t.shield) {
      t.shield = false;
      await this.view.damage({ kind: 'unit', uid: t.uid }, 0, true);
      return;
    }
    t.hp -= n;
    await this.view.damage({ kind: 'unit', uid: t.uid }, n, false);
  }

  private async hitFace(side: 0 | 1, n: number, by?: 0 | 1) {
    if (n <= 0 || this.over) return;
    const s = this.sides[side];
    s.hp -= n;
    if (by !== undefined) {
      this.sides[by].damageThisTurn += n;
      this.sides[by].bestTurnDamage = Math.max(this.sides[by].bestTurnDamage, this.sides[by].damageThisTurn);
    }
    await this.view.damage({ kind: 'face', side }, n, false);
    if (s.hp <= 0) await this.finish(this.other(side));
  }

  private async cleanup() {
    for (const s of this.sides) {
      const dead = s.field.filter((u) => u.hp <= 0);
      if (!dead.length) continue;
      s.field = s.field.filter((u) => u.hp > 0);
      for (const u of dead) await this.view.death(u);
    }
    this.view.sync();
  }

  private async finish(w: 0 | 1) {
    if (this.over) return;
    this.over = true;
    this.winner = w;
    this.view.sync();
    await this.view.end(w);
  }
}

export const cardDef = (id: string): CardDef => CARDS[id];
