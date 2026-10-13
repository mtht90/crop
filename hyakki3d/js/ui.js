// DOM の UI（HUD・レベルアップカード・バナー・各画面）
import { SKILLS, RUN, EVOLUTIONS } from './config.js';
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
    $('timer').classList.toggle('dawn', RUN.winAt - G.time < 60);
    $('kills').textContent = G.kills;
    $('allies').textContent = G.allies.length;
    $('foes').textContent = G.enemies.length;
    $('hpfill').style.width = `${Math.max(0, (G.player.hp / G.player.maxHp) * 100)}%`;
    if (G.boss) UI.bossBar(true, G.boss.hp / G.boss.maxHp);
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

  bossBar(show, frac = 1) {
    $('bossbar').classList.toggle('hidden', !show);
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

  showPause(show) { $('pause').classList.toggle('hidden', !show); },

  showResult(win, s) {
    $('hud').classList.add('hidden');
    $('levelup').classList.add('hidden');
    const r = $('result');
    r.classList.remove('hidden');
    r.classList.toggle('win', win);
    const t = Math.floor(s.time);
    $('resTitle').textContent = win ? '百鬼、祓い尽くす' : '力尽きた';
    $('resSub').textContent = win ? '夜が明け、妖怪たちは闇へ還っていった。' : '百鬼夜行に呑まれた。もう一度、札を構えよ。';
    $('resStats').innerHTML = `
      <div><span>生存時間</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
      <div><span>祓った妖怪</span><b>${s.kills}</b></div>
      <div><span>到達レベル</span><b>${s.level}</b></div>
      <div><span>最大同時式神</span><b>${s.maxAllies}</b></div>
      <div><span>総ダメージ</span><b>${Math.round(s.dmg)}</b></div>`;
    $('resUnlock').innerHTML = (s.unlocked || []).map((c) => `<div class="unlock"><img alt="" src="${ICONS['char_' + c.id] || ''}"><span>新たな陰陽師が解放された<br><b>${c.name}</b>（${c.title}）</span></div>`).join('');
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

// ================================================================ 陰陽師選択
UI.renderChars = (chars, progress, onSelect) => {
  const box = $('chars');
  box.innerHTML = '';
  const sel = progress.selected().id;
  for (const ch of chars) {
    const open = progress.isUnlocked(ch.id);
    const b = document.createElement('button');
    b.className = 'char' + (open ? '' : ' locked') + (ch.id === sel ? ' sel' : '');
    b.innerHTML = `<img alt="" src="${ICONS['char_' + ch.id] || ''}"><span>${open ? ch.name : '？？？'}</span>`;
    b.addEventListener('click', () => { if (open) { onSelect(ch); UI.renderChars(chars, progress, onSelect); } else UI.charInfo(ch, false); });
    box.appendChild(b);
  }
  UI.charInfo(progress.selected(), true);
};
UI.charInfo = (ch, open) => {
  const info = $('charInfo');
  if (!open) { info.innerHTML = `<b>？？？</b><span class="lock">解放条件：${ch.unlock.text}</span>`; return; }
  const icons = ch.start.map((id) => `<img alt="${SKILLS[id].name}" title="${SKILLS[id].name}" src="${ICONS[id] || ''}">`).join('');
  info.innerHTML = `<b>${ch.name}</b><em>${ch.title}</em><span>${ch.desc}</span><span class="start">${icons}</span>`;
};
