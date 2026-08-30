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

## ローカルで開く（GUI環境）

1. [Godot 4.3 stable](https://godotengine.org/download/archive/4.3-stable/) をインストールする
   （`docs/ENGINE_BASELINE.md` 記載のバージョンと必ず一致させること）。
2. このリポジトリをクローンし、ブランチ `claude/arena-3v3-architecture-2xjgol` を取得する。
3. Godot を起動し「Import」→ クローンしたフォルダの `project.godot` を選択する。
4. FileSystem ドックから `scenes/debug/hero_preview.tscn` を開き、F6（または
   右上の「現在のシーンを実行」ボタン）を押す。
   - 地面・ライト・空・カメラをアクティブ化済みの検証用シーンで、
     `data/heroes/hero_vanguard.tres`（KayKit CC0 アセット, `Knight.glb`）を
     割り当てた `HeroBase` が1体配置されている。
   - WASD で移動、マウスで視点、Space でジャンプ、Shift でダッシュ、
     左クリックで射撃が可能（`project.godot` の入力アクション参照）。
   - このシーンはあくまで手動確認用で、まだ HUD もゲームモード進行もない
     （Phase 5 の残作業、ADR-013 参照）。

## ヘッドレスでの起動検証（CI用）

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
- [x] Phase 2 — 操作感とアニメーション（移動/カメラ/入力に加え、KayKit CC0 実アセット導入とAnimationDriver/AnimationTree実装済み。上下半身分離/IK/BlendSpace2Dは未着手、docs/ANIMATION_PIPELINE.md参照）
- [x] Phase 3 — 射撃・スキル・ゲームフィール（戦闘ロジックは実装、HUD/VFX/SFXはPhase 5前に別途対応が必要）
- [x] Phase 4 — ネットワーク同期（量子化/リコンサイル/サーバー検証ロジックは実装・テスト済み。実際のRPC配線と複数ピアでの実機検証は未実施、ADR-012参照）
- [~] Phase 5 — ゲームルール・ビジュアル・ポリッシュ（GameModeBase/TDM/クリスタルアサルト/スポーン選択/リスポーン無敵/キルカメラ状態機械/ピックアップ取得権威/スコアボード/設定永続化/EntityRegistryは実装・テスト済み。第8.2章のメモリリークテストも実施しHeroBase生成/破棄でオブジェクト数リーク無しを確認。レンダリング/ライティング/UI/オーディオはビジュアル検証不可のため未着手、ADR-013参照）
