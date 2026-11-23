// 画面のUI(HTML)。枠・ボタン・ゲージはすべて Tiny Swords のUI素材。
import { PRESETS } from '../ai/mind';
import type { Controller, WelcomeInfo } from '../controller';
import { formatDuration } from '../controller';
import { ACTION_INFO, BUILDINGS, RES_NAMES, ROLE_INFO, UPGRADES, UPGRADE_ORDER, upgradeCost } from '../sim/config';
import type { ResKind, SimEvent, Villager } from '../sim/types';
import { avatar, buildingImg, icon, resIcon } from './skin';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString());
const ROLE_LABEL = { pawn: '村人', child: '子ども', warrior: '戦士', archer: '弓使い', monk: '僧侶' } as const;

export function avatarOf(v: Villager) {
  if (v.role === 'warrior') return avatar(1);
  if (v.role === 'archer') return avatar(2);
  if (v.role === 'monk') return avatar(3);
  return avatar(v.female ? 5 : 4);
}

export function describe(v: Villager, vs: Villager[]): string {
  if (v.knockedOut > 0) return '気絶している…';
  const t = v.task;
  if (!t) return 'ひと休み';
  const go = t.phase === 'go';
  switch (t.type) {
    case 'chop':
      return go ? '木を切りに向かっている' : '木を切っている';
    case 'harvest':
      return go ? '羊のところへ向かっている' : '羊を獲っている';
    case 'mine':
      return go ? '金鉱へ向かっている' : '金を掘っている';
    case 'build':
      return go ? '建設現場へ向かっている' : '建物を建てている';
    case 'repair':
      return '壊れた建物を直している';
    case 'deliver':
      return v.carrying ? `${RES_NAMES[v.carrying]}を運んでいる` : '倉へ向かっている';
    case 'eat':
      return 'ごはんを食べている';
    case 'sleep':
      return v.hidden ? '眠っている' : '家に帰るところ';
    case 'hide':
      return v.hidden ? '建物に隠れている' : '建物へ逃げている';
    case 'chat': {
      const p = vs.find((x) => x !== v && x.task?.type === 'chat' && x.task.targetId === t.targetId);
      return p ? `${p.name}と話している` : '話し相手を待っている';
    }
    case 'pray':
      return '祈っている';
    case 'festival':
      return '人の集まりにいる';
    case 'guard':
      return t.targetId === -2 ? '島のはずれを探検している' : '見張っている';
    case 'fight':
      return '盗賊と戦っている!';
    case 'heal':
      return 'けが人を手当てしている';
    case 'play':
      return '遊んでいる';
    default:
      return 'ぶらぶら歩いている';
  }
}

export class UI {
  ctl: Controller;
  private modalKind: string | null = null;
  private modalArg: number | string | null = null;
  private tab = '';
  private lastRes: Record<string, number> = {};
  private chronSeen = 0;
  private feedOpen = window.innerWidth > 720;

  constructor(ctl: Controller) {
    this.ctl = ctl;
  }

  ready() {
    $('#loading').classList.add('done');
    setTimeout(() => document.getElementById('loading')?.remove(), 800);
    $('#hud').hidden = false;
    this.bind();
    $('#feed').classList.toggle('collapsed', !this.feedOpen);
    this.refreshAll();
  }

