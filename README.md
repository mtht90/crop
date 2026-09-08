# Building Sandbox（建築サンドボックス・プロトタイプ）

戦闘のない建築特化のサンドボックス。壮大な建築を建て、写真を撮ることを目的とするゲームのプロトタイプです。
完全な仕様は [`docs/spec.md`](docs/spec.md) を参照してください。

## 現在の実装段階

仕様書14章「実装順」の **第1段階（操作感だけを作る）** の土台に加えて、
**4章「素材」** と **7章「履歴（アンドゥ／リドゥ）」** を実装しています。

- 壁・床の2種のみ（階段・屋根は未実装）
- 形状（shape_id）と素材（material_id）を分離。8種の素材を数字キーで切替可能
- **`res://materials/<folder>/` にPBRテクスチャ（Color/NormalGL/Roughness/AmbientOcclusion）
  を置くと自動でORMMaterial3Dとして使う。無ければ単色にフォールバックする（後述）**
- **UVはセル1辺2.5mでテクスチャ1タイルになるようスケール。壁・床で見た目のタイル密度が揃う**
- 設置プレビュー表示（選択中の素材が反映される）
- **アンドゥ／リドゥ（`Ctrl+Z` / `Ctrl+Y`）。回数上限なし、差分ベースの履歴**
- 固定サイズ（200m四方）の平坦な地面
- パーツの編集（3×3格子）なし
- セーブ／ロードなし
- 自由飛行カメラでの設置・削除

物理エンジンは使わない方針のため、当たり判定は一切持たせず、レイキャストは
セルグリッドを直接たどる DDA (Amanatides & Woo) 方式で行っています。
描画は個別の `MeshInstance3D` を並べるのではなく、チャンク × (shape_id, material_id)
単位の `MultiMeshInstance3D` にまとめています。

編集（3×3格子）・セーブ・チャンクの動的生成/解放はまだ未着手です。

## 動作環境

- Godot Engine **4.3** 以降（GDScript）
- `project.godot` をGodotエディタで開き、再生（F5）するだけで動作します

## 操作方法

| 操作 | 内容 |
|---|---|
| マウス移動 | 視点操作（自由飛行） |
| `W` / `A` / `S` / `D` | 前後左右移動 |
| `Q` / `E` | 下降 / 上昇 |
| `Shift`（押しながら） | 移動速度を加速 |
| ホイール | パーツ種（壁 ⇔ 床）を切替 |
| `1`〜`8` | 素材を切替（画面左上に選択中の素材名を表示） |
| 左クリック（押しっぱなし可） | 照準先に設置（プレビュー表示あり） |
| 右クリック（押しっぱなし可） | 照準したパーツを削除 |
| `Ctrl+Z` | アンドゥ |
| `Ctrl+Y` | リドゥ |
| `Esc` | マウスカーソルの捕捉/解放を切替 |

壁は狙ったセルのうち、プレイヤーに最も近い側面に自動で向きが決まります（仕様書2.1）。
床の上に壁を積むと自動でその階の高さに合わせて置けます。

## 空間モデルとデータ構造

- セルは一辺 2.5m の立方体、座標は整数 `Vector3i`（`scripts/Grid.gd`）
- セル境界の壁は `+X` / `+Z` 側だけを実体として正規化し、二重登録を防止（仕様書1.2）
- 1つの設置枠の中身は `PieceInstance`（`cell` / `shape_id` / `material_id`）。
  形状と素材は独立しているので、同じ `shape_id` のまま `material_id` だけ差し替えられる
- `World`（`scripts/World.gd`）がスロットデータのみを保持する。描画には一切関与しない
- `ChunkRenderer`（`scripts/ChunkRenderer.gd`）が (チャンク, shape_id, material_id) ごとに
  `MultiMeshInstance3D` を1つ持ち、パーツの追加・削除のたびに該当グループの
  MultiMeshだけを再構築する（チャンク全体や他グループは触らない）
- `History`（`scripts/History.gd`）は盤面全体のコピーではなく、1エントリごとに
  「追加された `PieceInstance` の配列」と「削除された `PieceInstance` の配列」の
  差分だけを持つ。アンドゥ／リドゥは通常の追加・削除と同じ経路
  （`World` → `ChunkRenderer`）で戻すため、影響したグループのMultiMeshだけが
  再構築される。1操作＝1エントリで、ボタンを押してから離すまでの連続設置／
  連続削除はまとめて1エントリになる

