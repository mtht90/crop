import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BALL, BOARD, COIN, CROON, FIELD, GAME, PAYOUT, PUSHER, TRAY, type CroonStageDef } from './config.ts';
import { holeCenters, plateMesh, plateY, type CroonPhysics } from './croon.ts';
import { loadHDR, loadModel, pbrMaterial } from './assets.ts';
import { boardPins, laneDividers, WALL_DOWN_Y, WALL_UP_Y, type PusherPhysics } from './physics.ts';

const FLOOR_Y = -16;
const CAB_HW = TRAY.halfWidth + 0.4; // 筐体外寸の半幅
const CAB_BACK = -11;
const GLASS_TOP = 9.2;
const SCREEN = { y: 13.1, w: 10.4, h: 6.5 };
const ROOF_TOP = SCREEN.y + SCREEN.h / 2 + 1.75;
// 上部クルーンの位置（台座の上に皿を置く）
const CROON_POS = new THREE.Vector3(0, ROOF_TOP + 1.0, BOARD.backZ + 1.0);

export class PusherScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;

  private coinMesh!: THREE.InstancedMesh;
  private pusherMesh!: THREE.Group;
  private ballMesh!: THREE.Mesh;
  private launcher!: THREE.Group;
  private screenTex!: THREE.CanvasTexture;
  private neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color; phase: number }[] = [];
  private checkerLamp!: THREE.MeshBasicMaterial;
  private checkerGlow = 0;
  private chests: THREE.Object3D[] = [];
  private chestSpin = 0;
  private feverUntil = 0;
  private time = 0;
  private dummy = new THREE.Object3D();
  private cameraTarget = new THREE.Vector3(0, 7.4, -2.5);
  private cameraBase = new THREE.Vector3(0, 18.5, 32.5);
  parallax = new THREE.Vector2();
  private croonGroup!: THREE.Group;
  private croonPlates: THREE.Group[] = [];
  private croonRings: THREE.Mesh[][] = [];
  private croonTubes: THREE.CatmullRomCurve3[] = [];
  private croonStageTarget = new THREE.Vector3();
  private croonStageCam = new THREE.Vector3();
  private croonFlash = 0;
  private croonBallPrev: THREE.Vector3 | null = null;
  private croonBall!: THREE.Mesh;
  private croonFocus = 0;
  private croonFocusTarget = 0;
  private croonCamPos = new THREE.Vector3(0, CROON_POS.y + 11.5, CROON_POS.z + 5.5);
  private croonCamTarget = CROON_POS.clone();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);
  }

  async build(screenCanvas: HTMLCanvasElement, onProgress: (p: number) => void): Promise<void> {
    let done = 0;
    const total = 6;
    const tick = <T>(p: Promise<T>) => p.then((v) => (onProgress(++done / total), v));

    const [hdr, studio, mats, chair, chest] = await Promise.all([
      tick(loadHDR('warm_bar_1k.hdr').catch(() => null)),
      loadHDR('studio_small_09_1k.hdr').catch(() => null),
      tick(this.loadMaterials()),
      tick(loadModel('bar_chair_round_01').catch(() => null)),
      tick(loadModel('treasure_chest').catch(() => null)),
    ]);

    // 背景はバー、映り込みはスタジオ（どちらも Poly Haven HDRI）
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envSource = studio ?? hdr;
    if (envSource) this.scene.environment = pmrem.fromEquirectangular(envSource).texture;
    studio?.dispose();
    this.scene.environmentIntensity = 0.55;
    this.scene.background = hdr ?? new THREE.Color(0x120a1c);
    this.scene.backgroundBlurriness = 0.35;
    this.scene.backgroundIntensity = 0.14;

    this.buildLights();
    tick(Promise.resolve());
    this.buildCabinet(mats);
    this.buildBoard(mats);
    this.buildPusher(mats);
    this.buildCoins(mats);
    this.buildBall(mats);
    this.buildScreen(screenCanvas);
    this.buildNeon();
    this.buildProps(chair?.scene ?? null, chest?.scene ?? null);
    this.buildCroon(mats);
    tick(Promise.resolve());

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private async loadMaterials() {
    const [coinFace, coinEdge, field, pusherTop, chrome, body, bodyRed, carpet, gold] = await Promise.all([
      pbrMaterial('Metal051A', { metal: true, color: 0xdde6ff, roughness: 1.7, envMapIntensity: 1.9, normalScale: 0.25 }),
      pbrMaterial('Metal009', { metal: true, repeat: [6, 0.3], color: 0xe8eaee, roughness: 0.6 }),
      pbrMaterial('Plastic015A', { repeat: [3, 3], color: 0x6f86ff, roughness: 0.6, normalScale: 0.5 }),
      pbrMaterial('DiamondPlate008A', { metal: true, repeat: [3, 3], color: 0xd8dde6, roughness: 0.8 }),
      pbrMaterial('Metal009', { metal: true, repeat: [2, 2], roughness: 0.35, envMapIntensity: 1.6 }),
      pbrMaterial('Plastic006', { repeat: [2, 2], color: 0x18181c, roughness: 0.7 }),
      pbrMaterial('Plastic010', { repeat: [2, 2], color: 0xb00c26, roughness: 0.6, envMapIntensity: 0.6 }),
      pbrMaterial('Carpet015', { repeat: [14, 14], roughness: 1, color: 0x5a3a44 }),
      pbrMaterial('Metal048A', { metal: true, roughness: 1.6, envMapIntensity: 1.4 }),
    ]);
    return { coinFace, coinEdge, field, pusherTop, chrome, body, bodyRed, carpet, gold };
  }

  private buildLights(): void {
    const spot = new THREE.SpotLight(0xfff1dd, 2000, 60, 0.5, 0.6, 2);
    spot.position.set(0, 26, 8);
    spot.target.position.set(0, 0, -1.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 8;
    spot.shadow.camera.far = 50;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    this.scene.add(spot, spot.target);

    // 筐体内の照明（ガラス上部の蛍光灯イメージ）
    const fill = new THREE.PointLight(0xffe0c0, 25, 20, 2);
    fill.position.set(0, GLASS_TOP - 0.8, 1);
    this.scene.add(fill);
    const pink = new THREE.PointLight(0xff3399, 80, 25, 2);
    pink.position.set(-CAB_HW - 2, 6, 3);
    const cyan = new THREE.PointLight(0x33ccff, 80, 25, 2);
    cyan.position.set(CAB_HW + 2, 6, 3);
    this.scene.add(pink, cyan);
  }

  private box(
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    shadow = true,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private buildCabinet(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    // 床（カーペット）
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), m.carpet);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const hw = FIELD.halfWidth;
    // フィールド床
    const fieldLen = FIELD.front - BOARD.backZ + 0.5;
    this.box(m.field, hw * 2, 0.5, fieldLen, 0, -0.25, FIELD.front - fieldLen / 2, false);
    // 手前両端のロストゾーン（ここから落ちたメダルはハズレ）
    for (const sx of [-1, 1]) {
      const w = hw - FIELD.winHalfWidth;
      const lost = this.textPlane('LOST', w, 0.9, '#ffb0b0', '#ff2020');
      lost.rotation.x = -Math.PI / 2;
      lost.position.set(sx * (FIELD.winHalfWidth + w / 2), 0.012, FIELD.front - 0.55);
      this.scene.add(lost);
      const zone = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x3a0610, roughness: 0.6 }),
      );
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(sx * (FIELD.winHalfWidth + w / 2), 0.006, FIELD.front - 0.55);
      zone.receiveShadow = true;
      this.scene.add(zone);
      // 落下路の仕切り
      this.box(m.chrome, 0.08, -TRAY.y - 0.5, TRAY.shieldZ - FIELD.front, sx * FIELD.winHalfWidth, (TRAY.y - 0.5) / 2, (FIELD.front + TRAY.shieldZ) / 2, false);
    }
    // フィールド手前のクロームエッジ
    this.box(m.chrome, hw * 2, 0.12, 0.12, 0, -0.06, FIELD.front - 0.06, false);

    // 下部筐体（赤）
    const lowerTop = -0.6;
    const lowerH = lowerTop - FLOOR_Y;
    // 前面パネル（受け皿の下）
    this.box(m.bodyRed, CAB_HW * 2, TRAY.y - 0.5 - FLOOR_Y, 6, 0, (TRAY.y - 0.5 + FLOOR_Y) / 2, FIELD.front + 0.5 + 2.4);
    // 前面（フィールドの真下、メダル落下路の奥）
    this.box(m.body, hw * 2 + 1.2, lowerTop - TRAY.y, 0.3, 0, (lowerTop + TRAY.y) / 2, FIELD.front - 0.2, false);
    // 左右の下部側板
    for (const s of [-1, 1]) {
      this.box(m.bodyRed, 0.8, lowerH, FIELD.front - CAB_BACK + 2.4, s * (CAB_HW - 0.4), (lowerTop + FLOOR_Y) / 2, (FIELD.front + 2.4 + CAB_BACK) / 2);
    }
    this.box(m.bodyRed, CAB_HW * 2, lowerH, 0.6, 0, (lowerTop + FLOOR_Y) / 2, CAB_BACK);
    // 受け皿
    const trayD = TRAY.shieldZ - FIELD.front + 0.2;
    this.box(m.chrome, TRAY.halfWidth * 2, 0.25, trayD, 0, TRAY.y - 0.125, FIELD.front + trayD / 2 - 0.1);
    this.box(m.chrome, TRAY.halfWidth * 2, 1.0, 0.15, 0, TRAY.y + 0.3, TRAY.shieldZ + 0.25);
    // 前面アクリル（落下路のカバー）
    const acrylic = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.05,
      envMapIntensity: 0.6,
      depthWrite: false,
    });
    this.box(acrylic, TRAY.halfWidth * 2, -TRAY.y - 0.6, 0.08, 0, (TRAY.y - 0.6) / 2 + 0.3, TRAY.shieldZ, false);

    // サイドの落とし穴（暗い空間）
    const dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const s of [-1, 1]) {
      this.box(dark, CAB_HW - hw - 0.8, 0.1, FIELD.front - FIELD.sideWallEnd, s * (hw + (CAB_HW - hw - 0.8) / 2), -3, (FIELD.front + FIELD.sideWallEnd) / 2, false);
    }
    // 上部の天板（フィールド左右の縁）
    for (const s of [-1, 1]) {
      this.box(m.chrome, 0.8, 0.3, FIELD.front - CAB_BACK + 2.4, s * (CAB_HW - 0.4), lowerTop + 0.15, (FIELD.front + 2.4 + CAB_BACK) / 2);
    }

    // ガラス側板（物理のサイド壁に対応）
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xddeeff,
      roughness: 0.02,
      metalness: 0,
      transparent: true,
      opacity: 0.07,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glassLen = FIELD.sideWallEnd - BOARD.backZ + 0.4;
    for (const s of [-1, 1]) {
      this.box(glass, 0.08, GLASS_TOP, glassLen, s * (hw + 0.05), GLASS_TOP / 2, FIELD.sideWallEnd - glassLen / 2, false);
      // クロームの柱
      this.box(m.chrome, 0.3, GLASS_TOP + 0.6, 0.3, s * (hw + 0.2), (GLASS_TOP + 0.6) / 2 - 0.3, FIELD.sideWallEnd);
      this.box(m.chrome, 0.3, 0.3, glassLen, s * (hw + 0.2), GLASS_TOP, FIELD.sideWallEnd - glassLen / 2);
    }

    // 上部筐体の背面・天井
    const upperBack = BOARD.backZ - 0.6;
    this.box(m.body, CAB_HW * 2, SCREEN.y + SCREEN.h / 2 + 1.5 - lowerTop, 0.6, 0, (SCREEN.y + SCREEN.h / 2 + 1.5 + lowerTop) / 2, upperBack - 0.3);
    for (const s of [-1, 1]) {
      this.box(m.bodyRed, 0.8, SCREEN.y + SCREEN.h / 2 + 1.5 - lowerTop, 2.6, s * (CAB_HW - 0.4), (SCREEN.y + SCREEN.h / 2 + 1.5 + lowerTop) / 2, upperBack + 0.7);
    }
    // 液晶まわりのベゼル
    this.box(m.body, SCREEN.w + 0.8, SCREEN.h + 0.8, 0.4, 0, SCREEN.y, BOARD.backZ - 0.05);
    this.box(m.chrome, SCREEN.w + 1.0, 0.2, 0.5, 0, SCREEN.y - SCREEN.h / 2 - 0.4, BOARD.backZ);
    this.box(m.chrome, SCREEN.w + 1.0, 0.2, 0.5, 0, SCREEN.y + SCREEN.h / 2 + 0.4, BOARD.backZ);
    // 天板
    this.box(m.bodyRed, CAB_HW * 2 + 0.2, 0.5, 3.4, 0, SCREEN.y + SCREEN.h / 2 + 1.5, upperBack + 0.9);
  }

  private buildBoard(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    const hw = FIELD.halfWidth;
    const midZ = (BOARD.frontZ + BOARD.backZ) / 2;
    const depth = BOARD.frontZ - BOARD.backZ;
    // ボード背面（プッシャー上面すぐ上〜上端）
    const backMat = m.bodyRed.clone();
    backMat.color.set(0x2a0a40);
    const backH = BOARD.top - PUSHER.height;
    this.box(backMat, hw * 2, backH, 0.3, 0, PUSHER.height + 0.04 + backH / 2, BOARD.backZ - 0.15, false);

    // ピン（クローム）
    const pins = boardPins();
    const pinGeo = new THREE.CylinderGeometry(BOARD.pinRadius, BOARD.pinRadius, depth, 12);
    pinGeo.rotateX(Math.PI / 2);
    const pinMesh = new THREE.InstancedMesh(pinGeo, m.chrome, pins.length);
    pins.forEach((p, i) => {
      this.dummy.position.set(p.x, p.y, midZ);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      pinMesh.setMatrixAt(i, this.dummy.matrix);
    });
    pinMesh.castShadow = true;
    this.scene.add(pinMesh);

    // レーン仕切り
    for (const x of laneDividers()) {
      const h = BOARD.laneDividerTop - BOARD.bottom;
      this.box(m.chrome, 0.12, h, depth, x, BOARD.bottom + h / 2, midZ);
    }
    // ボード下端の縁
    this.box(m.chrome, hw * 2, 0.12, 0.1, 0, BOARD.bottom - 0.06, BOARD.frontZ + 0.05);

    // チェッカー（中央レーン）のランプ
    this.checkerLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.1), toneMapped: false });
    const w = BOARD.checkerHalfWidth * 2 - 0.1;
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.35), this.checkerLamp);
    lamp.position.set(0, BOARD.bottom + 0.3, BOARD.backZ + 0.01);
    this.scene.add(lamp);
    const label = this.textPlane('START', w * 1.1, 0.5, '#ffe14a', '#ff8800');
    label.position.set(0, BOARD.laneDividerTop + 0.15, BOARD.backZ + 0.02);
    this.scene.add(label);

    // 手前ガラス
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.03,
      transparent: true,
      opacity: 0.05,
      envMapIntensity: 0.8,
      depthWrite: false,
    });
    const gh = BOARD.top + 0.3 - BOARD.bottom;
    this.box(glass, hw * 2, gh, 0.05, 0, BOARD.bottom + gh / 2, BOARD.frontZ + 0.03, false);
    this.box(m.chrome, hw * 2 + 0.3, 0.25, 0.4, 0, BOARD.top + 0.4, midZ);

    // 払い出しシュート（左右）
    for (const sx of [-1, 1]) {
      const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.6, 20, 1, true), m.chrome);
      chute.rotation.z = -sx * 1.1;
      chute.position.set(sx * (hw - 0.35), PAYOUT.dropY + 0.55, PAYOUT.dropZ + 0.6);
      chute.castShadow = true;
      this.scene.add(chute);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24), this.neonMat(new THREE.Color(3, 1.6, 0.3), sx * 0.3));
      rim.rotation.copy(chute.rotation);
      rim.rotateX(Math.PI / 2);
      rim.position.copy(chute.position).add(new THREE.Vector3(-sx * 0.72, -0.33, 0));
      this.scene.add(rim);
    }

    // 投入口（ランチャー）
    this.launcher = new THREE.Group();
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.6), m.body);
    nozzle.castShadow = true;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.5, 2.0), toneMapped: false }),
    );
    arrow.rotation.x = Math.PI;
    arrow.position.y = -0.55;
    this.launcher.add(nozzle, arrow);
    this.launcher.position.set(0, BOARD.top + 0.85, midZ);
    this.scene.add(this.launcher);
    // レール
    this.box(m.chrome, hw * 2 + 0.3, 0.12, 0.12, 0, BOARD.top + 1.25, midZ + 0.2);
  }

  private buildPusher(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    const g = new THREE.Group();
    const w = FIELD.halfWidth * 2 - 0.04;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, PUSHER.height - 0.02, PUSHER.depth), [
      m.chrome,
      m.chrome,
      m.pusherTop,
      m.chrome,
      m.chrome,
      m.chrome,
    ]);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // 前面の発光ライン
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.12),
      this.neonMat(new THREE.Color(0.2, 0.9, 3.0), 0),
    );
    strip.position.set(0, 0.1, PUSHER.depth / 2 + 0.01);
    g.add(strip);
    this.pusherMesh = g;
    this.scene.add(g);
  }

  private buildCoins(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    const geo = new THREE.CylinderGeometry(COIN.radius, COIN.radius, COIN.halfThickness * 2, 36, 1);
    // 縁にギザ（溝）を付ける代わりにノーマルマップの縦スケールで質感を出す
    this.coinMesh = new THREE.InstancedMesh(geo, [m.coinEdge, m.coinFace, m.coinFace], GAME.maxCoins);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.castShadow = true;
    this.coinMesh.receiveShadow = true;
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
    // 黄金メダル（光る金色）
    const goldFace = m.gold.clone();
    goldFace.emissive = new THREE.Color(0.9, 0.55, 0.05);
    goldFace.emissiveIntensity = 0.6;
    this.goldMesh = new THREE.InstancedMesh(geo, goldFace, 32);
    this.goldMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.goldMesh.castShadow = true;
    this.goldMesh.count = 0;
    this.goldMesh.frustumCulled = false;
    this.scene.add(this.goldMesh);

    // サイドウォール（BAR 揃いでせり上がる）
    const len = FIELD.front - FIELD.sideWallEnd + 0.4;
    for (const sx of [-1, 1]) {
      const wall = new THREE.Group();
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 6, len),
        new THREE.MeshPhysicalMaterial({ color: 0x66ddff, transparent: true, opacity: 0.25, roughness: 0.1, emissive: 0x115566, depthWrite: false }),
      );
      wall.add(glass);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, len), this.neonMat(new THREE.Color(0.4, 2.4, 3.0), sx * 0.2));
      edge.position.y = 3;
      wall.add(edge);
      wall.position.set(sx * (FIELD.halfWidth + 0.2), WALL_DOWN_Y, FIELD.sideWallEnd + len / 2 - 0.2);
      wall.visible = false;
      this.wallMeshes.push(wall);
      this.scene.add(wall);
    }
  }

  private goldMesh!: THREE.InstancedMesh;
  private wallMeshes: THREE.Group[] = [];

  private buildBall(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    const mat = m.gold.clone();
    mat.emissive = new THREE.Color(0.5, 0.25, 0.0);
    mat.emissiveIntensity = 0.6;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.radius, 40, 24), mat);
    this.ballMesh.castShadow = true;
    this.ballMesh.visible = false;
    this.scene.add(this.ballMesh);
  }

  private buildScreen(canvas: HTMLCanvasElement): void {
    this.screenTex = new THREE.CanvasTexture(canvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false });
    mat.color.setScalar(0.95);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mat);
    screen.position.set(0, SCREEN.y, BOARD.backZ + 0.16);
    this.scene.add(screen);

    // 上部の看板
    const sign = this.textPlane('MEDAL PUSHER', 7.4, 1.1, '#ffffff', '#ff2a8a', 'italic 900');
    sign.position.set(0, ROOF_TOP + 0.3, CROON_POS.z + 5.4);
    this.scene.add(sign);
  }

  private neonMat(color: THREE.Color, phase: number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone(), toneMapped: false });
    this.neon.push({ mat, base: color.clone(), phase });
    return mat;
  }

  private buildNeon(): void {
    const tube = (from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, phase: number) => {
      const len = from.distanceTo(to);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, len, 4, 8), this.neonMat(color, phase));
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.scene.add(mesh);
    };
    const pink = new THREE.Color(3.0, 0.3, 1.2);
    const cyan = new THREE.Color(0.3, 1.8, 3.0);
    const gold = new THREE.Color(3.0, 1.8, 0.4);
    const top = SCREEN.y + SCREEN.h / 2 + 1.0;
    const z = BOARD.backZ + 0.45;
    for (const s of [-1, 1]) {
      tube(new THREE.Vector3(s * (CAB_HW - 0.1), -0.4, FIELD.front + 2.5), new THREE.Vector3(s * (CAB_HW - 0.1), -0.4, CAB_BACK + 1), s < 0 ? pink : cyan, 0);
      tube(new THREE.Vector3(s * (SCREEN.w / 2 + 0.6), SCREEN.y - SCREEN.h / 2 - 0.3, z), new THREE.Vector3(s * (SCREEN.w / 2 + 0.6), top, z), s < 0 ? pink : cyan, 0.5);
    }
    tube(new THREE.Vector3(-SCREEN.w / 2 - 0.6, top, z), new THREE.Vector3(SCREEN.w / 2 + 0.6, top, z), gold, 0.25);
    tube(new THREE.Vector3(-FIELD.halfWidth, GLASS_TOP + 0.25, FIELD.sideWallEnd), new THREE.Vector3(FIELD.halfWidth, GLASS_TOP + 0.25, FIELD.sideWallEnd), gold, 0.75);
    tube(new THREE.Vector3(-TRAY.halfWidth, TRAY.y + 0.85, TRAY.shieldZ + 0.35), new THREE.Vector3(TRAY.halfWidth, TRAY.y + 0.85, TRAY.shieldZ + 0.35), pink, 0.1);

    // フィールド上部の照明パネル
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfWidth * 2, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.2, 1.1), toneMapped: false }),
    );
    panel.rotation.x = Math.PI / 2;
    panel.position.set(0, GLASS_TOP - 0.05, FIELD.sideWallEnd - 0.4);
    this.scene.add(panel);
  }

  private buildProps(chair: THREE.Object3D | null, chest: THREE.Object3D | null): void {
    // Poly Haven モデル（1単位=5cm なので 1m = 20 単位）
    if (chair) {
      chair.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      for (const x of [-13, 13]) {
        const c = chair.clone();
        c.scale.setScalar(20);
        c.position.set(x, FLOOR_Y, 9);
        c.rotation.y = x < 0 ? 0.4 : -0.4;
        this.scene.add(c);
      }
    }
    if (chest) {
      chest.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      const box = new THREE.Box3().setFromObject(chest);
      const size = box.getSize(new THREE.Vector3());
      const s = 6 / Math.max(size.x, size.z);
      chest.scale.setScalar(s);
      chest.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
      // 天板の左右に宝箱を飾る（フィーバー時に回転）
      for (const sx of [-1, 1]) {
        const holder = new THREE.Group();
        holder.add(sx < 0 ? chest : chest.clone());
        holder.position.set(sx * (CAB_HW + 3.2), FLOOR_Y, -2);
        holder.userData.baseY = FLOOR_Y;
        holder.rotation.y = -sx * 0.35;
        holder.userData.baseRot = holder.rotation.y;
        this.chests.push(holder);
        this.scene.add(holder);
      }
    }
  }

  private buildCroon(m: Awaited<ReturnType<PusherScene['loadMaterials']>>): void {
    const g = new THREE.Group();
    g.position.copy(CROON_POS);
    this.scene.add(g);
    this.croonGroup = g;
    const roofY = ROOF_TOP - CROON_POS.y;
    // 筐体の上に張り出す土台
    const base = new THREE.Mesh(new THREE.BoxGeometry(CAB_HW * 2 + 2.6, 0.5, 9.4), m.body);
    base.position.set(0, roofY - 0.25 + 0.01, 0.6);
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    CROON.stages.forEach((def, si) => {
      const stage = new THREE.Group();
      stage.position.set(def.x, def.y, def.z);
      g.add(stage);
      const R = def.radius;
      // 支柱
      const colH = def.y - roofY - def.depth - 0.77;
      if (colH > 0.05) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.35, R * 0.5, colH, 32), m.chrome);
        col.position.y = -def.depth - 0.77 - colH / 2;
        col.castShadow = true;
        stage.add(col);
      }
      // 皿の裏（台座）
      // 皿の面より下に置く（皿の上に重ならないように）
      const under = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R * 0.8, 0.3, 64), m.bodyRed);
      under.position.y = -def.depth - 0.62;
      stage.add(under);

      // 回転する皿（穴あき）
      const plate = new THREE.Group();
      stage.add(plate);
      this.croonPlates.push(plate);
      const mesh = plateMesh(def, 'all');
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geo.computeVertexNormals();
      const tex = this.plateTexture(def, si);
      const plateMat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissiveMap: tex,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        side: THREE.DoubleSide,
      });
      const pm = new THREE.Mesh(geo, plateMat);
      pm.receiveShadow = true;
      plate.add(pm);
      // 穴の縁（クロームのリング）と穴の中の暗い筒
      const rings: THREE.Mesh[] = [];
      holeCenters(def).forEach((h) => {
        const y = plateY(def, Math.hypot(h.x, h.z));
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(h.r + 0.02, 0.035, 8, 32),
          new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.25, emissive: 0x000000 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(h.x, y + 0.01, h.z);
        plate.add(ring);
        rings.push(ring);
        const pit = new THREE.Mesh(
          new THREE.CylinderGeometry(h.r, h.r, 0.3, 24, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x050208, side: THREE.BackSide }),
        );
        pit.position.set(h.x, y - 0.15, h.z);
        plate.add(pit);
      });
      this.croonRings.push(rings);

      // 外周：クロームの帯＋ガラスの壁＋ステージ色のネオン
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.35, 64, 1, true), m.chrome);
      band.position.y = 0.05;
      stage.add(band);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(R + 0.1, R + 0.1, 1.1, 64, 1, true),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
      );
      glass.position.y = 0.75;
      stage.add(glass);
      const c = new THREE.Color(def.color);
      const neon = new THREE.Mesh(
        new THREE.TorusGeometry(R + 0.13, 0.05, 8, 96),
        this.neonMat(new THREE.Color(c.r * 2.6, c.g * 2.6, c.b * 2.6), si * 0.3),
      );
      neon.rotation.x = Math.PI / 2;
      neon.position.y = 1.3;
      stage.add(neon);
      // 段の名前
      const label = this.textPlane(si === CROON.stages.length - 1 ? 'FINAL' : `STAGE ${si + 1}`, 1.8, 0.38, '#ffffff', def.color);
      // 外周の帯の正面に貼る（皿の上に重ならないように）
      label.position.set(0, -0.55, R + 0.2);
      stage.add(label);
      // 照明
      const spot = new THREE.SpotLight(0xffffff, 60 + R * 20, 14, 0.8, 0.5, 2);
      spot.position.set(0, 6, 2);
      spot.target = plate;
      stage.add(spot);
    });

    // 透明なシュート。0番は投入シュート（上から1段目へ）、i番は (i-1)段目の中央の穴 → i段目。
    // どれも常に下り坂で、最後は皿の縁に沿う向き（ボールが打ち出される向き）で入る
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe8f4ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const collarMat = m.chrome;
    const ballY = (def: CroonStageDef, r: number) => def.y + plateY(def, r) + CROON.ballRadius + 0.08;
    for (let i = 0; i < CROON.stages.length; i++) {
      const b = CROON.stages[i];
      const rb = b.radius - CROON.ballRadius - 0.04;
      const a = b.launchAngle;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); // 打ち出し方向（接線）
      const entry = new THREE.Vector3(b.x + Math.cos(a) * rb, ballY(b, rb), b.z - Math.sin(a) * rb);
      const in1 = entry.clone().addScaledVector(dir, -0.7).add(new THREE.Vector3(0, 0.08, 0));
      const in2 = entry.clone().addScaledVector(dir, -1.6).add(new THREE.Vector3(0, 0.3, 0));
      let pts: THREE.Vector3[];
      if (i === 0) {
        // 投入シュート：後ろの高いところから螺旋ぎみに降りてくる
        const top = new THREE.Vector3(b.x - 1.2, b.y + 3.2, b.z - 2.8);
        const mid = new THREE.Vector3(b.x - 2.6, b.y + 1.6, b.z - 1.2);
        pts = [top, top.clone().add(new THREE.Vector3(-0.4, -0.8, 0.3)), mid, in2, in1, entry];
      } else {
        const p = CROON.stages[i - 1];
        const e0 = new THREE.Vector3(p.x, p.y - p.depth - 0.15, p.z);
        const e1 = e0.clone().add(new THREE.Vector3(0, -0.35, -0.35));
        // 途中は奥側を回り、高さは出口→入口へ単調に下げる
        const m1 = e1.clone().lerp(in2, 0.35);
        m1.z = Math.min(e1.z, in2.z) - 1.4;
        m1.y = e1.y + (in2.y - e1.y) * 0.35;
        const m2 = e1.clone().lerp(in2, 0.7);
        m2.z = Math.min(e1.z, in2.z) - 1.1;
        m2.y = e1.y + (in2.y - e1.y) * 0.7;
        pts = [e0, e1, m1, m2, in2, in1, entry];
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.croonTubes.push(curve);
      const tubeR = CROON.ballRadius + 0.07;
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, tubeR, 16, false), tubeMat));
      // クロームの継ぎ手と支柱
      const len = curve.getLength();
      const n = Math.max(2, Math.round(len / 1.1));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const pos = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(tubeR + 0.02, 0.035, 8, 24), collarMat);
        collar.position.copy(pos);
        collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        g.add(collar);
        if (k > 0 && k < n && k % 2 === 1) {
          const h = pos.y - (roofY + 0.0);
          if (h > 0.3) {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 8), collarMat);
            rod.position.set(pos.x, pos.y - h / 2 - tubeR, pos.z);
            g.add(rod);
          }
        }
      }
    }

    // ボール
    const ballMat = m.chrome.clone();
    ballMat.emissive = new THREE.Color(0.4, 0.35, 0.1);
    ballMat.emissiveIntensity = 0.5;
    this.croonBall = new THREE.Mesh(new THREE.SphereGeometry(CROON.ballRadius, 32, 20), ballMat);
    this.croonBall.castShadow = true;
    this.croonBall.visible = false;
    g.add(this.croonBall);
  }

  /** 皿の模様（ステージ色の放射ストライプ＋穴の配当） */
  private plateTexture(def: CroonStageDef, si: number): THREE.CanvasTexture {
    const S = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const c = canvas.getContext('2d')!;
    const R = def.radius;
    const toPx = (v: number) => S / 2 + (v / (2 * R)) * S;
    const base = new THREE.Color(def.color);
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#' + base.clone().offsetHSL(0, 0, 0.12).getHexString());
    g.addColorStop(0.7, def.color);
    g.addColorStop(1, '#' + base.clone().offsetHSL(0, 0, -0.18).getHexString());
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // 放射ストライプ
    c.save();
    c.translate(S / 2, S / 2);
    for (let i = 0; i < 24; i++) {
      c.rotate((Math.PI * 2) / 24);
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, S / 2, 0, (Math.PI * 2) / 24);
      c.fill();
    }
    c.restore();
    // バンクの境目のライン
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(S / 2, S / 2, (S / 2) * CROON.bankStart, 0, Math.PI * 2);
    c.stroke();
    // 穴の配当
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    holeCenters(def).forEach((h, i) => {
      const isCenter = i === holeCenters(def).length - 1;
      const text = h.label === 'NEXT' ? 'NEXT' : String(h.label);
      // 穴の外側（中心から離れる方向）に文字を置く
      const rr = Math.hypot(h.x, h.z);
      const off = isCenter ? 0 : h.r + 0.32;
      const lx = isCenter ? 0 : h.x + (h.x / rr) * off;
      const lz = isCenter ? -(h.r + 0.3) : h.z + (h.z / rr) * off;
      c.save();
      c.translate(toPx(lx), toPx(lz));
      c.font = `900 ${isCenter ? 74 : 64}px Orbitron, sans-serif`;
      c.lineWidth = 10;
      c.strokeStyle = 'rgba(40,0,30,0.85)';
      c.strokeText(text, 0, 0);
      c.fillStyle = h.label === 'JP' ? '#fff27a' : h.label === 'NEXT' ? '#ffffff' : '#ffe9a8';
      c.fillText(text, 0, 0);
      c.restore();
    });
    // 中央の穴のまわりの輪
    c.strokeStyle = def.center === 'JP' ? '#fff27a' : '#ffffff';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(S / 2, S / 2, toPx(def.centerRadius + 0.14) - S / 2, 0, Math.PI * 2);
    c.stroke();
    void si;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  focusCroon(on: boolean): void {
    this.croonFocusTarget = on ? 1 : 0;
  }

  /** カメラを指定の段へ */
  focusCroonStage(i: number): void {
    const def = CROON.stages[i];
    const target = CROON_POS.clone().add(new THREE.Vector3(def.x, def.y - 0.2, def.z));
    this.croonStageTarget.copy(target);
    this.croonStageCam.copy(target).add(new THREE.Vector3(def.x * 0.15, 4.2 + def.radius * 1.6, 3.2 + def.radius * 1.3));
    // まだ寄っていないときは、寄り先をいきなり合わせる
    if (this.croonFocus < 0.05) {
      this.croonCamTarget.copy(this.croonStageTarget);
      this.croonCamPos.copy(this.croonStageCam);
    }
  }

  flashCroonHole(): void {
    this.croonFlash = 3;
  }

  updateCroon(croon: CroonPhysics): void {
    // カメラの寄り先をなめらかに移動
    this.croonCamTarget.lerp(this.croonStageTarget, 0.06);
    this.croonCamPos.lerp(this.croonStageCam, 0.06);
    CROON.stages.forEach((_, i) => {
      this.croonPlates[i].rotation.y = croon.stageAngle(i);
      this.croonRings[i].forEach((ring) => (ring.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0));
    });
    // 入った穴を光らせる
    const res = croon.state === 'settled' ? croon.result : null;
    if (res) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 14);
      const col = res.prize === 'JP' ? [3, 0.6, 2.4] : [3, 2.4, 0.4];
      (this.croonRings[res.stage][res.hole].material as THREE.MeshStandardMaterial).emissive.setRGB(col[0] * k, col[1] * k, col[2] * k);
    }
    // ボールの位置：シュート内 / 穴に吸い込まれ中 / 皿の上（物理）
    let pos: { x: number; y: number; z: number } | null = null;
    if (croon.state === 'transfer') {
      const tp = Math.min(1, croon.transferProgress);
      // 重力で加速していくように（進み = t^2）
      pos = this.croonTubes[croon.transferTo].getPointAt(tp * tp);
    } else if (croon.state === 'sinking') {
      pos = croon.sinkPosition;
    } else {
      pos = croon.ballPosition;
    }
    this.croonBall.visible = !!pos;
    if (pos) {
      // 物理では滑らせているので、見た目は移動量から転がりを計算する
      const next = new THREE.Vector3(pos.x, pos.y, pos.z);
      if (this.croonBallPrev) {
        const d = next.clone().sub(this.croonBallPrev);
        d.y = 0;
        const dist = d.length();
        if (dist > 1e-5 && dist < 1) {
          const axis = new THREE.Vector3(0, 1, 0).cross(d).normalize();
          this.croonBall.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / CROON.ballRadius));
        }
      }
      this.croonBallPrev = next;
      this.croonBall.position.copy(next);
    } else {
      this.croonBallPrev = null;
    }
  }

  private textPlane(text: string, w: number, h: number, fill: string, glow: string, weight = '900'): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round((1024 * h) / w);
    const c = canvas.getContext('2d')!;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const size = canvas.height * 0.72;
    c.font = `${weight} ${size}px Orbitron, sans-serif`;
    const fit = Math.min(1, (canvas.width * 0.94) / c.measureText(text).width);
    c.font = `${weight} ${size * fit}px Orbitron, sans-serif`;
    c.shadowColor = glow;
    c.shadowBlur = canvas.height * 0.2;
    c.fillStyle = glow;
    c.fillText(text, canvas.width / 2, canvas.height / 2);
    c.shadowBlur = canvas.height * 0.06;
    c.fillStyle = fill;
    c.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
    mat.color.setScalar(1.6);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // 縦長画面では引いて全体を収める
    this.camera.fov = w / h < 1 ? 42 + (1 - w / h) * 34 : 42;
    this.camera.updateProjectionMatrix();
  }

  setLauncherX(x: number): void {
    this.launcher.position.x += (x - this.launcher.position.x) * 0.5;
  }

  pulseChecker(): void {
    this.checkerGlow = 1;
  }

  fever(seconds: number): void {
    this.feverUntil = this.time + seconds;
    this.chestSpin = seconds;
  }

  render(dt: number, physics: PusherPhysics, screenDirty: boolean): void {
    this.time += dt;
    // メダル
    let i = 0;
    let gi = 0;
    for (const coin of physics.coins.values()) {
      if (i >= GAME.maxCoins) break;
      const p = coin.body.translation();
      const r = coin.body.rotation();
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.set(r.x, r.y, r.z, r.w);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      if (coin.gold && gi < 32) this.goldMesh.setMatrixAt(gi++, this.dummy.matrix);
      else this.coinMesh.setMatrixAt(i++, this.dummy.matrix);
    }
    this.coinMesh.count = i;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.goldMesh.count = gi;
    this.goldMesh.instanceMatrix.needsUpdate = true;
    // サイドウォール
    const wy = WALL_DOWN_Y + (WALL_UP_Y - WALL_DOWN_Y) * physics.wallLevel;
    for (const w of this.wallMeshes) {
      w.position.y = wy;
      w.visible = physics.wallLevel > 0.01;
    }

    // プッシャー
    const t = physics.pusherTranslation;
    this.pusherMesh.position.set(t.x, t.y, t.z);

    // ボール
    if (physics.ball) {
      const p = physics.ball.body.translation();
      const r = physics.ball.body.rotation();
      this.ballMesh.visible = true;
      this.ballMesh.position.set(p.x, p.y, p.z);
      this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w);
    } else {
      this.ballMesh.visible = false;
    }

    if (screenDirty) this.screenTex.needsUpdate = true;

    // ネオンの明滅
    const fever = this.time < this.feverUntil;
    for (const n of this.neon) {
      const k = fever
        ? 0.4 + 0.9 * Math.max(0, Math.sin((this.time * 10 + n.phase * 6) * Math.PI))
        : 0.85 + 0.15 * Math.sin((this.time * 0.8 + n.phase) * Math.PI * 2);
      n.mat.color.copy(n.base).multiplyScalar(k);
    }
    this.checkerGlow = Math.max(0, this.checkerGlow - dt * 1.5);
    const cg = 0.6 + this.checkerGlow * 3 + (fever ? Math.sin(this.time * 20) * 0.5 + 0.5 : 0);
    this.checkerLamp.color.setRGB(1 * cg, 0.75 * cg, 0.1 * cg);

    if (this.chestSpin > 0) this.chestSpin -= dt;
    this.chests.forEach((c, i) => {
      if (this.chestSpin > 0) c.rotation.y += dt * 6 * (i === 0 ? 1 : -1);
      else c.rotation.y += (c.userData.baseRot - c.rotation.y) * 0.08;
      c.position.y = c.userData.baseY + (this.chestSpin > 0 ? Math.abs(Math.sin(this.time * 6 + i)) * 0.8 : 0);
    });

    // カメラ（クルーン抽選中はクルーンへ寄る）
    const k = 1 - Math.exp(-dt * 3);
    this.croonFocus += (this.croonFocusTarget - this.croonFocus) * k;
    const f = this.croonFocus * this.croonFocus * (3 - 2 * this.croonFocus);
    const pos = new THREE.Vector3(
      this.cameraBase.x + this.parallax.x * 2.0,
      this.cameraBase.y + this.parallax.y * 1.2,
      this.cameraBase.z,
    ).lerp(this.croonCamPos, f);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.cameraTarget.clone().lerp(this.croonCamTarget, f));
    this.composer.render(dt);
  }
}
