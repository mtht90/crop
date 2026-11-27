// タイトル・準備・宝物庫・実績・遊び方・クレジット・結果の各画面
import { CARDS, GROUPS, HEROES, HERO_ORDER, PLAYER_COLORS, STAGES, STAGE_ORDER } from '../data/defs.ts';
import type { Game } from '../game/engine.ts';
import type { HeroId, Player, StageId } from '../game/types.ts';
import {
  ACHIEVEMENTS, DICE_SKINS, levelRewards, unlockedStages, xpForLevel, type MatchResult, type Reward, type SaveData,
} from '../meta.ts';
import { iconAuthors, icon } from './icons.ts';
import { $, cardHtml, esc, sleep, type UI } from './ui.ts';
import { audio } from '../audio.ts';

const AUTHOR_NAME: Record<string, string> = {
  lorc: 'Lorc', delapouite: 'Delapouite', quoting: 'Quoting', 'caro-asercion': 'Caro Asercion', skoll: 'Skoll',
  willdabeast: 'Willdabeast', darkzaitzev: 'DarkZaitzev', guard13007: 'Guard13007', faithtoken: 'Faithtoken', sbed: 'Sbed',
};

export function rewardHtml(r: Reward) {
  switch (r.kind) {
    case 'crowns':
      return `<div class="reward">${icon('crown')}<b>${r.amount} 王冠</b></div>`;
    case 'card':
      return `<div class="reward card-r">${cardHtml(r.card, { small: true })}<b>新カード「${CARDS[r.card].name}」</b></div>`;
    case 'stage':
      return `<div class="reward stage-r">${icon('treasure-map')}<b>新ステージ「${STAGES[r.stage].name}」</b></div>`;
    case 'dice':
      return `<div class="reward">${icon('rolling-dices')}<b>サイコロ「${DICE_SKINS.find((d) => d.id === r.skin)!.name}」</b></div>`;
  }
}

function xpBar(save: SaveData) {
  const need = xpForLevel(save.level);
  return `<div class="xp"><span class="lv">Lv.${save.level}</span><div class="xp-bar"><i style="width:${(save.xp / need) * 100}%"></i></div><span class="xp-num">${save.xp}/${need}</span></div>`;
}

export function titleScreen(ui: UI, save: SaveData): Promise<'play' | 'vault' | 'achievements' | 'help' | 'credits'> {
  const el = ui.showScreen(
    `<div class="title-wrap">
      <div class="logo"><span class="logo-sub">王国すごろく</span><h1>ダイス<br>キングダム</h1></div>
      <div class="title-menu">
        <button type="button" class="btn gold big" data-go="play">${icon('rolling-dices')}あそぶ</button>
        <button type="button" class="btn secondary" data-go="vault">${icon('open-treasure-chest')}宝物庫</button>
        <button type="button" class="btn secondary" data-go="achievements">${icon('medal')}実績 <small>${save.achievements.length}/${ACHIEVEMENTS.length}</small></button>
        <button type="button" class="btn secondary" data-go="help">${icon('book-cover')}遊び方</button>
        <button type="button" class="btn ghost" data-go="credits">${icon('scroll-quill')}クレジット</button>
      </div>
      <div class="profile">${xpBar(save)}<div class="crowns">${icon('crown')}<b>${save.crowns.toLocaleString()}</b> 王冠</div><div class="record">${save.games}戦 ${save.wins}勝</div></div>
    </div>`,
    'title',
  );
  return new Promise((resolve) => el.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.go as never))));
}

