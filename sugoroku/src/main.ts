// ダイスキングダム：起動と画面の流れ（v4：王国カードバトル）
import './style.css';
import './cards.css';
import './theme.css';
import './battle.css';
import { CARDS, HEROES, HERO_ORDER, NEUTRAL_COLOR, PLAYER_COLORS, REGIONS, STAGES } from './data/defs.ts';
import { audio, type Bgm } from './audio.ts';
import { Battle, noopBattleView } from './game/battle.ts';
import { BattleAI } from './game/battleAi.ts';
import { Campaign, type CampaignController, type Fight } from './game/campaign.ts';
import { CampaignAI } from './game/campaignAi.ts';
import type { HeroId, StageId } from './game/types.ts';
import { applyMatch, loadSave, unlockedCards, writeSave } from './meta.ts';
import { heroPortraits, World } from './render/world.ts';
import { BattleUI, type BattleSideInfo } from './ui/battleUi.ts';
import { icon } from './ui/icons.ts';
import { achievementsScreen, creditsScreen, helpScreen, resultsScreen, setupScreen, titleScreen, vaultScreen } from './ui/screens.ts';
import { UI, esc, sleep } from './ui/ui.ts';
import { GameView, HumanLord } from './view.ts';

const QS = new URLSearchParams(location.search);
const AUTO = QS.has('auto'); // 動作確認用：自分の手番も自動で打つ
const ROUNDS = QS.get('rounds') ? Number(QS.get('rounds')) : 8;
const save = loadSave();
const world = new World(document.getElementById('stage')!);
const ui = new UI(document.getElementById('ui')!);
audio.setMuted(save.muted);
ui.speed = 1;

// 最初の操作で音を出せるようにする
const unlock = () => {
  audio.unlock();
  removeEventListener('pointerdown', unlock);
  removeEventListener('keydown', unlock);
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

let portraits: Record<string, string> = {};
let builtStage: StageId | null = null;

async function ensureWorld(stage: StageId) {
  if (builtStage === stage) return;
  builtStage = stage;
  await world.build(STAGES[stage]);
  for (let i = 0; i < REGIONS.length; i++) await world.setRegion(i, REGIONS[i].start, REGIONS[i].kind === 'capital' ? REGIONS[i].start : null, false);
}

function bgm(name: Bgm) {
  audio.playBgm(name);
}

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load("800 30px 'M PLUS Rounded 1c'"), document.fonts.load("30px 'Dela Gothic One'")]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    /* フォントが読めなくても代わりのフォントで表示する */
  }
}

async function boot() {
  const loading = document.getElementById('loading')!;
  await fontsReady();
  await ensureWorld(save.lastStage in STAGES ? save.lastStage : 'meadow');
  portraits = await heroPortraits(Object.fromEntries(HERO_ORDER.map((h) => [h, HEROES[h].model])));
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
  await titleLoop();
}

async function titleLoop() {
  for (;;) {
    ui.hud.hidden = true;
    world.labels.hidden = true;
    world.overview();
    bgm('title');
    const go = await titleScreen(ui, save);
    if (go === 'play') {
      const pick = await setupScreen(ui, save, portraits);
      writeSave(save);
      if (!pick) continue;
      await playLoop(pick.hero, pick.stage);
    } else if (go === 'vault') await vaultScreen(ui, save);
    else if (go === 'achievements') await achievementsScreen(ui, save);
    else if (go === 'help') await helpScreen(ui);
    else await creditsScreen(ui);
  }
}

async function playLoop(hero: HeroId, stage: StageId) {
  for (;;) {
    const again = await playGame(hero, stage);
    if (!again) return;
  }
}

