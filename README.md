# Arena 3v3

サーバー権威型 3v3 ヒーローシューター（Godot 4.3 / PC / Forward+）。

## 必要環境

- Godot Engine **4.3 stable** (公式ビルド)。バージョン差異があるため必ず一致させること。
  詳細は `docs/ENGINE_BASELINE.md` を参照。
- 対応OS: Linux / Windows / macOS（開発は Linux headless CI を主とする）。

## ディレクトリ構成

```
addons/     GDScriptアドオン (gdUnit4 等)
assets/     外部アセット（出典別）
data/       .tres データ定義（HeroData/WeaponData/AbilityData/Tuning）
src/        ソースコード（core/net/gameplay/modes/level/ui/debug）
scenes/     .tscn シーン
shaders/    .gdshader
tests/      unit/integration/perf
tools/      CI・検証スクリプト
docs/       設計判断記録・エンジン検証記録・パイプライン文書
```

詳細な設計方針は本リポジトリ内の指示書（アーキテクチャ憲章）および
`docs/DECISIONS.md`（ADR）を参照。

## ビルド / 起動

現時点（Phase 0）ではプレイ可能なシーンは未実装。エディタで開くか、
ヘッドレスでの起動検証のみ可能:

```bash
godot --headless --quit-after 100
```

## サーバー起動（Phase 4 以降で実装予定）

```bash
godot --headless --server
```

## テスト実行

```bash
# ダミーテスト含む全体テストランナー
bash tools/ci_test.sh
```

内部的には gdUnit4 を用いる:

```bash
godot --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd -a tests/
```

## Godot API 検証

新しい Godot API を使う前に、必ず `tools/verify_api.gd` で存在確認すること
（詳細は `docs/ENGINE_BASELINE.md` の「第9章 API検証プロトコル」節）。

```bash
godot --headless --script tools/verify_api.gd
```

## 進行状況

- [x] Phase 0 — 環境検証と基盤
- [x] Phase 1 — AAA級アーキテクチャ基盤
- [x] Phase 2 — 操作感とアニメーション（移動/カメラ/入力は実装、実アセット未導入は既知の負債）
- [x] Phase 3 — 射撃・スキル・ゲームフィール（戦闘ロジックは実装、HUD/VFX/SFXはPhase 5前に別途対応が必要）
- [x] Phase 4 — ネットワーク同期（量子化/リコンサイル/サーバー検証ロジックは実装・テスト済み。実際のRPC配線と複数ピアでの実機検証は未実施、ADR-012参照）
- [~] Phase 5 — ゲームルール・ビジュアル・ポリッシュ（GameModeBase/TDM/クリスタルアサルト/スポーン選択/リスポーン無敵/スコアボード/設定永続化/EntityRegistryは実装・テスト済み。レンダリング/ライティング/UI/オーディオはビジュアル検証不可のため未着手、ADR-013参照）