export function setupScreen(ui: UI, save: SaveData, portraits: Record<string, string>): Promise<{ hero: HeroId; stage: StageId } | null> {
  let hero: HeroId = save.heroes.includes(save.lastHero) ? save.lastHero : 'knight';
  let stage: StageId = unlockedStages(save).includes(save.lastStage) ? save.lastStage : 'meadow';
  return new Promise((resolve) => {
    const render = () => {
      const stages = unlockedStages(save);
      const el = ui.showScreen(
        `<div class="panel-page">
          <header class="page-head"><button type="button" class="btn ghost back">${icon('exit-door')}戻る</button><h2>出発の準備</h2><div class="crowns">${icon('crown')}<b>${save.crowns.toLocaleString()}</b></div></header>
          <h3>キャラクター</h3>
          <div class="hero-grid">${HERO_ORDER.map((h) => {
            const d = HEROES[h];
            const owned = save.heroes.includes(h);
            return `<button type="button" class="hero-card${h === hero ? ' sel' : ''}${owned ? '' : ' locked'}" data-hero="${h}">
              <div class="portrait">${portraits[h] ? `<img src="${portraits[h]}" alt="">` : icon(d.icon)}</div>
              <div class="hc-name">${d.name}<small>${d.title}</small></div>
              <div class="hc-passive">${d.passive}</div>
              ${owned ? '' : `<div class="hc-lock">${icon('padlock')}${d.cost} 王冠で開放</div>`}
            </button>`;
          }).join('')}</div>
          <h3>ステージ</h3>
          <div class="stage-grid">${STAGE_ORDER.map((s) => {
            const d = STAGES[s];
            const open = stages.includes(s);
            return `<button type="button" class="stage-card st-${s}${s === stage ? ' sel' : ''}" data-stage="${s}" ${open ? '' : 'disabled'}>
              <b>${d.name}</b><span>${open ? d.desc : `レベル${d.unlockLevel}で開放`}</span></button>`;
          }).join('')}</div>
          <div class="start-row"><button type="button" class="btn gold big start">${icon('play-button')}この王国で遊ぶ</button></div>
        </div>`,
        'setup',
      );
      $('.back', el).addEventListener('click', () => resolve(null));
      el.querySelectorAll<HTMLElement>('[data-hero]').forEach((b) =>
        b.addEventListener('click', async () => {
          const h = b.dataset.hero as HeroId;
          if (!save.heroes.includes(h)) {
            const cost = HEROES[h].cost;
            const ok = await ui.dialog({
              title: `${HEROES[h].title} ${HEROES[h].name}`,
              icon: HEROES[h].icon,
              body: `<p>${HEROES[h].passive}</p><div class="cost-line"><span>開放</span><b>${cost} 王冠</b></div><div class="cost-line"><span>所持</span><b>${save.crowns} 王冠</b></div>`,
              buttons: [
                { label: 'やめる', value: false },
                { label: save.crowns >= cost ? '開放する' : '王冠が足りない', value: true, kind: 'gold', disabled: save.crowns < cost },
              ],
            });
            if (!ok) return;
            save.crowns -= cost;
            save.heroes.push(h);
            audio.play('fanfare');
          }
          hero = h;
          render();
        }),
      );
      el.querySelectorAll<HTMLElement>('[data-stage]').forEach((b) =>
        b.addEventListener('click', () => {
          stage = b.dataset.stage as StageId;
          render();
        }),
      );
      $('.start', el).addEventListener('click', () => resolve({ hero, stage }));
    };
    render();
  });
}

export function vaultScreen(ui: UI, save: SaveData, onDice: (id: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const render = () => {
      const road = Array.from({ length: 6 }, (_, k) => save.level + 1 + k);
      const el = ui.showScreen(
        `<div class="panel-page">
          <header class="page-head"><button type="button" class="btn ghost back">${icon('exit-door')}戻る</button><h2>宝物庫</h2><div class="crowns">${icon('crown')}<b>${save.crowns.toLocaleString()}</b></div></header>
          ${xpBar(save)}
          <h3>これからの報酬</h3>
          <div class="road">${road.map((lv) => `<div class="road-step"><span class="lv">Lv.${lv}</span>${levelRewards(lv).map(rewardHtml).join('')}</div>`).join('')}</div>
          <h3>サイコロ</h3>
          <div class="dice-grid">${DICE_SKINS.map((d) => {
            const open = d.level <= save.level;
            return `<button type="button" class="dice-card${save.dice === d.id ? ' sel' : ''}" data-dice="${d.id}" ${open ? '' : 'disabled'}>${icon('rolling-dices')}<b>${d.name}</b><small>${open ? (save.dice === d.id ? '使用中' : '使う') : `Lv.${d.level}`}</small></button>`;
          }).join('')}</div>
          <h3>カード図鑑</h3>
          <div class="card-grid">${Object.values(CARDS).map((c) => `<div class="card-slot${c.unlockLevel <= save.level ? '' : ' locked'}">${cardHtml(c.id, { small: true })}${c.unlockLevel <= save.level ? '' : `<span class="lock-tag">${icon('padlock')}Lv.${c.unlockLevel}</span>`}</div>`).join('')}</div>
        </div>`,
        'vault',
      );
      $('.back', el).addEventListener('click', () => resolve());
      el.querySelectorAll<HTMLElement>('[data-dice]').forEach((b) =>
        b.addEventListener('click', () => {
          onDice(b.dataset.dice!);
          render();
        }),
      );
    };
    render();
  });
}

export function achievementsScreen(ui: UI, save: SaveData): Promise<void> {
  const el = ui.showScreen(
    `<div class="panel-page">
      <header class="page-head"><button type="button" class="btn ghost back">${icon('exit-door')}戻る</button><h2>実績</h2><div class="crowns">${save.achievements.length}/${ACHIEVEMENTS.length}</div></header>
      <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
        const got = save.achievements.includes(a.id);
        return `<div class="ach${got ? ' got' : ''}">${icon(a.icon)}<div><b>${a.name}</b><small>${a.desc}</small></div><span class="ach-crowns">${got ? '達成' : `${icon('crown')}${a.crowns}`}</span></div>`;
      }).join('')}</div>
    </div>`,
    'achievements',
  );
  return new Promise((resolve) => $('.back', el).addEventListener('click', () => resolve()));
}