/** 1試合遊ぶ。もう一回なら true */
async function playGame(hero: HeroId, stage: StageId): Promise<boolean> {
  save.lastHero = hero;
  save.lastStage = stage;
  writeSave(save);
  ui.hideScreen();
  builtStage = null;
  await ensureWorld(stage);
  world.labels.hidden = false;

  const others = HERO_ORDER.filter((h) => h !== hero).sort(() => Math.random() - 0.5).slice(0, 3);
  const heroes = [hero, ...others];
  const names = ['あなた', ...others.map((h) => HEROES[h].name)];
  const seed = (Math.random() * 1e9) | 0;
  const view = new GameView(world, ui, 0);
  view.cpuSpeed = save.speed;
  const skill = STAGES[stage].aiSkill;
  const ctrls: CampaignController[] = heroes.map((_, i) => (i === 0 && !AUTO ? new HumanLord(ui, world) : new CampaignAI(skill)));
  const c = new Campaign({ stage, rounds: ROUNDS, heroes, names, humanIndex: 0, cardPool: unlockedCards(save), seed }, view, ctrls, (cc, f) => runBattle(cc, f, view));
  view.c = c;
  if (QS.has('debug')) Object.assign(window, { __dk: { c, world, ui } });
  if (AUTO) {
    c.lords[0].human = false;
    view.cpuSpeed = 4;
  }
  await world.addPieces(heroes.map((h) => HEROES[h].model));
  heroes.forEach((_, k) => world.setPiecePos(k, c.capitalOf(k)));
  ui.hud.hidden = false;
  ui.logEl.innerHTML = '';
  bgm((['main1', 'main2', 'main3'] as const)[Math.floor(Math.random() * 3)]);
  view.sync();

  // 領地の説明
  const showInfo = (i: number, x: number, y: number) => ui.showTooltip(ui.regionInfo(c, i), x, y);
  world.onTileClick = (i) => {
    const s = world.toScreen(world.regionPos[i]);
    showInfo(i, s.x, s.y);
  };
  world.onTileHover = (i, x, y) => {
    if (i === null) ui.hideTooltip();
    else showInfo(i, x, y);
  };
  world.labels.onclick = (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-region]');
    if (el) {
      const r = el.getBoundingClientRect();
      showInfo(Number(el.dataset.region), r.left, r.bottom);
    }
  };
  // 上部のボタン
  let quit = false;
  const onTop = async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('.speed')) {
      save.speed = save.speed === 1 ? 2 : save.speed === 2 ? 4 : 1;
      view.cpuSpeed = save.speed;
      ui.speed = save.speed;
      writeSave(save);
      view.sync();
    } else if (t.closest('.sound')) {
      save.muted = !save.muted;
      audio.setMuted(save.muted);
      writeSave(save);
      view.sync();
    } else if (t.closest('.menu')) {
      const v = await ui.dialog<'resume' | 'help' | 'quit' | 'deck'>({
        title: 'メニュー',
        icon: 'cog',
        body: '<p>試合を途中でやめると結果は記録されません。</p>',
        buttons: [
          { label: 'デッキを見る', value: 'deck' },
          { label: '遊び方', value: 'help' },
          { label: '試合をやめる', value: 'quit', kind: 'danger' },
          { label: '続ける', value: 'resume', kind: 'primary' },
        ],
      });
      if (v === 'help') {
        await helpScreen(ui);
        ui.hideScreen();
      } else if (v === 'deck') {
        const m = new Map<string, number>();
        for (const id of c.lords[0].deck) m.set(id, (m.get(id) ?? 0) + 1);
        const { battleCardHtml } = await import('./ui/battleUi.ts');
        await ui.dialog({
          title: `あなたのデッキ（${c.lords[0].deck.length}枚）`,
          icon: 'card-random',
          body: `<div class="shop-row wrap">${[...m].sort((a, b) => CARDS[a[0]].cost - CARDS[b[0]].cost).map(([id, n]) => `<div class="shop-item" style="cursor:default">${battleCardHtml(id, { small: true })}<small>×${n}</small></div>`).join('')}</div>`,
          buttons: [{ label: '閉じる', value: 0, kind: 'primary' }],
          className: 'discard',
        });
      } else if (v === 'quit') {
        quit = true;
        location.reload();
      }
    }
  };
  ui.top.addEventListener('click', onTop);

  if (!save.seenHelpV4 && !AUTO) {
    save.seenHelpV4 = true;
    writeSave(save);
    await ui.dialog({
      title: 'ようこそ、ダイスキングダムへ',
      icon: 'crown',
      body: `<p>島は13の領地に分かれている。あなたは<b>南の王都</b>から出発する。<b>8ラウンド後に領地が一番多い人</b>の勝ち。</p>
        <p>自分の番に、<b>となりの領地を1つ攻める</b>。攻めるとカードバトルになり、勝てば領地と報酬のカードが手に入る。</p>
        <p>バトルでは、カードを<b>上へスワイプ</b>して兵や呪文を出し、兵を<b>敵へドラッグ</b>して攻撃。相手の城の体力を0にしたら勝ち。</p>
        <p class="note">領地をタップすると、守り手や報酬が見られます。</p>`,
      buttons: [{ label: 'はじめる', value: true, kind: 'gold' }],
    });
  }
  await ui.banner(`${STAGES[stage].name}`, `${ROUNDS}ラウンドの戦いが始まる`, 'k-start', 1600);
  await c.run();
  ui.top.removeEventListener('click', onTop);
  world.onTileClick = null;
  world.onTileHover = null;
  ui.hideTooltip();
  if (quit) return false;
  await sleep(1200);
  const res = applyMatch(save, c, c.lords[0]);
  ui.hud.hidden = true;
  const next = await resultsScreen(ui, c, c.lords[0], res);
  return next === 'again';
}

