# Asset Licenses

このプロジェクトで使用する全ての外部アセット（3Dモデル、テクスチャ、音源、フォント、
サードパーティ製 Godot アドオン等）の出典・ライセンス・URL をここに記録する。
新しいアセットを追加した場合は必ず本ファイルにエントリを追加すること。

## フォーマット

```
### <アセット名>
- 出典: <サイト名 / 作者>
- URL: <取得元URL>
- ライセンス: <ライセンス名 (例: CC0, CC-BY 4.0, MIT)>
- 用途: <本プロジェクトでの使用箇所>
- 改変: <改変の有無と内容>
```

---

## 導入済みアセット / アドオン

### gdUnit4 (Godot addon)
- 出典: Mike Schulze / GitHub
- URL: https://github.com/MikeSchulze/gdUnit4
- ライセンス: MIT License（リポジトリ同梱の `LICENSE` を参照）
- バージョン: v4.3.4
- 用途: ユニット/統合テストフレームワーク（`addons/gdUnit4/`）
- 改変: アドオン自体の自己テスト群（`test/` ディレクトリ, 約31MB）を
  リポジトリ肥大化防止のため削除。ランタイム本体（`src/`）と
  CLIツール（`bin/`）のみを同梱。

---

### KayKit Character Pack: Adventurers (1.0)
- 出典: Kay Lousberg（www.kaylousberg.com）/ GitHub ミラー
  `KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0`
- URL: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- ライセンス: **CC0 1.0 Universal**（パブリックドメイン）。個人・商用問わず自由に使用可能、
  クレジット表記は任意（義務ではない）。リポジトリ同梱の
  `assets/characters/kaykit_adventurers/LICENSE.txt` を参照。
- 用途: プレースホルダーのヒーロービジュアル。`Knight.glb` を Vanguard、
  `Rogue.glb` を Kestrel の `HeroData.visual_scene` として使用（`data/heroes/*.tres`）。
  75種のアニメーションクリップが同梱されており、そのうち Idle/Walking_A/Running_A/
  Jump_Idle/Death_A を `AnimationDriver`（`src/gameplay/components/animation_driver.gd`）が
  実際に参照している（クリップ名は `tools/inspect_glb_animations.gd` で実測確認済み）。
- 改変: 元パックのうち Knight/Rogue の glTF (.glb) 2体分のみを
  `assets/characters/kaykit_adventurers/` に採用。FBX版・他3キャラクター
  （Barbarian/Mage/Rogue_Hooded）・サンプル画像・Textures フォルダの重複ファイルは
  リポジトリ肥大化防止のため取り込んでいない。
- 備考: ファンタジー風の見た目のため、最終的なヒーローのビジュアル（Vanguard/Kestrel等の
  オリジナルデザイン）ではなく、あくまで操作感・アニメーション配線の実証用
  プレースホルダーである。本番アセットは別途オリジナルデザインで用意すること
  （第0章の法的・IP制約: 既存アセットの流用ではなく仮称のオリジナルヒーローを実装する
  という方針そのものは変わらない）。

## 今後追加予定のアセット（Phase 2 以降）

- キャラクターモデル / アニメーション: Mixamo（ライセンス: Adobe General Terms of Use,
  再配布不可のため各開発者が個別に取得する運用とし、リポジトリには含めない想定）
- 環境アセット: Kenney.nl（CC0）を予定
- 効果音 / BGM: 未定（CC0 / CC-BY ソースを選定次第、本ファイルに追記）

**注意**: Mixamo アセットは利用規約上リポジトリへのコミットが制限される場合があるため、
実際に導入する際は規約を再確認し、必要であれば `assets/characters/README.md` に
各自での取得手順を記載する方式に変更すること。
