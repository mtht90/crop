// エンジンからの通知を 3D 演出・UI・音に変換する View と、あなたの操作を受け付ける Controller。
import { CARDS, GROUPS, HEROES, LEVEL_NAMES, PLAYER_COLORS, TILES } from './data/defs.ts';
import { audio, type Sfx } from './audio.ts';
import type { BannerKind, Controller, Game, Question, TilePurpose, View } from './game/engine.ts';
import { N_TILES } from './game/engine.ts';
import type { CardId, Player } from './game/types.ts';
import type { World } from './render/world.ts';
import { icon } from './ui/icons.ts';
import { cardHtml, esc, sleep, type UI } from './ui/ui.ts';

export class GameView implements View {
  g!: Game;
  world: World;
  ui: UI;
  humanId: number;
  active = 0;
  cpuSpeed = 1;
  private finaleStarted = false;

  constructor(world: World, ui: UI, humanId: number) {
    this.world = world;
    this.ui = ui;
    this.humanId = humanId;
  }
  /** 今の手番が CPU なら早送りの倍率を使う */
  private get sp() {
    const p = this.g?.s.players[this.active];
    return p && !p.human ? this.cpuSpeed : 1;
  }
  private applySpeed() {
    this.world.speed = this.sp;
    this.ui.speed = this.sp;
  }
  private wait(ms: number) {
    return sleep(ms / this.sp);
  }
  private name(p: Player) {
    return `<b style="color:${PLAYER_COLORS[p.id]}">${esc(p.name)}</b>`;
  }

  async turnStart(p: Player) {
    this.active = p.id;
    this.applySpeed();
    this.world.setZoom(innerWidth < innerHeight ? 0.5 : 0.62);
    this.world.focusOn(this.world.pathPos[p.pos]);
    this.sync();
    if (p.human) {
      audio.play('select');
      await this.ui.banner('あなたの番', p.jail > 0 ? '地下牢から脱出しよう' : '', 'turn me', 900);
    } else {
      await this.wait(350);
    }
  }

  async dice(_p: Player, values: number[]) {
    audio.play('dice_roll', { rate: this.sp > 1 ? 1.25 : 1 });
    this.world.focusOn(this.world.arena);
    await this.world.rollDice(values);
    const sum = values.reduce((a, b) => a + b, 0);
    const c = this.world.toScreen(this.world.arenaWorld);
    this.ui.float(c.x, c.y - 40, values.length > 1 ? `${sum}` : `${values[0]}`, 'dice-sum');
    await this.wait(450);
    this.world.clearDice();
  }

  async move(p: Player, path: number[]) {
    let k = 0;
    await this.world.movePiece(p.id, path, () => audio.play(`step${k++ % 3}` as Sfx, { volume: 0.5 }));
    this.world.focusOn(this.world.pathPos[path[path.length - 1]]);
    // スタート通過の演出
    if (path.includes(0)) audio.play('bonus', { volume: 0.5 });
  }

  async warp(p: Player, to: number) {
    audio.play('spell2');
    await this.world.warpPiece(p.id, to);
  }

  async cash(from: Player | null, to: Player | null, amount: number, reason: string) {
    if (amount <= 0) return;
    const jackpotTile = TILES.findIndex((t) => t.kind === 'jackpot');
    const a = from ? this.world.pieceWorld(from.id) : reason === 'ジャックポット' ? this.world.treasureWorld : this.world.centerWorld;
    const b = to ? this.world.pieceWorld(to.id) : /税|泉|保釈|盗賊/.test(reason) ? this.world.treasureWorld : this.world.centerWorld;
    void jackpotTile;
    const n = Math.min(14, 2 + Math.floor(amount / 60));
    const big = amount >= 500;
    audio.play(big ? 'coins_pour' : amount >= 150 ? 'coins_several' : 'coin1', { volume: 0.8 });
    if (from && !to && reason !== '建設' && reason !== '土地購入' && reason !== '酒場の賭け') this.world.playAnim(from.id, 'Hit_A', true);
    if (from && to) this.world.playAnim(from.id, 'Hit_B', true);
    const fly = this.world.coins(a, b, n);
    if (from) {
      const s = this.world.toScreen(this.world.pieceWorld(from.id));
      this.ui.float(s.x, s.y, `-${amount.toLocaleString()}G`, 'loss');
    }
    if (to) {
      const s = this.world.toScreen(this.world.pieceWorld(to.id));
      setTimeout(() => this.ui.float(s.x, s.y, `+${amount.toLocaleString()}G`, big ? 'gain big' : 'gain'), 500 / this.sp);
    }
    this.ui.log(`${from ? this.name(from) : '王国'} → ${to ? this.name(to) : reason.includes('税') || reason.includes('保釈') ? '黄金の泉' : '王国'}：${amount.toLocaleString()}G（${reason}）`);
    if (big && to && from) this.world.shakeCamera(0.25);
    await fly;
    if (to) audio.play('coin2', { volume: 0.6 });
    this.sync();
  }