/** 1回のバトル。あなたが関わるなら画面で戦い、CPU どうしなら画面なしで決着させる */
async function runBattle(c: Campaign, f: Fight, view: GameView): Promise<boolean> {
  const atk = f.attacker === 'dragon' ? null : f.attacker;
  const atkHuman = !!atk?.human;
  const defHuman = !!f.defender?.human;
  const skill = c.stage.aiSkill;
  const quick = async () => {
    const b = new Battle(f.setup, noopBattleView, [new BattleAI(skill), new BattleAI(skill)]);
    const w = await b.run();
    world.shakeCamera(0.3);
    await sleep(500 / view.cpuSpeed);
    return w;
  };
  if (!atkHuman && !defHuman) return (await quick()) === 0;

  const region = REGIONS[f.region];
  if (defHuman) {
    const who = atk ? `${esc(atk.name)}（${HEROES[atk.hero].title}）` : '竜';
    const v = await ui.dialog<'fight' | 'auto'>({
      title: `${region.name} が攻められた！`,
      icon: 'crossed-swords',
      color: atk ? PLAYER_COLORS[atk.id] : NEUTRAL_COLOR,
      body: `<p>${who} が攻めてきた。迎え撃とう！</p><div class="cost-line"><span>あなたの城の体力</span><b>${f.setup.sides[1].hp}</b></div><div class="cost-line"><span>相手の城の体力</span><b>${f.setup.sides[0].hp}</b></div><p class="note">守る側は14ターン守りきっても勝ち。</p>`,
      buttons: [
        { label: 'おまかせ', value: 'auto' },
        { label: '迎え撃つ', value: 'fight', kind: 'danger' },
      ],
    });
    if (v === 'auto') {
      const w = await quick();
      return w === 0;
    }
  }
  const me: 0 | 1 = atkHuman ? 0 : 1;
  const lordInfo = (l: typeof atk, role: string): BattleSideInfo => ({ name: l!.name, hero: l!.hero, color: PLAYER_COLORS[l!.id], icon: HEROES[l!.hero].icon, role });
  const neutralInfo = (role: string): BattleSideInfo => ({ name: f.attacker === 'dragon' && role === '攻め' ? '竜' : region.name, hero: null, color: NEUTRAL_COLOR, icon: f.attacker === 'dragon' && role === '攻め' ? 'dragon-head' : region.icon, role });
  const info: [BattleSideInfo, BattleSideInfo] = [
    atk ? lordInfo(atk, '攻め') : neutralInfo('攻め'),
    f.defender ? lordInfo(f.defender, `${region.name}の守り`) : neutralInfo(`${region.name}の守り`),
  ];
  const bui = new BattleUI(ui, me, info);
  world.setZoom(0.55);
  world.focusOn(world.regionPos[f.region]);
  ui.hud.classList.add('in-battle');
  world.labels.hidden = true;
  ui.hideTooltip();
  const b = new Battle(f.setup, bui, [bui, bui]);
  bui.mount(b);
  bgm('finale');
  const w = await b.run();
  const human = c.lords.find((l) => l.human);
  if (human) {
    const mine = b.sides[me];
    human.stats.bestDamage = Math.max(human.stats.bestDamage, mine.bestTurnDamage);
    if (w === me && mine.hp >= mine.maxHp) human.stats.flawless++;
  }
  await sleep(300);
  bui.unmount();
  ui.hud.classList.remove('in-battle');
  world.labels.hidden = false;
  bgm((['main1', 'main2', 'main3'] as const)[Math.floor(Math.random() * 3)]);
  void icon;
  return w === 0;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p>読み込みに失敗しました。再読み込みしてください。</p><pre>${String(e)}</pre>`;
});
