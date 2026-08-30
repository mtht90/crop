# Architecture Decision Records (ADR)

各エントリは「決定 / 背景 / 選択肢 / 選択理由 / トレードオフ」の形式で記述する。

---

## ADR-001: リポジトリを Godot プロジェクトとして新規開始する

- **決定**: 既存の Minecraft Paper プラグイン（CropSneakGrowth, Java/Maven）を削除し、
  同一リポジトリを Godot 4.3 の Arena 3v3 プロジェクトとしてゼロから構築する。
- **背景**: 本リポジトリには元々 `pom.xml` と Bukkit プラグインのソースが存在しており、
  依頼された「AAA級 3v3 ヒーローシューター（Godot）」の仕様とは無関係だった。
- **選択肢**:
  1. 別リポジトリ作成を要求する
  2. 既存コードを残したまま Godot プロジェクトを共存させる
  3. 既存コードを削除して Godot プロジェクトとして再スタートする
- **選択理由**: ユーザーに確認したところ「このリポジトリで新規に Godot プロジェクトを開始する」
  ことが明示的に承認されたため、3 を採用。共存（2）は言語・ビルドツールが全く異なり
  混乱の元になるため却下。
- **トレードオフ**: 元の Minecraft プラグインの履歴は git log 上に残るが、
  ワーキングツリーからは削除される。

---

## ADR-002: エンジンバージョンを Godot 4.3 stable に固定する

- **決定**: 開発・CI で使用する Godot バージョンを **4.3.stable.official** に固定する。
- **背景**: 第9章の「API 検証プロトコル」に従い、実機バージョンでの検証が必須。
  ネットワーク経由で取得可能な安定版として 4.3 系を採用した。
- **選択肢**: 4.2 系 / 4.3 系 / 4.4 系（開発時点で 4.3 が広く使われる安定版）
- **選択理由**: `LookAtModifier3D` など一部の新APIは 4.4 以降で追加されているが、
  4.3 は Forward+ / SDFGI / CompositorEffect / MultiplayerSynchronizer のデルタ同期など
  本プロジェクトが必要とする主要機能をすべて備えた安定版であるため採用。
- **トレードオフ**: `LookAtModifier3D` が使えないため、Phase 2 のエイムオフセット実装は
  `SkeletonIK3D` または独自の `SkeletonModifier3D` 継承クラスで代替する必要がある
  （`docs/ENGINE_BASELINE.md` 参照）。

---

## ADR-003: gdUnit4 をテストフレームワークとして採用する

- **決定**: ユニット/統合テストフレームワークとして **gdUnit4** を採用する。
- **背景**: 第8章で gdUnit4 または GUT のいずれかの使用が指示されている。
- **選択肢**: gdUnit4 / GUT
- **選択理由**: gdUnit4 は `--headless` での CLI 実行（`GdUnitCmdTool.gd`）が
  CI パイプラインと親和性が高く、Godot 4.x 系のアクティブなメンテナンスがあるため採用。
- **トレードオフ**: addon の実体はネットワーク取得が必要になる場合があり、
  Phase 0 時点ではダミーテストランナー（`tools/ci_test.sh`）で
  `--check-only` 相当の検証を先行させ、gdUnit4 本体の導入は
  取得可否を確認したうえで追って行う。

---

## ADR-004: HeroBase のコンポーネント初期化は `initialize()` 明示呼び出しで行う

- **決定**: 各コンポーネント（HealthComponent, MovementComponent 等）は `_ready()` 内で
  自身の初期値を確定させず、`HeroBase._ready()` から明示的に `initialize(...)` を
  呼び出すことで初期化する。
- **背景**: Godot の `_ready()` は子ノードが親より先に呼ばれる（ボトムアップ）。
  `HealthComponent._ready()` が `hero_data.base_health` を参照する構造だと、
  `HeroBase._ready()` がまだ `hero_data` を伝搬する前にコンポーネント側の初期化が
  完了してしまい、常にデフォルト値が使われるバグを生む。
- **選択肢**:
  1. `_ready()` の実行順序に依存させる
  2. 明示的な `initialize()` メソッドを各コンポーネントに持たせ、親から呼ぶ
- **選択理由**: 2 を採用。暗黙の実行順序への依存は「Godot API を推測で書くな」という
  第9章の精神に反する（実測せず直感的な順序を仮定するのは同種の誤り）ため、
  明示的な初期化 API で確実性を担保する。
- **トレードオフ**: コンポーネントごとに `initialize()` を1つ増やす必要があるが、
  ヒーロー追加時にはこの呼び出し規約自体は変更不要（HeroBase 側のみで完結）。

---

## ADR-005: `AbilityBase` と `AbilityData` を単一の `AbilityData` Resource に統合する

- **決定**: 指示書 3.2 章の `AbilityBase (Resource)` と 3.3 章の `AbilityData` は
  同一概念の重複表現とみなし、`AbilityData`（`src/gameplay/abilities/ability_data.gd`）
  ひとつに統合する。能力の実行ロジックは `AbilityData.execution_scene`
  （`PackedScene`）が指す Node 側に持たせる。
- **背景**: 指示書内でクラス名が2箇所で異なって参照されており、両方を別クラスとして
  実装すると意味のない委譲層が増え、「無駄な抽象化を避ける」という第0章の方針に反する。
- **選択肢**: 1. 両クラスを別々に実装し継承関係を作る　2. 単一の Resource に統合する
- **選択理由**: 2 を採用。データ（クールダウン等）と実行（Node）を分離する設計意図は
  `execution_scene` フィールドだけで十分に表現できる。
- **トレードオフ**: 指示書の想定するクラス名 `AbilityBase` は存在しないため、
  将来指示書を参照する際はこの ADR を参照すること。

---

## ADR-006: `GameFeelTuning` / `NetConfig` はヒーロー単位ではなくグローバル Resource として `preload` する

- **決定**: `MovementComponent` 等がゲームフィール定数を参照する際は、
  `HeroData` 経由ではなく `res://data/tuning/game_feel.tres` を `const` として
  直接 `preload` する。
- **背景**: 第4章の `GameFeelTuning` は「全ゲームフィール定数」であり、
  ヒーローごとに異なる値を持つ設計ではない。`HeroData` に含めると
  ヒーロー追加のたびに同じ値を再指定する羽目になり、単一情報源の原則に反する。
- **選択肢**: 1. `HeroData` にチューニング参照を持たせる　2. コンポーネント側で直接 `preload`
- **選択理由**: 2 を採用。Autoload 数の上限（5個）を消費せず、かつ Resource の
  キャッシュにより同一インスタンスが共有されるため、データの一意性も保たれる。
- **トレードオフ**: 実行時にチューニング値をホットリロードする場合は
  `preload` ではなく `load` への変更が必要になる（Phase 5 のデバッグ機能で再検討）。
