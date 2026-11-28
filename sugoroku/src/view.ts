// 遠征（地図）の演出と、あなたの操作。エンジンからの通知を 3D・UI・音に変換する。
import { CARDS, HEROES, PLAYER_COLORS, REGIONS } from './data/defs.ts';
import { audio } from './audio.ts';
import type { Campaign, CampaignController, CampaignView, Choice, Fight, TrainPick } from './game/campaign.ts';
import type { Lord } from './game/types.ts';
import type { World } from './render/world.ts';
import { battleCardHtml } from './ui/battleUi.ts';
import { icon } from './ui/icons.ts';
import { esc, sleep, type UI } from './ui/ui.ts';

export class GameView implements CampaignView {
  c!: Campaign;
  world: World;
  ui: UI;
  humanId: number;
  active = 0;
  cpuSpeed = 1;

  constructor(world: World, ui: UI, humanId: number) {
    this.world = world;
    this.ui = ui;
    this.humanId = humanId;
  }
  private wait(ms: number) {
    return sleep(ms / this.cpuSpeed);
  }
  name(l: Lord | null) {
    return l ? `<b style="color:${PLAYER_COLORS[l.id]}">${esc(l.name)}</b>` : '魔物';
  }

  async roundStart(round: number) {
    this.sync();
    this.ui.log(`── ラウンド ${round} ──`);
    const last = round === this.c.cfg.rounds;
    if (last) audio.playBgm('finale');
    await this.ui.banner(last ? '最終ラウンド' : `ラウンド ${round}`, last ? '最後の攻防！ 領地の数で勝敗が決まる' : `/ ${this.c.cfg.rounds}`, last ? 'k-final' : 'turn', last ? 1600 : 900);
  }

  async lordTurn(l: Lord) {
    this.active = l.id;
    this.sync();
    const cap = this.c.capitalOf(l.id);
    this.world.setZoom(innerWidth < innerHeight ? 0.75 : 0.85);
    this.world.focusOn(this.world.regionPos[cap]);
    if (l.human) {
      audio.play('select');
      await this.ui.banner('あなたの番', '攻める領地を選ぼう', 'turn me', 800);
    } else await this.wait(350);
  }

  async declare(f: Fight) {
    const r = REGIONS[f.region];
    const atk = f.attacker === 'dragon' ? null : f.attacker;
    this.world.setZoom(innerWidth < innerHeight ? 0.6 : 0.7);
    this.world.focusOn(this.world.regionPos[f.region]);
    if (atk) {
      void this.world.marchPiece(atk.id, f.region);
      audio.play('step0', { volume: 0.6 });
    }
    const who = atk ? this.name(atk) : '竜';
    this.ui.log(`${who} が ${r.name}（${f.defender ? this.name(f.defender) : '魔物'}）に攻め込んだ`);
    const involved = atk?.human || f.defender?.human;
    if (!involved) {
      await this.ui.banner(`${atk ? `<span class="banner-who" style="--pc:${PLAYER_COLORS[atk.id]}">${icon(HEROES[atk.hero].icon)}${esc(atk.name)}</span>` : '竜'} が攻め込む`, `${r.name}${f.defender ? `（${esc(f.defender.name)}の領地）` : ''}`, 'k-event', 900 / this.cpuSpeed);
    }
  }

  async result(f: Fight, won: boolean) {
    const r = REGIONS[f.region];
    const atk = f.attacker === 'dragon' ? null : f.attacker;
    if (atk) void this.world.returnPiece(atk.id);
    const involved = atk?.human || f.defender?.human;
    this.ui.log(won ? `${atk ? this.name(atk) : '竜'} が ${r.name} を奪った` : `${f.defender ? this.name(f.defender) : '魔物'} が ${r.name} を守りきった`);
    if (!involved) {
      audio.play(won ? 'thief' : 'thud');
      await this.ui.banner(won ? `${r.name} 陥落` : `${r.name} 防衛`, won ? `${atk ? esc(atk.name) : '竜'} の勝ち` : `${f.defender ? esc(f.defender.name) : '魔物'} が守りきった`, won ? 'k-steal' : 'k-event', 900 / this.cpuSpeed);
    }
  }

  async regionChange(region: number, _from: number | null, to: number | null) {
    const r = REGIONS[region];
    await this.world.setRegion(region, to, r.kind === 'capital' ? r.start : null, true);
    if (to !== null) audio.play('buy', { volume: 0.7 });
    this.sync();
    await this.wait(300);
  }

