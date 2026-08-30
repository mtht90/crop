# Engine Baseline

記録日: 2026-08-30

## インストール済みエンジン

```
$ godot --headless --version
4.3.stable.official.77dcf97d8
```

- Godot バージョン: **4.3 stable** (公式ビルド, 2024リリース)
- レンダラ: Forward+ (Vulkan) を採用（`project.godot` の `rendering/renderer/rendering_method = "forward_plus"`）
- 実行バイナリ: `/opt/godot/Godot_v4.3-stable_linux.x86_64`（`godot` としてPATHに配置）
- 取得元: `https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip`
  （公式リリースの Linux headless 対応ビルド。GUI無しの CI 環境でも `--headless` で動作確認済み）

## 第9章 API 検証プロトコルの実施記録

このバージョン (4.3) において存在有無を実測確認したクラス/API:

| クラス/API | 存在確認方法 | 結果 (4.3.stable) |
|---|---|---|
| `SkeletonIK3D` | `ClassDB.class_exists` | **存在する**（CCDIK系, `start`/`stop`/`set_target_transform` 等あり） |
| `SkeletonModifier3D` | 同上 | **存在する**（`_process_modification` 仮想メソッドを持つ基底クラス） |
| `LookAtModifier3D` | 同上 | **存在しない**（4.4以降で追加されたクラス。4.3では使用不可） |
| `MultiplayerSynchronizer` | 同上 | **存在する**（`delta_interval` プロパティあり = デルタ圧縮同期に対応） |
| `MultiplayerSpawner` | 同上 | **存在する** |
| `SceneMultiplayer` | 同上 | **存在する**（`max_delta_packet_size` 等の帯域調整プロパティあり） |
| `ENetMultiplayerPeer` | 同上 | **存在する** |
| `GPUParticles3D` | 同上 | **存在する** |
| `CompositorEffect` / `Compositor` | 同上 | **存在する**（4.3でポストプロセスのカスタムコンポジタが使用可能） |
| `NavigationAgent3D` | 同上 | **存在する** |
| `FastNoiseLite` | 同上 | **存在する**（カメラシェイクのノイズ源として Phase 2 で使用） |
| `SpringArm3D` | 同上 | **存在する** |
| `Camera3D` (`fov`/`h_offset`/`v_offset`) | 同上 | **存在する**（ADS FOV遷移・シェイクオフセットに使用） |
| `PhysicsRayQueryParameters3D` / `PhysicsDirectSpaceState3D.intersect_ray` | 同上 | **存在する**（サーバー権威ヒットスキャン判定に使用、Phase 3） |
| `Curve2D` (`point_count`/`get_point_position`) | 同上 | **存在する**（決定論的リコイルパターンの格納に使用、Phase 3） |

### 4.3 における設計上の結論
- **足のIK / エイムオフセットは `LookAtModifier3D` を使わない。** 4.3には存在しないため、
  Phase 2 では `SkeletonIK3D`（CCDIK）または `SkeletonModifier3D` を継承した
  カスタムモディファイアでボーン回転を上書きする方式を採用する（`docs/DECISIONS.md` に記録）。
- `MultiplayerSynchronizer` の `delta_interval` によりデルタ圧縮寄りの同期が組み込みで可能だが、
  本プロジェクトは仕様上「独自スナップショット層」を主とするため、
  `MultiplayerSynchronizer` は非予測オブジェクト（ピックアップの見た目など）限定で使用する。

再検証コマンド:
```bash
godot --headless --script tools/verify_api.gd
```
未確認のまま実装したコードはレビュー不合格とする。以降のフェーズで新しいAPIを使う際は
このスクリプトの `CLASSES_TO_CHECK` に追加し、再実行して結果をここに追記すること。

## 検証手順（再現用）

```bash
godot --headless --script tools/verify_api.gd
```