  async tile(i: number, reason: string, by?: Player) {
    const t = this.g.s.tiles[i];
    if (reason === 'buy') audio.play('buy');
    else if (reason === 'build') audio.play('build');
    else if (reason === 'takeover') audio.play('thief');
    else if (reason === 'quake') {
      audio.play('trap');
      this.world.shakeCamera(0.5);
    } else if (reason === 'dragon' || reason === 'raid') {
      audio.play('dragon');
      await this.world.dragonStrike(i);
    } else if (reason === 'festival') audio.play('bonus');
    else if (reason === 'sold') audio.play('slide');
    await this.world.setTile(i, t, true);
    this.updateLabel(i);
    if (reason === 'build' && by) this.ui.log(`${this.name(by)} が ${TILES[i].name} に${LEVEL_NAMES[t.level]}を建てた`);
    await this.wait(reason === 'build' || reason === 'buy' ? 380 : 250);
    this.sync();
  }

  async banner(kind: BannerKind, text: string, sub?: string, p?: Player) {
    const sfx: Partial<Record<BannerKind, Sfx>> = {
      monopoly: 'monopoly', 'unify-warn': 'trap', unify: 'fanfare', jackpot: 'coin_echo', final: 'fanfare', bankrupt: 'lose',
      landmark: 'fanfare', takeover: 'thief', 'event-good': 'bonus', 'event-bad': 'trap', event: 'dragon', dungeon: 'trap',
      doubles: 'levelup', win: 'win',
    };
    if (sfx[kind]) audio.play(sfx[kind]!);
    if (kind === 'jackpot') audio.play('coins_pour', { delay: 0.3 });
    if (kind === 'monopoly' || kind === 'jackpot' || kind === 'unify' || kind === 'landmark' || kind === 'win') this.world.confetti();
    if (kind === 'event' || kind === 'bankrupt') this.world.shakeCamera(0.6);
    if (kind === 'final' && !this.finaleStarted) {
      this.finaleStarted = true;
      audio.playBgm('finale');
    }
    if (p && (kind === 'monopoly' || kind === 'jackpot' || kind === 'landmark' || kind === 'event-good' || kind === 'unify')) this.world.playAnim(p.id, 'Jump_Full_Long', true);
    if (p && kind === 'bankrupt') this.world.playAnim(p.id, 'Death_A', true);
    if (kind === 'round') {
      this.ui.log(`── ${text} ──`);
      return;
    }
    const who = p ? `<span class="banner-who" style="--pc:${PLAYER_COLORS[p.id]}">${icon(HEROES[p.hero].icon)}${esc(p.name)}</span>` : '';
    const long = kind === 'win' || kind === 'unify' || kind === 'final' || kind === 'jackpot' || kind === 'monopoly';
    this.ui.log(`${p ? this.name(p) + '：' : ''}${text}${sub ? `（${sub}）` : ''}`);
    await this.ui.banner(`${who}${text}`, sub ?? '', `k-${kind}`, long ? 2000 : 1300);
    if (p && kind === 'bankrupt') this.world.setPieceVisible(p.id, false);
  }

  async cardGained(p: Player, card: CardId) {
    const c = CARDS[card];
    audio.play(c.rarity === 'epic' ? 'epic' : 'card');
    if (p.human) {
      await this.ui.banner(`<div class="card-reveal">${cardHtml(card)}</div>`, `${c.name} を手に入れた`, 'k-card', 1500);
    } else {
      this.ui.log(`${this.name(p)} はカードを1枚手に入れた`);
      await this.wait(250);
    }
  }

