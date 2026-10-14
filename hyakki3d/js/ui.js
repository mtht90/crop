// DOM の UI（HUD・レベルアップカード・バナー・各画面）
import { SKILLS, EVOLUTIONS, MODES, ENEMIES, ACHIEVEMENTS, CHARACTERS } from './config.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { attack: '攻撃', summon: '式神', passive: '補助' };

let ICONS = {};
function icon(id, size) {
  if (ICONS[id]) {
    const im = new Image();
    im.src = ICONS[id];
    im.width = im.height = size;
    im.className = 'icon3d';
    im.alt = '';
    return im;
  }
  const def = SKILLS[id];
  const el = document.createElement('span');
  el.className = 'kanji';
  el.textContent = id === '_heal' ? '薬' : id === '_purge' ? '祓' : def.icon;
  el.style.setProperty('--c', id === '_heal' ? '#ff6a8a' : id === '_purge' ? '#ffe9b0' : def.color);
  el.style.fontSize = Math.round(size * 0.62) + 'px';
  return el;
}

let hudT = 0;
let pickHandler = null;
let cardsReadyAt = 0;
let currentOpts = [];

export const UI = {
  setIcons(map) { ICONS = map || {}; },
  showTitle() {
    $('title').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('result').classList.add('hidden');
    $('levelup').classList.add('hidden');
    $('pause').classList.add('hidden');
  },
  showHUD() {
    $('title').classList.add('hidden');
    $('result').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
  },

  updateHUD(G) {
    const now = performance.now();
    if (now - hudT < 100) return;
    hudT = now;
    $('xpfill').style.width = `${Math.min(100, (G.xp / G.xpNext) * 100)}%`;
    $('lv').textContent = `Lv ${G.level}`;
    const t = Math.floor(G.time);
    $('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('dawn', !G.enraged && G.mode.len - G.time < 60);
    $('timer').classList.toggle('rage', !!G.enraged);
    // 奥義ゲージ
    const ult = $('ult');
    ult.style.setProperty('--k', G.ultKind ? Math.max(0, G.ultT / 8) : G.ult);
    ult.classList.toggle('ready', G.ult >= 1 && !G.ultKind);
    ult.classList.toggle('active', !!G.ultKind);
    $('kills').textContent = G.kills;
    $('allies').textContent = G.allies.length;
    $('foes').textContent = G.enemies.length;
    $('hpfill').style.width = `${Math.max(0, (G.player.hp / G.player.maxHp) * 100)}%`;
    if (G.boss) UI.bossBar(true, G.boss.hp / G.boss.maxHp, G.boss.def.name);
    if (G.debug.fps) $('debug').textContent = G.debugText || '';
  },

  refreshSkills(G) {
    const box = $('skills');
    box.innerHTML = '';
    for (const s of G.skills) {
      const d = document.createElement('div');
      d.className = `sk ${s.def.type}`;
      d.title = s.def.name;
      d.appendChild(icon(s.id, 26));
      const lv = document.createElement('i');
      lv.textContent = s.lv >= s.def.levels.length ? 'M' : s.lv;
      d.appendChild(lv);
      box.appendChild(d);
    }
  },

  banner(text, kind = 'red') {
    const b = document.createElement('div');
    b.className = `banner ${kind}`;
    b.innerHTML = `<span>${text}</span>`;
    $('banners').appendChild(b);
    setTimeout(() => b.remove(), kind === 'small' ? 2200 : 2800);
  },

  bossBar(show, frac = 1, name) {
    $('bossbar').classList.toggle('hidden', !show);
    if (name) $('bossName').textContent = name;
    if (show) $('bossfill').style.width = `${Math.max(0, frac * 100)}%`;
  },

  showLevelUp(G, opts, onPick) {
    currentOpts = opts;
    pickHandler = onPick;
    cardsReadyAt = performance.now() + 380;
    $('lvNum').textContent = G.level;
    const box = $('cards');
    box.innerHTML = '';
    opts.forEach((id, i) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.id = `card${i}`;
      c.style.animationDelay = `${i * 0.08}s`;
      let name, type, lvTxt, desc, isNew = false;
      if (id === '_heal') { name = '霊薬'; type = 'passive'; lvTxt = ''; desc = 'HP を全回復する'; }
      else if (id === '_purge') { name = '大祓'; type = 'attack'; lvTxt = ''; desc = '画面内の妖怪をすべて祓う'; }
      else {
        const def = SKILLS[id];
        const owned = G.skills.find((s) => s.id === id);
        name = def.name; type = def.type;
        if (owned) {
          lvTxt = `Lv${owned.lv} → ${owned.lv + 1}`;
          desc = def.type === 'passive' ? def.desc : def.up[owned.lv] || def.desc;
          const ev = EVOLUTIONS.find((e) => e.from === id || e.need === id);
          if (ev && owned.lv + 1 >= def.levels.length && def.type !== 'passive') desc += `<br><small class="evoHint">最大Lv＋「${SKILLS[ev.need].name}」で宝箱から進化</small>`;
        } else {
          lvTxt = 'NEW'; isNew = true; desc = def.desc;
          const ev = EVOLUTIONS.find((e) => e.need === id && G.skills.some((k) => k.id === e.from));
          if (ev) desc += `<br><small class="evoHint">「${SKILLS[ev.from].name}」の進化に必要</small>`;
        }
      }
      c.classList.add(type);
      if (isNew) c.classList.add('new');
      c.innerHTML = `
        <div class="icon"></div>
        <div class="body">
          <div class="row"><b class="name">${name}</b><em class="tag">${TYPE_LABEL[type]}</em></div>
          <div class="lv">${lvTxt}</div>
          <div class="desc">${desc}</div>
        </div>
        <kbd>${i + 1}</kbd>`;
      c.querySelector('.icon').appendChild(icon(id, 48));
      c.addEventListener('click', () => UI.pick(i));
      box.appendChild(c);
    });
    $('levelup').classList.remove('hidden');
  },

  pick(i) {
    if (!pickHandler || performance.now() < cardsReadyAt || i >= currentOpts.length) return;
    const h = pickHandler;
    pickHandler = null;
    $('levelup').classList.add('hidden');
    h(currentOpts[i]);
  },
  levelUpOpen() { return !!pickHandler; },
  levelUpOptions() { return currentOpts; },

  showPause(show) { $('pause').classList.toggle('hidden', !show); },

  showResult(win, s) {
    $('hud').classList.add('hidden');
    $('levelup').classList.add('hidden');
    const r = $('result');
    r.classList.remove('hidden');
    r.classList.toggle('win', win);
    const t = Math.floor(s.time);
    $('resTitle').textContent = win ? '百鬼、祓い尽くす' : '力尽きた';
    $('resSub').textContent = win ? 'がしゃどくろは崩れ、妖怪たちは闇へ還っていった。' : '百鬼夜行に呑まれた。もう一度、構えよ。';
    const fmt = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v) % 60).padStart(2, '0')}`;
    const best = s.best ? `<div class="best"><span>この退魔師の最高記録</span><b>${s.best.win ? '討伐済み' : fmt(s.best.time)} ／ ${s.best.kills} 体</b></div>` : '';
    $('resStats').innerHTML = `
      <div><span>${s.mode.name}・${s.char.job} ${s.char.name}</span><b>${win ? '討伐' : '敗北'}</b></div>
      <div><span>生存時間</span><b>${fmt(t)}</b></div>
      <div><span>祓った妖怪</span><b>${s.kills}</b></div>
      <div><span>到達レベル</span><b>${s.level}</b></div>
      <div><span>最大同時式神</span><b>${s.maxAllies}</b></div>
      <div><span>総ダメージ</span><b>${Math.round(s.dmg)}</b></div>${best}`;
    $('resUnlock').innerHTML = (s.unlocked || []).map((c) => `<div class="unlock"><img alt="" src="${ICONS['char_' + c.id] || ''}"><span>新たな退魔師が解放された<br><b>${c.job} ${c.name}</b></span></div>`).join('')
      + (s.achs || []).map((a) => `<div class="unlock ach"><span>実績達成<br><b>${a.name}</b>（${a.text}）</span></div>`).join('');
  },
};

// ================================================================ 宝箱ルーレット
let chestDone = null, chestReady = 0, chestTimers = [];
const REEL_POOL = Object.keys(SKILLS).filter((k) => !SKILLS[k].base);
UI.showChest = (rewards, onDone) => {
  const box = $('reels');
  box.innerHTML = '';
  $('chest').classList.remove('hidden');
  $('chest').classList.toggle('evo', rewards.some((r) => r.evo));
  $('chestHint').classList.remove('show');
  chestDone = onDone;
  chestReady = Infinity;
  chestTimers.forEach(clearTimeout);
  chestTimers = [];
  let stopped = 0;
  rewards.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'reel spin';
    el.innerHTML = '<div class="win"><img alt=""></div><b></b><small></small>';
    box.appendChild(el);
    const img = el.querySelector('img');
    let k = 0;
    const spin = setInterval(() => {
      const id = REEL_POOL[(k++ * 7 + i * 3) % REEL_POOL.length];
      if (ICONS[id]) img.src = ICONS[id];
      sfx.tick(i * 0.2);
    }, 70);
    const stopAt = 900 + i * 450 + (r.evo ? 600 : 0);
    chestTimers.push(setTimeout(() => {
      clearInterval(spin);
      if (ICONS[r.id]) img.src = ICONS[r.id];
      el.classList.remove('spin');
      el.classList.add('stop');
      if (r.evo) el.classList.add('evo');
      el.querySelector('b').textContent = r.name;
      el.querySelector('small').textContent = r.evo ? `進化！ ${r.sub}` : r.sub;
      sfx.reelStop(i);
      if (r.evo) sfx.chest();
      if (++stopped === rewards.length) {
        chestReady = performance.now() + 350;
        chestTimers.push(setTimeout(() => $('chestHint').classList.add('show'), 350));
        chestTimers.push(setTimeout(() => UI.chestContinue(true), 6000));
      }
    }, stopAt));
    chestTimers.push(spin);
  });
};
UI.chestContinue = (force = false) => {
  if (!chestDone || (!force && performance.now() < chestReady)) return;
  const f = chestDone;
  chestDone = null;
  chestTimers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  $('chest').classList.add('hidden');
  f();
};
document.getElementById('chest').addEventListener('click', () => UI.chestContinue());

// ================================================================ 退魔師・遊び方の選択
UI.renderChars = (chars, progress, onSelect) => {
  const box = $('chars');
  box.innerHTML = '';
  const sel = progress.selected().id;
  const P = progress.get();
  for (const ch of chars) {
    const open = progress.isUnlocked(ch.id);
    const b = document.createElement('button');
    b.className = 'char' + (open ? '' : ' locked') + (ch.id === sel ? ' sel' : '');
    const mark = (P.clears.main.includes(ch.id) ? '<i class="cm">本</i>' : '') + (P.clears.short.includes(ch.id) ? '<i class="cs">短</i>' : '');
    b.innerHTML = `<img alt="" src="${ICONS['char_' + ch.id] || ''}"><em>${ch.job}</em><span>${open ? ch.name : '？？？'}</span><div class="clr">${mark}</div>`;
    b.addEventListener('click', () => { if (open) { onSelect(ch); UI.renderChars(chars, progress, onSelect); } else UI.charInfo(ch, false); });
    box.appendChild(b);
  }
  UI.charInfo(progress.selected(), true);
};
UI.charInfo = (ch, open) => {
  const info = $('charInfo');
  if (!open) { info.innerHTML = `<b>${ch.job}</b><span class="lock">解放条件：${ch.unlock.text}</span>`; return; }
  const icons = ch.start.map((id) => `<img alt="${SKILLS[id].name}" title="${SKILLS[id].name}" src="${ICONS[id] || ''}">`).join('');
  info.innerHTML = `<div class="l1"><em>${ch.job}</em><b>${ch.name}</b><span class="start">${icons}</span></div>
    <div class="l2">${ch.desc}</div>
    <div class="l3"><i>奥義</i><b>${ch.ult.name}</b>${ch.ult.desc}</div>`;
};
UI.renderModes = (progress, onPick) => {
  const box = $('modes');
  box.innerHTML = '';
  const cur = progress.mode().id;
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'mode' + (m.id === cur ? ' sel' : '');
    b.innerHTML = `<b>${m.name}</b><span>${m.sub}</span>`;
    b.title = m.desc;
    b.addEventListener('click', () => { progress.setMode(m.id); onPick(m); UI.renderModes(progress, onPick); });
    box.appendChild(b);
  }
  $('modeDesc').textContent = progress.mode().desc;
};

// ================================================================ 図鑑
let codexTab = 'yokai';
UI.openCodex = (progress) => {
  $('codex').classList.remove('hidden');
  UI.codexTab(progress, codexTab);
};
UI.closeCodex = () => $('codex').classList.add('hidden');
UI.codexTab = (progress, tab) => {
  codexTab = tab;
  const P = progress.get();
  document.querySelectorAll('#codexTabs button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === tab));
  const body = $('codexBody');
  let html = '', got = 0, all = 0;
  if (tab === 'yokai') {
    const ids = [...progress.yokaiIds, 'orochi', 'mukuro', 'tengu'];
    for (const id of ids) {
      const d = ENEMIES[id];
      const n = d.mid ? P.mids[id] || 0 : d.boss ? P.clears.main.length + P.clears.short.length : P.yokai[id] || 0;
      all++; if (n) got++;
      html += `<div class="entry${n ? '' : ' unk'}"><b>${n ? d.name : '？？？'}</b><span>${d.boss ? '大ボス' : d.mid ? '中ボス' : d.elite ? '強敵' : '妖怪'}</span><em>${n ? `${n.toLocaleString()} ${d.boss ? '回' : '体'}` : '未遭遇'}</em></div>`;
    }
  } else if (tab === 'evo') {
    for (const ev of EVOLUTIONS) {
      const d = SKILLS[ev.to], n = P.evos.includes(ev.to);
      all++; if (n) got++;
      const img = n && ICONS[ev.to] ? `<img alt="" src="${ICONS[ev.to]}">` : '<i class="q">？</i>';
      html += `<div class="entry evo${n ? '' : ' unk'}">${img}<b>${n ? d.name : '？？？'}</b><span>${SKILLS[ev.from].name}（最大Lv）＋ ${n ? SKILLS[ev.need].name : '？？'}</span><em>${n ? d.desc : '宝箱から進化させると登録'}</em></div>`;
    }
  } else if (tab === 'chars') {
    for (const ch of CHARACTERS) {
      const open = P.unlocked.includes(ch.id);
      all++; if (open) got++;
      const cl = (m) => (P.clears[m].includes(ch.id) ? '<i class="ok">討伐</i>' : '<i>─</i>');
      const b = P.best[`main:${ch.id}`];
      html += `<div class="entry char${open ? '' : ' unk'}"><img alt="" src="${ICONS['char_' + ch.id] || ''}"><b>${ch.job} ${open ? ch.name : '？？？'}</b>
        <span>本編 ${cl('main')}　短期決戦 ${cl('short')}${b ? `　最多 ${b.kills} 体` : ''}</span><em>${open ? `奥義「${ch.ult.name}」` : `解放条件：${ch.unlock.text}`}</em></div>`;
    }
  } else {
    for (const a of ACHIEVEMENTS) {
      const n = P.ach.includes(a.id);
      all++; if (n) got++;
      html += `<div class="entry ach${n ? '' : ' unk'}"><i class="mk">${n ? '◆' : '◇'}</i><b>${a.name}</b><span>${a.text}</span></div>`;
    }
  }
  $('codexCount').textContent = `${got} / ${all}`;
  body.innerHTML = html;
};
