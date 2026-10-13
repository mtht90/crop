// DOM の UI（HUD・レベルアップカード・バナー・各画面）
import { SKILLS, RUN } from './config.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { attack: '攻撃', summon: '式神', passive: '補助' };
let hudT = 0;
let pickHandler = null;
let cardsReadyAt = 0;
let currentOpts = [];

export const UI = {
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
    const left = RUN.winAt - G.time;
    $('timer').classList.toggle('dawn', left < 60);
    $('kills').textContent = G.kills.toLocaleString();
    $('allies').textContent = G.allies.length;
    $('foes').textContent = G.enemies.length;
    const sk = $('streak');
    if (G.streak >= 15) {
      sk.textContent = `${G.streak} 連祓`;
      sk.style.fontSize = `${Math.min(64, 22 + Math.sqrt(G.streak) * 1.6)}px`;
      sk.classList.add('on');
    } else sk.classList.remove('on');
    if (G.boss) UI.bossBar(true, G.boss.hp / G.boss.maxHp);
    if (G.debug.fps) $('debug').textContent = G.debugText || '';
  },

  refreshSkills(G) {
    const box = $('skills');
    box.innerHTML = '';
    for (const s of G.skills) {
      const d = document.createElement('div');
      d.className = `sk ${s.def.type}`;
      d.style.setProperty('--c', s.def.color);
      d.innerHTML = `<span>${s.def.icon}</span><i>${s.lv >= s.def.levels.length ? 'MAX' : s.lv}</i>`;
      box.appendChild(d);
    }
  },

  banner(text, kind = 'red') {
    const b = document.createElement('div');
    b.className = `banner ${kind}`;
    b.textContent = text;
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
    const box = $('cards');
    box.innerHTML = '';
    opts.forEach((id, i) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.style.animationDelay = `${i * 0.07}s`;
      let icon, name, type, color, lvTxt, desc;
      if (id === '_heal') {
        icon = '薬'; name = '霊薬'; type = 'passive'; color = '#ff6a8a'; lvTxt = ''; desc = 'HP を全回復する';
      } else if (id === '_purge') {
        icon = '祓'; name = '大祓'; type = 'attack'; color = '#ffe9b0'; lvTxt = ''; desc = '画面内の妖怪をすべて祓う';
      } else {
        const def = SKILLS[id];
        const owned = G.skills.find((s) => s.id === id);
        icon = def.icon; name = def.name; type = def.type; color = def.color;
        if (owned) {
          lvTxt = `Lv ${owned.lv} → ${owned.lv + 1}`;
          desc = def.type === 'passive' ? def.desc : def.up[owned.lv] || def.desc;
        } else {
          lvTxt = 'NEW!';
          desc = def.desc;
        }
      }
      c.classList.add(type);
      if (lvTxt === 'NEW!') c.classList.add('new');
      c.style.setProperty('--c', color);
      c.innerHTML = `
        <div class="icon">${icon}</div>
        <div class="body">
          <div class="row"><b class="name">${name}</b><em class="tag">${TYPE_LABEL[type]}</em></div>
          <div class="lv">${lvTxt}</div>
          <div class="desc">${desc}</div>
        </div>
        <kbd>${i + 1}</kbd>`;
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
    $('resTitle').textContent = win ? '百鬼、祓い尽くす' : '力尽きた…';
    $('resSub').textContent = win ? '夜明けとともに妖怪たちは去っていった' : '百鬼夜行に呑まれた';
    $('resStats').innerHTML = `
      <div><span>生存時間</span><b>${Math.floor(t / 60)}分${String(t % 60).padStart(2, '0')}秒</b></div>
      <div><span>祓った妖怪</span><b>${s.kills.toLocaleString()}</b></div>
      <div><span>到達レベル</span><b>${s.level}</b></div>
      <div><span>最大同時式神</span><b>${s.maxAllies}</b></div>
      <div><span>総ダメージ</span><b>${Math.round(s.dmg).toLocaleString()}</b></div>`;
  },
};
