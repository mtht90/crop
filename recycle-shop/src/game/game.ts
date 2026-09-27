import * as THREE from 'three';
import { Engine } from '../core/engine';
import { assets, preloadAll } from '../core/assets';
import { audio } from '../core/audio';
import { events, toast } from '../core/events';
import { input } from '../core/input';
import { ALL_MODELS, ICONS } from '../data/assetList';
import { World } from '../world/world';
import { SPOTS } from '../world/layout';
import { Player } from '../entities/player';
import { CustomerManager } from '../systems/customers';
import { Interaction } from '../systems/interaction';
import { BuildMode } from '../systems/build';
import { AutoQuality, GuideMarker, Stocker } from '../systems/helpers';
import { UI } from '../ui/ui';
import { Hud } from '../ui/hud';
import { AppraisalUI } from '../ui/appraisal';
import { CheckoutUI } from '../ui/checkout';
import { WorkshopUI } from '../ui/workshop';
import { PriceUI, StockUI } from '../ui/price';
import { TerminalUI } from '../ui/terminal';
import { MorningUI, PauseUI, SettingsUI, SummaryUI, TitleUI, HelpUI, loadSettings, type Settings } from '../ui/menus';
import { GameModel } from './model';
import { OPEN_MINUTE } from './state';

/** ゲーム全体の組み立てとメインループ */
export class Game {
  readonly engine: Engine;
  readonly ui: UI;
  settings: Settings = loadSettings();
  settingsUI: SettingsUI;
  model!: GameModel;
  world!: World;
  player!: Player;
  customers!: CustomerManager;
  interaction!: Interaction;
  build!: BuildMode;
  hud!: Hud;
  stocker!: Stocker;
  guide!: GuideMarker;
  autoQuality!: AutoQuality;
  appraisal!: AppraisalUI;
  checkout!: CheckoutUI;
  workshop!: WorkshopUI;
  priceUI!: PriceUI;
  stockUI!: StockUI;
  terminal!: TerminalUI;
  pauseUI!: PauseUI;
  private mode: 'loading' | 'title' | 'play' = 'loading';
  private titleT = 0;
  private autosaveT = 0;
  private closingT = 0;
  private started = false;

