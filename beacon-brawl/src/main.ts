import * as THREE from 'three';
import './style.css';
import './skin.css';
import { loadAssets, ensureHeroes, heroModel, portraitOf, capturePortraits, type HeroModel } from './assets';
import { iconSvg, type IconName } from './icons';
import { HEROES, type HeroDef } from './heroes';
import { Match, MODES, type MatchResult } from './game';
import { Input } from './input';
import { Hud } from './hud';
import { initAudio, sfx } from './audio';
import { openBackend, type Backend } from './meta/store';
import { rarityOf } from './meta/roster';
import {
  GACHA_COST, GACHA_TABLE, GACHA_HERO_RATES, LOGIN_REWARDS, MAX_LEVEL, MISSIONS, PITY, ROAD, UPGRADE_COINS, UPGRADE_SHARDS,
  canLoginToday, enemyTier, levelMul, GameError, type Action, type ActionResult, type Reward,
} from './meta/economy';

const $ = (id: string) => document.getElementById(id)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const heroById = (id: string) => HEROES.find((h) => h.id === id)!;

const canvas = $('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // ソフト影はスマホで重いので通常のPCFに（輪郭はほぼ同じ）

const input = new Input(canvas);
const hud = new Hud(input);
let backend: Backend;
let match: Match | null = null;
let mode = 0;
let viewing = ''; // キャラ画面で見ているヒーロー

const P = () => backend.profile;

// 外部UI素材の画像（CSS の --img-* 変数で使う）
// CSS 変数の url() は CSS ファイルの場所基準で解決されるため、絶対 URL にして渡す
const UI_BASE = new URL(import.meta.env.BASE_URL + 'assets/ui/', location.href).href;
for (const n of ['btn-orange', 'btn-blue', 'btn-purple', 'panel-blue', 'panel-orange', 'panel-purple', 'row-blue', 'row-orange', 'row-purple',
  'bar-blue', 'bar-orange', 'bar-purple', 'gem', 'shard-s', 'shard-m', 'shard-l']) document.documentElement.style.setProperty(`--img-${n}`, `url("${UI_BASE}${n}.png")`);
for (const n of ['bg-home', 'bg-gacha', 'bg-sheet']) document.documentElement.style.setProperty(`--img-${n}`, `url("${UI_BASE}${n}.webp")`);

// data-icon 属性にアイコンを入れる
for (const e of document.querySelectorAll<HTMLElement>('[data-icon]')) e.innerHTML = iconSvg(e.dataset.icon as IconName);

function show(id: string | null) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  $('hud').classList.toggle('show', id === null);
}

