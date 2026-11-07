import * as THREE from 'three/webgpu';
import { UNIT, type BattleSimulation, type CardStats } from '@cardbattle/sim';
import { arena, simToWorld } from './coords';

/**
 * アリーナの仮オブジェクト（地面・川・橋）と、配置範囲・射程円などの補助表示。
 * 素材が届いたら Medieval Village MegaKit のモデルに置き換える（ASSETS_TODO.md 参照）。
 */
export class ArenaView {
  readonly root = new THREE.Group();
  private readonly overlay: THREE.Mesh;
  private readonly overlayColors: Float32Array;
  private readonly rangeRing: THREE.Mesh;
  private readonly areaDisc: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly ghostMat: THREE.MeshStandardMaterial;

  constructor(private readonly sim: BattleSimulation) {
    const r = sim.rules;
    const riverStart = r.riverStart / UNIT;
    const riverEnd = r.riverEnd / UNIT;

    // 地面：タイルごとに明暗をつけた格子（頂点カラー）
    const ground = this.tileMesh((tx, ty, c) => {
      const inRiver = ty + 0.5 > riverStart && ty + 0.5 < riverEnd;
      if (inRiver) c.set('#2f6f9f');
      else c.set((tx + ty) % 2 === 0 ? '#6fae4f' : '#66a447');
    }, 0);
    ground.receiveShadow = true;
    this.root.add(ground);

    // 川の水面
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(arena.width + 4, riverEnd - riverStart),
      new THREE.MeshStandardMaterial({ color: '#3b8fd0', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.copy(simToWorld(r.width / 2, (r.riverStart + r.riverEnd) / 2, -0.05));
    this.root.add(water);

    // 橋
    const bridgeMat = new THREE.MeshStandardMaterial({ color: '#9c7149', roughness: 0.9 });
    for (const bx of r.bridgeX) {
      const bridge = new THREE.Mesh(new THREE.BoxGeometry((r.bridgeHalfWidth * 2) / UNIT, 0.2, riverEnd - riverStart + 1), bridgeMat);
      bridge.position.copy(simToWorld(bx, (r.riverStart + r.riverEnd) / 2, 0.05));
      bridge.castShadow = bridge.receiveShadow = true;
      this.root.add(bridge);
    }

    // 外周の縁
    const rimMat = new THREE.MeshStandardMaterial({ color: '#3c4a3a', roughness: 1 });
    const rimGeo = new THREE.BoxGeometry(arena.width + 2, 0.6, 1);
    for (const z of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(0, 0.2, z * (arena.height / 2 + 0.5));
      this.root.add(rim);
    }
    const sideGeo = new THREE.BoxGeometry(1, 0.6, arena.height + 2);
    for (const x of [-1, 1]) {
      const rim = new THREE.Mesh(sideGeo, rimMat);
      rim.position.set(x * (arena.width / 2 + 0.5), 0.2, 0);
      this.root.add(rim);
    }

    // 配置できない範囲の表示（ドラッグ中だけ）
    this.overlay = this.tileMesh(() => undefined, 0.03, true);
    this.overlayColors = (this.overlay.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    this.overlay.visible = false;
    this.overlay.renderOrder = 2;
    this.root.add(this.overlay);

    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.visible = false;
    this.rangeRing.renderOrder = 3;
    this.root.add(this.rangeRing);

    this.areaDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.areaDisc.rotation.x = -Math.PI / 2;
    this.areaDisc.visible = false;
    this.areaDisc.renderOrder = 3;
    this.root.add(this.areaDisc);

    this.ghostMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), this.ghostMat);
    this.ghost.visible = false;
    this.root.add(this.ghost);
  }

  /** 1タイル = 1枚の四角形をまとめたメッシュ（頂点カラーで塗り分ける） */
  private tileMesh(paint: (tx: number, ty: number, c: THREE.Color) => void, height: number, transparent = false): THREE.Mesh {
    const w = arena.width;
    const h = arena.height;
    const positions = new Float32Array(w * h * 4 * 3);
    const colors = new Float32Array(w * h * 4 * (transparent ? 4 : 3));
    const indices: number[] = [];
    const c = new THREE.Color();
    let v = 0;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const corners = [
          [tx, ty],
          [tx + 1, ty],
          [tx + 1, ty + 1],
          [tx, ty + 1],
        ];
        c.set('#000000');
        paint(tx, ty, c);
        for (const [cx, cy] of corners) {
          positions.set([cx - w / 2, height, h / 2 - cy], v * 3);
          if (transparent) colors.set([c.r, c.g, c.b, 0], v * 4);
          else colors.set([c.r, c.g, c.b], v * 3);
          v++;
        }
        const b = v - 4;
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3); // 上向きの面
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, transparent ? 4 : 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = transparent
      ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    return new THREE.Mesh(geo, mat);
  }

  /** ドラッグ開始時：置けないタイルを赤く塗る */
  showPlacement(player: number, card: CardStats): void {
    if (card.type === 'spell') {
      this.overlay.visible = false;
      return;
    }
    const w = arena.width;
    const h = arena.height;
    const col = this.overlayColors;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const ok = this.sim.isValidPlacement(player, card, { x: tx * UNIT + UNIT / 2, y: ty * UNIT + UNIT / 2 });
        const base = (ty * w + tx) * 16;
        for (let k = 0; k < 4; k++) col.set(ok ? [1, 1, 1, 0.06] : [0.85, 0.12, 0.1, 0.32], base + k * 4);
      }
    }
    (this.overlay.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.overlay.visible = true;
  }

  /** ドラッグ中の位置表示：ゴースト・射程の円・呪文の範囲 */
  showCursor(card: CardStats, simX: number, simY: number, valid: boolean): void {
    const pos = simToWorld(simX, simY, 0.06);
    const tint = valid ? '#ffffff' : '#ff5a4a';
    if (card.type === 'spell') {
      this.areaDisc.visible = true;
      this.areaDisc.position.copy(pos);
      this.areaDisc.scale.setScalar(card.spellRadius / UNIT);
      this.rangeRing.visible = true;
      this.rangeRing.position.copy(pos);
      this.rangeRing.scale.setScalar(card.spellRadius / UNIT);
      (this.rangeRing.material as THREE.MeshBasicMaterial).color.set('#ffd36b');
      this.ghost.visible = false;
      return;
    }
    this.areaDisc.visible = false;
    const reach = (card.range + card.radius) / UNIT;
    this.rangeRing.visible = card.type === 'building' || card.range > 1500;
    this.rangeRing.position.copy(pos);
    this.rangeRing.scale.setScalar(reach);
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.set(tint);
    this.ghost.visible = true;
    const r = card.radius / UNIT;
    const spread = card.count > 1 ? (card.spawnSpacing / UNIT) * Math.ceil(Math.sqrt(card.count)) * 0.5 : 0;
    this.ghost.scale.set(r + spread, 0.15, r + spread);
    this.ghost.position.set(pos.x, card.flying ? 2 : 0.1, pos.z);
    this.ghostMat.color.set(tint);
  }

  hideCursor(): void {
    this.overlay.visible = false;
    this.rangeRing.visible = false;
    this.areaDisc.visible = false;
    this.ghost.visible = false;
  }
}