  async cardUsed(p: Player, card: CardId, target?: number) {
    const c = CARDS[card];
    audio.play(`spell${Math.floor(Math.random() * 5)}` as Sfx);
    this.world.playAnim(p.id, 'Use_Item', true);
    this.ui.log(`${this.name(p)} が「${c.name}」を使った${target !== undefined && c.target !== 'none' && c.target !== 'number' ? `（${TILES[target].name}）` : ''}`);
    if (target !== undefined && (c.target === 'enemyTile' || c.target === 'ownTile')) this.world.focusOn(this.world.plotPos[target]);
    await this.ui.banner(`<div class="card-reveal">${cardHtml(card)}</div>`, `${esc(p.name)} が使った`, 'k-card', 1400);
  }

  log(msg: string) {
    this.ui.log(msg);
  }

  sync() {
    if (!this.g) return;
    this.ui.renderHud(this.g, this.humanId, this.active);
    // 王城は首位の色、財宝は黄金の泉の額
    const rank = this.g.ranking();
    const lead = rank[0];
    const tie = rank.length > 1 && this.g.assets(rank[1]) === this.g.assets(lead);
    void this.world.setLeader(tie ? null : lead.id);
    void this.world.setTreasure(this.g.s.jackpot);
    for (let i = 0; i < N_TILES; i++) this.updateLabel(i);
  }

  /** マスの印字を今の状態に合わせる */
  updateLabel(i: number) {
    const def = TILES[i];
    const t = this.g.s.tiles[i];
    if (def.kind !== 'prop') {
      const SPECIAL: Record<string, { bg: string; fg: string; name: string }> = {
        start: { bg: '#f5b82e', fg: '#2b2640', name: 'スタート' },
        shrine: { bg: '#5aa9e6', fg: '#fff', name: 'カード' },
        event: { bg: '#b98ce8', fg: '#fff', name: '運命の巻物' },
        tax: { bg: '#5a4a5f', fg: '#ffd7a8', name: '竜の関所' },
        dungeon: { bg: '#6b6f7a', fg: '#fff', name: '地下牢' },
        jackpot: { bg: '#ffd35c', fg: '#7a4b00', name: '黄金の泉' },
        portal: { bg: '#3b3b8f', fg: '#c9b8ff', name: 'ワープ' },
        tavern: { bg: '#c9773b', fg: '#fff', name: '酒場' },
        cathedral: { bg: '#ffffff', fg: '#3b8eea', name: '大聖堂' },
      };
      const sp = SPECIAL[def.kind];
      const main = def.kind === 'jackpot' ? `${this.g.s.jackpot.toLocaleString()}G` : def.kind === 'start' ? `+${this.g.stage.salary}G` : def.kind === 'tax' ? '10%' : '';
      this.world.printTile(i, { kind: def.kind, name: sp.name, icon: def.icon, bg: sp.bg, fg: sp.fg, main });
      return;
    }
    const grp = GROUPS[def.group!];
    if (t.owner === null) {
      this.world.printTile(i, { kind: 'prop', name: def.name, icon: def.icon, bg: '#fffaf0', band: grp.color, main: `${this.g.price(i)}G` });
      return;
    }
    const oc = PLAYER_COLORS[t.owner];
    this.world.printTile(i, {
      kind: 'prop', name: def.name, icon: def.icon, band: grp.color, bg: '#ffffff', owner: oc, main: `${this.g.toll(i).toLocaleString()}G`,
      level: t.level, mono: this.g.ownsGroup(t.owner, def.group!), festival: t.festival > 0, dragon: t.dragon > 0,
    });
  }
}

/** あなたの操作 */
export class HumanController implements Controller {
  ui: UI;
  world: World;
  private rolled = false;
  constructor(ui: UI, world: World) {
    this.ui = ui;
    this.world = world;
  }

  async waitRoll(_g: Game, _p: Player) {
    if (this.rolled) {
      this.rolled = false;
      return;
    }
    await this.ui.waitRollButton();
  }

