# Animation Pipeline (Mixamo → Godot 4.3)

このドキュメントは第4.5章「アニメーション」で要求される Mixamo リグの導入手順を定義する。
**現時点（Phase 2 終了時点）ではリポジトリに実際のキャラクターアセットは未導入**であり、
本書は導入時の再現可能な手順書として先に整備するもの。理由は「既知の負債」に記載する。

## 1. Mixamo からの取得手順

1. Mixamo でベースキャラクター（例: `Y Bot` / `X Bot`）と、必要なアニメーション
   （Idle / Walk / Run / Jump-Start / Jump-Loop / Jump-Land / Fire / Reload 等）を
   FBX (Without Skin ではなく **With Skin**、`FPS: 30`、`Format: FBX Binary`) でダウンロードする。
2. 各アニメーションは "In Place" を有効にしてダウンロードする
   （ルートモーションを使わずコードが速度の権威を持つ、第4.5章の方針のため）。
3. 取得した FBX 群を `assets/characters/<hero_id>/mixamo_raw/` に配置する
   （ライセンス上リポジトリへの再配布が制限される場合は `ASSET_LICENSES.md` の注意書きに従い、
   各開発者が個別取得する運用に切り替える）。

## 2. Godot への Import と骨名リネーム

Mixamo の骨名は `mixamorig:Hips` のようなプレフィックス付きで出力される。
Godot 側の `AnimationTree` / `SkeletonModifier3D` 系ノードで扱いやすくするため、
Import 時に以下の変換を行う:

1. `.fbx` の Import 設定（`Advanced` タブ）で `Rename Bones` を有効化し、
   `mixamorig:` プレフィックスを除去するリネームマップを適用する。
2. リターゲット先の共通スケルトンボーン名（`Hips`, `Spine`, `Spine1`, `Spine2`,
   `Neck`, `Head`, `LeftShoulder`, `LeftArm`, ... ）に統一し、
   全ヒーローが同一のボーン名規約に従うようにする
   （ヒーローごとにボーン名が異なると AnimationTree の使い回しができなくなるため）。
3. 最初の1体を取り込んだ時点でボーン名一覧を `docs/ANIMATION_PIPELINE.md`（本書）の
   付録セクションに書き出し、以降のヒーローはこの一覧との差分がないことを確認する。

## 3. AnimationTree 構成方針

- ルートは `AnimationNodeStateMachine`。
- Locomotion は `AnimationNodeBlendSpace2D`（X: 左右ストレイフ, Y: 前後）。
- 上半身/下半身の分離は `AnimationNodeBlend2` + ボーンフィルタ
  （下半身: Locomotion, 上半身: 射撃/リロード/エイムオフセット）。
- 遷移の `xfade_time` は 0.08〜0.20 秒の範囲で明示し、カット遷移（0秒遷移）を禁止する。

## 4. 足接地 IK / エイムオフセット（Godot 4.3 における制約）

`docs/ENGINE_BASELINE.md` の実測結果により、**`LookAtModifier3D` は Godot 4.3 に
存在しない**（4.4 以降で追加されたクラス）。そのため本プロジェクトでは:

- 足接地 IK: `SkeletonIK3D`（CCDIK）を使用し、`start()`/`stop()` で
  地形の凹凸に応じて動的に有効化する。
- 上半身エイムオフセット: `LookAtModifier3D` の代わりに、`SkeletonModifier3D` を
  継承した独自クラス（例: `AimOffsetModifier3D`, 未実装）で該当ボーンの回転を
  ピッチ角に応じて上書きする。`_process_modification()` 仮想メソッドをオーバーライドする。

## 5. 足滑り防止

ルートモーションを使わない代わりに、`AnimationPlayer`/`AnimationTree` の再生速度を
実際の水平速度に比例させる（`speed_scale = current_speed / reference_speed`）ことで
足滑り (foot sliding) を抑制する。これは Phase 2 の `MovementComponent` が持つ
`state.velocity` から取得できる値を `AnimationDriver`（Presentation層）に渡すことで実現する
（Simulation → シグナル/直接参照 → Presentation の依存方向を守ること）。

---

## 既知の負債（Phase 2 終了時点）

- 本書の手順はまだ実際のアセットに対して実行されていない。理由: 本セッションはネットワーク越しに
  Mixamo（Adobe アカウントでのインタラクティブなダウンロードが必要）へアクセスできない
  ヘッドレス環境で作業しているため。
- `AnimationDriver` (`src/gameplay/components/animation_driver.gd`) は空のスタブのままであり、
  実際の `AnimationTree`/`BlendSpace2D`/`SkeletonIK3D` 配線は未実装。
- 上記のため、Phase 2 DoD のうち「足滑り・カット遷移・段差でのカメラ跳ねが目視で0」は
  アニメーションが存在しない現状では検証不能（該当なし）。カメラの段差対応（step smoothing）
  自体は `CameraRigComponent` に実装済みで、ロジックとしては第4.3章の式に従っている。
- 次アクション: 実アセット（Mixamo または CC0 の代替リグ）を入手できる環境で
  本書の手順を実行し、`AnimationDriver` を実装すること。
