# STAR ARENA（一人称3D 1対1格闘）

仕様と計画は [SPEC.md](./SPEC.md) を参照。

## 起動

```bash
cd game
npm install
npm run dev        # http://localhost:5173/
npm run build      # 型チェック + dist/ へ本番ビルド
```

- `http://localhost:5173/?viewer` … アニメーションビューア（技の再生・スロー・コマ送り・当たり判定表示）
  - `&speed=0.25` で初期再生速度を指定

## 操作

| 操作 | キー |
|---|---|
| 移動 / 視点 | WASD / マウス |
| 攻撃（銃は長押しで連射） | 左クリック |
| ガード | 右クリック長押し |
| ジャンプ | Space |
| ダッシュ / 回避（攻撃中もキャンセル可） | Shift |
| 固有スキル / 必殺技 | E / Q |
| リロード / ポーズ | R / Esc |

吹っ飛ばされて着地する瞬間に Shift で受け身。

## 構成

```
src/
  combat/     ファイター状態機械・当たり判定・弾（60Hz固定ステップ）
  characters/ キャラ定義データ（blaze=拳, star=二丁拳銃）
  ai/         CPU（3難易度）
  game/       ラウンド進行・勝敗判定
  render/     トゥーン描画・アリーナ・リグ/アニメ層・ビューモデル・エフェクト
  ui/         HUD・メニュー（DOM）
  audio/      合成サウンド（差し替え前提の仮素材）
  viewer.ts   アニメーションビューア
```
