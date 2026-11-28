// エンジンからの通知を 3D 演出・UI・音に変換する View と、あなたの操作を受け付ける Controller（v2）。
import { GROUPS, HEROES, LEVEL_NAMES, PLAYER_COLORS, TILES, baseId, card, upRef } from './data/defs.ts';
import { audio, type Sfx } from './audio.ts';
import type { Action, BannerKind, Controller, Game, Question, ShopPick, TilePurpose, UpgradeOffer, View } from './game/engine.ts';
import { N_TILES } from './game/engine.ts';
import type { CardId, CardRef, Player } from './game/types.ts';
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
      await this.ui.banner('あなたの番', p.jail > 0 ? '地下牢にいるので移動できない' : '', 'turn me', 800);
    } else await this.wait(300);
  }

  async draw(p: Player, cards: CardRef[]) {
    if (p.human) {
      audio.play('card');
      this.ui.dealCards(cards);
      await sleep(120);
    } else this.ui.log(`${this.name(p)} はカードを${cards.length}枚引いた`);
  }

  async discardHand(p: Player, cards: CardRef[]) {
    if (p.human) await this.ui.tossHand(cards.length);
  }

  async dice(_p: Player, values: number[]) {
    audio.play('dice_roll', { rate: this.sp > 1 ? 1.25 : 1 });
    this.world.focusOn(this.world.arena);
    await this.world.rollDice(values);
    const sum = values.reduce((a, b) => a + b, 0);
    const c = this.world.toScreen(this.world.arenaWorld);
    this.ui.float(c.x, c.y - 40, `${sum}`, 'dice-sum');
    await this.wait(450);
    this.world.clearDice();
  }

  async move(p: Player, path: number[]) {
    let k = 0;
    await this.world.movePiece(p.id, path, () => audio.play(`step${k++ % 3}` as Sfx, { volume: 0.5 }));
    this.world.focusOn(this.world.pathPos[path[path.length - 1]]);
    if (path.includes(0)) audio.play('bonus', { volume: 0.5 });
  }

  async warp(p: Player, to: number) {
    audio.play('spell2');
    await this.world.warpPiece(p.id, to);
  }

  async cash(from: Player | null, to: Player | null, amount: number, reason: string) {
    if (amount <= 0) return;
    const toBank = /税|泉|保釈|盗賊/.test(reason) && !to;
    const a = from ? this.world.pieceWorld(from.id) : reason === 'ジャックポット' ? this.world.treasureWorld : this.world.centerWorld;
    const b = to ? this.world.pieceWorld(to.id) : toBank ? this.world.treasureWorld : this.world.centerWorld;
    const big = amount >= 300;
    audio.play(big ? 'coins_pour' : amount >= 100 ? 'coins_several' : 'coin1', { volume: 0.8 });
    if (from && to) this.world.playAnim(from.id, 'Hit_B', true);
    const fly = this.world.coins(a, b, Math.min(12, 2 + Math.floor(amount / 40)));
    if (from) {
      const s = this.world.toScreen(this.world.pieceWorld(from.id));
      this.ui.float(s.x, s.y, `-${amount.toLocaleString()}G`, 'loss');
    }
    if (to) {
      const s = this.world.toScreen(this.world.pieceWorld(to.id));
      setTimeout(() => this.ui.float(s.x, s.y, `+${amount.toLocaleString()}G`, big ? 'gain big' : 'gain'), 450 / this.sp);
    }
    this.ui.log(`${from ? this.name(from) : '王国'} → ${to ? this.name(to) : toBank ? '黄金の泉' : '王国'}：${amount.toLocaleString()}G（${reason}）`);
    await fly;
    if (to) audio.play('coin2', { volume: 0.6 });
    this.sync();
  }

  async tile(i: number, reason: string, by?: Player) {
    const t = this.g.s.tiles[i];
    const sfx: Record<string, Sfx> = { claim: 'buy', build: 'build', steal: 'thief', guard: 'spell1', trap: 'spell3', 'trap-sprung': 'trap', quake: 'trap', sold: 'slide' };
    if (sfx[reason]) audio.play(sfx[reason]);
    if (reason === 'quake') this.world.shakeCamera(0.5);
    if (reason === 'dragon' || reason === 'raid') {
      audio.play('dragon');
      await this.world.dragonStrike(i);
    }
    await this.world.setTile(i, t, true);
    this.updateLabel(i);
    if (by && reason === 'claim') this.ui.log(`${this.name(by)} が ${TILES[i].name} に旗を立てた`);
    if (by && reason === 'build') this.ui.log(`${this.name(by)} が ${TILES[i].name} を${LEVEL_NAMES[t.level]}にした`);
    if (by && reason === 'trap' && !by.human) this.ui.log(`${this.name(by)} がどこかに罠を仕掛けた`);
    await this.wait(reason === 'claim' || reason === 'build' ? 380 : 220);
    this.sync();
  }

  async banner(kind: BannerKind, text: string, sub?: string, p?: Player) {
    const sfx: Partial<Record<BannerKind, Sfx>> = {
      claim: 'buy', steal: 'thief', lost: 'trap', set: 'monopoly', 'conquest-warn': 'trap', conquest: 'fanfare', jackpot: 'coin_echo', final: 'fanfare',
      fort: 'fanfare', 'event-good': 'bonus', 'event-bad': 'trap', event: 'dragon', dungeon: 'trap', trap: 'trap', win: 'win',
    };
    if (sfx[kind]) audio.play(sfx[kind]!);
    if (kind === 'jackpot') audio.play('coins_pour', { delay: 0.3 });
    if (kind === 'set' || kind === 'jackpot' || kind === 'conquest' || kind === 'fort' || kind === 'win' || kind === 'steal') this.world.confetti();
    if (kind === 'event' || kind === 'trap') this.world.shakeCamera(0.6);
    if (kind === 'final' && !this.finaleStarted) {
      this.finaleStarted = true;
      audio.playBgm('finale');
    }
    if (p && (kind === 'set' || kind === 'jackpot' || kind === 'fort' || kind === 'event-good' || kind === 'steal' || kind === 'conquest')) this.world.playAnim(p.id, 'Jump_Full_Long', true);
    if (p && kind === 'trap') this.world.playAnim(p.id, 'Hit_A', true);
    if (kind === 'round') {
      this.ui.log(`── ${text} ──`);
      return;
    }
    const who = p ? `<span class="banner-who" style="--pc:${PLAYER_COLORS[p.id]}">${icon(HEROES[p.hero].icon)}${esc(p.name)}</span>` : '';
    const long = kind === 'win' || kind === 'conquest' || kind === 'final' || kind === 'jackpot' || kind === 'set';
    this.ui.log(`${p ? this.name(p) + '：' : ''}${text}${sub ? `（${sub}）` : ''}`);
    await this.ui.banner(`${who}${text}`, sub ?? '', `k-${kind}`, long ? 1900 : 1200);
  }

  async cardGained(p: Player, ref: CardRef, upgraded = false) {
    const c = card(ref);
    audio.play(upgraded ? 'spell1' : c.rarity === 'epic' ? 'epic' : 'card');
    if (p.human) {
      if (upgraded) await this.ui.banner(`<div class="card-reveal">${cardHtml(ref)}</div>`, `「${card(baseId(ref)).name}」を強化した！`, 'k-card', 1500);
      else await this.ui.banner(`<div class="card-reveal">${cardHtml(ref)}</div>`, `${c.name} がデッキに加わった`, 'k-card', 1300);
    } else {
      this.ui.log(upgraded ? `${this.name(p)} が「${card(baseId(ref)).name}」を強化した` : `${this.name(p)} が「${c.name}」を手に入れた`);
      await this.wait(200);
    }
  }

  async cardUsed(p: Player, ref: CardRef, target?: number) {
    const c = card(ref);
    const cardId = c.id;
    audio.play(c.move ? 'slide' : (`spell${Math.floor(Math.random() * 5)}` as Sfx));
    this.world.playAnim(p.id, c.move ? 'Interact' : 'Use_Item', true);
    // 罠の場所は相手には見せない
    const where = target !== undefined && cardId !== 'trap' && c.target !== 'steps' && c.target !== 'none' ? `（${TILES[target].name}）` : '';
    this.ui.log(`${this.name(p)} が「${c.name}」を使った${where}${c.exhaust ? '（消耗）' : ''}`);
    if (target !== undefined && cardId !== 'trap' && (c.target === 'enemyTile' || c.target === 'ownTile' || c.target === 'emptyTile')) this.world.focusOn(this.world.plotPos[target]);
    if (p.human) {
      this.sync();
      return;
    }
    await this.ui.banner(`<div class="card-reveal">${cardHtml(ref)}</div>`, `${esc(p.name)} が使った`, 'k-card', c.move ? 700 : 1100);
  }

  log(msg: string) {
    this.ui.log(msg);
  }

  sync() {
    if (!this.g) return;
    this.ui.renderHud(this.g, this.humanId, this.active);
    const rank = this.g.ranking();
    const lead = rank[0];
    const tie = rank.length > 1 && this.g.score(rank[1]) === this.g.score(lead);
    void this.world.setLeader(tie || this.g.territories(lead).length === 0 ? null : lead.id);
    void this.world.setTreasure(this.g.s.jackpot);
    for (let i = 0; i < N_TILES; i++) this.updateLabel(i);
  }

  /** マスの印字を今の状態に合わせる */
  updateLabel(i: number) {
    const def = TILES[i];
    const t = this.g.s.tiles[i];
    const myTrap = t.trap !== null && t.trap === this.humanId;
    if (def.kind !== 'prop') {
      const SPECIAL: Record<string, { bg: string; fg: string; name: string }> = {
        start: { bg: '#f5b82e', fg: '#2b2640', name: 'スタート' },
        shrine: { bg: '#5aa9e6', fg: '#fff', name: 'カード屋' },
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
      this.world.printTile(i, { kind: def.kind, name: sp.name, icon: def.icon, bg: sp.bg, fg: sp.fg, main, trap: myTrap });
      return;
    }
    const grp = GROUPS[def.group!];
    if (t.owner === null) {
      this.world.printTile(i, { kind: 'prop', name: def.name, icon: def.icon, bg: '#fffaf0', band: grp.color, main: `${this.g.price(i)}G`, trap: myTrap });
      return;
    }
    this.world.printTile(i, {
      kind: 'prop', name: def.name, icon: def.icon, band: grp.color, bg: '#ffffff', owner: PLAYER_COLORS[t.owner],
      main: `奪${this.g.stealCost(i, this.g.s.players[this.humanId] ?? this.g.s.players[0]).toLocaleString()}`,
      level: t.level, set: this.g.ownsGroup(t.owner, def.group!), guard: t.guard > 0, trap: myTrap,
    });
  }
}

