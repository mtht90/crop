# Animation Pipeline (Mixamo → Godot 4.3)

## 更新: KayKit CC0 アセットによる実装（このセクションが最新の状態）

Mixamo（Adobe アカウント必須のインタラクティブなダウンロードフロー）にはこのセッションの
ネットワーク制限上到達できなかったため、代わりに **KayKit Character Pack: Adventurers**
（CC0 1.0、`ASSET_LICENSES.md` 参照）を GitHub 経由で導入し、実アセットに対して
`AnimationDriver`（`src/gameplay/components/animation_driver.gd`）を実装済み。

- キャラクターは `assets/characters/kaykit_adventurers/{Knight,Rogue}.glb`
  （glTF、テクスチャ・スケルトン・アニメーション全て埋め込み済み）。
- 実際に含まれるアニメーションクリップ名は `tools/inspect_glb_animations.gd` で実測確認済み
  （`AnimationPlayer.get_animation_list()` を実行、全77種）。使用中のクリップ:
  `Idle` / `Walking_A` / `Running_A` / `Jump_Idle` / `Death_A`。
- `HeroData.visual_scene`（`PackedScene`）にキャラクターシーンを差し込むだけで、
  `HeroBase._load_visual()` が自動的にモデルを `VisualRoot` へ配置し、内部の
  `AnimationPlayer` を検出して `AnimationDriver.initialize()` に渡す。
  つまり新ヒーローへの見た目付与も「.tres を差し込むだけ」という第3.2章の原則を維持する。
- `AnimationTree` はコード側で `AnimationNodeStateMachine` を動的構築する
  （Idle/Walk/Run/Jump の相互遷移 + Death への遷移、`xfade_time` は0.10〜0.15秒で明示、
  カット遷移なし）。ロコモーション判定は `MovementComponent.state`
  （速度・接地フラグ）を読むだけで、AnimationDriver 自身は移動計算を一切行わない。

実装していないもの（引き続き既知の負債）:
- 上半身/下半身分離（`AnimationNodeBlend2` + ボーンフィルタ）
- 足接地IK（`SkeletonIK3D`）、エイムオフセット（`SkeletonModifier3D` 継承クラス、
  `LookAtModifier3D` が4.3に存在しないための代替方式は下記「4章」に記載のまま）
- BlendSpace2D（前後×左右の連続ブレンド。現状は3段階の離散ステート）
- 攻撃/リロード等のアクションアニメーション（`1H_Ranged_Shoot`/`Reload` 等の
  クリップ自体はアセットに含まれているが、WeaponComponent とはまだ未接続）

これらは同じ KayKit アセットの残りのクリップで実装可能であり、次のアクションとして
優先度順に着手すること。

---

## 元の計画（Mixamo 想定、参考として残す）

このセクションは当初 Mixamo リグを前提に書かれた手順書。KayKit CC0 アセットは
既にリグ・アニメーション込みで配布されているため Mixamo 特有の骨名リネーム手順は
不要だったが、将来 Mixamo 由来の別アセットを追加する場合の参考として残す。

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

## 既知の負債（このセクションの現状）

冒頭の「KayKit CC0 アセットによる実装」に記載の通り、`AnimationDriver` はもはや
空スタブではなく実装済み。残っている負債はロコモーションの離散ステート止まりである点
（BlendSpace2D・上下半身分離・IK・エイムオフセット・攻撃アニメーション未接続）であり、
詳細は冒頭セクションを参照。Phase 2 DoD の目視確認項目は、実際にキャラクターが
描画される状態になったため今後 GPU/ディスプレイのある環境で確認可能になった
（このセッションではその確認自体はまだ実施していない）。
