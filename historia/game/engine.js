// HISTORIA rules engine (ARCANE BEASTS rules, no ex/Ω, no resistance values)
// The engine is UI-agnostic. Choices are requested through async `ask(pi, req)`
// where pi is the player index and req = {kind, prompt, options:[{label, value, card?}], optional}.
(function () {
  'use strict';
  const CARDS = {};
  for (const c of window.HISTORIA_CARDS) CARDS[c.id] = c;
  const TYPES = ['buyu', 'chiryaku', 'seiji', 'kagaku', 'shiso', 'tanken', 'gekokujo', 'geijutsu'];
  const TYPE_JA = { buyu: '武勇', chiryaku: '知略', seiji: '政治', kagaku: '科学', shiso: '思想', tanken: '探検', gekokujo: '下剋上', geijutsu: '芸術', mushoku: '無色' };
  const STATUS_JA = { poison: 'どく', burn: 'やけど', sleep: 'ねむり', para: 'マヒ', conf: 'こんらん' };
  const KIND_JA = { support: 'サポート', goods: 'グッズ', tool: 'どうぐ', stadium: 'スタジアム', energy: 'エネルギー', person: '人物' };

  // ---------- effect text ----------
  function fxList(fx) { return fx ? String(fx).split(',').map(s => s.trim()).filter(Boolean) : []; }
  function attackText(a) {
    return fxList(a.fx).map(t => {
      const [k, x, y] = t.split(':'); const n = +x;
      switch (k) {
        case 'draw': return `自分の山札を${n}枚引く。`;
        case 'heal': return `この人物のHPを${n}回復する。`;
        case 'healall': return `自分の人物全員のHPを、それぞれ${n}回復する。`;
        case 'st': return `相手のバトル場の人物を${STATUS_JA[x]}にする。`;
        case 'stc': return `コインを1回投げ、表なら相手のバトル場の人物を${STATUS_JA[x]}にする。`;
        case 'bench': return `自分のベンチの人物1人につき、${n}ダメージ追加。`;
        case 'oppbench': return `相手のベンチの人物1人につき、${n}ダメージ追加。`;
        case 'coin': return `コインを1回投げ、表なら${n}ダメージ追加。`;
        case 'coinfail': return `コインを1回投げ、裏ならこのワザは失敗。`;
        case 'coins': return `コインを2回投げ、表の数×${n}ダメージ。`;
        case 'snipe': return `相手のベンチの人物1人にも${n}ダメージ。`;
        case 'self': return `この人物にも${n}ダメージ。`;
        case 'disc': return `この人物のエネルギーを${n}個トラッシュする。`;
        case 'oppdisc': return `相手のバトル場の人物のエネルギーを1個トラッシュする。`;
        case 'guard': return `次の相手の番、この人物が受けるダメージは-${n}。`;
        case 'noatk': return `次の自分の番、この人物はワザが使えない。`;
        case 'gust': return `相手のベンチの人物を1人選び、バトル場の人物と入れ替える。`;
        case 'switch': return `この人物を自分のベンチの人物と入れ替える。`;
        case 'basic': return `自分の山札からたねの人物を1枚選び、ベンチに出す。`;
        case 'energy': return `自分の山札から基本エネルギーを1枚選び、ベンチの人物につける。`;
        case 'sup': return `自分の山札からサポートを1枚選び、手札に加える。`;
        case 'item': return `自分の山札からグッズかどうぐを1枚選び、手札に加える。`;
        case 'dmgd': return `相手のバトル場の人物がダメージを受けていれば、${n}ダメージ追加。`;
        case 'stat': return `相手のバトル場の人物が特殊状態なら、${n}ダメージ追加。`;
        case 'eper': return `この人物についているエネルギー1個につき、${n}ダメージ追加。`;
        case 'hand1': return `相手の手札をウラのまま1枚選び、トラッシュする。`;
        case 'wounded': return `この人物が受けているダメージ10につき、${n}ダメージ追加。`;
        default: return '';
      }
    }).join('');
  }
  function trainerText(c) {
    const out = [];
    for (const t of fxList(c.fx)) {
      const p = t.split(':'); const k = p[0]; const n = +p[1];
      if (k === 'tool') {
        const sub = p.slice(1).join(':').split(',');
        for (const s of t.slice(5).split('|')) {}
        const m = p[1], v = +p[2];
        if (m === 'hp') out.push(`これをつけた人物の最大HPは+${v}。`);
        if (m === 'atk') out.push(`これをつけた人物のワザのダメージは、相手のバトル場の人物に+${v}。`);
        if (m === 'retreat') out.push(`これをつけた人物は、エネルギーなしでにげられる。`);
        if (m === 'guard') out.push(`これをつけた人物が受けるワザのダメージは-${v}。`);
        continue;
      }
      if (k === 'hp') { out.push(`さらに最大HPも+${n}。`); continue; }
      if (k === 'stadium') {
        const m = p[1];
        if (m === 'typeatk') out.push(`おたがいの${p[2]}の人物のワザのダメージは、相手のバトル場の人物に+${p[3]}。`);
        if (m === 'retreat') out.push(`おたがいのバトル場の人物のにげるエネルギーは1個少なくなる。`);
        if (m === 'heal') out.push(`おたがいの番の終わりに、その番のプレイヤーのバトル場の人物のHPを${p[2]}回復する。`);
        if (m === 'drawplus') out.push(`おたがいのプレイヤーは、自分の番に1回、手札が4枚以下なら山札を1枚引ける（自動）。`);
        if (m === 'basichp') out.push(`おたがいのたねの人物の最大HPは+${p[2]}。`);
        continue;
      }
      switch (k) {
        case 'draw': out.push(`自分の山札を${n}枚引く。`); break;
        case 'redraw': out.push(`自分の手札をすべて山札にもどして切り、山札を${n}枚引く。`); break;
        case 'oppredraw': out.push(`相手は手札をすべて山札にもどして切り、山札を${n}枚引く。`); break;
        case 'gust': out.push(`相手のベンチの人物を1人選び、バトル場の人物と入れ替える。`); break;
        case 'switch': out.push(`自分のバトル場の人物を、ベンチの人物と入れ替える。`); break;
        case 'heal': out.push(`自分の人物1人のHPを${n}回復する。`); break;
        case 'energy': out.push(`自分の山札から基本エネルギーを${n}枚まで選び、自分の人物に好きなようにつける。`); break;
        case 'basic': out.push(`自分の山札からたねの人物を${n}枚まで選び、手札に加える。`); break;
        case 'search': out.push(`自分の山札から好きなカードを1枚選び、手札に加える。`); break;
        case 'sup2': out.push(`自分の山札からサポート以外のトレーナーズを2枚まで選び、手札に加える。`); break;
        case 'recover': out.push(`自分のトラッシュから人物を${n}枚まで選び、山札にもどして切る。`); break;
        case 'eneback': out.push(`自分のトラッシュから基本エネルギーを${n}枚まで選び、手札に加える。`); break;
        case 'top': out.push(`自分の山札を上から${n}枚見て、その中から1枚を手札に加える。残りは山札にもどして切る。`); break;
        case 'snipe': out.push(`相手の人物1人に${n}ダメージ。`); break;
        case 'atkbuff': out.push(`この番、自分の人物のワザのダメージは、相手のバトル場の人物に+${n}。`); break;
        case 'item_energy': out.push(`自分のトラッシュから基本エネルギーを1枚選び、自分のバトル場の人物につける。`); break;
      }
    }
    return out.join('');
  }

  // ---------- helpers ----------
  let uidSeq = 1;
  const rnd = () => Math.random();
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const inst = id => ({ uid: uidSeq++, id });
  const C = x => CARDS[x.id || x];
  const isBasic = x => C(x).kind === 'person' && C(x).stage === 0;
  const isEnergy = x => C(x).kind === 'energy';
  const isTrainer = x => ['support', 'goods', 'tool', 'stadium'].includes(C(x).kind);

  function mkSlot(card, turn) {
    return { uid: uidSeq++, stack: [card], energy: [], tool: null, damage: 0, status: {}, enteredTurn: turn, evolvedTurn: -1, guard: 0, noatkTurn: -1 };
  }
  const top = s => C(s.stack[s.stack.length - 1]);

  class Game {
    constructor(decks, opts) {
      this.opts = opts || {};
      this.ask = this.opts.ask;           // async (pi, req) => value
      this.onEvent = this.opts.onEvent || (() => {});
      this.turn = 0; this.cur = 0; this.winner = null; this.stadium = null; this.log = [];
      this.players = decks.map((d, i) => ({
        i, name: this.opts.names ? this.opts.names[i] : (i === 0 ? 'あなた' : 'CPU'),
        deck: shuffle(d.map(inst)), hand: [], prizes: [], discard: [], active: null, bench: [],
        energyPlayed: false, supporterPlayed: false, stadiumPlayed: false, retreated: false, atkbuff: 0, koLastTurn: false,
      }));
    }
    P(i) { return this.players[i]; }
    opp(i) { return this.players[1 - i]; }
    emit(type, data) { this.onEvent(type, data || {}); }
    say(msg) { this.log.push(msg); this.emit('log', { msg }); }
    flip() { const h = rnd() < 0.5; this.emit('coin', { heads: h }); this.say(`コイン：${h ? '表' : '裏'}`); return h; }

    maxHp(s) {
      const c = top(s); let hp = c.hp;
      if (s.tool) { for (const t of fxList(C(s.tool).fx)) { const p = t.split(':'); if (p[0] === 'tool' && p[1] === 'hp') hp += +p[2]; if (p[0] === 'hp') hp += +p[1]; } }
      const st = this.stadiumFx();
      if (st && st[1] === 'basichp' && c.stage === 0) hp += +st[2];
      return hp;
    }
    hpLeft(s) { return this.maxHp(s) - s.damage; }
    stadiumFx() { if (!this.stadium) return null; const t = fxList(C(this.stadium.card).fx)[0]; return t ? t.split(':').slice(1) : null; }
    retreatCost(s) {
      if (s.tool && fxList(C(s.tool).fx).some(t => t === 'tool:retreat:0')) return 0;
      let r = top(s).ret; const st = this.stadiumFx(); if (st && st[0] === 'retreat') r -= 1; return Math.max(0, r);
    }
    allSlots(p) { return [p.active, ...p.bench].filter(Boolean); }
    draw(p, n) { let k = 0; for (; k < n && p.deck.length; k++) p.hand.push(p.deck.shift()); if (k) this.emit('draw', { pi: p.i, n: k }); return k; }

    // ---------- setup ----------
    async setup() {
      for (const p of this.players) {
        let mull = 0;
        for (;;) {
          p.deck.push(...p.hand); p.hand = []; shuffle(p.deck); this.draw(p, 7);
          if (p.hand.some(isBasic)) break;
          mull++; this.say(`${p.name}の手札にたねの人物がいないので、引き直し。`);
        }
        p.mulligans = mull;
      }
      for (const p of this.players) { const o = this.opp(p.i); if (o.mulligans) this.draw(p, o.mulligans); }
      for (const p of this.players) {
        const basics = p.hand.filter(isBasic);
        const pick = await this.ask(p.i, { kind: 'setupActive', prompt: 'バトル場に出す人物を選んでください', options: basics.map(c => ({ label: C(c).name, value: c.uid, card: c })) });
        const c = p.hand.find(x => x.uid === pick) || basics[0];
        p.hand.splice(p.hand.indexOf(c), 1); p.active = mkSlot(c, 0);
        for (;;) {
          const rest = p.hand.filter(isBasic); if (!rest.length || p.bench.length >= 5) break;
          const b = await this.ask(p.i, { kind: 'setupBench', prompt: 'ベンチに出す人物を選んでください（終わったら「完了」）', optional: true, options: rest.map(c => ({ label: C(c).name, value: c.uid, card: c })) });
          if (b == null) break;
          const bc = p.hand.find(x => x.uid === b); if (!bc) break;
          p.hand.splice(p.hand.indexOf(bc), 1); p.bench.push(mkSlot(bc, 0));
        }
        for (let k = 0; k < 6; k++) p.prizes.push(p.deck.shift());
      }
      this.cur = rnd() < 0.5 ? 0 : 1;
      this.say(`${this.P(this.cur).name}の先攻。`);
      this.emit('setupDone');
    }

    // ---------- turn ----------
    async startTurn() {
      this.turn++; const p = this.P(this.cur);
      Object.assign(p, { energyPlayed: false, supporterPlayed: false, stadiumPlayed: false, retreated: false, atkbuff: 0 });
      this.say(`── ${p.name}の番（ターン${this.turn}） ──`);
      this.emit('turnStart', { pi: p.i, turn: this.turn });
      if (!p.deck.length) { this.say(`${p.name}は山札が引けない。`); return this.end(1 - p.i, 'deckout'); }
      this.draw(p, 1);
      const st = this.stadiumFx();
      if (st && st[0] === 'drawplus' && p.hand.length <= 4) { this.draw(p, 1); this.say('堺の港の効果で1枚引いた。'); }
    }
    isFirstTurnOfGame() { return this.turn === 1; }
    canEvolveThisTurn() { return this.turn > 2; }

    // legal actions for UI/AI
    playable(pi) {
      const p = this.P(pi); const res = [];
      if (this.winner != null || this.cur !== pi) return res;
      for (const c of p.hand) {
        const d = C(c);
        if (d.kind === 'person' && d.stage === 0) { if (p.bench.length < 5) res.push({ type: 'bench', card: c }); }
        else if (d.kind === 'person') { const t = this.evoTargets(p, c); if (t.length) res.push({ type: 'evolve', card: c, targets: t }); }
        else if (d.kind === 'energy') { if (!p.energyPlayed) res.push({ type: 'energy', card: c, targets: this.allSlots(p) }); }
        else if (d.kind === 'support') { if (!p.supporterPlayed && !(this.turn === 1)) if (this.trainerUsable(p, c)) res.push({ type: 'trainer', card: c }); }
        else if (d.kind === 'goods') { if (this.trainerUsable(p, c)) res.push({ type: 'trainer', card: c }); }
        else if (d.kind === 'tool') { const t = this.allSlots(p).filter(s => !s.tool); if (t.length) res.push({ type: 'tool', card: c, targets: t }); }
        else if (d.kind === 'stadium') { if (!p.stadiumPlayed && (!this.stadium || this.stadium.card.id !== c.id)) res.push({ type: 'stadium', card: c }); }
      }
      return res;
    }
    evoTargets(p, c) {
      if (!this.canEvolveThisTurn()) return [];
      const d = C(c);
      return this.allSlots(p).filter(s => top(s).id === d.from && s.enteredTurn < this.turn && s.evolvedTurn < this.turn);
    }
    trainerUsable(p, c) {
      const o = this.opp(p.i);
      for (const t of fxList(C(c).fx)) {
        const k = t.split(':')[0];
        if (k === 'gust' && !o.bench.length) return false;
        if (k === 'switch' && !p.bench.length && fxList(C(c).fx).length === 1) return false;
        if (k === 'heal' && !this.allSlots(p).some(s => s.damage > 0) && fxList(C(c).fx).length === 1) return false;
        if (k === 'item_energy' && !p.discard.some(isEnergy)) return false;
        if (k === 'eneback' && !p.discard.some(isEnergy)) return false;
        if (k === 'recover' && !p.discard.some(x => C(x).kind === 'person') && fxList(C(c).fx).length === 1) return false;
        if (k === 'basic' && !p.deck.some(isBasic)) return false;
      }
      if (!p.deck.length && fxList(C(c).fx).every(t => /^(draw|top|search|basic|sup2|energy)/.test(t))) return false;
      return true;
    }
    energyOk(s, cost) {
      const pool = s.energy.map(e => C(e).type); const need = [...cost];
      for (const t of need.filter(x => x !== 'mushoku')) { const i = pool.indexOf(t); if (i < 0) return false; pool.splice(i, 1); }
      return pool.length >= need.filter(x => x === 'mushoku').length;
    }
    canAttack(pi, ai) {
      const p = this.P(pi); const s = p.active; if (!s || this.cur !== pi || this.turn === 1) return false;
      if (s.status.sleep || s.status.para) return false;
      const a = top(s).atks[ai]; if (!a) return false;
      if (s.noatkTurn === this.turn && s.noatkIdx === ai) return false;
      return this.energyOk(s, a.cost);
    }
    canRetreat(pi) {
      const p = this.P(pi); const s = p.active;
      return !!s && this.cur === pi && !p.retreated && p.bench.length > 0 && !s.status.sleep && !s.status.para && s.energy.length >= this.retreatCost(s);
    }

    // ---------- actions ----------
    async playBasic(pi, uid) {
      const p = this.P(pi); const c = p.hand.find(x => x.uid === uid); if (!c || !isBasic(c) || p.bench.length >= 5) return false;
      p.hand.splice(p.hand.indexOf(c), 1); const s = mkSlot(c, this.turn); p.bench.push(s);
      this.say(`${p.name}は${C(c).name}をベンチに出した。`); this.emit('place', { pi, slot: s.uid }); return true;
    }
    async evolve(pi, uid, slotUid) {
      const p = this.P(pi); const c = p.hand.find(x => x.uid === uid); if (!c) return false;
      const s = this.evoTargets(p, c).find(x => x.uid === slotUid); if (!s) return false;
      p.hand.splice(p.hand.indexOf(c), 1); const old = top(s).name; s.stack.push(c); s.evolvedTurn = this.turn; s.status = {};
      this.say(`${p.name}は${old}を${C(c).name}に進化させた。`); this.emit('evolve', { pi, slot: s.uid }); return true;
    }
    async attachEnergy(pi, uid, slotUid) {
      const p = this.P(pi); if (p.energyPlayed) return false; const c = p.hand.find(x => x.uid === uid); if (!c || !isEnergy(c)) return false;
      const s = this.allSlots(p).find(x => x.uid === slotUid); if (!s) return false;
      p.hand.splice(p.hand.indexOf(c), 1); s.energy.push(c); p.energyPlayed = true;
      this.say(`${p.name}は${top(s).name}に${C(c).name}をつけた。`); this.emit('energy', { pi, slot: s.uid, type: C(c).type }); return true;
    }
    async attachTool(pi, uid, slotUid) {
      const p = this.P(pi); const c = p.hand.find(x => x.uid === uid); const s = this.allSlots(p).find(x => x.uid === slotUid);
      if (!c || !s || s.tool) return false; p.hand.splice(p.hand.indexOf(c), 1); s.tool = c;
      this.say(`${p.name}は${top(s).name}に${C(c).name}をつけた。`); this.emit('tool', { pi, slot: s.uid }); return true;
    }
    async playStadium(pi, uid) {
      const p = this.P(pi); const c = p.hand.find(x => x.uid === uid); if (!c || p.stadiumPlayed) return false;
      p.hand.splice(p.hand.indexOf(c), 1);
      if (this.stadium) this.P(this.stadium.owner).discard.push(this.stadium.card);
      this.stadium = { card: c, owner: pi }; p.stadiumPlayed = true;
      this.say(`${p.name}はスタジアム「${C(c).name}」を出した。`); this.emit('stadium', { pi, id: c.id }); return true;
    }
    async playTrainer(pi, uid) {
      const p = this.P(pi); const o = this.opp(pi); const c = p.hand.find(x => x.uid === uid); if (!c) return false;
      const d = C(c); if (d.kind === 'support') { if (p.supporterPlayed || this.turn === 1) return false; p.supporterPlayed = true; }
      p.hand.splice(p.hand.indexOf(c), 1);
      this.say(`${p.name}は${KIND_JA[d.kind]}「${d.name}」を使った。`); this.emit('trainer', { pi, id: d.id });
      for (const t of fxList(d.fx)) {
        const [k, x] = t.split(':'); const n = +x;
        if (k === 'draw') this.draw(p, n);
        else if (k === 'redraw') { p.deck.push(...p.hand); p.hand = []; shuffle(p.deck); this.draw(p, n); }
        else if (k === 'oppredraw') { o.deck.push(...o.hand); o.hand = []; shuffle(o.deck); this.draw(o, n); this.say(`${o.name}は手札を山札にもどし、${n}枚引いた。`); }
        else if (k === 'gust') await this.doGust(pi);
        else if (k === 'switch') await this.doSwitch(pi);
        else if (k === 'heal') await this.doHealOne(pi, n);
        else if (k === 'energy') { for (let j = 0; j < n; j++) if (!(await this.searchEnergyTo(pi, 'any'))) break; }
        else if (k === 'basic') { for (let j = 0; j < n; j++) if (!(await this.searchTo(pi, isBasic, 'たねの人物'))) break; }
        else if (k === 'search') await this.searchTo(pi, () => true, '好きなカード');
        else if (k === 'sup2') { for (let j = 0; j < 2; j++) if (!(await this.searchTo(pi, z => ['goods', 'tool', 'stadium'].includes(C(z).kind), 'トレーナーズ'))) break; }
        else if (k === 'recover') { for (let j = 0; j < n; j++) { const cs = p.discard.filter(z => C(z).kind === 'person'); if (!cs.length) break; const v = await this.ask(pi, { kind: 'pick', prompt: '山札にもどす人物を選んでください', optional: true, options: cs.map(z => ({ label: C(z).name, value: z.uid, card: z })) }); if (v == null) break; const z = p.discard.find(q => q.uid === v); p.discard.splice(p.discard.indexOf(z), 1); p.deck.push(z); } shuffle(p.deck); }
        else if (k === 'eneback') { for (let j = 0; j < n; j++) { const z = p.discard.find(isEnergy); if (!z) break; p.discard.splice(p.discard.indexOf(z), 1); p.hand.push(z); } }
        else if (k === 'top') { const look = p.deck.slice(0, n); if (look.length) { const v = await this.ask(pi, { kind: 'pick', prompt: '手札に加えるカードを選んでください', options: look.map(z => ({ label: C(z).name, value: z.uid, card: z })) }); const z = look.find(q => q.uid === v) || look[0]; p.deck.splice(p.deck.indexOf(z), 1); p.hand.push(z); shuffle(p.deck); } }
        else if (k === 'snipe') { const ts = this.allSlots(o); const v = await this.ask(pi, { kind: 'target', side: 'opp', prompt: `${n}ダメージを与える人物を選んでください`, options: ts.map(s => ({ label: top(s).name, value: s.uid, slot: s })) }); const s = ts.find(q => q.uid === v) || ts[0]; if (s) await this.applyDamage(o, s, n, false); }
        else if (k === 'atkbuff') p.atkbuff += n;
        else if (k === 'item_energy') { const z = p.discard.find(isEnergy); if (z && p.active) { p.discard.splice(p.discard.indexOf(z), 1); p.active.energy.push(z); this.emit('energy', { pi, slot: p.active.uid, type: C(z).type }); } }
      }
      p.discard.push(c);
      await this.checkKOs();
      return true;
    }
    async doGust(pi) {
      const o = this.opp(pi); if (!o.bench.length) return;
      const v = await this.ask(pi, { kind: 'target', side: 'opp', prompt: 'バトル場に呼び出す相手のベンチの人物を選んでください', options: o.bench.map(s => ({ label: top(s).name, value: s.uid, slot: s })) });
      const s = o.bench.find(q => q.uid === v) || o.bench[0];
      o.bench.splice(o.bench.indexOf(s), 1, o.active); o.active.status = {}; o.active = s;
      this.say(`${o.name}の${top(s).name}がバトル場に引きずり出された。`); this.emit('switch', { pi: o.i });
    }
    async doSwitch(pi) {
      const p = this.P(pi); if (!p.bench.length) return;
      const v = await this.ask(pi, { kind: 'target', side: 'self', bench: true, prompt: 'バトル場に出す人物を選んでください', options: p.bench.map(s => ({ label: top(s).name, value: s.uid, slot: s })) });
      const s = p.bench.find(q => q.uid === v) || p.bench[0];
      p.bench.splice(p.bench.indexOf(s), 1, p.active); p.active.status = {}; p.active = s;
      this.say(`${p.name}は${top(s).name}をバトル場に出した。`); this.emit('switch', { pi });
    }
    async doHealOne(pi, n) {
      const p = this.P(pi); const ts = this.allSlots(p).filter(s => s.damage > 0); if (!ts.length) return;
      const v = await this.ask(pi, { kind: 'target', side: 'self', prompt: `HPを${n}回復する人物を選んでください`, options: ts.map(s => ({ label: top(s).name, value: s.uid, slot: s })) });
      const s = ts.find(q => q.uid === v) || ts[0]; s.damage = Math.max(0, s.damage - n); this.emit('heal', { pi, slot: s.uid, n });
    }
    async searchTo(pi, pred, what) {
      const p = this.P(pi); const cs = p.deck.filter(pred);
      if (!cs.length) { this.say(`山札に${what}がなかった。`); shuffle(p.deck); return false; }
      const uniq = []; const seen = new Set(); for (const z of cs) if (!seen.has(z.id)) { seen.add(z.id); uniq.push(z); }
      const v = await this.ask(pi, { kind: 'pick', prompt: `手札に加える${what}を選んでください`, optional: true, options: uniq.map(z => ({ label: C(z).name, value: z.uid, card: z })) });
      if (v == null) { shuffle(p.deck); return false; }
      const z = p.deck.find(q => q.uid === v); p.deck.splice(p.deck.indexOf(z), 1); p.hand.push(z); shuffle(p.deck); this.emit('draw', { pi, n: 1 });
      return true;
    }
    async searchEnergyTo(pi, where) {
      const p = this.P(pi); const e = p.deck.find(isEnergy); if (!e) return false;
      const ts = where === 'bench' ? p.bench : this.allSlots(p); if (!ts.length) return false;
      const types = [...new Set(p.deck.filter(isEnergy).map(z => C(z).type))];
      let type = types[0];
      if (types.length > 1) type = await this.ask(pi, { kind: 'pick', prompt: 'つけるエネルギーを選んでください', options: types.map(t => ({ label: TYPE_JA[t] + 'エネルギー', value: t, card: { id: 'E-' + t } })) }) || types[0];
      const v = await this.ask(pi, { kind: 'target', side: 'self', bench: where === 'bench', prompt: 'エネルギーをつける人物を選んでください', options: ts.map(s => ({ label: top(s).name, value: s.uid, slot: s })) });
      const s = ts.find(q => q.uid === v) || ts[0]; const z = p.deck.find(q => isEnergy(q) && C(q).type === type) || e;
      p.deck.splice(p.deck.indexOf(z), 1); s.energy.push(z); shuffle(p.deck);
      this.say(`${top(s).name}に${C(z).name}をつけた。`); this.emit('energy', { pi, slot: s.uid, type: C(z).type }); return true;
    }
    async retreat(pi) {
      const p = this.P(pi); if (!this.canRetreat(pi)) return false;
      const s = p.active; let cost = this.retreatCost(s);
      while (cost-- > 0) { const e = s.energy.pop(); p.discard.push(e); }
      const v = await this.ask(pi, { kind: 'target', side: 'self', bench: true, prompt: '入れ替える人物を選んでください', options: p.bench.map(b => ({ label: top(b).name, value: b.uid, slot: b })) });
      const b = p.bench.find(q => q.uid === v) || p.bench[0];
      p.bench.splice(p.bench.indexOf(b), 1, s); s.status = {}; p.active = b; p.retreated = true;
      this.say(`${p.name}は${top(s).name}をにがし、${top(b).name}を出した。`); this.emit('switch', { pi }); return true;
    }

    // ---------- attack ----------
    damageTo(attacker, ap, defSlot, base, isActiveTarget) {
      let d = base; if (d <= 0) return 0;
      const ac = top(attacker); const dc = top(defSlot);
      if (isActiveTarget) {
        if (attacker.tool) for (const t of fxList(C(attacker.tool).fx)) { const q = t.split(':'); if (q[0] === 'tool' && q[1] === 'atk') d += +q[2]; }
        const st = this.stadiumFx(); if (st && st[0] === 'typeatk' && TYPE_JA[ac.type] === st[1]) d += +st[2];
        d += ap.atkbuff || 0;
        if (dc.weak === ac.type) d *= 2;
        d -= defSlot.guard || 0;
        if (defSlot.tool) for (const t of fxList(C(defSlot.tool).fx)) { const q = t.split(':'); if (q[0] === 'tool' && q[1] === 'guard') d -= +q[2]; }
      }
      return Math.max(0, d);
    }
    async attack(pi, ai) {
      if (!this.canAttack(pi, ai)) return false;
      const p = this.P(pi); const o = this.opp(pi); const s = p.active; const a = top(s).atks[ai];
      this.say(`${top(s).name}の「${a.name}」！`); this.emit('attack', { pi, slot: s.uid, name: a.name, type: top(s).type });
      if (s.status.conf) { if (!this.flip()) { this.say('こんらんでワザが失敗し、自分に30ダメージ。'); await this.applyDamage(p, s, 30, false); await this.checkKOs(); return this.endTurn(); } }
      let dmg = a.dmg; let fail = false; const after = [];
      for (const t of fxList(a.fx)) {
        const [k, x, y] = t.split(':'); const n = +x;
        switch (k) {
          case 'bench': dmg += n * p.bench.length; break;
          case 'oppbench': dmg += n * o.bench.length; break;
          case 'coin': if (this.flip()) dmg += n; break;
          case 'coinfail': if (!this.flip()) fail = true; break;
          case 'coins': { let h = 0; if (this.flip()) h++; if (this.flip()) h++; dmg += n * h; break; }
          case 'dmgd': if (o.active && o.active.damage > 0) dmg += n; break;
          case 'stat': if (o.active && Object.keys(o.active.status).length) dmg += n; break;
          case 'eper': dmg += n * s.energy.length; break;
          case 'wounded': dmg += n * Math.floor(s.damage / 10); break;
          default: after.push([k, x, y]);
        }
      }
      if (fail) { this.say('ワザは失敗した。'); return this.endTurn(); }
      if (dmg > 0 && o.active) {
        const real = this.damageTo(s, p, o.active, dmg, true);
        await this.applyDamage(o, o.active, real, true, top(s).weak === undefined ? false : top(o.active).weak === top(s).type);
      }
      for (const [k, x] of after) {
        const n = +x;
        if (k === 'draw') this.draw(p, n);
        else if (k === 'heal') { s.damage = Math.max(0, s.damage - n); this.emit('heal', { pi, slot: s.uid, n }); }
        else if (k === 'healall') { for (const q of this.allSlots(p)) { if (q.damage) { q.damage = Math.max(0, q.damage - n); this.emit('heal', { pi, slot: q.uid, n }); } } }
        else if (k === 'st') this.setStatus(o, x);
        else if (k === 'stc') { if (this.flip()) this.setStatus(o, x); }
        else if (k === 'snipe') { if (o.bench.length) { const v = await this.ask(pi, { kind: 'target', side: 'opp', bench: true, prompt: `${n}ダメージを与えるベンチの人物を選んでください`, options: o.bench.map(b => ({ label: top(b).name, value: b.uid, slot: b })) }); const b = o.bench.find(q => q.uid === v) || o.bench[0]; await this.applyDamage(o, b, n, false); } }
        else if (k === 'self') await this.applyDamage(p, s, n, false);
        else if (k === 'disc') { for (let j = 0; j < n && s.energy.length; j++) p.discard.push(s.energy.pop()); }
        else if (k === 'oppdisc') { if (o.active && o.active.energy.length) { o.discard.push(o.active.energy.pop()); this.say('相手のエネルギーを1個トラッシュした。'); } }
        else if (k === 'guard') { s.guard = n; s.guardTurn = this.turn + 1; }
        else if (k === 'noatk') { s.noatkTurn = this.turn + 2; s.noatkIdx = ai; }
        else if (k === 'gust') { if (o.active && o.bench.length && o.active.damage < this.maxHp(o.active)) await this.doGust(pi); }
        else if (k === 'switch') { if (p.bench.length && s === p.active) await this.doSwitch(pi); }
        else if (k === 'basic') { const b = p.deck.filter(isBasic); if (b.length && p.bench.length < 5) { const v = await this.ask(pi, { kind: 'pick', prompt: 'ベンチに出すたねの人物を選んでください', optional: true, options: b.map(z => ({ label: C(z).name, value: z.uid, card: z })) }); if (v != null) { const z = p.deck.find(q => q.uid === v); p.deck.splice(p.deck.indexOf(z), 1); p.bench.push(mkSlot(z, this.turn)); this.emit('place', { pi }); } shuffle(p.deck); } }
        else if (k === 'energy') { if (p.bench.length) await this.searchEnergyTo(pi, 'bench'); }
        else if (k === 'sup') await this.searchTo(pi, z => C(z).kind === 'support', 'サポート');
        else if (k === 'item') await this.searchTo(pi, z => ['goods', 'tool'].includes(C(z).kind), 'グッズ・どうぐ');
        else if (k === 'hand1') { if (o.hand.length) { const z = o.hand.splice(Math.floor(rnd() * o.hand.length), 1)[0]; o.discard.push(z); this.say(`${o.name}の手札の${C(z).name}をトラッシュした。`); } }
      }
      await this.checkKOs();
      if (this.winner != null) return true;
      return this.endTurn();
    }
    setStatus(o, st) {
      const s = o.active; if (!s) return;
      if (st === 'sleep' || st === 'para' || st === 'conf') { delete s.status.sleep; delete s.status.para; delete s.status.conf; }
      s.status[st] = st === 'para' ? this.turn : true;
      this.say(`${top(s).name}は${STATUS_JA[st]}になった。`); this.emit('status', { pi: o.i, slot: s.uid, st });
    }
    async applyDamage(p, s, n, fromAttack, weak) {
      if (n <= 0) return; s.damage += n; this.emit('damage', { pi: p.i, slot: s.uid, n, weak: !!weak });
      this.say(`${top(s).name}に${n}ダメージ${weak ? '（弱点）' : ''}。`);
    }
    async checkKOs() {
      for (const p of this.players) {
        for (const s of [...this.allSlots(p)]) {
          if (this.hpLeft(s) > 0) continue;
          this.say(`${top(s).name}は退場した。`); this.emit('ko', { pi: p.i, slot: s.uid });
          p.discard.push(...s.stack, ...s.energy); if (s.tool) p.discard.push(s.tool);
          if (s === p.active) p.active = null; else p.bench.splice(p.bench.indexOf(s), 1);
          p.koLastTurn = true;
          const o = this.opp(p.i);
          const n = Math.min(1, o.prizes.length);
          for (let k = 0; k < n; k++) { o.hand.push(o.prizes.pop()); }
          this.say(`${o.name}はサイドを${n}枚とった（残り${o.prizes.length}）。`); this.emit('prize', { pi: o.i });
        }
      }
      for (const o of this.players) if (!o.prizes.length) return this.end(o.i, 'prizes');
      for (const p of this.players) {
        if (!p.active) {
          if (!p.bench.length) return this.end(1 - p.i, 'nobench');
          const v = await this.ask(p.i, { kind: 'target', side: 'self', bench: true, prompt: 'バトル場に出す人物を選んでください', options: p.bench.map(b => ({ label: top(b).name, value: b.uid, slot: b })) });
          const b = p.bench.find(q => q.uid === v) || p.bench[0]; p.bench.splice(p.bench.indexOf(b), 1); p.active = b; this.emit('switch', { pi: p.i });
        }
      }
    }
    end(w, why) {
      if (this.winner != null) return true;
      this.winner = w; const msg = { prizes: 'サイドをすべてとった', nobench: '相手の場に人物がいなくなった', deckout: '相手の山札がなくなった', concede: '相手が降参した' }[why];
      this.say(`${this.P(w).name}の勝ち！（${msg}）`); this.emit('gameOver', { winner: w, why }); return true;
    }
    async endTurn() {
      if (this.winner != null) return true;
      const p = this.P(this.cur);
      const st = this.stadiumFx(); if (st && st[0] === 'heal' && p.active && p.active.damage) { p.active.damage = Math.max(0, p.active.damage - +st[1]); this.emit('heal', { pi: p.i, slot: p.active.uid }); }
      // checkup
      for (const q of this.players) {
        const s = q.active; if (!s) continue;
        if (s.status.poison) { this.say(`${top(s).name}はどくで10ダメージ。`); await this.applyDamage(q, s, 10, false); }
        if (s.status.burn) { this.say(`${top(s).name}はやけどで20ダメージ。`); await this.applyDamage(q, s, 20, false); if (this.flip()) { delete s.status.burn; this.say('やけどが治った。'); } }
        if (s.status.sleep) { if (this.flip()) { delete s.status.sleep; this.say(`${top(s).name}は目を覚ました。`); } }
        if (s.status.para && q.i === this.cur && s.status.para < this.turn) { delete s.status.para; }
        if (s.status.para && q.i === this.cur && s.status.para !== this.turn) delete s.status.para;
      }
      for (const q of this.players) for (const s of this.allSlots(q)) if (s.guard && s.guardTurn <= this.turn) { s.guard = 0; }
      const o = this.opp(this.cur); o.koLastTurn = o.koLastTurn && false;
      await this.checkKOs(); if (this.winner != null) return true;
      this.cur = 1 - this.cur; this.emit('turnEnd', {});
      await this.startTurn();
      return true;
    }
    concede(pi) { this.end(1 - pi, 'concede'); }
  }

  window.HE = { Game, CARDS, C, top, TYPES, TYPE_JA, STATUS_JA, KIND_JA, attackText, trainerText, fxList, isBasic, isEnergy, isTrainer, shuffle };
})();