  async reward(l: Lord, card: string) {
    if (l.human) {
      audio.play(CARDS[card].rarity === 'epic' ? 'epic' : 'card');
      await this.ui.banner(`<div class="card-reveal">${battleCardHtml(card)}</div>`, `「${CARDS[card].name}」がデッキに加わった`, 'k-card', 1200);
    } else this.ui.log(`${this.name(l)} が「${CARDS[card].name}」を手に入れた`);
  }

  async eliminated(l: Lord, by: Lord | null) {
    audio.play('fanfare');
    this.world.setPieceVisible(l.id, false);
    this.world.confetti();
    await this.ui.banner(`${esc(l.name)} の王都が陥落！`, `${by ? esc(by.name) : '？'} が王を討ち取った。${esc(l.name)} の領地は中立に戻る`, 'k-conquest', 2000);
  }

  async dragonRaid(region: number) {
    audio.play('dragon');
    await this.world.dragonStrike(region);
    await this.ui.banner('竜の襲撃！', `首位の領主の ${REGIONS[region].name} に竜が襲いかかる`, 'k-event', 1500);
  }

  log(msg: string) {
    this.ui.log(msg);
  }

  sync() {
    if (!this.c) return;
    this.ui.renderHud(this.c, this.humanId, this.active);
    REGIONS.forEach((r, i) => {
      const o = this.c.owner[i];
      const capital = r.kind === 'capital' && o === r.start && o !== null;
      this.world.setRegionLabel(
        i,
        `<span class="rl-icon">${icon(capital ? 'castle' : r.icon)}</span><span class="rl-name">${r.name}</span><span class="rl-hp">${icon('hearts')}${this.c.defenseHp(i)}</span>`,
        o === null ? null : PLAYER_COLORS[o],
      );
    });
  }

  async finish(w: Lord) {
    audio.play('win');
    this.world.confetti();
    await this.ui.banner(`${esc(w.name)} の戴冠！`, `領地 ${this.c.regionsOf(w.id).length} つで島の王となった`, 'k-win', 2200);
  }
}

/** あなたの操作（どこを攻めるか・報酬・訓練） */
export class HumanLord implements CampaignController {
  ui: UI;
  world: World;
  constructor(ui: UI, world: World) {
    this.ui = ui;
    this.world = world;
  }