export function helpScreen(ui: UI): Promise<void> {
  const el = ui.showScreen(
    `<div class="panel-page help">
      <header class="page-head"><button type="button" class="btn ghost back">${icon('exit-door')}戻る</button><h2>遊び方</h2><div></div></header>
      <section><h3>${icon('tower-flag')}目的</h3><p>島をめぐって陣（色付きのマス）に旗を立て、20ラウンド後に<b>陣を一番多く持っている人</b>の勝ち。全ての陣を手に入れたら、その場で<b>全陣制圧</b>の勝利。</p></section>
      <section><h3>${icon('card-random')}カードで動く</h3><p>自分の番になると山札から<b>新しく5枚</b>引く。行動力は毎ターン<b>3</b>。カードの左上の宝石の数字が行動力のコスト。<b>移動はカードでしかできない</b>（サイコロも「サイコロ」カードが必要。移動カードは1ターン1枚）。カードは<b>上へスワイプ</b>（マスを選ぶカードは盤面のマスまでドラッグ）か、2回タップで使う。使わなかった手札はターン終了時に捨て札へ。山札が尽きたら捨て札を混ぜ直す。</p></section>
      <section><h3>${icon('house')}陣と砦</h3><p>空いた陣に止まったら、お金を払って旗を立てる。自分の陣では砦を築ける（旗 → 砦 → 城塞 → 王城）。砦が強いほど税収が増え、奪われにくい。毎ターンの初めに、持っている陣から税収が入る。</p>
        <div class="group-row">${GROUPS.map((g) => `<span style="--group:${g.color}">${g.name}</span>`).join('')}</div></section>
      <section><h3>${icon('gavel')}陣を奪う</h3><p>相手の陣に止まると通行税を払う。そのあと<b>お金を払えば陣を奪える</b>（守りの結界がある陣は奪えない）。同じ色を全部そろえると税収2倍。</p></section>
      <section><h3>${icon('swap-bag')}デッキを強くする</h3><p>スタートを通ると「王の贈り物」で、新しいカードを1枚もらうか、デッキのカードを1種類<b>強化（+）</b>できる。カード屋のマスでは、お金でカードを買うか強化する。強化するとコストが下がったり、効果が強くなる。「転移の書」「王の勅命」「竜の召喚」は<b>消耗</b>カードで、使うとその試合ではデッキから消える。</p></section>
      <section><h3>${icon('fountain')}逆転のチャンス</h3><p>黄金の泉は貯まった全額がもらえるジャックポット。巻物のイベントは下位ほど良いことが起きやすい。最後の3ラウンドは陣を奪う値段が3割引。</p></section>
      <section><h3>${icon('crown')}遊ぶほど広がる王国</h3><p>遊ぶと経験値と王冠がもらえる。レベルが上がると新しいカード・ステージ・サイコロが開放され、王冠で新しいキャラを仲間にできる。</p></section>
    </div>`,
    'help',
  );
  return new Promise((resolve) => $('.back', el).addEventListener('click', () => resolve()));
}