/** あなたの操作 */
export class HumanController implements Controller {
  ui: UI;
  world: World;
  constructor(ui: UI, world: World) {
    this.ui = ui;
    this.world = world;
  }

  async turn(g: Game, p: Player): Promise<Action> {
    const board = {
      pick: (x: number, y: number) => this.world.tileAt(x, y),
      highlight: (t: number[] | null) => {
        this.world.setSelectable(t);
        if (t) this.world.frameTiles(t);
      },
      hover: (t: number | null) => this.world.hoverTile(t),
    };
    for (;;) {
      const r = await this.ui.handPhase(g, p, board);
      if (r === 'end') return { type: 'end' };
      const ref = p.hand[r.index];
      const c = card(ref);
      if (c.target === 'none' || c.target === 'steps') return { type: 'play', index: r.index };
      if (r.target !== undefined) return { type: 'play', index: r.index, target: r.target };
      const target = await this.selectTile(g.cardTargets(p, ref), this.targetText(c.id), true);
      if (target === null) continue;
      return { type: 'play', index: r.index, target };
    }
  }

  private targetText(card: CardId) {
    const t: Partial<Record<CardId, string>> = {
      teleport: '移動先のマスを選んでください',
      banner: '旗を立てる空き地を選んでください',
      march: '奪う相手の陣を選んでください',
      edict: '奪う相手の陣を選んでください',
      fortify: '砦を築く自分の陣を選んでください',
      guard: '結界で守る自分の陣を選んでください',
      trap: '罠を仕掛けるマスを選んでください',
      quake: '地震を起こす相手の陣を選んでください',
      dragon: '竜を放つ相手の陣を選んでください',
    };
    return t[card] ?? 'マスを選んでください';
  }

