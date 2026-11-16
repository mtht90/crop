// HISTORIA app: screens, save data, battle UI
(function () {
  'use strict';
  const { Game, CARDS, C, top, TYPE_JA, STATUS_JA, KIND_JA, isBasic } = window.HE;
  const { cardHTML, backHTML, ic, esc } = window.HCARD;
  const { PREBUILT, validate } = window.HDECK;
  const ALL = window.HISTORIA_CARDS;
  const $ = (s, r) => (r || document).querySelector(s);
  const stage = $('#stage');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- scale the 1600x900 stage to the window ----------
  function fit() { const s = Math.min(innerWidth / 1600, innerHeight / 900); stage.style.transform = `translate(-50%,-50%) scale(${s})`; }
  addEventListener('resize', fit); fit();

  // ---------- save ----------
  const KEY = 'historia-save-v1';
  const STARTER = {};
  for (const d of Object.values(PREBUILT)) { const cnt = {}; for (const id of d.cards) cnt[id] = (cnt[id] || 0) + 1; for (const [id, n] of Object.entries(cnt)) if (CARDS[id].kind !== 'energy') STARTER[id] = Math.max(STARTER[id] || 0, n); }
  let save = { coll: { ...STARTER }, decks: [], gems: 500, packs: 3, wins: 0, level: 2, sound: true, myDeck: 'pre-buyu' };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.coll) save = Object.assign(save, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };
  const owned = id => CARDS[id].kind === 'energy' ? 99 : (save.coll[id] || 0);
  const deckById = id => PREBUILT[id.replace('pre-', '')] && id.startsWith('pre-') ? PREBUILT[id.replace('pre-', '')] : save.decks.find(d => d.id === id);
  const allDecks = () => [...Object.values(PREBUILT), ...save.decks];

  // ---------- sound (Battle for Wesnoth audio, GPL) ----------
  const SFX = {}; let bgm = null, bgmName = '';
  function sfx(n, v) { if (!save.sound) return; try { const a = (SFX[n] = SFX[n] || new Audio(`assets/sfx/${n}.mp3`)); const b = a.cloneNode(); b.volume = v || .6; b.play().catch(() => {}); } catch (e) {} }
  function music(n) { if (bgmName === n) return; bgmName = n; if (bgm) { bgm.pause(); bgm = null; } if (!save.sound || !n) return; try { bgm = new Audio(`assets/music/${n}.mp3`); bgm.loop = true; bgm.volume = .35; bgm.play().catch(() => {}); } catch (e) {} }
  const ATK_SFX = { buyu: 'sword-1', chiryaku: 'magic-missile-2', seiji: 'magic-holy-1', kagaku: 'lightning', shiso: 'magic-holy-2', tanken: 'water-blast', gekokujo: 'magic-dark', geijutsu: 'magic-faeriefire' };

  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; stage.appendChild(t); setTimeout(() => t.remove(), 2500); }
  function fitNames(root) { requestAnimationFrame(() => (root || stage).querySelectorAll('.card .name').forEach(n => { if (n.dataset.fit) return; n.dataset.fit = 1; let f = parseFloat(getComputedStyle(n).fontSize), i = 0; while (n.scrollWidth > n.clientWidth + 1 && i++ < 25) { f *= .93; n.style.fontSize = f + 'px'; } })); }
  function show(html, id) { stage.innerHTML = `<div class="scr" id="${id}">${html}</div>`; fitNames(); return $('#' + id); }
  const back = () => `<button class="btn dark sm back" data-go="home">もどる</button>`;
  stage.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { sfx('button'); go(g.dataset.go); } });
  function go(where) { ({ home, title, decksel: deckSelect, decks: deckList, coll: collection, pack, credits })[where](); }

  // ---------- title / home ----------
  function title() {
    music('title');
    show(`<div class="starburst" style="left:300px;top:-120px;width:1000px;height:700px"></div>
      <div class="ring" style="--ring:url(ui/circle7.png);left:500px;top:100px;width:600px;height:600px;opacity:.3"></div>
      <div class="logo">HISTORIA</div><div class="sub">偉人たちのカードバトル</div><div class="tap">タップしてはじめる</div><div class="vig"></div>`, 'title')
      .addEventListener('click', () => { sfx('gamestart'); home(); });
  }
  function home() {
    music('menu');
    const pick = ['H01-003', 'H01-035', 'H01-023'].map(id => cardHTML(id));
    const el = show(`<div class="starburst" style="left:320px;top:-200px;width:960px;height:640px"></div>
      <div class="ring" style="--ring:url(ui/circle7.png);left:520px;top:60px;width:560px;height:560px;opacity:.32"></div>
      <div class="logo" style="position:absolute;left:0;right:0;top:36px;text-align:center;font-size:86px">HISTORIA</div>
      <div class="fan"><div style="left:-40px;top:80px;rotate:-14deg;position:absolute">${pick[1]}</div><div style="left:380px;top:80px;rotate:14deg;position:absolute">${pick[2]}</div><div style="left:170px;top:30px;position:absolute">${pick[0]}</div></div>
      <div class="vig"></div>
      <div class="top"><span class="chip">◆ ${save.gems}</span><span class="chip">パック ${save.packs}</span><button class="rbtn" id="snd" title="音" style="--i:var(--i-${save.sound ? 'support' : 'tool'})"></button></div>
      <div class="menu"><button class="btn" data-go="decksel">対戦</button><button class="btn dark" data-go="decks">デッキ</button><button class="btn dark" data-go="coll">図鑑</button><button class="btn dark" data-go="pack">パック</button><button class="btn dark xs" data-go="credits" style="align-self:center">クレジット</button></div>`, 'home');
    $('#snd', el).onclick = () => { save.sound = !save.sound; persist(); if (!save.sound) music(null); else { bgmName = ''; music('menu'); } home(); };
  }

  // ---------- deck select for battle ----------
  function deckTile(d, on) {
    const lead = d.cards.map(id => CARDS[id]).filter(c => c.kind === 'person').sort((a, b) => b.stage - a.stage || b.rar - a.rar)[0];
    const t = d.type || (lead && lead.type) || 'mushoku';
    return `<div class="deck ${on ? 'on' : ''}" data-deck="${d.id}"><img src="art/${lead ? lead.art : 'H01-001.jpg'}" alt=""><div class="lab">${ic(t)}<div>${esc(d.name)}<small>${d.id.startsWith('pre-') ? '構築済み' : '自分のデッキ'}・${d.cards.length}枚</small></div></div></div>`;
  }
  function deckSelect() {
    music('menu');
    const decks = allDecks().filter(d => !validate(d.cards).length);
    const el = show(`<div class="screen-head"><span class="h">対戦 ― デッキを選ぶ</span></div>${back()}
      <div class="decks" style="grid-template-columns:repeat(5,1fr);bottom:150px;overflow-y:auto">${decks.map(d => deckTile(d, d.id === save.myDeck)).join('')}</div>
      <div style="position:absolute;left:40px;right:40px;bottom:36px;display:flex;align-items:center;gap:18px">
        <span class="chip">CPUの強さ</span>${[1, 2, 3].map(l => `<button class="btn ${save.level === l ? '' : 'dark'} xs" data-lv="${l}">${['やさしい', 'ふつう', 'つよい'][l - 1]}</button>`).join('')}
        <span style="flex:1"></span><button class="btn" id="start">対戦開始</button></div>`, 'decksel');
    el.querySelectorAll('[data-deck]').forEach(t => t.onclick = () => { sfx('select'); save.myDeck = t.dataset.deck; persist(); deckSelect(); });
    el.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { save.level = +b.dataset.lv; persist(); deckSelect(); });
    $('#start', el).onclick = () => { const mine = deckById(save.myDeck) || PREBUILT.buyu; const others = Object.values(PREBUILT).filter(d => d.id !== mine.id); battle(mine, others[Math.floor(Math.random() * others.length)]); };
  }

  // ---------- collection ----------
  let collFilter = 'all';
  const FILTERS = [['all', 'すべて'], ...Object.entries(TYPE_JA).filter(([k]) => k !== 'mushoku').map(([k, v]) => [k, v]), ['trainer', 'トレーナーズ'], ['energy', 'エネルギー']];
  const passes = (c, f) => f === 'all' || (f === 'trainer' ? ['support', 'goods', 'tool', 'stadium'].includes(c.kind) : f === 'energy' ? c.kind === 'energy' : c.type === f && c.kind === 'person');
  function filtersHTML(cur) { return `<div class="filters">${FILTERS.map(([k, v]) => `<button data-f="${k}" class="${cur === k ? 'on' : ''}">${TYPE_JA[k] ? ic(k) : ''}${v}</button>`).join('')}</div>`; }
  function collection() {
    music('menu');
    const list = ALL.filter(c => passes(c, collFilter));
    const have = ALL.filter(c => c.kind !== 'energy' && owned(c.id)).length, total = ALL.filter(c => c.kind !== 'energy').length;
    const el = show(`<div class="screen-head"><span class="h">図鑑</span><span class="chip">${have} / ${total} 種類</span></div>${back()}${filtersHTML(collFilter)}
      <div class="grid withf">${list.map(c => `<div class="cell" data-id="${c.id}">${cardHTML(c.id, { cls: owned(c.id) ? '' : ' dim' })}${c.kind !== 'energy' && owned(c.id) ? `<span class="cnt">×${owned(c.id)}</span>` : ''}</div>`).join('')}</div>`, 'coll');
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { collFilter = b.dataset.f; collection(); });
    el.querySelectorAll('.cell').forEach(t => t.onclick = () => cardDetail(t.dataset.id));
  }
  function cardDetail(id) {
    const c = CARDS[id]; sfx('select');
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="panel" style="flex-direction:row;align-items:flex-start;gap:34px;max-width:1100px"><div>${cardHTML(id).replace('class="card', 'style="width:420px" class="card')}</div>
      <div style="width:520px;display:flex;flex-direction:column;gap:12px;font-size:17px;line-height:1.7;user-select:text">
      <div class="q" style="text-align:left">${esc(c.name)}</div>
      ${c.kind === 'person' ? `<div>${TYPE_JA[c.type]} ・ ${['たね', '1進化', '2進化'][c.stage]} ・ ★${c.rar}</div><div>人物：${esc(c.person)}（${esc(c.region)}、${esc(c.years)}）</div><div>${esc(c.flav)}</div>` : c.kind === 'energy' ? '<div>基本エネルギー</div>' : `<div>${KIND_JA[c.kind]} ・ ★${c.rar}</div><div>${esc(c.flav)}</div>`}
      ${c.art ? `<div style="color:#c9ced8;font-size:14px">画：${esc(c.artist)}（${esc(c.lic)}）<br>出典：ウィキメディア・コモンズ<br><span style="word-break:break-all">${esc(c.src || '')}</span></div>` : ''}
      <div>持っている数：${c.kind === 'energy' ? '無制限' : owned(id) + '枚'}</div>
      <button class="btn dark sm" id="mclose">閉じる</button></div></div>`;
    stage.appendChild(m); fitNames(m);
    m.onclick = e => { if (e.target === m || e.target.id === 'mclose') m.remove(); };
  }

  // ---------- decks ----------
  function deckList() {
    music('menu');
    const el = show(`<div class="screen-head"><span class="h">デッキ</span><span class="chip">構築済み8 ・ 自分のデッキ${save.decks.length}</span></div>${back()}
      <div class="decks" style="grid-template-columns:repeat(5,1fr);bottom:30px;overflow-y:auto">${allDecks().map(d => deckTile(d)).join('')}
      <div class="deck" data-new="1" style="display:grid;place-items:center;background:rgba(10,12,18,.7)"><span class="h" style="font-size:30px">＋ 新しいデッキ</span></div></div>`, 'decks');
    el.querySelectorAll('[data-deck]').forEach(t => t.onclick = () => { const d = deckById(t.dataset.deck); editor(d.id.startsWith('pre-') ? { id: null, name: d.name + 'のコピー', cards: d.cards.filter(id => owned(id) >= 1) } : JSON.parse(JSON.stringify(d))); });
    $('[data-new]', el).onclick = () => editor({ id: null, name: '新しいデッキ', cards: [] });
  }
  let edFilter = 'all';
  function editor(d) {
    const cnt = {}; for (const id of d.cards) cnt[id] = (cnt[id] || 0) + 1;
    const list = ALL.filter(c => passes(c, edFilter) && owned(c.id));
    const rows = Object.entries(cnt).sort((a, b) => { const ka = CARDS[a[0]], kb = CARDS[b[0]]; const o = k => ({ person: 0, support: 1, goods: 2, tool: 3, stadium: 4, energy: 5 })[k.kind]; return o(ka) - o(kb) || a[0].localeCompare(b[0]); });
    const errs = validate(d.cards);
    const el = show(`<div class="screen-head"><span class="h">デッキ編集</span><input id="dname" value="${esc(d.name)}" style="font:800 20px var(--f-body);padding:8px 14px;border-radius:10px;border:0;background:#111319;color:#fff;box-shadow:0 0 0 2px #6e7480;width:300px"></div>
      <button class="btn dark sm back" id="edback">もどる</button>${filtersHTML(edFilter)}
      <div class="grid withf">${list.map(c => `<div class="cell" data-add="${c.id}">${cardHTML(c.id, { cls: (cnt[c.id] || 0) >= owned(c.id) ? ' dim' : '' })}<span class="cnt">${cnt[c.id] || 0}/${c.kind === 'energy' ? '∞' : owned(c.id)}</span></div>`).join('')}</div>
      <div class="side"><div class="chip" style="justify-content:center;font-size:22px">${d.cards.length} / 60枚</div>
        <div class="list">${rows.map(([id, n]) => `<div class="row" data-rm="${id}">${CARDS[id].kind === 'person' || CARDS[id].kind === 'energy' ? ic(CARDS[id].type) : HCARD.icK(CARDS[id].kind)}${esc(CARDS[id].name)}<b>×${n}</b></div>`).join('')}</div>
        <div style="font-size:14px;color:#ffb3a8;font-weight:700;min-height:20px">${errs.join(' ')}</div>
        <div style="display:flex;gap:10px"><button class="btn dark xs" id="auto">エネルギーで60枚に</button><button class="btn xs" id="dsave">保存</button>${d.id ? '<button class="btn red xs" id="ddel">削除</button>' : ''}</div></div>`, 'editor');
    const name = () => $('#dname', el).value.trim() || '自分のデッキ';
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { edFilter = b.dataset.f; d.name = name(); editor(d); });
    el.querySelectorAll('[data-add]').forEach(t => t.onclick = () => { const id = t.dataset.add; const n = cnt[id] || 0; if (d.cards.length >= 60) return toast('60枚までです'); if (CARDS[id].kind !== 'energy' && (n >= 4 || n >= owned(id))) return toast(n >= 4 ? '同じカードは4枚までです' : '持っている枚数をこえています'); sfx('select', .4); d.cards.push(id); d.name = name(); editor(d); });
    el.querySelectorAll('[data-rm]').forEach(t => t.onclick = () => { const i = d.cards.indexOf(t.dataset.rm); if (i >= 0) d.cards.splice(i, 1); d.name = name(); editor(d); });
    $('#auto', el).onclick = () => { const ts = {}; d.cards.forEach(id => { const c = CARDS[id]; if (c.kind === 'person') ts[c.type] = (ts[c.type] || 0) + 1; }); const t = Object.entries(ts).sort((a, b) => b[1] - a[1])[0]; const ty = t ? t[0] : 'buyu'; while (d.cards.length < 60) d.cards.push('E-' + ty); d.name = name(); editor(d); };
    $('#dsave', el).onclick = () => { d.name = name(); if (validate(d.cards).length) return toast('このままでは保存できません：' + validate(d.cards)[0]); if (!d.id) { d.id = 'my-' + Date.now(); save.decks.push(d); } else save.decks[save.decks.findIndex(x => x.id === d.id)] = d; persist(); sfx('gold'); toast('保存しました'); deckList(); };
    const del = $('#ddel', el); if (del) del.onclick = () => { save.decks = save.decks.filter(x => x.id !== d.id); persist(); deckList(); };
    $('#edback', el).onclick = () => deckList();
  }

  // ---------- packs ----------
  function rollPack() {
    const pool = r => ALL.filter(c => c.kind !== 'energy' && c.rar === r);
    const pickR = (weights) => { let x = Math.random() * weights.reduce((a, b) => a + b[1], 0); for (const [r, w] of weights) { if ((x -= w) < 0) return r; } return weights[0][0]; };
    const draw = r => { const p = pool(r); return p[Math.floor(Math.random() * p.length)].id; };
    return [draw(pickR([[1, 1]])), draw(pickR([[1, 3], [2, 2]])), draw(pickR([[2, 1]])), draw(pickR([[2, 3], [3, 2]])), draw(pickR([[3, 70], [4, 24], [5, 6]]))];
  }
  function pack() {
    music('menu');
    const el = show(`<div class="starburst" style="left:400px;top:0;width:800px;height:700px"></div>
      <div class="ring" style="--ring:url(ui/circle6.png);left:560px;top:150px;width:480px;height:480px;opacity:.5"></div>
      <div class="screen-head"><span class="h">パック</span><span class="chip">パック ${save.packs}</span><span class="chip">◆ ${save.gems}</span></div>${back()}
      <div class="stagec" style="text-align:center">${backHTML('packbox')}<div style="margin-top:20px;font-weight:800;font-size:20px">第1弾「天下統一と大航海時代」 1パック5枚</div></div>
      <div style="position:absolute;left:0;right:0;bottom:50px;display:flex;justify-content:center;gap:20px"><button class="btn" id="open1" ${save.packs > 0 ? '' : 'disabled'}>パックを開ける</button><button class="btn dark" id="buy" ${save.gems >= 100 ? '' : 'disabled'}>◆100で買う</button></div>
      <div class="vig"></div>`, 'pack');
    $('#buy', el).onclick = () => { save.gems -= 100; save.packs++; persist(); sfx('gold'); pack(); };
    $('#open1', el).onclick = () => openPack();
  }
  function openPack() {
    if (save.packs <= 0) return; save.packs--; const got = rollPack(); for (const id of got) save.coll[id] = (save.coll[id] || 0) + 1; persist(); sfx('open-chest');
    const maxR = Math.max(...got.map(id => CARDS[id].rar));
    const el = show(`<div class="starburst" style="left:200px;top:-100px;width:1200px;height:1000px"></div>
      <div class="ring" style="--ring:url(ui/circle6.png);--ringc:${maxR >= 4 ? '#ffd27a' : '#9fd8ff'};left:420px;top:50px;width:760px;height:760px;opacity:.6"></div>
      <div class="ring" style="--ring:url(ui/circle4.png);--ringc:#9fd8ff;left:550px;top:180px;width:500px;height:500px;opacity:.4;animation-direction:reverse"></div>
      <div class="screen-head"><span class="h">タップでめくる</span></div>
      <div class="row5">${got.map((id, i) => `<div class="pc" data-i="${i}"><div class="in">${backHTML()}${cardHTML(id)}</div></div>`).join('')}</div>
      <div style="position:absolute;left:0;right:0;bottom:46px;display:flex;justify-content:center;gap:20px"><button class="btn dark" id="all">ぜんぶめくる</button><button class="btn" id="done">完了</button></div>`, 'pack');
    const flip = pc => { if (pc.classList.contains('open')) return; pc.classList.add('open'); const r = CARDS[got[+pc.dataset.i]].rar; sfx(r >= 4 ? 'fanfare-short' : 'select', r >= 4 ? .7 : .5); };
    el.querySelectorAll('.pc').forEach(pc => pc.onclick = () => flip(pc));
    $('#all', el).onclick = async () => { for (const pc of el.querySelectorAll('.pc')) { flip(pc); await sleep(250); } };
    $('#done', el).onclick = () => pack();
  }

  // ---------- credits ----------
  function credits() {
    const persons = ALL.filter(c => c.art);
    show(`<div class="screen-head"><span class="h">クレジット</span></div>${back()}<div class="credits panel">
      <h3>HISTORIA</h3><p>ルール：ARCANE BEASTS のルールを流用。カードの内容・プログラムは本作のために作成。<br>本作はGPLの素材（音楽・効果音）を含むため、ゲーム全体を GNU GPL v2 以降、カード画像を CC BY-SA で配布します。</p>
      <h3>画面・カードの素材</h3><table>
      <tr><td>カード枠・ボタン</td><td>RPG Card Template — Lady Luck Soft (JardsonJean)</td><td>CC BY-SA</td></tr>
      <tr><td>台・パネル・バー</td><td>Dark Fantasy UI Pack — Of Far Different Nature</td><td>CC BY 4.0</td></tr>
      <tr><td>バトル場の台座</td><td>Teleporter Circle — Clint Bellanger</td><td>CC BY 3.0</td></tr>
      <tr><td>魔法陣</td><td>Circles glow — Buch</td><td>CC BY-SA 3.0</td></tr>
      <tr><td>光の筋</td><td>Dark Star — MikeeUSA</td><td>CC BY-SA 3.0</td></tr>
      <tr><td>特殊状態アイコン</td><td>Painterly Spell Icons — J. W. Bjerk (eleazzaar)</td><td>CC BY-SA 3.0</td></tr>
      <tr><td>タイプ印・種類の印</td><td>game-icons.net — Lorc, Skoll, Delapouite</td><td>CC BY 3.0</td></tr>
      <tr><td>カード裏の模様</td><td>The Grammar of Ornament (1868) — Owen Jones</td><td>著作権の制限なし</td></tr>
      <tr><td>音楽・効果音</td><td>Battle for Wesnoth — Aleksi Aubry-Carlson, Timothy Pinkham, Doug Kaufman, Mattias Westlund, Stephen Rozanc, Gianmarco Leone ほか</td><td>GPL v2+</td></tr>
      <tr><td>フォント</td><td>Dela Gothic One, M PLUS 1p, Cinzel</td><td>SIL OFL 1.1</td></tr></table>
      <h3>肖像・出来事の絵（ウィキメディア・コモンズ）</h3><table>${persons.map(c => `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${esc(c.artist)}</td><td>${esc(c.lic)}</td><td style="word-break:break-all"><a href="${esc(c.src)}" target="_blank" rel="noopener">元ページ</a></td></tr>`).join('')}</table></div>`, 'credits');
  }

  // =================== battle ===================
  function battle(myDeck, cpuDeck) {
    music('battle1');
    window.HBATTLE.start(myDeck, cpuDeck, {
      stage, sfx, toast, level: save.level, speed: save.speed || 1,
      setSpeed: v => { save.speed = v; persist(); },
      onEnd: win => {
        music(null); sfx(win ? 'fanfare-short' : 'wail', .7);
        const reward = win ? 100 + (save.level - 1) * 50 : 20; save.gems += reward; let bonus = false;
        if (win) { save.wins++; if (save.wins % 3 === 0) { save.packs++; bonus = true; } }
        persist();
        return { text: `${win ? '勝利！' : '敗北…'} ◆${reward} を手に入れた${bonus ? '（3勝ボーナス：パック1）' : ''}` };
      },
      again: d => battle(d[0], Object.values(PREBUILT).filter(x => x.id !== d[0].id)[Math.floor(Math.random() * 7)]),
      home: () => home(),
    });
  }

  window.HAPP = { go, battle };
  title();
})();
