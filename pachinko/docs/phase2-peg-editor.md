# Phase 2: 釘配置エディタ

Godotの `EditorPlugin` として実装した、2Dビューポート上でクリックするだけで釘を
追加/削除できるツール(`addons/peg_layout_editor/`)。

## 構成

| ファイル | 役割 |
|---|---|
| `addons/peg_layout_editor/plugin.cfg` | プラグイン定義 |
| `addons/peg_layout_editor/peg_layout_editor.gd` | エディタ本体(ドック+2Dビューポート入力処理) |
| `scripts/PegBoard.gd` | 釘コンテナノード(`@tool`)。追加/削除/保存/読込ロジック |
| `resources/peg_layout_resource.gd` | 釘レイアウトを保持する `Resource`(`PegLayoutResource`) |
| `resources/layouts/phase1_default_layout.tres` | Phase 1で手配置した12本のレイアウトを書き出したもの |

## 使い方

1. `project.godot` を開くとプラグインは自動で有効化される
   (`[editor_plugins] enabled=...` に登録済み)
2. シーンツリーで `Main.tscn` → `Board/Pegs` ノード(`PegBoard.gd`がアタッチされている)を選択
3. 左上ドックに現れる「釘配置エディタ」パネルで:
   - **追加モード** ON → 2Dビューポートをクリックした位置に釘を1本追加
   - **削除モード** ON → クリック位置に最も近い釘(`remove_distance`=12px以内)を削除
   - **グリッドスナップ** → 指定px単位に配置座標をスナップ(初期値8px)
   - **レイアウトを保存** → 現在の子ノード(釘)の位置を `PegLayoutResource` として
     `layout_path` に書き出す
   - **レイアウトを再読込** → 保存済み `.tres` から釘を再構築(既存の釘は全消去してから復元)
   - **全消去** → 釘を全て削除

4. 通常のシーン保存(Ctrl+S)でも、エディタ上で追加した釘ノードはそのまま `Main.tscn`
   に永続化される。`.tres` への書き出しは、レイアウトを別ファイルとして共有/差し替え
   したい場合(難易度違いの盤面バリエーション等)のためのオプション機能という位置づけ。

## 設計上の注意点

- `PegBoard.add_peg()` はエディタ実行時、生成した釘の `owner` を編集中シーンのルートに
  設定している。これを忘れるとGodotエディタでは表示されるがシーン保存時に永続化されない
  (Godotの仕様上、`owner` が設定されていないノードはシーンファイルに書き出されない)。
- `PegBoard._ready()` は `Engine.is_editor_hint()` が真の間は何もしない
  (エディタ実行中にゲームロジックが走らないようにするため)。実行時(ゲームプレイ時)は
  `get_child_count() == 0` の場合のみ `load_layout()` を呼ぶ。これは「エディタで直接
  配置してシーンに焼き込んだ場合」と「空のPegBoardに外部レイアウトを実行時ロードする場合」
  の両方を壊さずに共存させるための分岐。
- `_forward_canvas_gui_input` で受け取る `event.position` は2Dエディタのワールド座標系
  である前提でコードを書いている(Godot 4のEditorPlugin 2Dキャンバス入力の一般的な仕様)。
  **この開発環境にはGodotエディタ本体が無く実機確認ができていない**ため、次にGodotが
  使える環境で必ず「クリックした位置と実際に追加される釘の位置が一致するか」を確認すること。
  ズレがある場合は、`get_editor_interface().get_editor_viewport_2d()` のカメラ変換を
  介して座標変換する必要がある。

## 既知の制約(TODO)

- 現状は円1種類の釘のみ配置可能。将来的に「風車」「ステージ(ワープ)」など釘以外の
  盤面パーツにも対応する場合はPegBoardを`BoardPartsEditor`的な形に拡張する必要がある。
- Undo/Redo(`EditorUndoRedoManager`)未対応。誤操作の取り消しは現状「全消去→再読込」
  でしか行えない。Phase 6までにUndo/Redo対応を追加すること。