// ---------- 3D の背景（ホームとキャラ画面で1人を大きく映す） ----------
class Stage3D {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private model: HeroModel | null = null;
  private def: HeroDef | null = null;
  private ring: THREE.Mesh;
  private t = 0;
  /** 'home' は中央、'side' は画面右寄り（情報パネルの横）に立たせる */
  layout: 'home' | 'side' = 'home';

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x0b1030);
    new THREE.TextureLoader().load(UI_BASE + 'bg-home.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; s.background = t; });
    s.fog = new THREE.Fog(0x0b1030, 14, 40);
    s.add(new THREE.HemisphereLight(0xcfdcff, 0x3a3048, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(3, 8, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2 });
    const rim = new THREE.DirectionalLight(0x6fb6ff, 2.2); rim.position.set(-4, 3, -5);
    s.add(sun, rim);
    // 床: 光る六角の台座と放射状のグロー
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x141b44, metalness: 0.5, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x1d2660, metalness: 0.7, roughness: 0.3 }));
    pad.position.y = 0.09; pad.receiveShadow = true; s.add(pad);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.9, 6), new THREE.MeshBasicMaterial({ color: 0xffd60a, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.19; s.add(this.ring);
    const stars = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 16; stars.set([Math.cos(a) * r, Math.random() * 14, Math.sin(a) * r - 6], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.08, fog: false })));
  }

  async display(def: HeroDef) {
    this.def = def;
    await ensureHeroes([def]);
    if (this.def !== def) return; // 読み込み中に別のキャラが選ばれた
    if (this.model) this.model.root.removeFromParent();
    const m = heroModel(def);
    m.root.position.set(0, 0.18, 0);
    m.root.rotation.y = 0;
    this.scene.add(m.root);
    m.mixer.clipAction(m.clips.get(def.idle)!).reset().play();
    m.settle();
    (this.ring.material as THREE.MeshBasicMaterial).color.set(def.color);
    this.model = m;
  }

  /** ポーズを取らせる（タップ時など） */
  cheer() {
    const m = this.model;
    if (!m) return;
    const a = m.mixer.clipAction(m.clips.get('Dance_Loop')!);
    a.reset().fadeIn(0.15).play();
    setTimeout(() => a.fadeOut(0.3), 1600);
  }

  release() { this.model?.root.removeFromParent(); this.model = null; }

  update(dt: number) {
    this.t += dt;
    this.model?.update(dt);
    if (this.model) this.model.root.rotation.y = Math.sin(this.t * 0.5) * 0.25;
    this.ring.rotation.z += dt * 0.4;
    const portrait = this.camera.aspect < 1;
    const side = this.layout === 'side' && !portrait;
    const sx = side ? 0.15 : 0; // キャラ画面では左の情報パネルと右のカード一覧の間に立たせる
    const look = new THREE.Vector3(sx, portrait ? 1.0 : 1.35, 0);
    this.camera.position.set(sx * 0.6, portrait ? 1.7 : 1.9, portrait ? 9.5 : 6.8);
    this.camera.lookAt(look);
  }
}
let stage: Stage3D;

// ---------- 共通: 通貨表示・トースト・ポップアップ ----------
function toast(text: string) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
  clearTimeout((toast as unknown as { timer: number }).timer);
  (toast as unknown as { timer: number }).timer = window.setTimeout(() => { t.hidden = true; }, 2200);
}

function rewardLine(r: Reward): HTMLElement {
  const row = el('div', 'reward');
  const add = (icon: IconName, text: string, cls: string) => { const s = el('span', `rw ${cls}`); s.innerHTML = iconSvg(icon); s.append(el('b', '', text)); row.append(s); };
  if (r.coins) add('coin', `+${r.coins}`, 'coin');
  if (r.gems) add('gem', `+${r.gems}`, 'gem');
  if (r.hero) { const s = el('span', 'rw hero'); const img = el('img'); img.src = portraitOf(r.hero); s.append(img, el('b', '', `${heroById(r.hero).name} 加入！`)); row.append(s); }
  if (r.shards) add('upgrade', `${heroById(r.shards.hero).name}のかけら +${r.shards.n}`, 'shard');
  return row;
}

let popupDone: (() => void) | null = null;
function popup(title: string, body: HTMLElement | string, okText = 'OK'): Promise<void> {
  $('pop-title').textContent = title;
  const b = $('pop-body'); b.innerHTML = '';
  if (typeof body === 'string') b.append(el('p', '', body)); else b.append(body);
  $('pop-ok').textContent = okText;
  $('popup').hidden = false;
  return new Promise((res) => { popupDone = res; });
}
$('pop-ok').addEventListener('click', () => { sfx.ui(); $('popup').hidden = true; popupDone?.(); popupDone = null; });

/** サーバー/ブラウザに操作を送る。失敗したらトーストで知らせる */
async function act(a: Action): Promise<ActionResult | null> {
  try { const r = await backend.act(a); refreshHome(); return r; } catch (e) {
    toast(e instanceof GameError ? e.message : '通信に失敗しました。時間をおいてもう一度お試しください');
    return null;
  }
}

