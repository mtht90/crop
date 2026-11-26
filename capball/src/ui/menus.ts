import { audio } from '../core/audio';
import { CAPS, capById, capPitch, capStars, drawCap, DUP_COINS, RARITY, type CapBrand, type Rarity } from '../game/caps';
import { PITCHES, SLOTS, SLOT_HOW } from '../game/data';
import { CUPS, cupById, cupOpen, newLeague, standings, userGame, type Cup, type LeagueState } from '../game/league';
import { addCoins, ownsCap, persist, save } from '../game/save';
import { LEAGUE_TEAMS, teamById } from '../game/teams';
import { drawCapTop } from '../render/cap';
import { CapPreview } from '../render/capPreview';
import { VendingView } from '../render/vendingView';
import { icon } from './skin';

const el = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
};

/** キャップの天面を描いた小さな canvas */
function capIcon(c: CapBrand, size = 56, locked = false) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  cv.className = 'capicon' + (locked ? ' locked' : '');
  cv.style.width = cv.style.height = size + 'px';
  drawCapTop(cv.getContext('2d')!, size * 2, c);
  return cv;
}

const coinHtml = () => `<span class="coins"><i class="coin"></i><b>${save.coins.toLocaleString()}</b></span>`;
const rarityTag = (id: string) => `<span class="rar r-${RARITY[id]}">${RARITY[id]}</span>`;
const bar = (n: number) => `<span class="stars">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`;