  constructor(app: HTMLElement, uiRoot: HTMLElement) {
    this.engine = new Engine(app);
    this.ui = new UI(uiRoot);
    this.settingsUI = new SettingsUI(this);
    input.attach(this.engine.renderer.domElement);
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'play' && !this.ui.modalOpen) { audio.init(); input.lock(true); }
    });
    this.applySettings(true);
    this.engine.onUpdate((dt) => this.update(dt));
  }

  applySettings(quality = false) {
    const s = this.settings;
    audio.volumes.master = s.master;
    audio.volumes.music = s.music;
    audio.volumes.sfx = s.sfx;
    audio.applyVolumes();
    input.sensitivity = s.sensitivity;
    input.invertY = s.invertY;
    if (quality) this.engine.setQuality(s.quality);
  }

  async boot(onProgress: (p: number, label: string) => void) {
    const failures = await preloadAll(ALL_MODELS, ICONS, onProgress);
    if (failures.length) throw new Error(`素材 ${failures.length} 件の読み込みに失敗 (${failures[0]})`);
    await document.fonts?.ready;
    // タイトル背景用に店舗を作る (セーブがあればその店)
    const model = GameModel.load() ?? GameModel.create('ふくろう堂');
    await this.buildWorld(model);
    this.mode = 'title';
    this.engine.start();
    this.ui.open(new TitleUI(this));
  }

  private async buildWorld(model: GameModel) {
    // 既存のシーンを破棄
    const scene = this.engine.scene;
    for (const c of [...scene.children]) if (c !== this.engine.camera) scene.remove(c);
    for (const c of [...this.engine.camera.children]) this.engine.camera.remove(c);
    this.hud?.el.remove();
    this.guide?.dispose();
    this.model = model;
    this.world = new World(this.engine, model);
    await this.world.build();
    this.player = new Player(this.engine.camera, () => this.world.colliders());
    this.player.spawn(SPOTS.playerSpawn, 0);
    this.customers = new CustomerManager(this);
    this.interaction = new Interaction(this);
    this.hud = new Hud(this);
    this.hud.el.classList.add('hidden');
    this.ui.root.prepend(this.hud.el);
    this.build?.cancel();
    this.build = new BuildMode(this);
    this.appraisal = new AppraisalUI(this);
    this.checkout = new CheckoutUI(this);
    this.workshop = new WorkshopUI(this);
    this.priceUI = new PriceUI(this);
    this.stockUI = new StockUI(this);
    this.terminal = new TerminalUI(this);
    this.pauseUI = new PauseUI(this);
    this.stocker = new Stocker(this);
    this.guide = new GuideMarker(this);
    this.autoQuality ??= new AutoQuality(this);
    this.world.building.setOpenSign(model.state.phase === 'open');
    this.world.building.updateTime(model.state.minute);
    this.world.building.onDoorOpen = () => { if (this.mode === 'play') audio.doorBell(); };
  }

  async startGame(model: GameModel, isNew = false) {
    if (model !== this.model) await this.buildWorld(model);
    this.mode = 'play';
    this.ui.inGame = true;
    this.hud.el.classList.remove('hidden');
    this.player.spawn(SPOTS.playerSpawn, 0);
    audio.loop('bgm', 'bgm-project-utopia.ogg', 'music', 0.6);
    audio.loop('amb', 'ambience.ogg', 'ambience', 0.35);
    if (!this.started) {
      this.started = true;
      events.on('money:changed', () => this.model.checkObjectives());
      events.on('item:placed', () => this.model.checkObjectives());
      events.on('item:priced', () => this.model.checkObjectives());
      events.on('item:cleaned', () => this.model.checkObjectives());
      events.on('fixture:bought', () => this.model.checkObjectives());
      events.on('upgrade:bought', () => this.model.checkObjectives());
    }
    if (isNew) this.ui.open(new HelpUI());
    else if (this.model.state.phase === 'summary') this.ui.open(new SummaryUI(this));
    else input.lock();
    this.ui.refreshLock();
  }

  // ───── 操作 ─────
  toggleOpen() {
    const s = this.model.state;
    if (s.phase === 'prep') {
      this.model.openShop();
      this.world.building.setOpenSign(true);
      audio.play('success');
      toast('開店しました！ いらっしゃいませ', 'good', 'shop');
      this.model.checkObjectives();
      // 開店直後に 1 人目
      this.customers.spawn('buyer');
    } else if (s.phase === 'open') {
      s.minute = Math.max(s.minute, this.model.closeMinute() - 1);
      toast('本日の受付を終了します', 'info', 'wooden-sign');
    }
  }

  openTerminal() { this.terminal.open(); }

  onUpgrade(id: string) {
    if (id === 'expand') {
      this.world.building.setExpanded(true);
      this.world.rebuildNav();
    }
  }

  save(notify: boolean) {
    const ok = this.model.save();
    if (notify) toast(ok ? 'セーブしました' : 'セーブに失敗しました (ブラウザの保存領域を確認してください)', ok ? 'good' : 'bad', 'save');
  }

  nextDay() {
    this.customers.clearAll();
    this.interaction.reset();
    // 手に持っていた品などを在庫へ
    for (const it of this.model.state.items) {
      if (it.loc.type === 'held' || it.loc.type === 'customer') { it.loc = { type: 'stock' }; this.world.destroyView(it.uid); }
    }
    const notes = this.model.startNextDay();
    this.world.building.setOpenSign(false);
    this.save(false);
    this.ui.open(new MorningUI(this, notes));
  }

  // ───── ループ ─────
  private update(dt: number) {
    this.ui.update(dt);
    if (this.mode === 'title') {
      this.titleT += dt;
      const t = this.titleT * 0.05;
      const cam = this.engine.camera;
      cam.position.set(Math.sin(t) * 5 + 2, 3.2 + Math.sin(t * 0.7) * 0.4, 17 + Math.cos(t) * 2);
      cam.lookAt(0, 1.6, 4);
      this.world.building.updateTime(15 * 60 + 30);
      this.world.update(dt, []);
      input.endFrame();
      return;
    }
    if (this.mode !== 'play') { input.endFrame(); return; }
    const s = this.model.state;
    // Esc: 建築モード > モーダル > ポーズ
    if (input.rawPressed('Escape') && !this.ui.modalOpen && !this.build.active) this.ui.open(this.pauseUI);

    const timeRuns = !this.ui.timePaused() && (s.phase === 'open' || s.phase === 'closing');
    const gameMinutes = timeRuns ? dt * (1 / this.settings.dayLength) : 0;
    if (timeRuns) s.minute += gameMinutes;
    if (s.phase === 'prep') s.minute = OPEN_MINUTE - 60;

    const frozenWorld = this.ui.timePaused();
    if (!frozenWorld) {
      this.player.update(dt);
      this.customers.update(dt, gameMinutes);
      this.world.update(dt, this.customers.positions());
      this.build.update();
      this.interaction.update();
      this.stocker.update(gameMinutes);
      this.guide.update();
      this.autoQuality.update(dt);
    }
    this.world.building.updateTime(s.minute);
    this.hud.update(dt);
    this.checkout.update(dt);

    // 閉店処理
    if (s.phase === 'open' && s.minute >= this.model.closeMinute()) {
      s.phase = 'closing';
      this.closingT = 0;
      this.customers.closeShop();
      this.world.building.setOpenSign(false);
      toast('閉店時間です。残りのお客さんの対応をしましょう', 'info', 'alarm-clock');
    }
    if (s.phase === 'closing') {
      this.closingT += dt;
      const busy = this.customers.anyoneInside() || this.ui.isOpen(this.appraisal) || this.ui.isOpen(this.checkout);
      if ((!busy && this.closingT > 2) || s.minute > this.model.closeMinute() + 90) {
        if (!this.ui.modalOpen) {
          this.interaction.reset();
          this.model.settleDay();
          this.ui.open(new SummaryUI(this));
        }
      }
    }
    this.autosaveT += dt;
    if (this.autosaveT > 60) { this.autosaveT = 0; if (s.phase !== 'summary') this.save(false); }
    input.endFrame();
  }

  /** 自動テスト・デバッグ用フック */
  debug() {
    return {
      game: this,
      state: () => this.model.state,
      customers: () => this.customers.debugSummary(),
      spawn: (role?: 'buyer' | 'seller', arch?: string) => this.customers.spawn(role, arch)?.name,
      teleport: (x: number, z: number, yaw = 0, pitch = 0) => { this.player.pos.set(x, 0, z); this.player.yaw = yaw; this.player.pitch = pitch; },
      setMinute: (m: number) => { this.model.state.minute = m; },
      nav: () => { const m = this.world.nav.debugMesh(); this.engine.scene.add(m); return true; },
      THREE,
      assets,
    };
  }
}