// ---------- ホーム ----------
function badgeCounts() {
  const p = P();
  const missions = p.daily.missions.filter((m) => !m.claimed && m.progress >= MISSIONS[m.id].goal).length;
  const road = ROAD.filter((r, i) => p.bestTrophies >= r.at && !p.road.includes(i)).length;
  const upgrades = Object.entries(p.heroes).filter(([, h]) => h.level < MAX_LEVEL && p.coins >= UPGRADE_COINS[h.level] && h.shards >= UPGRADE_SHARDS[h.level]).length;
  const gacha = p.gems >= GACHA_COST.single ? 1 : 0;
  return { missions, road, upgrades, gacha };
}
function setBadge(id: string, n: number, text?: string) {
  const b = $(id).querySelector('.badge') as HTMLElement;
  b.hidden = n <= 0; b.textContent = text ?? String(n);
}

function refreshHome() {
  const p = P();
  $('h-name').textContent = p.name;
  $('h-trophies').textContent = String(p.trophies);
  $('h-coins').textContent = p.coins.toLocaleString();
  $('h-gems').textContent = p.gems.toLocaleString();
  const h = heroById(p.selected);
  $('h-hero').textContent = h.name; $('h-role').textContent = h.role;
  $('h-level').textContent = `Lv.${p.heroes[p.selected]?.level ?? 1}`;
  const c = badgeCounts();
  setBadge('nav-missions', c.missions); setBadge('nav-road', c.road); setBadge('nav-heroes', c.upgrades, '!'); setBadge('nav-gacha', c.gacha, '!');
  $('nav-ranking').hidden = backend.kind !== 'server';
  $('save-note').textContent = backend.kind === 'server' ? '' : 'オフライン版：データはこのブラウザに保存されます';
}

function buildModes() {
  const box = $('modes');
  MODES.forEach((m, i) => {
    const b = el('button', '', m.name);
    b.addEventListener('click', () => { mode = i; sfx.ui(); refreshMode(); });
    box.append(b);
  });
  refreshMode();
}
function refreshMode() {
  [...$('modes').children].forEach((b, i) => b.classList.toggle('on', i === mode));
  $('mode-desc').textContent = MODES[mode].desc;
}

async function goHome() {
  match?.dispose(); match = null;
  stage.layout = 'home';
  show('home');
  refreshHome();
  await stage.display(heroById(P().selected));
}

// ---------- キャラ一覧・強化 ----------
const RARITY_LABEL = { R: 'R', SR: 'SR', SSR: 'SSR' } as const;

function buildCards() {
  const box = $('cards'); box.innerHTML = '';
  const order = [...HEROES].sort((a, b) => Number(!P().heroes[a.id]) - Number(!P().heroes[b.id]) || 'R SR SSR'.indexOf(rarityOf(b.id)) - 'R SR SSR'.indexOf(rarityOf(a.id)));
  for (const h of order) {
    const st = P().heroes[h.id];
    const c = el('button', `card r-${rarityOf(h.id)}${st ? '' : ' locked'}${h.id === viewing ? ' on' : ''}`);
    c.style.setProperty('--hc', hexColor(h.color));
    const img = el('img'); img.src = portraitOf(h); img.alt = '';
    c.append(img, el('em', 'rar', RARITY_LABEL[rarityOf(h.id)]), el('b', '', h.name), el('span', '', st ? `Lv.${st.level}` : '未所持'));
    if (h.id === P().selected) c.append(el('i', 'using', '使用中'));
    c.addEventListener('click', () => { sfx.ui(); viewHero(h.id); });
    box.append(c);
  }
}

