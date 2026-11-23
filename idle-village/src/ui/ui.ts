// 画面のUI(HTML)。Tiny Swords のUI素材をスキンとして使う。
import { API_PRESETS, AIManager, WEBLLM_PREFERRED } from '../ai/ai';
import type { Controller, WelcomeInfo } from '../controller';
import { formatDuration } from '../controller';
import { BUILDINGS, RES_NAMES, ROLE_NAMES, SKILL_NAMES, STAGE_NAMES, STAGE_REQ, TRAITS, UPGRADES, UPGRADE_ORDER, upgradeCost } from '../sim/config';
import type { ResKind, SimEvent, Villager } from '../sim/types';
import { avatar, buildingImg, icon, resIcon } from './skin';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString());

export function avatarOf(v: Villager) {
  if (v.role === 'warrior') return avatar(1);
  if (v.role === 'archer') return avatar(2);
  if (v.role === 'monk') return avatar(3);
  return avatar(v.female ? 5 : 4);
}

export function describe(v: Villager, villagers: Villager[]): string {
  if (v.knockedOut > 0) return '気絶している…';
  const t = v.task;
  if (!t) return 'ひと休み';
  const going = t.phase === 'go';
  switch (t.type) {
    case 'chop':
      return going ? '木を切りに向かっている' : '木を切っている';
    case 'harvest':
      return going ? '羊のところへ向かっている' : '羊の世話をしている';
    case 'mine':
      return going ? '金鉱へ向かっている' : '金を掘っている';
    case 'build':
      return going ? '建設現場へ向かっている' : '建物を建てている';
    case 'repair':
      return '壊れた建物を直している';
    case 'deliver':
      return v.carrying ? `${RES_NAMES[v.carrying]}を運んでいる` : '倉へ向かっている';
    case 'eat':
      return going ? 'ごはんを食べに行く' : 'ごはんを食べている';
    case 'sleep':
      return v.hidden ? '家で眠っている' : '家に帰るところ';
    case 'hide':
      return v.hidden ? '建物に隠れている' : '建物へ逃げている';
    case 'chat': {
      const p = villagers.find((x) => x.id === t.targetId);
      return p ? `${p.name}とおしゃべり` : 'おしゃべり';
    }
    case 'pray':
      return '修道院で祈っている';
    case 'festival':
      return 'お祭りを楽しんでいる';
    case 'guard':
      return '村を見張っている';
    case 'fight':
      return '盗賊と戦っている!';
    case 'heal':
      return 'けが人を手当てしている';
    case 'play':
      return '元気に遊んでいる';
    default:
      return 'ぶらぶら散歩中';
  }
}

export function roleLabel(v: Villager) {
  if (v.role === 'pawn') return SKILL_NAMES[v.skill];
  return ROLE_NAMES[v.role];
}

export class UI {
  ctl: Controller;
  private modalKind: string | null = null;
  private lastRes: Record<string, number> = {};
  private councilOpen = window.innerWidth > 720;

  constructor(ctl: Controller) {
    this.ctl = ctl;
  }