## 素材テクスチャの配置方法

`res://materials/<folder>/` に、ambientCG など由来のPBRテクスチャ4枚を
**展開したままのファイル名で**置くと、`Materials.gd` が自動で読み込む。
判定はファイル名の**末尾**だけを見るので、接頭辞（製品名や解像度）は自由でよい。

| 拡張子の末尾 | 用途 |
|---|---|
| `..._Color.png` | アルベド（`albedo_texture`）。sRGBとして扱われる |
| `..._NormalGL.png` | 法線（`normal_texture`）。OpenGL形式（Godot標準）前提 |
| `..._Roughness.png` | 粗さ。AOと合成して`orm_texture`のGチャンネルに詰める |
| `..._AmbientOcclusion.png` | 遮蔽。AOと合成して`orm_texture`のRチャンネルに詰める |

例: `res://materials/concrete/Concrete034_1K-PNG_Color.png`

**置くべきフォルダ名（`scripts/Materials.gd` の `DEFS` と対応）:**

| フォルダ名 | 素材名（画面表示） |
|---|---|
| `concrete` | コンクリート |
| `wood` | 木材 |
| `tin` | トタン |
| `tile` | タイル |
| `mud_wall` | 土壁 |
| `glass` | ガラス |
| `brick` | れんが |
| `white_paint` | 白ペンキ |

4枚のうち1枚でも欠けている素材は、既存の単色 `ORMMaterial3D` に自動でフォールバックする
（落ちない）。9種目以降を増やす場合は `Materials.gd` の `DEFS` に1行足すだけでよい。

**画像を置いた後は、一度インポートを走らせる必要がある**（Godotエディタで開いて
数秒待つか、CLIなら `godot --path . --import` を一度実行する）。`.import` サイドカーが
無いテクスチャは `load()` に失敗する。

**未実装（次回以降）**:
- Downloads フォルダから `res://materials/` へコピーするスクリプト
- VRAM圧縮・ミップマップ有効化などのインポート設定の自動適用
  （sRGB/リニアの区別はGodotのシェーダー側が `albedo_texture` とその他で
  自動的に扱うため、インポート時の設定は不要と確認済み）

これらは実ファイルの正確なファイル名が分かってから着手する。

## ディレクトリ構成

```
project.godot            Godotプロジェクト設定
scenes/Main.tscn          起動シーン（ロジックはすべてMain.gdで構築）
scripts/Main.gd           環境・地面・プレイヤー・UIのセットアップ
scripts/FreeCamera.gd     自由飛行カメラ（マウスルック・WASD+QE）
scripts/BuildSystem.gd    設置・削除・プレビュー・素材選択のロジック
scripts/Grid.gd           セル座標・壁の正規化ユーティリティ
scripts/PieceInstance.gd  1枠分のパーツデータ（shape_id / material_id）
scripts/World.gd          スロット単位のワールドデータ（描画とは分離）
scripts/Materials.gd      素材8種のカタログ。テクスチャ読込・ORM合成・フォールバック
scripts/ShapeMesh.gd      shape_idごとのメッシュ生成（UVはセル寸法基準で自前で張る）
scripts/DDARaycaster.gd   物理エンジンを使わないセルグリッドDDAレイキャスト
scripts/ChunkRenderer.gd  (チャンク, shape_id, material_id) 単位のMultiMesh描画
scripts/History.gd        差分ベースのアンドゥ/リドゥ履歴（回数上限なし）
docs/spec.md              実装仕様書全文
```

素材を10種に増やす場合は `scripts/Materials.gd` の `DEFS` 配列に定義を1件足すだけでよい。

## 次のステップ

- 階段・屋根パーツと `DIAG` 枠の追加
- フォトナ方式の編集（3×3格子、`edit_mask`）とメッシュキャッシュ
- 塗り替え（設置済みパーツの素材だけを差し替えるモード、仕様書4.3）
- チャンクの動的生成・解放とセーブ／ロード

仕様書14章の方針どおり、**まず実際に触って操作感を判断してから**、次の段階に進むことを推奨します。