  private selectTile(options: number[], text: string, allowCancel: boolean): Promise<number | null> {
    return new Promise((resolve) => {
      this.world.setSelectable(options);
      const prevClick = this.world.onTileClick;
      const finish = (v: number | null) => {
        this.world.setSelectable(null);
        this.world.onTileClick = prevClick;
        this.ui.clearAction();
        resolve(v);
      };
      this.world.onTileClick = (i) => {
        if (options.includes(i)) finish(i);
        else prevClick?.(i);
      };
      this.world.frameTiles(options);
      this.ui.selectBar(text, allowCancel, () => finish(null));
    });
  }

  async confirm(g: Game, p: Player, q: Question): Promise<boolean> {
    const def = TILES[q.tile];
    const grp = GROUPS[def.group!];
    const after = `<div class="cost-line"><span>所持金</span><b>${p.cash.toLocaleString()}G → ${(p.cash - q.cost).toLocaleString()}G</b></div>`;
    const setHint = (() => {
      const others = g.groupTiles(def.group!).filter((k) => k !== q.tile);
      return others.every((k) => g.s.tiles[k].owner === p.id) ? `<p class="hint good">${grp.name}を統一できる！（税収2倍）</p>` : '';
    })();
    switch (q.kind) {
      case 'claim':
        return this.ui.dialog({
          title: `${def.name} に旗を立てる？`,
          icon: 'tower-flag',
          color: grp.color,
          body: `<p class="grp-name">${grp.name}</p>${setHint}<div class="cost-line"><span>値段</span><b>${q.cost}G</b></div><div class="cost-line"><span>毎ターンの税収</span><b>+${Math.round((g.price(q.tile) * 0.07) / 5) * 5}G〜</b></div>${after}`,
          buttons: [
            { label: '見送る', value: false },
            { label: '旗を立てる', value: true, kind: 'primary' },
          ],
        });
      case 'fortify':
        return this.ui.dialog({
          title: `${LEVEL_NAMES[q.level]}を築く？`,
          icon: 'hammer-drop',
          color: grp.color,
          body: `<p class="grp-name">${def.name}</p><p>砦が強いほど奪われにくく、税収も増える。</p><div class="cost-line"><span>築城費</span><b>${q.cost}G</b></div>${after}`,
          buttons: [
            { label: '築かない', value: false },
            { label: '築く', value: true, kind: 'primary' },
          ],
        });
      case 'steal': {
        const owner = g.s.players[g.s.tiles[q.tile].owner!];
        return this.ui.dialog({
          title: `${def.name} を奪う？`,
          icon: 'gavel',
          color: PLAYER_COLORS[owner.id],
          body: `<p class="grp-name">持ち主：${esc(owner.name)}・${LEVEL_NAMES[g.s.tiles[q.tile].level]}</p>${setHint}<div class="cost-line"><span>奪う値段</span><b>${q.cost.toLocaleString()}G</b></div><p class="note">奪うと砦は1段階崩れる。</p>${after}`,
          buttons: [
            { label: 'やめる', value: false },
            { label: '奪う', value: true, kind: 'danger' },
          ],
        });
      }
    }
  }