  ready() {
    $('#loading').classList.add('done');
    setTimeout(() => $('#loading').remove(), 800);
    $('#hud').hidden = false;
    this.bind();
    $('#council').classList.toggle('collapsed', !this.councilOpen);
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
      const i = order.indexOf(this.ctl.speed);
      this.ctl.setSpeed(order[(i + 1) % order.length]);
      this.ctl.audio.play('click', 0.5);
    });
    $('#btn-sound').addEventListener('click', () => {
      this.ctl.audio.settings.muted = !this.ctl.audio.settings.muted;
      this.ctl.audio.save();
      this.update();
    });
    $('#council-head').addEventListener('click', () => {
      this.councilOpen = !this.councilOpen;
      $('#council').classList.toggle('collapsed', !this.councilOpen);
    });
    $('#vc-close').addEventListener('click', () => this.ctl.scene?.select(null));
    $('#vc-follow').addEventListener('click', () => {
      const sc = this.ctl.scene;
      if (!sc || sc.selectedId === null) return;
      sc.following = !sc.following;
      this.update();
    });
    $('#btn-depart').addEventListener('click', () => this.openModal('depart'));
    $('#zoom-in').addEventListener('click', () => this.ctl.scene?.setZoom(this.ctl.scene.cameras.main.zoom * 1.25));
    $('#zoom-out').addEventListener('click', () => this.ctl.scene?.setZoom(this.ctl.scene.cameras.main.zoom / 1.25));
  }

  refreshAll() {
    this.lastRes = {};
    this.update();
    this.renderCouncil();
    if (this.modalKind) this.openModal(this.modalKind);
  }

  update() {
    const sim = this.ctl.sim;
    const s = sim.s;
    $('#island-name').textContent = s.islandName;
    $('#time-label').textContent = `${sim.timeLabel}${sim.isNight ? ' ☾' : ' ☀'}`;
    $('#stage-label').textContent = `${STAGE_NAMES[s.stage]}の時代`;
    const req = STAGE_REQ[s.stage + 1];
    $('#next-goal').textContent = req ? `次の時代へ:${req.desc}` : s.departed ? '城が完成!旅立ちができます' : '城の完成を目指そう';
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
    $('#btn-sound img').setAttribute('style', this.ctl.audio.settings.muted ? 'opacity:.35' : '');
    $('#btn-depart').hidden = !s.departed;
    // 強化できるものがあれば印
    const can = UPGRADE_ORDER.some((k) => s.points >= upgradeCost(k, s.upgrades[k]));
    $('#btn-upgrades').classList.toggle('glow', can);
    $('#raid-indicator').hidden = !sim.raidActive;
    this.updateVillagerCard();
    if (this.modalKind === 'upgrades') this.renderUpgrades(true);
    if (this.modalKind === 'villagers') this.renderVillagers(true);
  }

  updateAIStatus() {
    for (const id of ['ai-status', 'ai-status-line']) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = id === 'ai-status-line' ? `判断:${this.ctl.ai.status}` : this.ctl.ai.status;
        el.classList.toggle('busy', this.ctl.ai.busy);
      }
    }
    if (this.modalKind === 'settings') {
      const p = document.getElementById('webllm-progress');
      if (p) p.textContent = this.ctl.ai.progress || this.ctl.ai.status;
    }
  }

  // ───────────── 長老会議 ─────────────
  renderCouncil() {
    const p = this.ctl.sim.s.policy;
    const next = p.nextBuild ? `<div class="plan"><img src="${buildingImg(p.nextBuild)}" alt="">次の計画:<b>${BUILDINGS[p.nextBuild].name}</b></div>` : '';
    const lines = p.lines.map((l) => `<li><b>${esc(l.speaker)}</b>「${esc(l.text)}」</li>`).join('');
    $('#council-body').innerHTML = `${next}<ul>${lines || '<li class="muted">まだ会議は開かれていない</li>'}</ul>`;
    $('#council-src').textContent = p.source === 'ai' ? 'AI' : 'ルール';
    $('#council-src').className = `src ${p.source}`;
    this.updateAIStatus();
  }

  // ───────────── 村人カード ─────────────
  showVillager(id: number | null) {
    const card = $('#villager-card');
    card.hidden = id === null;
    if (id !== null) this.ctl.audio.play('pop', 0.4);
    this.updateVillagerCard();
  }

  private updateVillagerCard() {
    const sc = this.ctl.scene;
    const card = $('#villager-card');
    if (!sc || sc.selectedId === null) {
      card.hidden = true;
      return;
    }
    const v = this.ctl.sim.s.villagers.find((x) => x.id === sc.selectedId);
    if (!v) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $('#vc-avatar').setAttribute('src', avatarOf(v));
    $('#vc-name').textContent = v.name;
    $('#vc-meta').textContent = `${Math.floor(v.age)}歳・${v.female ? '女' : '男'}・${roleLabel(v)}`;
    $('#vc-trait').textContent = TRAITS[v.trait];
    $('#vc-doing').textContent = describe(v, this.ctl.sim.s.villagers);
    $('#vc-bubble').textContent = v.bubble ? `「${v.bubble.text}」` : '';
    $('#vc-parents').textContent = v.parents.length ? `${v.parents.join('と')}の子` : '島に流れ着いた一人';
    const hunger = Math.round((1 - v.hunger) * 100);
    const energy = Math.round(v.energy * 100);
    $('#vc-bars').innerHTML = `<label>満腹<span class="mbar"><i style="width:${hunger}%"></i></span></label><label>元気<span class="mbar e"><i style="width:${energy}%"></i></span></label>`;
    $('#vc-follow').textContent = sc.following ? '追いかけ中' : '追いかける';
    $('#vc-follow').classList.toggle('on', sc.following);
  }

  // ───────────── 通知 ─────────────
  toast(html: string, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = html;
    $('#toasts').prepend(t);
    while ($('#toasts').children.length > 4) $('#toasts').lastElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 5200);
    setTimeout(() => t.remove(), 6000);
  }

  banner(text: string, color = 'yellow') {
    const b = document.createElement('div');
    b.className = `banner ribbon-${color}`;
    b.innerHTML = `<span>${esc(text)}</span>`;
    document.getElementById('hud')!.appendChild(b);
    setTimeout(() => b.remove(), 3800);
  }

  onSimEvent(e: SimEvent) {
    const s = this.ctl.sim.s;
    const last = s.chronicle[s.chronicle.length - 1];
    switch (e.type) {
      case 'built': {
        const b = s.buildings.find((x) => x.id === e.id);
        if (b) this.toast(`<img src="${buildingImg(b.kind)}" class="ti">${BUILDINGS[b.kind].name}が完成した!`);
        break;
      }
      case 'birth': {
        const v = s.villagers.find((x) => x.id === e.id);
        if (v) this.toast(`<img src="${avatarOf(v)}" class="ti">${esc(last?.text ?? `${v.name}が生まれた`)}`, 'pink');
        break;
      }
      case 'death':
        if (last?.kind === 'death') this.toast(`✧ ${esc(last.text)}`, 'gray');
        break;
      case 'raidStart':
        this.banner('盗賊団が上陸した!', 'red');
        this.toast(`<img src="${icon(5)}" class="ti">盗賊団が島に上陸した!村人は建物に避難中…`, 'red');
        break;
      case 'raidEnd':
        this.toast(`<img src="${icon(6)}" class="ti">${esc(last?.text ?? '盗賊団は去った')}`, 'blue');
        break;
      case 'stage':
        this.banner(`「${STAGE_NAMES[e.stage]}」の時代`, 'yellow');
        this.toast(`新しい時代「${STAGE_NAMES[e.stage]}」が始まった!`, 'gold');
        break;
      case 'council':
        this.renderCouncil();
        break;
      case 'season':
        this.banner(this.ctl.sim.timeLabel, 'blue');
        break;
    }
    if (this.modalKind === 'history') this.renderHistory(true);
  }

  showWelcome(w: WelcomeInfo) {
    const res = (['wood', 'meat', 'gold'] as ResKind[])
      .map((k) => `<span class="chip"><img src="${resIcon(k)}">+${fmt(Math.max(0, w.gained[k]))}</span>`)
      .join('');
    const entries = w.entries.slice(-8).map((t) => `<li>${esc(t)}</li>`).join('');
    this.openModal('custom', 'おかえりなさい', `
      <p class="lead">留守のあいだ(${formatDuration(w.away)})も、村人たちは暮らしを続けていました。</p>
      <div class="chips">${res}<span class="chip">✦ +${fmt(w.points)}</span></div>
      ${entries ? `<h3>そのあいだの出来事</h3><ul class="chron">${entries}</ul>` : ''}
      <div class="actions"><button class="btn blue" id="welcome-ok">村を見る</button></div>`);
    $('#welcome-ok').addEventListener('click', () => this.closeModal());
  }

  // ───────────── モーダル ─────────────
  openModal(kind: string, title?: string, html?: string) {
    this.modalKind = kind;
    $('#modal').hidden = false;
    const titles: Record<string, string> = { upgrades: '天の恵み', history: '村の歴史書', villagers: '村人たち', settings: '設定', depart: '旅立ち' };
    $('#modal-title').textContent = title ?? titles[kind] ?? '';
    $('#modal-box').className = `modal-box paper ${kind}`;
    if (kind === 'upgrades') this.renderUpgrades();
    else if (kind === 'history') this.renderHistory();
    else if (kind === 'villagers') this.renderVillagers();
    else if (kind === 'settings') this.renderSettings();
    else if (kind === 'depart') this.renderDepart();
    else if (html) $('#modal-body').innerHTML = html;
  }

  closeModal() {
    this.modalKind = null;
    $('#modal').hidden = true;
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
      <div class="upgrades">${UPGRADE_ORDER.map((k) => {
        const lv = s.upgrades[k];
        const cost = upgradeCost(k, lv);
        return `<div class="up-card wood-s">
          <img src="${icons[k]}" class="up-icon">
          <div class="up-text"><div class="up-name">${UPGRADES[k].name} <span class="lv">Lv.${lv}</span></div><div class="up-desc">${UPGRADES[k].desc}</div></div>
          <button class="btn blue small" data-up="${k}" ${s.points < cost ? 'disabled' : ''}>✦ ${fmt(cost)}</button>
        </div>`;
      }).join('')}</div>
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

  private renderHistory(partial = false) {
    const s = this.ctl.sim.s;
    const list = [...s.chronicle].reverse();
    const html = list
      .map(
        (c) =>
          `<li class="k-${c.kind}"><span class="when">${esc(c.label)}</span>${c.kind === 'ai' ? '<span class="ai-tag">AI</span>' : ''}${esc(c.text)}</li>`,
      )
      .join('');
    const body = $('#modal-body');
    if (partial && body.querySelector('.chron')) {
      body.querySelector('.chron')!.innerHTML = html;
      return;
    }
    const st = s.stats;
    body.innerHTML = `
      <p class="lead">${esc(s.islandName)}(${s.islandNo}つ目の島)の記録</p>
      <div class="chips"><span class="chip">誕生 ${st.births}</span><span class="chip">永眠 ${st.deaths}</span><span class="chip">建築 ${st.built}</span><span class="chip">撃退 ${st.raidsRepelled}</span></div>
      <ul class="chron">${html}</ul>`;
  }

  private renderVillagers(partial = false) {
    const s = this.ctl.sim.s;
    const vs = [...s.villagers].sort((a, b) => b.age - a.age);
    const rows = vs
      .map(
        (v) => `<li data-vid="${v.id}"><img src="${avatarOf(v)}"><div><b>${esc(v.name)}</b> <span class="muted">${Math.floor(v.age)}歳・${roleLabel(v)}・${TRAITS[v.trait]}</span><br><span class="doing">${describe(v, s.villagers)}</span></div></li>`,
      )
      .join('');
    const body = $('#modal-body');
    if (partial) {
      const ul = body.querySelector('.vlist');
      if (ul && ul.children.length === vs.length) {
        vs.forEach((v, i) => {
          const d = ul.children[i].querySelector('.doing');
          if (d) d.textContent = describe(v, s.villagers);
        });
        return;
      }
    }
    body.innerHTML = `<p class="lead">島に暮らす ${vs.length} 人。名前を押すと、その村人を追いかけます。</p><ul class="vlist">${rows}</ul>`;
    body.querySelectorAll<HTMLElement>('[data-vid]').forEach((li) =>
      li.addEventListener('click', () => {
        const id = Number(li.dataset.vid);
        const v = s.villagers.find((x) => x.id === id);
        this.closeModal();
        if (v) this.ctl.scene?.select(id, true);
      }),
    );
  }

  private renderDepart() {
    const s = this.ctl.sim.s;
    $('#modal-body').innerHTML = `
      <p class="lead">${esc(s.islandName)}には立派な城が建ちました。村人たちの子孫は、新しい島を目指して海へ漕ぎ出すことができます。</p>
      <ul class="bullets">
        <li>新しい島で、3人の開拓者から始まります</li>
        <li>くらしポイントの入り方が <b>×${(1 + 0.25 * (s.memories + 1)).toFixed(2)}</b> になります</li>
        <li>天の恵みのレベルは半分を引き継ぎます</li>
        <li>この島の歴史書は旅立ちとともに閉じられます</li>
      </ul>
      <p>まだこの島を眺めていたければ、旅立ちはいつでもできます。</p>
      <div class="actions"><button class="btn red" id="depart-ok">旅立つ</button><button class="btn blue" id="depart-no">まだ見守る</button></div>`;
    $('#depart-ok').addEventListener('click', () => {
      this.closeModal();
      this.ctl.depart();
      this.banner('新しい島へ', 'blue');
    });
    $('#depart-no').addEventListener('click', () => this.closeModal());
  }

  private renderSettings() {
    const ai = this.ctl.ai;
    const st = ai.settings;
    const au = this.ctl.audio.settings;
    const gpu = AIManager.webgpuAvailable();
    const presetOpts = Object.entries(API_PRESETS)
      .map(([k, p]) => `<option value="${k}" ${st.api.preset === k ? 'selected' : ''}>${p.label}</option>`)
      .join('');
    $('#modal-body').innerHTML = `
      <h3>長老会議のAI</h3>
      <p class="note">季節ごとの長老会議で、村の方針と会話をAIに考えさせることができます。AIが使えないときは、ルールで判断します。</p>
      <div class="radio">
        <label><input type="radio" name="prov" value="rule" ${st.provider === 'rule' ? 'checked' : ''}> ルール(AIなし)</label>
        <label><input type="radio" name="prov" value="webllm" ${st.provider === 'webllm' ? 'checked' : ''} ${gpu ? '' : 'disabled'}> ブラウザ内AI(無料・無制限)${gpu ? '' : '<span class="muted">※このブラウザは非対応</span>'}</label>
        <label><input type="radio" name="prov" value="api" ${st.provider === 'api' ? 'checked' : ''}> 無料APIを使う</label>
      </div>
      <div class="sub" id="sub-webllm" ${st.provider === 'webllm' ? '' : 'hidden'}>
        <p class="note">初回はAIモデルのダウンロード(数百MB〜2GB)があります。パソコンのGPUで動くので、費用はかかりません。</p>
        <label>モデル <select id="webllm-model"><option>${esc(st.webllmModel)}</option></select></label>
        <button class="btn blue small" id="webllm-load">読み込む</button>
        <div id="webllm-progress" class="muted">${esc(ai.progress || ai.status)}</div>
      </div>
      <div class="sub" id="sub-api" ${st.provider === 'api' ? '' : 'hidden'}>
        <label>サービス <select id="api-preset">${presetOpts}</select></label>
        <p class="note" id="api-note">${esc(API_PRESETS[st.api.preset]?.note ?? '')}</p>
        <label>APIキー <input type="password" id="api-key" value="${esc(st.api.apiKey)}" placeholder="キーを貼り付け" autocomplete="off"></label>
        <label>モデル <input type="text" id="api-model" value="${esc(st.api.model)}"></label>
        <label id="api-base-row" ${st.api.preset === 'custom' ? '' : 'hidden'}>URL <input type="text" id="api-base" value="${esc(st.api.baseUrl)}" placeholder="https://.../v1"></label>
        <p class="note">キーはこのブラウザの中だけに保存されます。</p>
      </div>
      <div class="actions"><button class="btn blue small" id="ai-test">今すぐ長老会議を開く</button><span id="ai-status" class="muted">${esc(ai.status)}</span></div>

      <h3>音</h3>
      <label class="slider">音楽 <input type="range" min="0" max="1" step="0.05" id="vol-music" value="${au.music}"></label>
      <label class="slider">効果音 <input type="range" min="0" max="1" step="0.05" id="vol-sfx" value="${au.sfx}"></label>
      <label><input type="checkbox" id="mute" ${au.muted ? 'checked' : ''}> すべての音を消す</label>

      <h3>データ</h3>
      <div class="actions"><button class="btn red small" id="reset">最初からやり直す</button></div>

      <h3>素材・クレジット</h3>
      <ul class="credits">
        <li>グラフィック:<b>Tiny Swords</b> by Pixel Frog</li>
        <li>音楽・効果音:<b>Ninja Adventure</b> by Pixel-Boy &amp; AAA(CC0)</li>
        <li>フォント:<b>DotGothic16</b> by Fontworks(SIL OFL)</li>
        <li>ゲームエンジン:Phaser 3 / ブラウザ内AI:WebLLM</li>
      </ul>`;
    const body = $('#modal-body');
    body.querySelectorAll<HTMLInputElement>('input[name=prov]').forEach((r) =>
      r.addEventListener('change', () => {
        st.provider = r.value as typeof st.provider;
        ai.save();
        $('#sub-webllm').hidden = st.provider !== 'webllm';
        $('#sub-api').hidden = st.provider !== 'api';
        if (st.provider === 'webllm') void this.fillModels();
      }),
    );
    if (st.provider === 'webllm') void this.fillModels();
    $('#webllm-model').addEventListener('change', (e) => {
      st.webllmModel = (e.target as HTMLSelectElement).value;
      ai.save();
    });
    $('#webllm-load').addEventListener('click', async () => {
      try {
        await ai.loadWebLLM();
        $('#webllm-progress').textContent = '準備完了!次の季節から長老会議に参加します';
      } catch (err) {
        $('#webllm-progress').textContent = `読み込みに失敗しました:${(err as Error).message}`;
      }
    });
    $('#api-preset').addEventListener('change', (e) => {
      const k = (e.target as HTMLSelectElement).value;
      const p = API_PRESETS[k];
      st.api.preset = k;
      if (k !== 'custom') st.api.baseUrl = p.baseUrl;
      st.api.model = p.model || st.api.model;
      ($('#api-model') as HTMLInputElement).value = st.api.model;
      $('#api-note').textContent = p.note;
      $('#api-base-row').hidden = k !== 'custom';
      ai.save();
    });
    for (const [id, key] of [
      ['#api-key', 'apiKey'],
      ['#api-model', 'model'],
      ['#api-base', 'baseUrl'],
    ] as const) {
      $(id).addEventListener('change', (e) => {
        st.api[key] = (e.target as HTMLInputElement).value.trim();
        ai.save();
      });
    }
    $('#ai-test').addEventListener('click', () => {
      if (!ai.enabled) {
        $('#ai-status').textContent = 'AIが設定されていません';
        return;
      }
      void this.ctl.runAICouncil();
    });
    $('#vol-music').addEventListener('input', (e) => {
      this.ctl.audio.settings.music = Number((e.target as HTMLInputElement).value);
      this.ctl.audio.save();
    });
    $('#vol-sfx').addEventListener('input', (e) => {
      this.ctl.audio.settings.sfx = Number((e.target as HTMLInputElement).value);
      this.ctl.audio.save();
    });
    $('#mute').addEventListener('change', (e) => {
      this.ctl.audio.settings.muted = (e.target as HTMLInputElement).checked;
      this.ctl.audio.save();
      this.update();
    });
    $('#reset').addEventListener('click', () => {
      if (confirm('いまの島のデータを消して、最初からやり直しますか?')) {
        this.closeModal();
        this.ctl.resetAll();
      }
    });
  }

  private async fillModels() {
    const sel = document.getElementById('webllm-model') as HTMLSelectElement | null;
    if (!sel) return;
    const ids = await this.ctl.ai.listWebLLMModels();
    const cur = this.ctl.ai.settings.webllmModel;
    const list = ids.includes(cur) ? ids : [cur, ...ids];
    sel.innerHTML = list.map((id) => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(id)}${WEBLLM_PREFERRED[0] === id ? '(日本語向け・おすすめ)' : ''}</option>`).join('');
  }
}