function viewHero(id: string) {
  viewing = id;
  const h = heroById(id), st = P().heroes[id];
  const lvl = st?.level ?? 1, mul = levelMul(lvl);
  void stage.display(h);
  ($('i-img') as HTMLImageElement).src = portraitOf(h);
  $('i-role').textContent = `${RARITY_LABEL[rarityOf(id)]}・${h.role}`;
  $('i-role').style.background = hexColor(h.color);
  $('i-name').textContent = h.name;
  $('i-level').textContent = st ? `Lv.${lvl}${lvl >= MAX_LEVEL ? '（最大）' : ''}　かけら ${st.shards}` : '未所持';
  $('i-blurb').textContent = h.blurb;
  const stats: [string, number, string][] = [
    ['体力', h.hp * mul / 1700, String(Math.round(h.hp * 1.25 * mul))],
    ['攻撃', (h.atk * mul / h.interval) / 160, String(Math.round(h.atk * mul))],
    ['速度', h.speed / 8.4, h.speed.toFixed(1)],
    ['射程', h.range / 14, h.range.toFixed(1)],
  ];
  $('i-stats').innerHTML = '';
  for (const [label, val, num] of stats) {
    const row = el('div', 'stat');
    row.innerHTML = '<span></span><div><i></i></div><b></b>';
    row.querySelector('span')!.textContent = label;
    row.querySelector('b')!.textContent = num;
    (row.querySelector('i') as HTMLElement).style.width = `${Math.min(1, val) * 100}%`;
    $('i-stats').append(row);
  }
  $('i-skills').innerHTML = '';
  const ultSel = P().ults[id] ?? 0;
  const rows = [['スキル1', h.skills[0], -1], ['スキル2', h.skills[1], -1], ['必殺技A', h.ults[0], 0], ['必殺技B', h.ults[1], 1]] as const;
  for (const [tag, s, ult] of rows) {
    const row = el('div', `sk${ult >= 0 ? ' ult' : ''}${ult === ultSel ? ' on' : ''}`);
    row.innerHTML = `<i>${iconSvg(s.icon)}</i><em></em><b></b><span></span>`;
    row.querySelector('em')!.textContent = tag;
    row.querySelector('b')!.textContent = s.name;
    row.querySelector('span')!.textContent = s.desc + (s.cd ? `（CT ${s.cd}秒）` : '');
    if (ult >= 0 && st) row.addEventListener('click', async () => { sfx.ui(); await act({ type: 'setUlt', hero: id, ult: ult as 0 | 1 }); viewHero(id); });
    $('i-skills').append(row);
  }
  const acts = $('i-actions'); acts.innerHTML = '';
  if (st) {
    if (lvl < MAX_LEVEL) {
      const c = UPGRADE_COINS[lvl], sh = UPGRADE_SHARDS[lvl];
      const can = P().coins >= c && st.shards >= sh;
      const up = el('button', `upbtn${can ? ' can' : ''}`);
      up.innerHTML = `<b>強化 Lv.${lvl}→${lvl + 1}</b><span>${iconSvg('coin')}${c.toLocaleString()}　${iconSvg('upgrade')}${sh}</span>`;
      up.addEventListener('click', async () => {
        sfx.ui();
        if (await act({ type: 'upgrade', hero: id })) { sfx.capture(); stage.cheer(); toast(`${h.name} が Lv.${lvl + 1} になった！`); viewHero(id); }
      });
      acts.append(up);
    }
    const use = el('button', 'primary', id === P().selected ? '使用中' : 'このキャラを使う');
    use.toggleAttribute('disabled', id === P().selected);
    use.addEventListener('click', async () => { sfx.ui(); if (await act({ type: 'select', hero: id })) { stage.cheer(); viewHero(id); } });
    acts.append(use);
  } else {
    const road = ROAD.find((r) => r.reward.hero === id);
    acts.append(el('p', 'locked-note', road ? `ガチャ、またはトロフィーロード（${road.at}）で手に入ります` : 'ガチャで手に入ります'));
  }
  buildCards();
}

function openHeroes() {
  stage.layout = 'side';
  show('heroes');
  viewHero(viewing && heroById(viewing) ? viewing : P().selected);
}

// ---------- ガチャ ----------
const ITEM_IMG: Record<string, string> = { shardS: 'shard-s', shardM: 'shard-m', shardL: 'shard-l', coinS: '', coinL: '' };
const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;