  async choose(c: Campaign, l: Lord): Promise<Choice> {
    const targets = c.targets(l);
    for (;;) {
      const pick = await new Promise<number | 'train'>((resolve) => {
        this.world.setSelectable(targets);
        this.world.frameTiles(targets);
        const prev = this.world.onTileClick;
        const done = (v: number | 'train') => {
          this.world.setSelectable(null);
          this.world.onTileClick = prev;
          this.world.labels.onclick = null;
          this.ui.clearAction();
          resolve(v);
        };
        this.world.onTileClick = (i) => {
          if (targets.includes(i)) done(i);
          else prev?.(i);
        };
        // 名札をタップしても選べる
        this.world.labels.onclick = (e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-region]');
          const i = el ? Number(el.dataset.region) : -1;
          if (targets.includes(i)) done(i);
        };
        this.ui.action.innerHTML = `<div class="select-bar"><span>${icon('crossed-swords')}光っている領地をタップして攻める</span><button type="button" class="btn secondary train">${icon('upgrade')}訓練する</button></div>`;
        this.ui.action.classList.add('show');
        this.ui.action.querySelector('.train')!.addEventListener('click', () => done('train'));
      });
      if (pick === 'train') {
        const ok = await this.ui.dialog({
          title: '訓練する？',
          icon: 'upgrade',
          body: '<p>このラウンドは攻めずに、カードを1枚もらうか、デッキから弱いカードを1枚外す。</p>',
          buttons: [
            { label: 'やめる', value: false },
            { label: '訓練する', value: true, kind: 'primary' },
          ],
        });
        if (ok) return { type: 'train' };
        continue;
      }
      if (await this.confirmAttack(c, l, pick)) return { type: 'attack', region: pick };
    }
  }

  private confirmAttack(c: Campaign, l: Lord, region: number) {
    const r = REGIONS[region];
    const o = c.owner[region];
    const def = o === null ? null : c.lords[o];
    const preview = r.pool.length ? `<div class="pool-row">${r.pool.slice(0, 4).map((x) => battleCardHtml(x, { small: true })).join('')}</div>` : '';
    return this.ui.dialog({
      title: `${r.name} を攻める？`,
      icon: r.icon,
      color: def ? PLAYER_COLORS[def.id] : '#8a8070',
      body: `<div class="cost-line"><span>守り手</span><b>${def ? `${esc(def.name)}（${HEROES[def.hero].title}）` : r.kind === 'capital' ? '廃墟の守備兵' : '魔物'}</b></div>
        <div class="cost-line"><span>相手の城の体力</span><b>${c.defenseHp(region)}</b></div>
        <div class="cost-line"><span>あなたの城の体力</span><b>${c.makeFight(l, region).setup.sides[0].hp}</b></div>
        ${r.kind === 'capital' && def ? '<p class="hint">王都を落とすと、この領主は脱落する。</p>' : ''}
        ${r.kind === 'dragon' ? '<p class="hint">竜の巣はとても手強い。落とせば伝説のカードが手に入る。</p>' : ''}
        ${preview ? `<p class="note">勝つと、こんなカードから報酬を選べる</p>${preview}` : ''}`,
      buttons: [
        { label: 'やめる', value: false },
        { label: '攻める！', value: true, kind: 'danger' },
      ],
      className: 'attack',
    });
  }

  async reward(_c: Campaign, _l: Lord, offers: string[]): Promise<number> {
    return this.pickCard('勝利の報酬', 'デッキに加えるカードを1枚選んでください。', offers, false) as Promise<number>;
  }

  async train(_c: Campaign, l: Lord, offers: string[]): Promise<TrainPick> {
    for (;;) {
      const r = await this.pickCard('訓練', '新しいカードを1枚もらうか、デッキから外すカードを選ぶ。', offers, true);
      if (r === 'remove') {
        const card = await this.removeDialog(l);
        if (card) return { kind: 'remove', card };
        continue;
      }
      return r < 0 ? null : { kind: 'add', index: r };
    }
  }

  private pickCard(title: string, text: string, offers: string[], allowRemove: boolean): Promise<number | 'remove'> {
    return new Promise((resolve) => {
      let sel = -1;
      const p = this.ui.dialog<string>({
        title,
        icon: 'card-random',
        body: `<p>${text}</p><div class="shop-row">${offers.map((c, i) => `<button type="button" class="shop-item" data-k="${i}">${battleCardHtml(c, { small: true })}</button>`).join('')}</div>`,
        buttons: [
          ...(allowRemove ? [{ label: 'カードを外す', value: 'remove' }] : [{ label: 'いらない', value: 'skip' }]),
          { label: 'これにする', value: 'ok', kind: 'primary' as const, disabled: true },
        ],
        className: 'discard shop',
      });
      const wrap = this.ui.dialogs.lastElementChild as HTMLElement;
      const ok = wrap.querySelector<HTMLButtonElement>('.dialog-buttons .btn.primary')!;
      wrap.querySelectorAll<HTMLButtonElement>('.shop-item').forEach((b) =>
        b.addEventListener('click', () => {
          sel = Number(b.dataset.k);
          wrap.querySelectorAll('.shop-item').forEach((x) => x.classList.toggle('sel', x === b));
          ok.disabled = false;
          audio.play('hover', { volume: 0.5 });
        }),
      );
      void p.then((v) => resolve(v === 'remove' ? 'remove' : v === 'ok' ? sel : -1));
    });
  }

  private removeDialog(l: Lord): Promise<string | null> {
    const m = new Map<string, number>();
    for (const c of l.deck) m.set(c, (m.get(c) ?? 0) + 1);
    const list = [...m].sort((a, b) => CARDS[a[0]].cost - CARDS[b[0]].cost);
    return new Promise((resolve) => {
      let sel: string | null = null;
      const p = this.ui.dialog<string>({
        title: 'デッキから外す',
        icon: 'cancel',
        body: `<p>外すカードを選ぶ（デッキは${l.deck.length}枚。8枚より少なくはできない）。弱いカードを抜くと、強いカードを引きやすくなる。</p><div class="shop-row wrap">${list.map(([c, n]) => `<button type="button" class="shop-item" data-c="${c}">${battleCardHtml(c, { small: true })}<small>×${n}</small></button>`).join('')}</div>`,
        buttons: [
          { label: '戻る', value: 'back' },
          { label: '外す', value: 'ok', kind: 'danger', disabled: true },
        ],
        className: 'discard shop',
      });
      const wrap = this.ui.dialogs.lastElementChild as HTMLElement;
      const ok = wrap.querySelector<HTMLButtonElement>('.dialog-buttons .btn.danger')!;
      wrap.querySelectorAll<HTMLButtonElement>('.shop-item').forEach((b) =>
        b.addEventListener('click', () => {
          sel = b.dataset.c!;
          wrap.querySelectorAll('.shop-item').forEach((x) => x.classList.toggle('sel', x === b));
          ok.disabled = l.deck.length <= 8;
        }),
      );
      void p.then((v) => resolve(v === 'ok' ? sel : null));
    });
  }
}