export function creditsScreen(ui: UI): Promise<void> {
  const authors = iconAuthors();
  const el = ui.showScreen(
    `<div class="panel-page credits">
      <header class="page-head"><button type="button" class="btn ghost back">${icon('exit-door')}戻る</button><h2>クレジット</h2><div></div></header>
      <section><h3>3Dモデル</h3><p>Kay Lousberg — KayKit : Medieval Hexagon Pack / Character Pack Adventurers / Board Game Bits（CC0）<br><a href="https://www.kaylousberg.com" target="_blank" rel="noopener">kaylousberg.com</a><br>Quaternius — LowPoly Animated Monsters の竜（CC0）<br><a href="https://quaternius.itch.io/lowpoly-animated-monsters" target="_blank" rel="noopener">quaternius.itch.io</a></p></section>
      <section><h3>音楽</h3><p>"Teller of the Tales" "Master of the Feast" "Pippin the Hunchback" "Fiddles McGinty" "Celtic Impulse"<br>Kevin MacLeod (incompetech.com)<br>Licensed under Creative Commons: By Attribution 4.0 License<br><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">creativecommons.org/licenses/by/4.0/</a></p></section>
      <section><h3>効果音（CC BY 3.0）</h3><p>Little Robot Sound Factory — Fantasy / UI / Coins Sound Effects Library<br>bart — Level up sound effects<br>NenadSimic — Picked Coin Echo<br>CosmicD — Epic Amulet Item<br>ViRiX — UI and Item sound effect Jingles Sample 2<br>Justin Nichol — Multiple Dice Rolling<br>すべて OpenGameArt.org より。<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a></p></section>
      <section><h3>アイコン（CC BY 3.0）</h3><p>game-icons.net — ${Object.entries(authors)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([a, list]) => `${AUTHOR_NAME[a] ?? a}（${list.length}点）`)
        .join('、')}<br><a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a> ・ <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a></p></section>
      <section><h3>UI素材</h3><p>カード：Wholetone — Ivory &amp; Lacquer 無料サンプラー<br><a href="https://wholetoneassets.itch.io/ivory-lacquer-free-sampler" target="_blank" rel="noopener">wholetoneassets.itch.io</a><br>ダイアログ・ボタンの枠：Kenney — UI Pack (Adventure)（CC0）<br><a href="https://kenney.nl/assets/ui-pack-adventure" target="_blank" rel="noopener">kenney.nl</a></p></section>
      <section><h3>フォント</h3><p>Dela Gothic One / M PLUS Rounded 1c — SIL Open Font License 1.1</p></section>
    </div>`,
    'credits',
  );
  return new Promise((resolve) => $('.back', el).addEventListener('click', () => resolve()));
}

export async function resultsScreen(ui: UI, g: Game, me: Player, res: MatchResult): Promise<'again' | 'title'> {
  const rank = g.ranking();
  const won = g.s.winner === me.id;
  const reason = g.s.winReason === 'conquest' ? '全陣制圧' : '陣の数で決着';
  const el = ui.showScreen(
    `<div class="panel-page results">
      <h2 class="res-title ${won ? 'win' : ''}">${won ? '戴冠！' : `${res.rank + 1}位`}<small>${reason}</small></h2>
      <div class="res-rank">${rank
        .map((p, k) => `<div class="rr${p === me ? ' me' : ''}" style="--pc:${PLAYER_COLORS[p.id]}"><span class="rr-n">${p.bankrupt ? '破産' : `${k + 1}位`}</span>${icon(HEROES[p.hero].icon)}<b>${esc(p.name)}</b><span class="rr-a">陣 ${g.territories(p).length}・${p.cash.toLocaleString()}G</span></div>`)
        .join('')}</div>
      <div class="res-gain">
        <div class="res-col"><h3>経験値</h3>${res.xpGained.map((x) => `<div class="cost-line"><span>${x.label}</span><b>+${x.xp}</b></div>`).join('')}</div>
        <div class="res-col"><h3>王冠</h3>${res.crownsGained.map((x) => `<div class="cost-line"><span>${x.label}</span><b>+${x.crowns}</b></div>`).join('')}</div>
      </div>
      <div class="xp anim"><span class="lv">Lv.<b>${res.levelBefore}</b></span><div class="xp-bar"><i style="width:${(res.xpBefore / xpForLevel(res.levelBefore)) * 100}%"></i></div></div>
      <div class="res-unlocks"></div>
      <div class="start-row"><button type="button" class="btn secondary to-title">タイトルへ</button><button type="button" class="btn gold big again">${icon('rolling-dices')}もう一回</button></div>
    </div>`,
    'results',
  );
  audio.play(won ? 'win' : 'lose');
  // 経験値バーを伸ばす演出
  const bar = el.querySelector<HTMLElement>('.xp.anim i')!;
  const lv = el.querySelector<HTMLElement>('.xp.anim .lv b')!;
  await sleep(600);
  let level = res.levelBefore;
  while (level < res.levelAfter) {
    bar.style.width = '100%';
    await sleep(700);
    level++;
    lv.textContent = String(level);
    audio.play('levelup');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = '';
  }
  bar.style.width = `${(res.xpAfter / xpForLevel(res.levelAfter)) * 100}%`;
  const box = el.querySelector<HTMLElement>('.res-unlocks')!;
  const items = [
    ...(res.levelAfter > res.levelBefore ? [`<div class="unlock-head">レベルアップ！ Lv.${res.levelAfter}</div>`] : []),
    ...res.rewards.map(rewardHtml),
    ...res.newAchievements.map((a) => `<div class="reward ach-r">${icon(a.icon)}<b>実績「${a.name}」</b><small>${a.desc}</small></div>`),
  ];
  for (const it of items) {
    await sleep(450);
    box.insertAdjacentHTML('beforeend', it);
    audio.play('gems', { volume: 0.7 });
  }
  return new Promise((resolve) => {
    $('.again', el).addEventListener('click', () => resolve('again'));
    $('.to-title', el).addEventListener('click', () => resolve('title'));
  });
}