function openGacha() {
  stage.release();
  show('gacha');
  // 目玉: 中身の種類（かけら・コイン）と、たまに出るキャラ
  const f = $('g-feature'); f.innerHTML = '';
  const unowned = HEROES.filter((h) => !P().heroes[h.id]);
  for (const h of (unowned.length ? unowned : HEROES).filter((x) => rarityOf(x.id) !== 'R').slice(0, 3)) {
    const c = el('div', 'gfeat'); c.style.setProperty('--hc', hexColor(h.color));
    const img = el('img'); img.src = portraitOf(h);
    c.append(img, el('b', '', h.name), el('em', '', rarityOf(h.id)));
    f.append(c);
  }
  const items = el('div', 'gitems');
  for (const [cls, label] of [['shard-l', 'かけら大'], ['shard-m', 'かけら中'], ['shard-s', 'かけら小']] as const) {
    const it = el('div', 'gitem'); const g = el('i', `gemi ${cls}`); it.append(g, el('span', '', label)); items.append(it);
  }
  const coin = el('div', 'gitem'); const ci = el('i', 'coini'); ci.innerHTML = iconSvg('coin'); coin.append(ci, el('span', '', 'コイン')); items.append(coin);
  f.append(items);
  const t = GACHA_TABLE;
  $('g-rates-text').textContent = `提供割合　キャラ ${pct(t[0].rate)}（SSR ${pct(t[0].rate * GACHA_HERO_RATES.SSR)}・SR ${pct(t[0].rate * GACHA_HERO_RATES.SR)}・R ${pct(t[0].rate * GACHA_HERO_RATES.R)}）／ `
    + t.slice(1).map((x) => `${x.label} ${pct(x.rate)}`).join('・') + '　／　10回なら「かけら大」以上を1つ確定';
  refreshGacha();
}
function refreshGacha() {
  $('g-pity').textContent = `あと ${PITY - P().pity} 回でキャラ確定`;
  $('g-1').toggleAttribute('disabled', P().gems < GACHA_COST.single);
  $('g-10').toggleAttribute('disabled', P().gems < GACHA_COST.ten);
}
async function pull(count: 1 | 10) {
  sfx.ui();
  const r = await act({ type: 'gacha', count });
  if (!r || r.type !== 'gacha') return;
  const box = $('gr-cards'); box.innerHTML = '';
  box.classList.toggle('ten', count === 10);
  r.pulls.forEach((p, i) => {
    let c: HTMLElement;
    if (p.kind === 'hero') {
      const h = heroById(p.hero);
      c = el('div', `gcard r-${p.rarity}`);
      c.style.setProperty('--hc', hexColor(h.color));
      const img = el('img'); img.src = portraitOf(h);
      c.append(img, el('em', 'rar', p.rarity), el('b', '', h.name), el('span', p.isNew ? 'new' : 'dup', p.isNew ? 'NEW!' : `かけら+${p.shards}`));
    } else {
      c = el('div', `gcard item k-${p.kind}`);
      const pic = el('div', 'itemimg');
      if (ITEM_IMG[p.kind]) pic.style.backgroundImage = `var(--img-${ITEM_IMG[p.kind]})`; else { pic.classList.add('coinpic'); pic.innerHTML = iconSvg('coin'); }
      c.append(pic);
      if ('hero' in p) { const face = el('img', 'face'); face.src = portraitOf(p.hero); c.append(face); }
      c.append(el('div', 'amt', `${p.kind.startsWith('coin') ? 'コイン' : 'かけら'} +${p.n}`), el('span', 'dup', 'hero' in p ? heroById(p.hero).name : GACHA_TABLE.find((x) => x.kind === p.kind)!.label));
    }
    c.style.animationDelay = `${i * 0.12}s`;
    box.append(c);
  });
  $('gacha-result').hidden = false;
  const got = r.pulls.find((p) => p.kind === 'hero');
  setTimeout(() => (got ? sfx.win() : r.pulls.some((p) => p.kind === 'shardL') ? sfx.capture() : sfx.ui()), 200);
  refreshGacha();
}
$('g-1').addEventListener('click', () => pull(1));
$('g-10').addEventListener('click', () => pull(10));
$('gr-ok').addEventListener('click', () => { sfx.ui(); $('gacha-result').hidden = true; });