  async pickCard(g: Game, p: Player): Promise<{ card: CardId; target?: number } | null> {
    for (;;) {
      const r = await this.ui.turnActions(g, p, true);
      if (r.type === 'roll') {
        this.rolled = true;
        return null;
      }
      const c = CARDS[r.card];
      if (c.target === 'none') return { card: r.card };
      if (c.target === 'number') {
        const n = await this.ui.dialog<number | null>({
          title: '精密ダイス',
          icon: c.icon,
          body: '<p>出目の合計を選んでください。止まるマスが下に出ます。</p>' +
            `<div class="num-grid">${Array.from({ length: 11 }, (_, k) => k + 2)
              .map((n) => {
                const i = (p.pos + n) % N_TILES;
                return `<div class="num-hint"><b>${n}</b><small>${TILES[i].name}</small></div>`;
              })
              .join('')}</div>`,
          buttons: [{ label: 'やめる', value: null }, ...Array.from({ length: 11 }, (_, k) => ({ label: String(k + 2), value: k + 2, kind: 'primary' as const }))],
          className: 'numbers',
        });
        if (n === null) continue;
        this.rolled = true;
        return { card: r.card, target: n };
      }
      const purpose: TilePurpose = c.target === 'ownTile' ? 'festival' : c.target === 'anyTile' ? 'teleport' : (r.card as TilePurpose);
      const target = await this.selectTile(g, p, purpose, g.cardTargets(p, r.card), true);
      if (target === null) continue;
      return { card: r.card, target };
    }
  }