  async steps(_g: Game, p: Player, options: number[], reason: string): Promise<number> {
    const title = reason === 'ranger' ? '出目を調整する（狩人）' : '何マス進む？';
    return this.ui.dialog({
      title,
      icon: reason === 'ranger' ? 'bow-arrow' : 'flag-objective',
      body: `<div class="num-grid">${options.map((n) => `<div class="num-hint"><b>${n > 0 ? n : n}</b><small>${TILES[(p.pos + n + N_TILES) % N_TILES].name}</small></div>`).join('')}</div>`,
      buttons: options.map((n) => ({ label: n > 0 ? `${n}マス進む` : `${-n}マス戻る`, value: n, kind: 'primary' as const })),
      className: 'numbers',
    });
  }

  async chooseTile(_g: Game, _p: Player, _purpose: TilePurpose, options: number[]): Promise<number> {
    return (await this.selectTile(options, 'ワープ先のマスを選んでください', false)) ?? options[0];
  }

  async shop(g: Game, p: Player, offers: CardId[], free: boolean, upgrades: UpgradeOffer[]): Promise<ShopPick> {
    type V = { kind: 'buy'; index: number } | { kind: 'upgrade'; card: CardId };
    const items: V[] = [...offers.map((_, index) => ({ kind: 'buy' as const, index })), ...upgrades.map((u) => ({ kind: 'upgrade' as const, card: u.card }))];
    const price = (v: V) => (v.kind === 'buy' ? (free ? 0 : g.cardPrice(offers[v.index], p)) : upgrades.find((u) => u.card === v.card)!.cost);
    const copies = (id: CardId) => g.allCards(p).filter((r) => r === id).length;
    const body = `<p>${free ? '新しいカードを1枚もらうか、デッキのカードを1種類強化できる（どちらか1つ）。' : '新しいカードを買うか、デッキのカードを強化できる（1回の来店で1つ）。'}</p>
      <div class="shop-cols">
        <div class="shop-sec"><h3>新しいカード</h3><div class="shop-row">${offers
          .map((c, i) => `<button type="button" class="shop-item" data-k="${i}" ${p.cash < price(items[i]) ? 'disabled' : ''}>${cardHtml(c, { small: true })}<small>${free ? '無料' : `${price(items[i])}G`}</small></button>`)
          .join('')}</div></div>
        ${upgrades.length ? `<div class="shop-sec shop-up"><h3>強化（デッキの1枚が + になる）</h3><div class="shop-row">${upgrades
          .map((u, j) => {
            const k = offers.length + j;
            return `<button type="button" class="shop-item" data-k="${k}" ${p.cash < u.cost ? 'disabled' : ''}><span class="up-pair">${cardHtml(u.card, { small: true })}${icon('fast-forward-button')}${cardHtml(upRef(u.card), { small: true })}</span><small>${u.cost ? `${u.cost}G` : '無料'}・デッキに${copies(u.card)}枚</small></button>`;
          })
          .join('')}</div></div>` : ''}
      </div>`;
    return new Promise((resolve) => {
      let sel = -1;
      const done = this.ui.dialog<string>({
        title: free ? '王の贈り物' : 'カード屋',
        icon: free ? 'crown' : 'swap-bag',
        body,
        buttons: [
          { label: free ? 'いらない' : '何もしない', value: 'skip' },
          { label: 'これにする', value: 'ok', kind: 'primary', disabled: true },
        ],
        className: 'discard shop',
      });
      const wrap = this.ui.dialogs.lastElementChild as HTMLElement;
      const ok = wrap.querySelector<HTMLButtonElement>('.dialog-buttons .btn.primary')!;
      wrap.querySelectorAll<HTMLButtonElement>('.shop-item').forEach((b) =>
        b.addEventListener('click', () => {
          sel = Number(b.dataset.k);
          wrap.querySelectorAll('.shop-item').forEach((x) => x.classList.toggle('sel', x === b));
          const v = items[sel];
          ok.disabled = false;
          ok.textContent = v.kind === 'buy' ? (free ? 'もらう' : `買う（${price(v)}G）`) : `強化する${price(v) ? `（${price(v)}G）` : ''}`;
          audio.play('hover', { volume: 0.5 });
        }),
      );
      void done.then((r) => resolve(r === 'ok' && sel >= 0 ? items[sel] : null));
    });
  }

  async dungeon(g: Game, p: Player): Promise<'pay' | 'roll'> {
    const fee = Math.round((50 * g.stage.tollMul) / 5) * 5;
    return this.ui.dialog({
      title: '地下牢',
      icon: 'prisoner',
      body: `<p>保釈金 ${fee}G を払ってすぐに出るか、ゾロ目に賭けるか。失敗するとこのターンは移動できない（カードは使える）。残り${p.jail}回で釈放。</p>`,
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
}