// ---------- ミッション・ログボ ----------
function openMissions() {
  stage.release();
  show('missions');
  const p = P();
  const login = $('m-login'); login.innerHTML = '';
  // 今の7日周期で受け取った日数（今日受け取った後なら 1〜7、まだなら 0〜6）
  const N = LOGIN_REWARDS.length, today = !canLoginToday(p, Date.now());
  const got = today ? ((p.login.count - 1) % N) + 1 : p.login.count % N;
  LOGIN_REWARDS.forEach((r, i) => {
    const d = el('div', `lday${i < got ? ' done' : ''}${!today && i === got ? ' next' : ''}`);
    d.append(el('small', '', `${i + 1}日目`));
    const ic = el('i', r.gems ? 'gemi gem' : ''); if (!r.gems) ic.innerHTML = iconSvg('coin'); d.append(ic, el('b', '', String(r.gems ?? r.coins)));
    login.append(d);
  });
  const list = $('m-list'); list.innerHTML = '';
  p.daily.missions.forEach((m, i) => {
    const def = MISSIONS[m.id];
    const row = el('div', `mission${m.claimed ? ' claimed' : ''}`);
    const bar = el('div', 'mbar'); const fill = el('i'); fill.style.width = `${(m.progress / def.goal) * 100}%`; bar.append(fill);
    const info = el('div', 'minfo'); info.append(el('b', '', def.label), bar, el('small', '', `${m.progress} / ${def.goal}`));
    const btn = el('button', 'claim', m.claimed ? '受取済み' : m.progress >= def.goal ? '受け取る' : '進行中');
    btn.toggleAttribute('disabled', m.claimed || m.progress < def.goal);
    btn.addEventListener('click', async () => {
      sfx.ui();
      const r = await act({ type: 'claimMission', index: i });
      if (r?.type === 'reward') { sfx.capture(); toast('ミッション報酬を受け取った！'); openMissions(); }
    });
    row.append(rewardLine(def.reward), info, btn);
    list.append(row);
  });
}

// ---------- トロフィーロード ----------
function openRoad() {
  stage.release();
  show('road');
  const p = P();
  $('r-best').textContent = `最高 ${p.bestTrophies}`;
  const list = $('road-list'); list.innerHTML = '';
  ROAD.forEach((r, i) => {
    const reached = p.bestTrophies >= r.at, claimed = p.road.includes(i);
    const row = el('div', `rstep${reached ? ' reached' : ''}${claimed ? ' claimed' : ''}`);
    const at = el('div', 'rat'); at.innerHTML = iconSvg('trophy'); at.append(el('b', '', String(r.at)));
    const btn = el('button', 'claim', claimed ? '受取済み' : reached ? '受け取る' : `あと ${r.at - p.bestTrophies}`);
    btn.toggleAttribute('disabled', claimed || !reached);
    btn.addEventListener('click', async () => {
      sfx.ui();
      const res = await act({ type: 'claimRoad', index: i });
      if (res?.type === 'reward') { sfx.capture(); await popup('報酬を受け取った！', rewardLine(res.reward)); openRoad(); }
    });
    row.append(at, rewardLine(r.reward), btn);
    list.append(row);
  });
  const next = list.querySelector('.rstep:not(.claimed)');
  next?.scrollIntoView({ block: 'center' });
}

// ---------- ランキング ----------
async function openRanking() {
  stage.release();
  show('ranking');
  const ol = $('rank-list'); ol.innerHTML = '';
  ol.append(el('li', 'loading', '読み込み中…'));
  try {
    const list = (await backend.ranking?.()) ?? [];
    ol.innerHTML = '';
    list.forEach((r, i) => { const li = el('li', r.me ? 'me' : ''); li.append(el('em', '', String(i + 1)), el('b', '', r.name), el('span', '', `${r.trophies}`)); ol.append(li); });
    if (!list.length) ol.append(el('li', 'loading', 'まだ誰もいません'));
  } catch { ol.innerHTML = ''; ol.append(el('li', 'loading', '読み込めませんでした')); }
}