  private selectTile(_g: Game, _p: Player, purpose: TilePurpose, options: number[], allowCancel: boolean): Promise<number | null> {
    const text: Record<TilePurpose, string> = {
      portal: 'ワープ先のマスを選んでください',
      teleport: '移動先のマスを選んでください',
      festival: '収穫祭を開く自分の土地を選んでください',
      quake: '地震を起こす相手の土地を選んでください',
      dragon: '竜を放つ相手の土地を選んでください',
      edict: '買い取る相手の土地を選んでください',
      'royal-build': '王都の恵み：建設する土地を選んでください',
    };
    return new Promise((resolve) => {
      this.world.setSelectable(options);
      const prevClick = this.world.onTileClick;
      const labels = this.world.labels;
      const onLabel = (e: Event) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.tile-label.selectable');
        if (el) finish(Number(el.dataset.tile));
      };
      const finish = (v: number | null) => {
        this.world.setSelectable(null);
        this.world.onTileClick = prevClick;
        labels.removeEventListener('click', onLabel);
        this.ui.clearAction();
        resolve(v);
      };
      this.world.onTileClick = (i) => {
        if (options.includes(i)) finish(i);
        else prevClick?.(i);
      };
      labels.addEventListener('click', onLabel);
      this.ui.selectBar(text[purpose], allowCancel, () => finish(null));
    });
  }

  async confirm(g: Game, p: Player, q: Question): Promise<boolean> {
    const def = TILES[q.tile];
    const grp = def.group !== undefined ? GROUPS[def.group] : null;
    const after = (cost: number) => `<div class="cost-line"><span>所持金</span><b>${p.cash.toLocaleString()}G → ${(p.cash - cost).toLocaleString()}G</b></div>`;
    switch (q.kind) {
      case 'buy': {
        const others = g.groupTiles(def.group!).filter((k) => k !== q.tile);
        const mine = others.filter((k) => g.s.tiles[k].owner === p.id).length;
        const hint = mine === 2 ? '<p class="hint good">買うと領地制覇！通行料が2倍になる</p>' : mine === 1 ? '<p class="hint">同じ色をもう1つ持っている</p>' : '';
        return this.ui.dialog({
          title: `${def.name} を買いますか？`,
          icon: def.icon,
          color: grp!.color,
          body: `<p class="grp-name">${grp!.name}</p>${hint}<div class="cost-line"><span>価格</span><b>${q.cost}G</b></div><div class="cost-line"><span>止まった相手から</span><b>${Math.round(g.price(q.tile) * 0.25)}G〜</b></div>${after(q.cost)}`,
          buttons: [
            { label: '買わない', value: false },
            { label: '買う', value: true, kind: 'primary' },
          ],
        });
      }
      case 'build': {
        const t = g.s.tiles[q.tile];
        const cur = g.toll(q.tile);
        t.level++;
        const next = g.toll(q.tile);
        t.level--;
        return this.ui.dialog({
          title: `${LEVEL_NAMES[q.level]}を建てますか？`,
          icon: q.level >= 4 ? 'castle' : 'hammer-drop',
          color: grp!.color,
          body: `<p class="grp-name">${def.name}</p><div class="cost-line"><span>建設費</span><b>${q.cost}G</b></div><div class="cost-line up"><span>通行料</span><b>${cur}G → ${next}G</b></div>${after(q.cost)}${q.level >= 4 ? '<p class="hint good">王国の象徴は誰にも奪われない</p>' : ''}`,
          buttons: [
            { label: '建てない', value: false },
            { label: '建てる', value: true, kind: 'primary' },
          ],
        });
      }
      case 'takeover': {
        const owner = g.s.players[g.s.tiles[q.tile].owner!];
        const completes = g.groupTiles(def.group!).every((k) => k === q.tile || g.s.tiles[k].owner === p.id);
        return this.ui.dialog({
          title: `${def.name} を買収しますか？`,
          icon: 'gavel',
          color: PLAYER_COLORS[owner.id],
          body: `<p class="grp-name">持ち主：${esc(owner.name)}・${LEVEL_NAMES[g.s.tiles[q.tile].level]}</p>${completes ? '<p class="hint good">奪えば領地制覇！</p>' : ''}<div class="cost-line"><span>買収額</span><b>${q.cost.toLocaleString()}G</b></div><div class="cost-line"><span>今の通行料</span><b>${g.toll(q.tile).toLocaleString()}G</b></div>${after(q.cost)}`,
          buttons: [
            { label: 'やめる', value: false },
            { label: '買収する', value: true, kind: 'danger' },
          ],
        });
      }
      case 'shield':
        return this.ui.dialog({
          title: '鉄壁の盾を使いますか？',
          icon: 'magic-shield',
          body: `<p>${def.name} の通行料 <b>${q.toll.toLocaleString()}G</b> を0にできます。</p>`,
          buttons: [
            { label: '払う', value: false },
            { label: '盾を使う', value: true, kind: 'primary' },
          ],
        });
    }
  }

  async chooseTile(g: Game, p: Player, purpose: TilePurpose, options: number[]): Promise<number> {
    if (purpose === 'royal-build') {
      const pick = await this.selectTile(g, p, purpose, options, true);
      return pick ?? -1;
    }
    const pick = await this.selectTile(g, p, purpose, options, false);
    return pick ?? options[0];
  }

  async dungeon(g: Game, p: Player): Promise<'pay' | 'roll'> {
    const fee = Math.round((50 * g.stage.tollMul) / 5) * 5;
    return this.ui.dialog({
      title: '地下牢',
      icon: 'prisoner',
      body: `<p>保釈金 ${fee}G を払ってすぐに出るか、ゾロ目に賭けるか。あと${p.jail}回失敗すると釈放されます。</p>`,
      buttons: [
        { label: 'ゾロ目に賭ける', value: 'roll' },
        { label: `${fee}G 払う`, value: 'pay', kind: 'primary' },
      ],
    });
  }

  async tavern(_g: Game, p: Player): Promise<number> {
    return this.ui.dialog({
      title: '酒場の賭け',
      icon: 'beer-stein',
      body: '<p>サイコロ1個で勝負！ 4〜5なら2倍、6なら3倍。1〜3は没収。</p>',
      buttons: [
        { label: '賭けない', value: 0 },
        { label: '50G 賭ける', value: 50, kind: 'primary', disabled: p.cash < 50 },
        { label: '150G 賭ける', value: 150, kind: 'gold', disabled: p.cash < 150 },
      ],
    });
  }

  async discard(_g: Game, p: Player, incoming: CardId): Promise<number> {
    const all = [...p.hand, incoming];
    return this.ui.dialog({
      title: '手札がいっぱい',
      icon: 'card-random',
      body: `<p>捨てるカードを1枚選んでください。</p><div class="discard-row">${all.map((c, i) => `<div>${cardHtml(c, { small: true })}${i === all.length - 1 ? '<small class="new">NEW</small>' : ''}</div>`).join('')}</div>`,
      buttons: all.map((c, i) => ({ label: `${CARDS[c].name}を捨てる`, value: i })),
      className: 'discard',
    });
  }
}