function capDetailHtml(c: CapBrand) {
  const st = capStars(c);
  return `<div class="cn"><b>${c.name}</b>${rarityTag(c.id)}<span>${c.genre}</span></div><div class="cd">${c.desc}</div>
    <div class="cs"><div>球速${bar(st.speed)}</div><div>変化${bar(st.brk)}</div><div>制球${bar(st.control)}</div><div>重さ${bar(st.weight)}</div></div>`;
}
function repHtml(c: CapBrand) {
  return `<div class="rh">持ち球（回し方 → 球種）</div>` + SLOTS.map((sl) => {
    const k = capPitch(c, sl);
    return `<div class="rp${k ? '' : ' no'}"><span>${SLOT_HOW[sl]}</span><b>${k ? PITCHES[k].name : '×'}</b></div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
export type HomeChoice = 'league' | 'vending' | 'challenge' | 'caps' | 'free';

/** ホーム：ここから遊びを選ぶ */
export function homeScreen(parent: HTMLElement): Promise<HomeChoice> {
  return new Promise((resolve) => {
    const cap = capById(save.capSel);
    const lg = save.league && !save.league.done ? save.league : null;
    const won = Object.keys(save.cupsWon).length;
    const s = el(`<div class="screen dim home">
      <div class="topbar">${coinHtml()}<span class="rec">${save.stats.wins}勝 / ${save.stats.games}試合 ・ 優勝 ${won}</span></div>
      <div class="logo small"><div class="jp">キャップ<br>スタジアム</div></div>
      <div class="menu-grid">
        <button class="mbig league" data-a="league"><span class="ic">${icon('trophy')}</span><b>リーグ戦</b><small>${lg ? `${cupById(lg.cupId).name} 第${lg.round + 1}節へ` : '〇〇杯を勝ち抜け'}</small></button>
        <button class="mbig vend" data-a="vending"><span class="ic">${icon('shoppingCart')}</span><b>自販機</b><small>コインでキャップを買う</small></button>
        <button class="mbig chal" data-a="challenge"><span class="ic">${icon('target')}</span><b>チャレンジ</b><small>的当て・ホームラン競争</small></button>
        <button class="mbig mycap" data-a="caps"><span class="ic capslot"></span><b>マイキャップ</b><small>${cap.name}</small></button>
        <button class="mbig free" data-a="free"><span class="ic">${icon('singleplayer')}</span><b>フリー試合</b><small>チームと相手を選んで1試合</small></button>
      </div>
    </div>`);
    s.querySelector('.capslot')!.append(capIcon(cap, 40));
    parent.append(s);
    s.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(b.dataset.a as HomeChoice); }));
  });
}

// ---------------------------------------------------------------------------
/** 杯の一覧。挑戦する杯（または続きのリーグ）を選ぶ */
export function cupsScreen(parent: HTMLElement): Promise<LeagueState | null> {
  return new Promise((resolve) => {
    const cur = save.league && !save.league.done ? save.league : null;
    const s = el(`<div class="screen dim"><div class="panel wide">
      <div class="phead"><button class="back" aria-label="戻る">${icon('arrowLeft')}</button><h2>リーグ戦</h2>${coinHtml()}</div>
      ${cur ? `<button class="big-btn" data-cont>続きから：${cupById(cur.cupId).name}（第${cur.round + 1}節）</button>` : ''}
      <div class="cups">${CUPS.map((c) => {
        const open = cupOpen(c, save.cupsWon);
        const wins = save.cupsWon[c.id] ?? 0;
        return `<button class="cup g-${c.grade}${open ? '' : ' locked'}" data-cup="${c.id}" ${open ? '' : 'disabled'}>
          <span class="grade">${c.grade}</span>
          <span class="cname"><b>${c.name}</b><small>${open ? c.desc : `${cupById(c.unlock!).name}で優勝すると挑戦できる`}</small></span>
          <span class="cmeta">${wins ? `<span class="trophy">${icon('trophy', 'dark')}×${wins}</span>` : ''}<small>優勝 ${c.prize[0]}</small></span>
        </button>`;
      }).join('')}</div>
      <div class="howto" style="margin-top:8px">6チームの総当たり（5試合）。勝ち＝3点・引き分け＝1点で、いちばん多いチームが優勝。順位に応じて賞金が出る。</div>
    </div></div>`);
    parent.append(s);
    const done = (v: LeagueState | null) => { s.remove(); resolve(v); };
    s.querySelector<HTMLElement>('.back')!.onclick = () => { audio.play('ui_move'); done(null); };
    s.querySelector<HTMLElement>('[data-cont]')?.addEventListener('click', () => { audio.play('ui_ok'); done(cur); });
    s.querySelectorAll<HTMLElement>('[data-cup]').forEach((b) => (b.onclick = async () => {
      const cup = cupById(b.dataset.cup!);
      if (cur && !(await confirmBox(parent, `${cupById(cur.cupId).name}の途中です。やめて${cup.name}に挑戦しますか？`))) return;
      audio.play('ui_ok');
      save.league = newLeague(cup, save.teamId);
      persist();
      done(save.league);
    }));
  });
}

function confirmBox(parent: HTMLElement, msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = el(`<div class="menu"><div class="panel" style="width:min(320px,100%)"><div class="howto" style="font-size:14px;text-align:center">${msg}</div>
      <button class="big-btn" data-v="1">はい</button><button class="big-btn sub" data-v="0">いいえ</button></div></div>`);
    parent.append(s);
    s.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => (b.onclick = () => { s.remove(); resolve(b.dataset.v === '1'); }));
  });
}

function tableHtml(l: LeagueState) {
  const rows = standings(l);
  return `<table class="standings"><tr><th></th><th>チーム</th><th>勝</th><th>敗</th><th>分</th><th>点</th><th>得失</th></tr>${rows.map((r, k) => {
    const t = teamById(r.id);
    return `<tr class="${r.i === 0 ? 'me' : ''}"><td>${k + 1}</td><td class="nm"><i class="dot" style="background:${t.color}"></i>${t.name}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td class="p">${r.pts}</td><td>${r.rs - r.ra >= 0 ? '+' : ''}${r.rs - r.ra}</td></tr>`;
  }).join('')}</table>`;
}

/** リーグの順位表と次の試合 */
export function leagueScreen(parent: HTMLElement, l: LeagueState): Promise<'play' | 'back'> {
  return new Promise((resolve) => {
    const cup = cupById(l.cupId);
    const g = userGame(l)!;
    const opp = teamById(l.teams[g.oppIndex]);
    const me = teamById(l.teams[0]);
    const oc = capById(opp.capId);
    const last = l.results.filter((r) => r.a === 0 || r.b === 0);
    const form = last.map((r) => {
      const mine = r.a === 0 ? r.ra : r.rb, theirs = r.a === 0 ? r.rb : r.ra;
      return `<i class="${mine > theirs ? 'w' : mine < theirs ? 'l' : 'd'}">${mine > theirs ? '○' : mine < theirs ? '●' : '△'}</i>`;
    }).join('');
    const s = el(`<div class="screen dim"><div class="panel wide">
      <div class="phead"><button class="back" aria-label="戻る">${icon('arrowLeft')}</button><h2><span class="grade g-${cup.grade}">${cup.grade}</span>${cup.name}</h2>${coinHtml()}</div>
      <div class="round">第${l.round + 1}節 / 全${l.schedule.length}節 <span class="form">${form}</span></div>
      <div class="vs">
        <div class="vt"><i class="dot big" style="background:${me.color}"></i><b>${me.short}</b><small>${g.user === 'away' ? '先攻' : '後攻'}</small></div>
        <div class="vsl">VS</div>
        <div class="vt"><i class="dot big" style="background:${opp.color}"></i><b>${opp.short}</b><small>${'★'.repeat(opp.rank)}</small></div>
      </div>
      <div class="oppcap"><span class="oc"></span><span>相手のキャップ：<b>${oc.name}</b>（${oc.genre}）</span></div>
      ${tableHtml(l)}
      <button class="big-btn" data-a="play">プレイボール！</button>
    </div></div>`);
    s.querySelector('.oc')!.append(capIcon(oc, 28));
    parent.append(s);
    s.querySelector<HTMLElement>('.back')!.onclick = () => { audio.play('ui_move'); s.remove(); resolve('back'); };
    s.querySelector<HTMLElement>('[data-a="play"]')!.onclick = () => { audio.play('ui_ok'); s.remove(); resolve('play'); };
  });
}

/** リーグ終了：最終順位と賞金 */
export function leagueEndScreen(parent: HTMLElement, l: LeagueState): Promise<void> {
  return new Promise((resolve) => {
    const cup = cupById(l.cupId);
    const rows = standings(l);
    const rank = rows.findIndex((r) => r.i === 0) + 1;
    const prize = cup.prize[rank - 1] ?? 0;
    const champ = rank === 1;
    const next = CUPS.find((c) => c.unlock === cup.id);
    const firstWin = champ && !(save.cupsWon[cup.id] ?? 0);
    if (champ) save.cupsWon[cup.id] = (save.cupsWon[cup.id] ?? 0) + 1;
    addCoins(prize);
    save.league = null;
    persist();
    const s = el(`<div class="screen dim"><div class="result-title">${champ ? '優勝！！' : `${rank}位`}</div>
      <div class="panel wide">
        ${champ ? `<div class="trophy-big">${icon('trophy')}</div><div class="center"><b>${cup.name}</b> 制覇！</div>` : `<div class="center">${cup.name} 最終順位 <b>${rank}位</b></div>`}
        ${tableHtml(l)}
        <div class="reward">賞金 <i class="coin"></i><b>+${prize}</b></div>
        ${firstWin && next ? `<div class="unlock">${icon('medal1', 'dark')} <b>${next.name}</b>（${next.grade}）に挑戦できるようになった！</div>` : ''}
        <button class="big-btn">ホームへ</button>
      </div></div>`);
    parent.append(s);
    audio.bgm(champ ? 'win' : null, { loop: false });
    if (champ) audio.play('cheer_big', { volume: 0.7 });
    s.querySelector<HTMLElement>('.big-btn')!.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(); };
  });
}

// ---------------------------------------------------------------------------
const PRICE = 100;

/** 自販機：コインでキャップを買う（何が出るかはお楽しみ） */
const PRICE10 = 900;

export function vendingScreen(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const s = el(`<div class="screen dim"><div class="panel wide vendp">
      <div class="phead"><button class="back" aria-label="戻る">${icon('arrowLeft')}</button><h2>自販機</h2>${coinHtml()}</div>
      <div class="vstage"><div class="vprice"><i class="coin"></i>${PRICE}</div></div>
      <div class="buys">
        <button class="big-btn buy">${icon('shoppingCart')}1本 ${PRICE}</button>
        <button class="big-btn buy10">${icon('shoppingCart')}10本 ${PRICE10}</button>
      </div>
      <div class="howto rates">出る確率　N 60%・R 26%・SR 11.5%・SSR 2.5%　／　ダブったらコインが戻る</div>
      <div class="lineup"><div class="lh">集めたキャップ <span class="collect"></span></div><div class="rprog"></div></div>
    </div></div>`);
    parent.append(s);
    const view = new VendingView(Math.min(300, window.innerWidth - 80), 280);
    s.querySelector('.vstage')!.prepend(view.canvas);
    const refresh = () => {
      s.querySelectorAll('.coins b').forEach((b) => (b.textContent = save.coins.toLocaleString()));
      const n = CAPS.filter((c) => ownsCap(c.id)).length;
      s.querySelector('.collect')!.innerHTML = `<b>${n}</b> / ${CAPS.length}`;
      s.querySelector('.rprog')!.innerHTML = (['N', 'R', 'SR', 'SSR'] as Rarity[]).map((r) => {
        const all = CAPS.filter((c) => RARITY[c.id] === r);
        const got = all.filter((c) => ownsCap(c.id)).length;
        return `<div class="rp-row"><span class="rar r-${r}">${r}</span><span class="rbar"><i style="width:${(got / all.length) * 100}%"></i></span><span class="rn">${got}/${all.length}</span></div>`;
      }).join('');
      s.querySelector<HTMLButtonElement>('.buy')!.disabled = save.coins < PRICE;
      s.querySelector<HTMLButtonElement>('.buy10')!.disabled = save.coins < PRICE10;
    };
    refresh();
    let busy = false;
    /** 1本引いて記録する */
    const pull = () => {
      const c = drawCap();
      const isNew = !ownsCap(c.id);
      save.caps[c.id] = (save.caps[c.id] ?? 0) + 1;
      if (!isNew) save.coins += DUP_COINS[RARITY[c.id]];
      return { c, isNew };
    };
    s.querySelector<HTMLElement>('.back')!.onclick = () => { if (busy) return; audio.play('ui_move'); view.dispose(); s.remove(); resolve(); };
    s.querySelector<HTMLElement>('.buy')!.onclick = async () => {
      if (busy || save.coins < PRICE) return;
      busy = true;
      addCoins(-PRICE);
      const { c, isNew } = pull();
      persist();
      refresh();
      audio.play('ui_ok');
      // ガコン：自販機が揺れて、取り出し口からキャップが飛び出す
      audio.play('bounce', { volume: 0.7, rate: 0.8 });
      await view.dispense(c);
      await revealCap(parent, c, isNew);
      view.reset();
      refresh();
      busy = false;
    };
    s.querySelector<HTMLElement>('.buy10')!.onclick = async () => {
      if (busy || save.coins < PRICE10) return;
      busy = true;
      addCoins(-PRICE10);
      const got = Array.from({ length: 10 }, pull);
      persist();
      refresh();
      audio.play('ui_ok');
      audio.play('bounce', { volume: 0.7, rate: 0.8 });
      // いちばんレアなものを取り出し口から出す
      const order: Rarity[] = ['SSR', 'SR', 'R', 'N'];
      const best = [...got].sort((a, b) => order.indexOf(RARITY[a.c.id]) - order.indexOf(RARITY[b.c.id]))[0];
      await view.dispense(best.c);
      await revealMany(parent, got);
      view.reset();
      refresh();
      busy = false;
    };
  });
}

/** 10本まとめて買ったときの結果 */
function revealMany(parent: HTMLElement, got: { c: CapBrand; isNew: boolean }[]): Promise<void> {
  return new Promise((resolve) => {
    const top = got.some((g) => RARITY[g.c.id] === 'SSR') ? 'SSR' : got.some((g) => RARITY[g.c.id] === 'SR') ? 'SR' : 'R';
    const s = el(`<div class="menu reveal r-${top}"><div class="rays"></div><div class="panel" style="width:min(380px,100%)">
      <h2 style="text-align:center;margin-bottom:8px">10本 買った！</h2>
      <div class="many"></div>
      <div class="rnew">新しいキャップ <b>${got.filter((g) => g.isNew).length}</b> 本</div>
      <button class="big-btn">OK</button></div></div>`);
    const box = s.querySelector('.many')!;
    got.forEach((g, k) => {
      const d = el(`<div class="mi r-${RARITY[g.c.id]}" style="animation-delay:${k * 70}ms"><span class="rar r-${RARITY[g.c.id]}">${RARITY[g.c.id]}</span>${g.isNew ? '<b class="new">NEW</b>' : ''}<small>${g.c.name}</small></div>`);
      d.prepend(capIcon(g.c, 54));
      box.append(d);
    });
    parent.append(s);
    audio.play(top === 'SSR' || top === 'SR' ? 'cheer_big' : 'cheer', { volume: 0.6 });
    s.querySelector<HTMLElement>('.big-btn')!.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(); };
  });
}

function revealCap(parent: HTMLElement, c: CapBrand, isNew: boolean): Promise<void> {
  return new Promise((resolve) => {
    const rar = RARITY[c.id];
    const s = el(`<div class="menu reveal r-${rar}"><div class="rays"></div><div class="panel" style="width:min(340px,100%)">
      <div class="rbanner r-${rar}">${rar}</div>
      <div class="rview"></div>
      <div class="capinfo">${capDetailHtml(c)}</div>
      <div class="caprep">${repHtml(c)}</div>
      <div class="rnew">${isNew ? '<b class="new">NEW!</b> 新しいキャップを手に入れた' : `ダブり… <i class="coin"></i><b>+${DUP_COINS[rar]}</b> 戻ってきた`}</div>
      <button class="big-btn">OK</button></div></div>`);
    const pv = new CapPreview(c, 150);
    s.querySelector('.rview')!.append(pv.canvas);
    parent.append(s);
    audio.play(rar === 'SSR' || rar === 'SR' ? 'cheer_big' : isNew ? 'cheer' : 'chime', { volume: 0.6 });
    s.querySelector<HTMLElement>('.big-btn')!.onclick = () => { audio.play('ui_ok'); pv.dispose(); s.remove(); resolve(); };
  });
}

// ---------------------------------------------------------------------------
/** マイキャップ：集めたキャップを見る・使うキャップを選ぶ */
export function capsScreen(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let sel = capById(save.capSel);
    const PER = 20;
    let rar: '' | Rarity = '', genre = '', ownOnly = false, page = 0;
    const genres = [...new Set(CAPS.map((c) => c.genre))];
    const s = el(`<div class="screen dim"><div class="panel wide">
      <div class="phead"><button class="back" aria-label="戻る">${icon('arrowLeft')}</button><h2>マイキャップ</h2>${coinHtml()}</div>
      <div class="capview"><div class="capinfo"></div></div>
      <div class="caprep"></div>
      <button class="big-btn use">このキャップを使う</button>
      <div class="dexhead"><b>図鑑</b><span class="dexcount"></span></div>
      <div class="dexbar">
        <div class="seg rars">${['', 'N', 'R', 'SR', 'SSR'].map((r) => `<button data-r="${r}">${r || 'すべて'}</button>`).join('')}</div>
        <div class="dexrow2">
          <select class="genre" aria-label="ジャンル"><option value="">すべてのジャンル</option>${genres.map((g) => `<option>${g}</option>`).join('')}</select>
          <label class="own"><input type="checkbox" id="dex-own"> 持っているだけ</label>
        </div>
      </div>
      <div class="dex"></div>
      <div class="pager"><button class="pv" aria-label="前へ">${icon('arrowLeft')}</button><span class="pn"></span><button class="nx" aria-label="次へ">${icon('right')}</button></div>
      <div class="howto">持っていないキャップは自販機で手に入る。守るときに投げるのは、ここで選んだキャップ。</div>
    </div></div>`);
    parent.append(s);
    const pv = new CapPreview(sel);
    s.querySelector('.capview')!.prepend(pv.canvas);
    const dex = s.querySelector('.dex')!;
    const list = () => CAPS.filter((c) => (!rar || RARITY[c.id] === rar) && (!genre || c.genre === genre) && (!ownOnly || ownsCap(c.id)));
    const owned = CAPS.filter((c) => ownsCap(c.id)).length;
    s.querySelector('.dexcount')!.innerHTML = `集めた <b>${owned}</b> / ${CAPS.length}`;
    const drawGrid = () => {
      const all = list();
      const pages = Math.max(1, Math.ceil(all.length / PER));
      page = Math.min(page, pages - 1);
      dex.innerHTML = '';
      for (const c of all.slice(page * PER, page * PER + PER)) {
        const own = ownsCap(c.id);
        const b = el(`<button class="dexb${own ? '' : ' locked'}${c.id === sel.id ? ' sel' : ''}" data-id="${c.id}"><span class="rar r-${RARITY[c.id]}">${RARITY[c.id]}</span><small>${own ? c.name : '？？？'}</small></button>`);
        b.prepend(capIcon(c, 44, !own));
        if (own && (save.caps[c.id] ?? 0) > 1) b.insertAdjacentHTML('beforeend', `<em>×${save.caps[c.id]}</em>`);
        b.onclick = () => { sel = c; audio.play('ui_move'); refresh(); };
        dex.append(b);
      }
      if (!all.length) dex.innerHTML = '<div class="empty">この条件のキャップはまだない</div>';
      s.querySelector('.pn')!.textContent = `${page + 1} / ${pages}`;
      s.querySelector<HTMLButtonElement>('.pv')!.disabled = page <= 0;
      s.querySelector<HTMLButtonElement>('.nx')!.disabled = page >= pages - 1;
      s.querySelectorAll<HTMLElement>('.rars button').forEach((b) => b.classList.toggle('sel', b.dataset.r === rar));
    };
    const refresh = () => {
      const own = ownsCap(sel.id);
      s.querySelector('.capinfo')!.innerHTML = own ? capDetailHtml(sel) : `<div class="cn"><b>？？？</b>${rarityTag(sel.id)}<span>${sel.genre}</span></div><div class="cd">まだ持っていない。自販機で探そう</div>`;
      s.querySelector('.caprep')!.innerHTML = own ? repHtml(sel) : '';
      pv.canvas.style.filter = own ? '' : 'brightness(0) opacity(.35)';
      pv.set(sel);
      const use = s.querySelector<HTMLButtonElement>('.use')!;
      use.disabled = !own || sel.id === save.capSel;
      use.textContent = sel.id === save.capSel ? '使用中' : own ? 'このキャップを使う' : '持っていない';
      dex.querySelectorAll<HTMLElement>('.dexb').forEach((b) => b.classList.toggle('sel', b.dataset.id === sel.id));
    };
    s.querySelectorAll<HTMLElement>('.rars button').forEach((b) => (b.onclick = () => { rar = b.dataset.r as '' | Rarity; page = 0; audio.play('ui_move'); drawGrid(); }));
    s.querySelector<HTMLSelectElement>('.genre')!.onchange = (e) => { genre = (e.target as HTMLSelectElement).value; page = 0; drawGrid(); };
    s.querySelector<HTMLInputElement>('#dex-own')!.onchange = (e) => { ownOnly = (e.target as HTMLInputElement).checked; page = 0; drawGrid(); };
    s.querySelector<HTMLElement>('.pv')!.onclick = () => { page--; audio.play('ui_move'); drawGrid(); };
    s.querySelector<HTMLElement>('.nx')!.onclick = () => { page++; audio.play('ui_move'); drawGrid(); };
    // 選んでいるキャップのページから始める
    page = Math.floor(Math.max(0, list().findIndex((c) => c.id === sel.id)) / PER);
    drawGrid();
    refresh();
    s.querySelector<HTMLElement>('.use')!.onclick = () => { save.capSel = sel.id; persist(); audio.play('ui_ok'); refresh(); };
    s.querySelector<HTMLElement>('.back')!.onclick = () => { audio.play('ui_move'); pv.dispose(); s.remove(); resolve(); };
  });
}

// ---------------------------------------------------------------------------
export type ChallengeKind = 'target' | 'derby';

/** チャレンジの一覧 */
export function challengeScreen(parent: HTMLElement): Promise<ChallengeKind | null> {
  return new Promise((resolve) => {
    const s = el(`<div class="screen dim"><div class="panel wide">
      <div class="phead"><button class="back" aria-label="戻る">${icon('arrowLeft')}</button><h2>チャレンジ</h2>${coinHtml()}</div>
      <button class="chal-card" data-k="target"><span class="ic">${icon('target')}</span><span><b>的当て</b><small>12球で9枚のパネルを撃ち抜け。変化球でコーナーを狙おう</small></span><span class="best">ベスト<b>${save.best.target}</b>枚</span></button>
      <button class="chal-card" data-k="derby"><span class="ic red">${icon('star')}</span><span><b>ホームラン競争</b><small>10アウトになるまで、何本スタンドに放り込めるか</small></span><span class="best">ベスト<b>${save.best.derby}</b>本</span></button>
      <div class="howto">結果に応じてコインがもらえる。記録を更新するとボーナス。</div>
    </div></div>`);
    parent.append(s);
    s.querySelector<HTMLElement>('.back')!.onclick = () => { audio.play('ui_move'); s.remove(); resolve(null); };
    s.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => (b.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(b.dataset.k as ChallengeKind); }));
  });
}

/** チャレンジの結果 */
export function challengeResult(parent: HTMLElement, kind: ChallengeKind, score: number): Promise<'again' | 'home'> {
  return new Promise((resolve) => {
    const prev = save.best[kind];
    const record = score > prev;
    const coins = (kind === 'target' ? score * 15 + (score >= 9 ? 150 : 0) : score * 25) + (record ? 100 : 0);
    if (record) save.best[kind] = score;
    addCoins(coins);
    const unit = kind === 'target' ? '枚' : '本';
    const s = el(`<div class="screen dim"><div class="result-title">${kind === 'target' ? (score >= 9 ? 'パーフェクト！' : '的当て 終了') : 'ホームラン競争 終了'}</div>
      <div class="panel" style="width:min(340px,100%)">
        <div class="bigscore"><b>${score}</b>${unit}</div>
        ${record ? `<div class="unlock">${icon('medal1', 'dark')} ベスト記録更新！</div>` : `<div class="center">ベスト ${prev}${unit}</div>`}
        <div class="reward"><i class="coin"></i><b>+${coins}</b></div>
        <button class="big-btn" data-a="again">もう一回</button>
        <button class="big-btn sub" data-a="home">ホームへ</button>
      </div></div>`);
    parent.append(s);
    s.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => { audio.play('ui_ok'); s.remove(); resolve(b.dataset.a as 'again' | 'home'); }));
  });
}

export { LEAGUE_TEAMS };
export type { Cup };