// ---------- 名前変更 ----------
$('me-name-btn').addEventListener('click', async () => {
  sfx.ui();
  const box = el('div', 'rename');
  const inp = el('input'); inp.id = 'rename-input'; inp.maxLength = 12; inp.value = P().name;
  box.append(el('label', '', 'プレイヤー名（12文字まで）'), inp);
  setTimeout(() => inp.focus(), 50);
  await popup('名前を変える', box, '決定');
  if (inp.value.trim() && inp.value.trim() !== P().name) await act({ type: 'rename', name: inp.value });
});

// ---------- バトル ----------
async function startMatch() {
  initAudio();
  const p = P();
  const me = heroById(p.selected);
  const others = HEROES.filter((h) => h !== me).sort(() => Math.random() - 0.5);
  const teams: [HeroDef[], HeroDef[]] = [[me, others[0], others[1]], [others[2], others[3], others[4]]];
  // 相手の強さはトロフィーで決まる（味方の AI も同じ強さ）
  const tier = enemyTier(p.trophies);
  const aiMul = levelMul(tier.level);
  const muls: [number[], number[]] = [[levelMul(p.heroes[me.id]?.level ?? 1), aiMul, aiMul], [aiMul, aiMul, aiMul]];
  stage.release();
  show('loading');
  $('loadtext').textContent = 'バトルの準備中…';
  $('loadfill').style.width = '0%';
  try {
    await ensureHeroes([...teams[0], ...teams[1]], (k) => { $('loadfill').style.width = `${k * 100}%`; });
  } catch {
    toast('キャラの読み込みに失敗しました'); void goHome(); return;
  }
  match?.dispose();
  input.reset();
  match = new Match({ mode: MODES[mode], difficulty: { name: '', enemyMul: 1, skillDelay: tier.skillDelay }, ult: p.ults[me.id] ?? 0, teams, muls }, input, hud, showResult);
  resize();
  show(null);
}

async function showResult(r: MatchResult) {
  const t = $('r-title');
  t.textContent = r.winner === 0 ? 'VICTORY' : r.winner === 1 ? 'DEFEAT' : 'DRAW';
  t.className = r.winner === 0 ? 'blue' : r.winner === 1 ? 'red' : '';
  $('r-score').innerHTML = `<b class="blue">${r.scores[0]}</b><span></span><b class="red">${r.scores[1]}</b>`;
  $('r-score').querySelector('span')!.textContent = r.unit;
  const table = $('r-table');
  table.innerHTML = '<tr><th></th><th>KO</th><th>DOWN</th></tr>';
  for (const u of r.units) {
    const tr = el('tr', `${u.team === 0 ? 'blue' : 'red'}${u.isPlayer ? ' me' : ''}`);
    const first = el('td');
    const pic = el('img'); pic.src = portraitOf(u.def); pic.alt = '';
    first.append(pic, document.createTextNode(u.name));
    tr.append(first);
    for (const text of [String(u.kills), String(u.deaths)]) tr.append(el('td', '', text));
    table.append(tr);
  }
  const box = $('r-rewards'); box.innerHTML = '';
  box.append(el('p', 'loading', '報酬を計算中…'));
  show('result');
  const res = await act({ type: 'match', hero: r.player.hero, outcome: r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : 'draw', kos: r.player.kos, ults: r.player.ults, captures: r.player.captures });
  box.innerHTML = '';
  if (res?.type === 'match') {
    const w = res.rewards;
    const row = el('div', 'reward big');
    const tr = el('span', `rw trophy${w.trophies < 0 ? ' minus' : ''}`); tr.innerHTML = iconSvg('trophy'); tr.append(el('b', '', `${w.trophies >= 0 ? '+' : ''}${w.trophies}`));
    const co = el('span', 'rw coin'); co.innerHTML = iconSvg('coin'); co.append(el('b', '', `+${w.coins}`));
    row.append(tr, co); box.append(row);
    for (const m of w.missionsDone) box.append(el('p', 'mdone', `ミッション達成：${m}`));
  }
}