  private bind() {
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        this.ctl.audio.play('click', 0.5);
        this.openModal(b.dataset.open!);
      }),
    );
    $('#modal-close').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) this.closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    $('#btn-speed').addEventListener('click', () => {
      const order = [1, 2, 4];
      this.ctl.setSpeed(order[(order.indexOf(this.ctl.speed) + 1) % order.length]);
      this.ctl.audio.play('click', 0.5);
    });
    $('#btn-sound').addEventListener('click', () => {
      this.ctl.audio.settings.muted = !this.ctl.audio.settings.muted;
      this.ctl.audio.save();
      this.update();
    });
    $('#feed-head').addEventListener('click', () => {
      this.feedOpen = !this.feedOpen;
      $('#feed').classList.toggle('collapsed', !this.feedOpen);
    });
    $('#vc-close').addEventListener('click', () => this.ctl.scene?.select(null));
    $('#vc-follow').addEventListener('click', () => {
      const sc = this.ctl.scene;
      if (!sc || sc.selectedId === null) return;
      sc.following = !sc.following;
      this.update();
    });
    $('#vc-more').addEventListener('click', () => {
      const id = this.ctl.scene?.selectedId;
      if (id != null) this.openModal('person', id);
    });
    $('#btn-depart').addEventListener('click', () => this.openModal('depart'));
    $('#zoom-in').addEventListener('click', () => this.ctl.scene?.setZoom(this.ctl.scene.cameras.main.zoom * 1.25));
    $('#zoom-out').addEventListener('click', () => this.ctl.scene?.setZoom(this.ctl.scene.cameras.main.zoom / 1.25));
  }

  refreshAll() {
    this.lastRes = {};
    $('#feed-body').innerHTML = '';
    this.chronSeen = Math.max(0, this.ctl.sim.s.chronicle.length - 4);
    this.update();
    this.updateMindStatus();
    if (this.modalKind) this.render();
  }

  // ───────────── 毎回の更新 ─────────────
  update() {
    const sim = this.ctl.sim;
    const s = sim.s;
    $('#island-name').textContent = s.islandName;
    $('#time-label').textContent = `${sim.timeLabel}${sim.isNight ? '・夜' : ''}`;
    $('#era-label').textContent = `「${s.era}」`;
    for (const k of ['wood', 'meat', 'gold'] as ResKind[]) {
      const el = $(`#r-${k}`);
      const v = Math.floor(s.res[k]);
      if (this.lastRes[k] !== undefined && v > this.lastRes[k]) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      this.lastRes[k] = v;
      el.textContent = fmt(v);
    }
    $('#r-pop').textContent = `${sim.population}/${sim.capacity}`;
    $('#r-points').textContent = fmt(s.points);
    $('#btn-speed').textContent = `×${this.ctl.speed}`;
    ($('#btn-sound img') as HTMLImageElement).style.opacity = this.ctl.audio.settings.muted ? '0.35' : '';
    $('#btn-depart').hidden = !s.departed;
    $('#btn-upgrades').classList.toggle('glow', UPGRADE_ORDER.some((k) => s.points >= upgradeCost(k, s.upgrades[k])));
    $('#raid-indicator').hidden = !sim.raidActive;
    // 歴史書の新しい行を「村のようす」へ
    if (s.chronicle.length < this.chronSeen) this.chronSeen = 0;
    for (const c of s.chronicle.slice(this.chronSeen)) this.pushFeed(`<span class="ev k-${c.kind}">${esc(c.text)}</span>`);
    this.chronSeen = s.chronicle.length;
    this.updateVillagerCard();
    if (this.modalKind === 'upgrades') this.renderUpgrades(true);
    if (this.modalKind === 'villagers') this.renderVillagers(true);
    if (this.modalKind === 'person') this.renderPerson(true);
  }

  private pushFeed(html: string) {
    const ul = $('#feed-body');
    const li = document.createElement('li');
    li.innerHTML = html;
    ul.appendChild(li);
    while (ul.children.length > 40) ul.firstElementChild!.remove();
    ul.scrollTop = ul.scrollHeight;
  }

  updateMindStatus() {
    const m = this.ctl.mind;
    const dot = document.getElementById('mind-dot');
    if (dot) dot.className = `mind-dot ${m.busy ? 'busy' : m.ready ? (m.logs[0] && !m.logs[0].ok ? 'err' : 'on') : ''}`;
    const st = document.getElementById('mind-status');
    if (st) st.textContent = this.ctl.sandboxed && !m.ready ? 'このページではAIに接続できません(本能と習慣で暮らしています)' : m.status;
    if (this.modalKind === 'settings' && this.tab === 'ai') {
      const l = document.getElementById('mind-logs');
      if (l) l.innerHTML = this.logsHtml();
    }
  }

  // ───────────── 村人カード ─────────────
  showVillager(id: number | null) {
    $('#villager-card').hidden = id === null;
    if (id !== null) this.ctl.audio.play('pop', 0.4);
    this.updateVillagerCard();
  }

  private updateVillagerCard() {
    const sc = this.ctl.scene;
    const card = $('#villager-card');
    const v = sc && sc.selectedId !== null ? this.ctl.sim.s.villagers.find((x) => x.id === sc.selectedId) : undefined;
    if (!sc || !v) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $('#vc-avatar').setAttribute('src', avatarOf(v));
    $('#vc-name').textContent = v.name;
    const partner = this.ctl.sim.s.villagers.find((x) => x.id === v.partnerId);
    $('#vc-meta').textContent = `${Math.floor(v.age * 10)}歳・${v.female ? '女' : '男'}・${ROLE_LABEL[v.role]}${partner ? `・${partner.name}と連れ添う` : ''}`;
    $('#vc-personality').textContent = v.personality || '(どんな人か、まだわからない)';
    $('#vc-thought').textContent = v.thinking ? '考え中…' : v.intention?.source === 'ai' ? v.intention.thought : '';
    $('#vc-doing').textContent = describe(v, this.ctl.sim.s.villagers);
    const bar = (label: string, val: number, cls: string) => `<span>${label}</span><div class="ts-bar ${cls}"><i style="width:${Math.round(val * 100)}%"></i></div>`;
    $('#vc-bars').innerHTML = bar('満腹', 1 - v.hunger, 'orange') + bar('元気', v.energy, 'green') + bar('人恋しさ', v.loneliness, 'blue');
    $('#vc-follow').textContent = sc.following ? '追いかけ中' : '追いかける';
    $('#vc-follow').classList.toggle('on', sc.following);
  }

  // ───────────── 通知 ─────────────
  toast(html: string, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = html;
    $('#toasts').prepend(t);
    while ($('#toasts').children.length > 3) $('#toasts').lastElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 5200);
    setTimeout(() => t.remove(), 6000);
  }

  banner(text: string, color = 'yellow') {
    const b = document.createElement('div');
    b.className = 'banner-pop';
    b.innerHTML = `<div class="ribbon ribbon-${color} big"><span>${esc(text)}</span></div>`;
    $('#hud').appendChild(b);
    setTimeout(() => b.remove(), 3800);
  }

  onSimEvent(e: SimEvent) {
    const s = this.ctl.sim.s;
    switch (e.type) {
      case 'talkLine': {
        const c = s.conversations.find((x) => x.id === e.convId);
        const l = c?.lines[c.played - 1];
        if (l) this.pushFeed(`<span class="who">${esc(l.speaker)}</span>「${esc(l.text)}」`);
        break;
      }
      case 'built': {
        const b = s.buildings.find((x) => x.id === e.id);
        if (b) this.toast(`<img src="${buildingImg(b.kind, b.variant)}" class="ti">「${esc(b.name)}」が完成した`);
        break;
      }
      case 'birth': {
        const v = s.villagers.find((x) => x.id === e.id);
        if (v) this.toast(`<img src="${avatarOf(v)}" class="ti face">${esc(v.parents.join('と'))}に子どもが生まれた`);
        break;
      }
      case 'raidStart':
        this.banner('盗賊団が上陸した!', 'red');
        break;
      case 'raidEnd':
        this.toast(`<img src="${icon(6)}" class="ti">盗賊団は去っていった`);
        break;
      case 'season':
        this.banner(this.ctl.sim.timeLabel, 'blue');
        break;
      case 'culture':
        if (this.modalKind === 'history') this.render();
        break;
    }
  }

  showWelcome(w: WelcomeInfo) {
    const res = (['wood', 'meat', 'gold'] as ResKind[]).map((k) => `<span class="chip"><img src="${resIcon(k)}">+${fmt(Math.max(0, w.gained[k]))}</span>`).join('');
    const entries = w.entries.slice(-8).map((t) => `<li>${esc(t)}</li>`).join('');
    this.openModal(
      'custom',
      null,
      'おかえりなさい',
      `<p class="lead">留守のあいだ(${formatDuration(w.away)})も、村人たちは本能と習慣で暮らしていました。</p>
      <div class="chips">${res}<span class="chip">✦ +${fmt(w.points)}</span></div>
      ${entries ? `<h3>そのあいだの出来事</h3><ul class="list chron">${entries}</ul>` : ''}
      <div class="actions"><button class="btn blue" id="welcome-ok">村を見る</button></div>`,
    );
    $('#welcome-ok').addEventListener('click', () => this.closeModal());
  }

  // ───────────── モーダル ─────────────
  openModal(kind: string, arg: number | string | null = null, title?: string, html?: string) {
    this.modalKind = kind;
    this.modalArg = arg;
    const tabs: Record<string, string[]> = { history: ['events', 'talks', 'village'], settings: ['ai', 'sound', 'data'] };
    this.tab = tabs[kind]?.[0] ?? '';
    $('#modal').hidden = false;
    const titles: Record<string, string> = { upgrades: '天の恵み', history: '村の記録', villagers: '村人たち', settings: '設定', depart: '旅立ち', setup: '村人に心を' };
    $('#modal-title').textContent = title ?? titles[kind] ?? '';
    if (html !== undefined) {
      $('#modal-tabs').innerHTML = '';
      $('#modal-body').innerHTML = html;
    } else this.render();
  }

  closeModal() {
    this.modalKind = null;
    $('#modal').hidden = true;
  }

  private renderTabs(list: [string, string][]) {
    $('#modal-tabs').innerHTML = list.map(([k, n]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('');
    $('#modal-tabs')
      .querySelectorAll<HTMLElement>('[data-tab]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          this.tab = b.dataset.tab!;
          this.ctl.audio.play('click', 0.4);
          this.render();
        }),
      );
  }

  private render() {
    $('#modal-tabs').innerHTML = '';
    switch (this.modalKind) {
      case 'upgrades':
        return this.renderUpgrades();
      case 'history':
        return this.renderHistory();
      case 'villagers':
        return this.renderVillagers();
      case 'person':
        return this.renderPerson();
      case 'settings':
        return this.renderSettings();
      case 'depart':
        return this.renderDepart();
      case 'setup':
        return this.renderSetup();
    }
  }

  private renderUpgrades(partial = false) {
    const s = this.ctl.sim.s;
    const icons: Record<string, string> = { work: icon(1), walk: icon(7), nature: icon(2), housing: buildingImg('house'), family: avatar(5), strength: icon(6) };
    const body = $('#modal-body');
    if (partial && body.querySelector('.upgrades')) {
      body.querySelector('.pts')!.innerHTML = `くらしポイント <b>✦ ${fmt(s.points)}</b>`;
      body.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach((b) => {
        const k = b.dataset.up as keyof typeof UPGRADES;
        b.disabled = s.points < upgradeCost(k, s.upgrades[k]);
      });
      return;
    }
    body.innerHTML = `
      <p class="lead">村人たちの暮らしから生まれる<b>くらしポイント</b>で、村全体をそっと後押しできます。</p>
      <p class="pts">くらしポイント <b>✦ ${fmt(s.points)}</b></p>
      <ul class="list upgrades">${UPGRADE_ORDER.map((k) => {
        const lv = s.upgrades[k];
        const cost = upgradeCost(k, lv);
        return `<li class="card up-card"><img src="${icons[k]}" class="up-icon"><div class="up-text"><div class="up-name">${UPGRADES[k].name} <span class="lv">Lv.${lv}</span></div><div class="up-desc">${UPGRADES[k].desc}</div></div><button class="btn blue small" data-up="${k}" ${s.points < cost ? 'disabled' : ''}>✦ ${fmt(cost)}</button></li>`;
      }).join('')}</ul>
      <p class="note">旅立ちのたびに、くらしポイントの入り方が25%ずつ増えます(いま ×${(1 + 0.25 * s.memories).toFixed(2)})。</p>`;
    body.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.ctl.buyUpgrade(b.dataset.up as keyof typeof UPGRADES)) {
          this.renderUpgrades();
          this.update();
        }
      }),
    );
  }

  private renderHistory() {
    const s = this.ctl.sim.s;
    this.renderTabs([
      ['events', '出来事'],
      ['talks', '会話'],
      ['village', '村のかたち'],
    ]);
    const body = $('#modal-body');
    const name = (id: number) => s.villagers.find((v) => v.id === id)?.name ?? '(今はいない人)';
    if (this.tab === 'events') {
      const st = s.stats;
      body.innerHTML = `
        <div class="chips"><span class="chip">誕生 ${st.births}</span><span class="chip">永眠 ${st.deaths}</span><span class="chip">建築 ${st.built}</span><span class="chip">会話 ${st.talks}</span><span class="chip">撃退 ${st.raidsRepelled}</span></div>
        <ul class="list chron">${[...s.chronicle]
          .reverse()
          .map((c) => `<li class="k-${c.kind}"><span class="when">${esc(c.label)}</span>${esc(c.text)}</li>`)
          .join('')}</ul>`;
    } else if (this.tab === 'talks') {
      const convs = [...s.conversations].reverse().filter((c) => c.lines.length);
      body.innerHTML = convs.length
        ? `<ul class="list">${convs
            .map(
              (c) =>
                `<li class="card conv"><span class="when">${esc(c.label)}</span>${esc(name(c.a))} と ${esc(name(c.b))}${c.topic ? ` <span class="muted small">(${esc(c.topic)})</span>` : ''}<ul class="lines">${c.lines.map((l) => `<li><b>${esc(l.speaker)}</b>「${esc(l.text)}」</li>`).join('')}</ul></li>`,
            )
            .join('')}</ul>`
        : '<p class="muted">まだ会話は記録されていません。</p>';
    } else {
      const bl = s.buildings
        .map(
          (b) =>
            `<li class="card"><img class="bimg" src="${buildingImg(b.kind, b.variant)}"><div><b>${esc(b.name)}</b> <span class="muted small">${ROLE_INFO[b.role].name}${b.done ? '' : `・建設中 ${Math.round(b.progress * 100)}%`}</span><br><span class="small">${esc(b.purpose || '')}${b.proposer ? `(${esc(b.proposer)}の発案)` : ''}</span></div></li>`,
        )
        .join('');
      const pl = s.projects
        .map((p) => {
          const c = BUILDINGS[p.kind].cost;
          return `<li class="card"><img class="bimg" src="${buildingImg(p.kind)}" style="opacity:.55"><div><b>${esc(p.name)}</b> <span class="muted small">${ROLE_INFO[p.role].name}・必要:木${c.wood ?? 0}${c.gold ? `・金${c.gold}` : ''}</span><br><span class="small">${esc(p.purpose)}${p.proposer ? `(${esc(p.proposer)}の発案)` : ''}</span></div></li>`;
        })
        .join('');
      body.innerHTML = `
        <p class="lead">いまは「<b>${esc(s.era)}</b>」と呼ばれています。</p>
        <h3>習わし</h3>${s.customs.length ? `<ul class="list chron">${s.customs.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted">まだ習わしは生まれていません。</p>'}
        <h3>計画中の建物</h3>${pl ? `<ul class="list">${pl}</ul>` : '<p class="muted">いまは計画がありません。</p>'}
        <h3>建物</h3><ul class="list">${bl}</ul>`;
    }
  }

  private thoughtOrDoing(v: Villager) {
    return v.intention?.source === 'ai' && v.intention.thought ? `(${v.intention.thought})` : describe(v, this.ctl.sim.s.villagers);
  }

  private renderVillagers(partial = false) {
    const s = this.ctl.sim.s;
    const vs = [...s.villagers].sort((a, b) => b.age - a.age);
    const body = $('#modal-body');
    if (partial) {
      const ul = body.querySelector('.vlist');
      if (ul && ul.children.length === vs.length) {
        vs.forEach((v, i) => {
          const d = ul.children[i].querySelector('.doing');
          if (d) d.textContent = this.thoughtOrDoing(v);
        });
        return;
      }
    }
    body.innerHTML = `<p class="lead">島に暮らす ${vs.length} 人。押すとその人の帳面を開きます。</p><ul class="list vlist">${vs
      .map(
        (v) =>
          `<li class="card" data-vid="${v.id}"><div class="slot"><img src="${avatarOf(v)}"></div><div><b>${esc(v.name)}</b> <span class="muted small">${Math.floor(v.age * 10)}歳・${ROLE_LABEL[v.role]}</span><br><span class="small">${esc(v.personality || '')}</span><br><span class="doing">${esc(this.thoughtOrDoing(v))}</span></div></li>`,
      )
      .join('')}</ul>`;
    body.querySelectorAll<HTMLElement>('[data-vid]').forEach((li) => li.addEventListener('click', () => this.openModal('person', Number(li.dataset.vid))));
  }

  private renderPerson(partial = false) {
    const s = this.ctl.sim.s;
    const v = s.villagers.find((x) => x.id === this.modalArg);
    const body = $('#modal-body');
    if (!v) {
      body.innerHTML = '<p class="muted">この人はもう島にいません。</p>';
      return;
    }
    if (partial) {
      const d = body.querySelector('.p-doing');
      if (d) d.textContent = describe(v, s.villagers);
      return;
    }
    $('#modal-title').textContent = `${v.name}の帳面`;
    const partner = s.villagers.find((x) => x.id === v.partnerId);
    const children = s.villagers.filter((x) => x.parents.includes(v.name));
    const rels = Object.entries(v.relations)
      .map(([id, r]) => ({ o: s.villagers.find((x) => x.id === Number(id)), r }))
      .filter((x) => x.o)
      .sort((a, b) => b.r.score - a.r.score);
    const feel = (n: number) => (n >= 60 ? 'とても好き' : n >= 20 ? '好き' : n > -20 ? 'ふつう' : n > -60 ? '苦手' : 'きらい');
    const want = v.intention ? `${ACTION_INFO[v.intention.action].replace(/\(.*\)/, '')}${v.intention.target ? `(${v.intention.target})` : ''}` : '';
    body.innerHTML = `
      <div class="vc-top"><div class="slot"><img src="${avatarOf(v)}"></div><div><div style="font-size:22px">${esc(v.name)}</div><div class="muted">${Math.floor(v.age * 10)}歳・${v.female ? '女' : '男'}・${ROLE_LABEL[v.role]}</div></div></div>
      <p>${esc(v.personality || '(どんな人か、まだわからない)')}</p>
      <div class="card"><div class="thought">${esc(v.intention?.source === 'ai' ? v.intention.thought : '')}</div><div class="small muted">いま:<span class="p-doing">${esc(describe(v, s.villagers))}</span>${want ? `/したいこと:${esc(want)}` : ''}</div></div>
      <h3>家族</h3><p class="small">${v.parents.length ? `${esc(v.parents.join('と'))}の子。` : '島に流れ着いた一人。'}${partner ? `${esc(partner.name)}と連れ添っている。` : ''}${children.length ? `子は${children.map((c) => esc(c.name)).join('、')}。` : ''}</p>
      <h3>まわりの人</h3>${rels.length ? `<ul class="list">${rels.map((x) => `<li class="small">${esc(x.o!.name)}:${x.r.label ? `<b>${esc(x.r.label)}</b>・` : ''}<span class="muted">${feel(x.r.score)}</span></li>`).join('')}</ul>` : '<p class="muted small">まだ深い付き合いはない。</p>'}
      <h3>記憶</h3>${v.memories.length ? `<ul class="list chron mem">${v.memories.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="muted small">まだ心に残る出来事はない。</p>'}
      <div class="actions"><button class="btn blue small" id="p-follow">この人を追いかける</button></div>`;
    $('#p-follow').addEventListener('click', () => {
      this.closeModal();
      this.ctl.scene?.select(v.id, true);
    });
  }

  private renderDepart() {
    const s = this.ctl.sim.s;
    $('#modal-body').innerHTML = `
      <p class="lead">${esc(s.islandName)}には立派な城が建ちました。村人たちの子孫は、新しい島を目指して海へ漕ぎ出すことができます。</p>
      <ul class="list chron">
        <li>新しい島で、3人の開拓者から始まります</li>
        <li>くらしポイントの入り方が <b>×${(1 + 0.25 * (s.memories + 1)).toFixed(2)}</b> になります</li>
        <li>天の恵みのレベルは半分を引き継ぎます</li>
      </ul>
      <div class="actions"><button class="btn red" id="depart-ok">旅立つ</button><button class="btn blue" id="depart-no">まだ見守る</button></div>`;
    $('#depart-ok').addEventListener('click', () => {
      this.closeModal();
      this.ctl.depart();
      this.banner('新しい島へ', 'blue');
    });
    $('#depart-no').addEventListener('click', () => this.closeModal());
  }

  // ───────────── AIの設定 ─────────────
  private aiFormHtml() {
    const st = this.ctl.mind.settings;
    const p = PRESETS[st.preset] ?? PRESETS.gemini;
    const custom = st.preset === 'custom';
    return `
      <div class="field">
        <span>サービス</span><select id="ai-preset">${Object.entries(PRESETS)
          .map(([k, x]) => `<option value="${k}" ${st.preset === k ? 'selected' : ''}>${esc(x.label)}</option>`)
          .join('')}</select>
        <span>APIキー</span><input type="password" id="ai-key" value="${esc(st.apiKey)}" placeholder="ここに貼り付け" autocomplete="off" />
        <span>モデル</span><div class="row"><input type="text" id="ai-model" value="${esc(st.model)}" list="ai-models" style="flex:1" /><datalist id="ai-models"></datalist><button class="btn blue small" id="ai-list">一覧</button></div>
        <span ${custom ? '' : 'hidden'}>URL</span><input type="text" id="ai-base" value="${esc(st.baseUrl)}" ${custom ? '' : 'hidden'} placeholder="https://.../v1" />
      </div>
      <p class="note">${esc(p.note)}${p.keyUrl ? ` <a href="${p.keyUrl}" target="_blank" rel="noopener">キーを作るページを開く</a>` : ''}</p>
      <p class="note">キーはこのブラウザの中だけに保存され、選んだサービス以外には送られません。</p>
      <div class="actions"><button class="btn blue small" id="ai-test">つながるか試す</button><span id="ai-test-r" class="small muted"></span></div>`;
  }

  private bindAiForm() {
    const m = this.ctl.mind;
    const st = m.settings;
    $('#ai-preset').addEventListener('change', (e) => {
      const k = (e.target as HTMLSelectElement).value;
      const p = PRESETS[k];
      st.preset = k;
      if (k !== 'custom') st.baseUrl = p.baseUrl;
      st.model = p.model || st.model;
      m.save();
      this.render();
    });
    const bindInput = (id: string, key: 'apiKey' | 'model' | 'baseUrl') =>
      $(id).addEventListener('change', (e) => {
        st[key] = (e.target as HTMLInputElement).value.trim();
        m.save();
      });
    bindInput('#ai-key', 'apiKey');
    bindInput('#ai-model', 'model');
    bindInput('#ai-base', 'baseUrl');
    const syncInputs = () => {
      st.apiKey = ($('#ai-key') as HTMLInputElement).value.trim();
      st.model = ($('#ai-model') as HTMLInputElement).value.trim();
      m.save();
    };
    $('#ai-list').addEventListener('click', async () => {
      syncInputs();
      $('#ai-test-r').textContent = '一覧を取得中…';
      try {
        const list = await m.listModels();
        $('#ai-models').innerHTML = list.map((x) => `<option value="${esc(x)}">`).join('');
        $('#ai-test-r').textContent = `${list.length}個のモデルが使えます。モデル欄を押すと選べます`;
      } catch (e) {
        $('#ai-test-r').textContent = `取得できませんでした:${(e as Error).message.slice(0, 60)}`;
      }
    });
    $('#ai-test').addEventListener('click', async () => {
      syncInputs();
      $('#ai-test-r').textContent = '試しています…';
      try {
        $('#ai-test-r').textContent = `つながりました(${await m.test()})`;
        m.thinkNow(this.ctl.sim);
      } catch (e) {
        const msg = (e as Error).message;
        $('#ai-test-r').textContent = /Failed to fetch|NetworkError|Load failed/.test(msg)
          ? 'つながりませんでした。この画面からは外部のAPIに接続できない可能性があります'
          : `失敗しました:${msg.slice(0, 80)}`;
      }
    });
  }

  private logsHtml() {
    const logs = this.ctl.mind.logs;
    if (!logs.length) return '<li class="muted">まだ記録はありません</li>';
    return logs
      .slice(0, 12)
      .map((l) => `<li class="${l.ok ? '' : 'ng'}">${new Date(l.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${l.ok ? '○' : '×'} ${esc(l.note)}(${(l.ms / 1000).toFixed(1)}秒)</li>`)
      .join('');
  }

  private renderSetup() {
    $('#modal-body').innerHTML = `
      <p class="lead">この島の村人たちは、<b>本能</b>(食べる・眠る・逃げる・人恋しくなる)以外のすべてを、AIで自分で考えて暮らします。何をして生きるか、誰と何を話すか、何を建てて何と呼ぶか、どんな習わしをつくるか。</p>
      <p>AIを使うには、無料で作れるAPIキーが必要です。</p>
      <ol class="steps">
        <li>「キーを作るページを開く」から、Googleのアカウントでログインして <b>APIキーを作成</b> します</li>
        <li>できたキーをコピーして、下の欄に貼り付けます</li>
        <li>「つながるか試す」を押して、つながったら完了です</li>
      </ol>
      ${this.ctl.sandboxed ? '<p class="note">※このページは外部に接続できない場所で開かれているため、AIは使えません。</p>' : ''}
      ${this.aiFormHtml()}
      <div class="actions"><button class="btn blue" id="setup-done">はじめる</button><button class="btn red small" id="setup-skip">AIなしで見る</button></div>`;
    this.bindAiForm();
    $('#setup-done').addEventListener('click', () => {
      const m = this.ctl.mind;
      m.settings.apiKey = ($('#ai-key') as HTMLInputElement).value.trim();
      m.settings.model = ($('#ai-model') as HTMLInputElement).value.trim();
      m.save();
      this.closeModal();
      m.thinkNow(this.ctl.sim);
    });
    $('#setup-skip').addEventListener('click', () => this.closeModal());
  }

  private renderSettings() {
    this.renderTabs([
      ['ai', 'AI'],
      ['sound', '音'],
      ['data', 'データと素材'],
    ]);
    const body = $('#modal-body');
    const m = this.ctl.mind;
    if (this.tab === 'ai') {
      body.innerHTML = `
        <p class="lead">村人の判断・会話・名付け・建物の発案・習わしを、AIが考えます。</p>
        <label class="check"><input type="checkbox" id="ai-on" ${m.settings.enabled ? 'checked' : ''}> AIを使う</label>
        ${this.aiFormHtml()}
        <h3>考える間隔</h3>
        <div class="field"><span id="ai-int-l">${m.settings.interval}秒ごと</span><input type="range" id="ai-int" min="10" max="120" step="5" value="${m.settings.interval}"></div>
        <p class="note">1回で数人分の判断と会話をまとめて考えます。無料枠の回数制限に引っかかるときは、間隔を長くしてください。</p>
        <h3>最近のやりとり</h3><ul class="list logs" id="mind-logs">${this.logsHtml()}</ul>`;
      this.bindAiForm();
      $('#ai-on').addEventListener('change', (e) => {
        m.settings.enabled = (e.target as HTMLInputElement).checked;
        m.save();
      });
      $('#ai-int').addEventListener('input', (e) => {
        m.settings.interval = Number((e.target as HTMLInputElement).value);
        $('#ai-int-l').textContent = `${m.settings.interval}秒ごと`;
        m.save();
      });
    } else if (this.tab === 'sound') {
      const au = this.ctl.audio.settings;
      body.innerHTML = `
        <div class="field"><span>音楽</span><input type="range" min="0" max="1" step="0.05" id="vol-music" value="${au.music}"><span>効果音</span><input type="range" min="0" max="1" step="0.05" id="vol-sfx" value="${au.sfx}"></div>
        <label class="check"><input type="checkbox" id="mute" ${au.muted ? 'checked' : ''}> すべての音を消す</label>`;
      $('#vol-music').addEventListener('input', (e) => {
        au.music = Number((e.target as HTMLInputElement).value);
        this.ctl.audio.save();
      });
      $('#vol-sfx').addEventListener('input', (e) => {
        au.sfx = Number((e.target as HTMLInputElement).value);
        this.ctl.audio.save();
      });
      $('#mute').addEventListener('change', (e) => {
        au.muted = (e.target as HTMLInputElement).checked;
        this.ctl.audio.save();
        this.update();
      });
    } else {
      body.innerHTML = `
        <h3>データ</h3><div class="actions"><button class="btn red small" id="reset">最初からやり直す</button></div>
        <h3>素材・クレジット</h3>
        <ul class="list chron">
          <li>グラフィック・UI:<b>Tiny Swords</b> by Pixel Frog</li>
          <li>音楽・効果音:<b>Ninja Adventure</b> by Pixel-Boy &amp; AAA(CC0)</li>
          <li>フォント:<b>DotGothic16</b> by Fontworks(SIL OFL)</li>
          <li>ゲームエンジン:Phaser 3</li>
        </ul>`;
      let armed = false;
      $('#reset').addEventListener('click', () => {
        if (!armed) {
          armed = true;
          $('#reset').textContent = '本当に消す?(もう一度押す)';
          setTimeout(() => {
            armed = false;
            const r = document.getElementById('reset');
            if (r) r.textContent = '最初からやり直す';
          }, 4000);
          return;
        }
        this.closeModal();
        this.ctl.resetAll();
      });
    }
  }
}