$('btn-battle').addEventListener('click', () => { sfx.ui(); void startMatch(); });
$('btn-again').addEventListener('click', () => { sfx.ui(); void startMatch(); });
$('btn-home').addEventListener('click', () => { sfx.ui(); void goHome(); });
$('nav-heroes').addEventListener('click', () => { sfx.ui(); openHeroes(); });
$('nav-gacha').addEventListener('click', () => { sfx.ui(); openGacha(); });
$('nav-missions').addEventListener('click', () => { sfx.ui(); openMissions(); });
$('nav-road').addEventListener('click', () => { sfx.ui(); openRoad(); });
$('nav-ranking').addEventListener('click', () => { sfx.ui(); void openRanking(); });
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { sfx.ui(); void goHome(); });
canvas.addEventListener('click', () => { if (!match) stage.cheer(); });
addEventListener('pointerdown', () => initAudio(), { once: true });

// ---------- 描画ループ ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxRatio) * resScale);
  renderer.setSize(w, h, false);
  for (const cam of [stage?.camera, match?.camera]) if (cam) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
  hud.resize(w, h);
}
addEventListener('resize', resize);

/** 解像度の自動調整: 重いときは描画解像度を少し下げ、余裕があれば戻す */
const maxRatio = 2;
let resScale = 1, slowT = 0, fastT = 0;
function adaptResolution(dt: number) {
  if (dt > 1 / 45) { slowT += dt; fastT = 0; } else if (dt < 1 / 58) { fastT += dt; slowT = 0; } else { slowT = fastT = 0; }
  const floor = 0.6 / Math.min(devicePixelRatio, maxRatio) > 0.5 ? 0.75 : 0.6;
  if (slowT > 1 && resScale > floor) { resScale = Math.max(floor, resScale - 0.1); slowT = 0; resize(); }
  else if (fastT > 3 && resScale < 1) { resScale = Math.min(1, resScale + 0.1); fastT = 0; resize(); }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (match) { match.update(dt); renderer.render(match.scene, match.camera); adaptResolution(dt); }
  else if (stage) { stage.update(dt); renderer.render(stage.scene, stage.camera); }
  requestAnimationFrame(frame);
}

// ---------- 起動 ----------
async function boot() {
  await loadAssets((k) => { $('loadfill').style.width = `${k * 30}%`; });
  // 開発用: ?portraits で全員の顔アイコンを書き出す（scripts/render-portraits.cjs）
  if (location.search.includes('portraits')) {
    (window as unknown as Record<string, unknown>).__portraits = await capturePortraits(renderer, HEROES);
    return;
  }
  $('loadtext').textContent = 'データを読み込み中…';
  backend = await openBackend();
  stage = new Stage3D();
  buildModes();
  resize();
  requestAnimationFrame(frame);
  $('loadtext').textContent = 'キャラを読み込み中…';
  await stage.display(heroById(P().selected));
  $('loadfill').style.width = '100%';
  await goHome();
  // ログインボーナス
  if (canLoginToday(P(), Date.now())) {
    const r = await act({ type: 'login' });
    if (r?.type === 'login' && r.reward) await popup(`ログインボーナス ${r.day}日目`, rewardLine(r.reward));
  }
}
boot().catch((e) => { $('loadtext').textContent = `読み込みに失敗しました: ${e?.message ?? e}`; });

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('loadtext').textContent = '描画がリセットされました。ページを再読み込みしてください。'; show('loading'); });

// デバッグ・自動テスト用
(window as unknown as Record<string, unknown>).__game = {
  renderer, get match() { return match; }, get backend() { return backend; }, startMatch, HEROES,
  setMode(i: number) { mode = i; refreshMode(); },
};
