# 非対称対戦ホラーFPS 素材カタログ（CC0以外）

> 1人のハンター vs 4人のサバイバーで戦う、一人称の非対称ホラー対戦ゲーム用の素材カタログです（ジャンルの参考：Identity V）。
> **CC0の素材は含めていません。** Unity Asset Store（US）、Fab、Synty Store、Mixamo、CC-BY、OFLなど、ライセンスに条件がある素材を集めています。
> 価格と仕様は 2026-11 時点で検索して確かめたものです。**買う前に、各ページで価格とライセンスを確かめてください。**

---

## 0. 先に決めておくこと

### エンジン：**Unity 6（URP）をおすすめします**
- Unity Asset Storeの素材をいちばん無理なく使えます。
- Asset Storeの素材は、EULAを守れば他のエンジンでも使えると Unity が公式に案内しています（[Unity Support](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)）。
  ただし、Three.jsなどのWeb版では、モデルのファイルがそのまま配信されてしまいます。「生ファイルの再配布」とみなされる恐れがあるので、おすすめしません。

### ライセンスの共通ルール（いちばん大事）
| ルール | 対象 |
|---|---|
| **素材をリポジトリに入れない。** `mtht90/crop` が公開リポジトリなら、Gitに入れた時点で再配布になります | Asset Store / Synty / Fab / Mixamo / Sonniss のすべて |
| 素材は `Assets/ThirdParty/` に置き、`.gitignore` に入れる。各自が購入・ダウンロードして取り込む | 同上 |
| クレジット画面に表記する | CC-BY（Freesound、Kevin MacLeod など） |
| **CC-BY-NC や CC-BY-ND は使わない**（NCは商用不可、NDは改変不可） | Freesound / Sketchfab |
| AIの学習に使わない | Asset Store Terms、Sonniss（2024年以降） |
| 素材の席数を確認する。チームで使うなら人数分のライセンスが必要です | Asset Store（1席ごと）、Synty（1本で5席） |

### オリジナルにする
ジャンルとして参考にするのは問題ありません。ただし、Identity Vのキャラクター名、外見、マップ名、UIのデザインはまねせず、独自の世界観にしてください。
例：ヴィクトリア朝の療養院、蒸気仕掛けの「封印装置」を解く、など。

---

## 1. カタログ

ライセンス略号
- **UAS** = Unity Asset Store Standard EULA
- **SYN** = Synty EULA
- **FAB** = Fab Standard License
- **MIX** = Adobe Mixamo規約
- **BY** = CC-BY 4.0
- **OFL** = SIL Open Font License

### 1-A. マップ・環境

| 素材 | ストア | 価格 | 画風 | ライセンス | 用途・メモ |
|---|---|---|---|---|---|
| [POLYGON Horror Mansion](https://syntystore.com/products/polygon-horror-mansion)（[UAS版](https://marketplace.unity.com/packages/3d/environments/fantasy/polygon-horror-mansion-low-poly-3d-art-by-synty-213346)） | Synty / UAS | $99.99 | ローポリ | SYN / UAS | **洋館マップ。** 屋根裏・地下・温室のデモシーンあり。ろうそく・霧・雨のFXと10キャラ付き。URP対応 |
| [POLYGON Horror Asylum](https://syntystore.com/products/polygon-horror-asylum) | Synty | 要確認 | ローポリ | SYN | **療養院マップ。** Mansionと同じ画風 |
| [POLYGON Horror Carnival](https://assetstore.unity.com/packages/3d/environments/fantasy/polygon-horror-carnival-pack-art-by-synty-266862) | UAS / Synty | 要確認 | ローポリ | UAS / SYN | **廃遊園地マップ。** 観覧車・テントで高低差と遮蔽を作れる |
| [Victorian Mansion Environment](https://assetstore.unity.com/packages/3d/environments/victorian-mansion-environment-269740) | UAS | $79.99 | リアル | UAS | 約200プロップ、コリジョン付き。URP/HDRPのデモあり。ホラー用の飾りは別途必要 |
| [Victorian Interior Environment](https://assetstore-fallback.unity.com/packages/3d/environments/victorian-interior-environment-205253) | UAS | 要確認 | リアル | UAS | 室内の内装。上のMansionと組み合わせる |
| [P3D Haunted Hospital Full Level](https://marketplace.unity.com/packages/3d/environments/p3d-haunted-hospital-full-level-249735) | UAS | $59.99 | リアル | UAS | **病院・療養院のマップ1つ分。** Built-in / URP / HDRP対応 |
| [Haunted Horror House Environment Kit](https://assetstore.unity.com/packages/3d/environments/dungeons/haunted-horror-house-environment-kit-354650) | UAS | 要確認 | リアル | UAS | 屋内のモジュール部品 |
| [Quixel Megascans（Fab）](https://www.fab.com) | Fab | 無料（2026-11時点） | フォトスキャン | FAB | 地面・岩・草・壁のテクスチャ。Fab Standard Licenseなら**どのエンジンでも使えます**。古いQuixel.comの素材は当時の規約のままです |

### 1-B. キャラクター・アニメーション

| 素材 | ストア | 価格 | ライセンス | 用途・メモ |
|---|---|---|---|---|
| Horror Mansion / Asylum / Carnival に付くキャラ | Synty | （パックに含む） | SYN | **サバイバー用。** アニメは付いていないので、Mixamoを使います（Humanoidリグで流用できます） |
| [Mixamo](https://www.mixamo.com) | Adobe | 無料 | MIX | 歩く・走る・しゃがむ・倒れる・担がれる・板を倒す、などの全モーション。**ゲームに組み込むのはOK。生のFBXを配布するのはNG** |
| [Creepy Horror Monster – PBR & Animated](https://assetstore.unity.com/packages/3d/characters/humanoids/sci-fi/creepy-horror-monster-pbr-animated-38448) | UAS | $15 | UAS | ハンター候補（リアル画風）。攻撃2種・待機・走る・歩くのアニメ付き |
| [Horror Demon Creature v1（66アニメ）](https://assetstore.unity.com/packages/3d/characters/creatures/horror-demon-creature-v1-with-66-animations-262417) | UAS | 要確認 | UAS | ハンター候補。アニメが多いので、スキル演出に回せる |
| [Monster pack](https://marketplace.unity.com/packages/3d/characters/creatures/monster-pack-306195) | UAS | 要確認 | UAS | 30アニメ。FPS・ホラー向けと明記 |

> **一人称の腕について：** サバイバーの一人称視点用の腕は、上のキャラのメッシュから頭を消し、カメラにつけて使います。追加の購入はいりません。

### 1-C. 仕組み・テンプレート（コード系）

| 素材 | ストア | 価格 | ライセンス | 用途・メモ |
|---|---|---|---|---|
| [Horror Multiplayer Game Template](https://assetstore.unity.com/packages/templates/systems/horror-multiplayer-game-template-297297)（[HDRP版](https://assetstore.unity.com/packages/templates/systems/horror-multiplayer-game-template-hdrp-308495)） | UAS | $59.99 | UAS | **サバイバー対キラーの役割分けが最初からある**、いちばん近いテンプレ。⚠ 非公式サイトの無料コピーは不正な再配布なので使わない |
| [Multiplayer FPS Template](https://assetstore.unity.com/packages/templates/systems/multiplayer-fps-template-259143) | UAS | 無料 | UAS | 汎用のFPSの土台。ほかのAsset Store素材が必要 |
| [UHFPS – Ultimate Horror FPS Kit (URP)](https://marketplace.unity.com/packages/templates/systems/uhfps-ultimate-horror-fps-kit-urp-254506) | UAS | 要確認 | UAS | ドア・引き出し・ライト・隠れるなどの操作。シングルプレイ用なので、ネットワーク同期は自分で作る |
| [Asymmetric Multiplayer Horror Template](https://www.fab.com/listings/07d0c59b-ee1b-48c6-a30c-c76621897d10) | Fab | 要確認 | FAB | **Unreal用。** Unrealを選ぶ場合の候補 |
| [Mirror](https://github.com/MirrorNetworking/Mirror) | GitHub / UAS | 無料 | MIT | ネットワーク同期（実績が多い） |
| Netcode for GameObjects | Unity公式 | 無料 | Unity Companion | 公式のネットワーク同期（Mirrorの代わり） |

### 1-D. サウンド

| 素材 | ストア | 価格 | ライセンス | 用途・メモ |
|---|---|---|---|---|
| [Sonniss GDC Game Audio Bundle](https://sonniss.com/gameaudiogdc)（2015〜2026の各年） | Sonniss | 無料 | Sonniss独自 | 合計数百GBの効果音。ロイヤリティフリーでクレジット不要。**素材をそのまま再配布するのとAI学習はNG** |
| [Horror Game Ambient Soundscapes Vol.1](https://assetstore.unity.com/packages/audio/ambient/horror-game-ambient-soundscapes-vol-1-209693) | UAS | 要確認 | UAS | マップごとの環境音（ループ） |
| [Ultimate Horror Game SFX, Ambience & Jump Scare](https://marketplace.unity.com/packages/audio/sound-fx/ultimate-horror-game-sfx-ambience-jump-scare-sounds-264106) | UAS | 要確認 | UAS | ハンター接近時の音・驚かせる音 |
| [Horror Audio Bundle (Music + Ambience + FX)](https://assetstore.unity.com/packages/audio/sound-fx/horror-audio-bundle-music-ambience-fx-21789) | UAS | $28 | UAS | 定番のまとめ売り（古いが安い） |
| [Freesound](https://freesound.org)（**CC-BYだけに絞る**） | Freesound | 無料 | BY | 足りない効果音を補う。クレジット表記が必要。CC0とCC-BY-NCはフィルターで外す |
| [incompetech（Kevin MacLeod）](https://incompetech.com) | incompetech | 無料 | BY 4.0 | メニュー・ロビーのBGM。クレジット表記が必要 |

### 1-E. フォント・UI

| 素材 | 入手先 | ライセンス | 用途 |
|---|---|---|---|
| [Zen Antique](https://fonts.google.com/specimen/Zen+Antique) / [Shippori Mincho](https://fonts.google.com/specimen/Shippori+Mincho) | Google Fonts | OFL | 日本語の見出し（古風な明朝） |
| [Noto Serif JP](https://fonts.google.com/noto/specimen/Noto+Serif+JP) | Google Fonts | OFL | 日本語の本文 |
| [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) / [Cinzel](https://fonts.google.com/specimen/Cinzel) | Google Fonts | OFL | 英字のロゴ・見出し（ヴィクトリア朝らしさ） |
| [Creepster](https://fonts.google.com/specimen/Creepster) | Google Fonts | OFL | 驚かせる演出用（使いすぎ注意） |

---

## 2. 組み合わせ（おすすめセット）

**画風をそろえることがいちばん大事です。** Syntyのローポリとリアル系を同じマップに混ぜると、安っぽく見えます。

### セットA：Syntyローポリで統一（おすすめ・作りやすい）
| 役割 | 素材 |
|---|---|
| マップ×3 | Horror Mansion（洋館）＋ Horror Asylum（療養院）＋ Horror Carnival（遊園地） |
| サバイバー | 3パックに付くキャラ ＋ Mixamoのモーション |
| ハンター | Syntyのキャラを大きくして色を変えたもの。または Monster pack をローポリ風のシェーダーで |
| FX | パックに付く霧・ろうそく・雨 |
| 音 | Sonniss ＋ Horror Game Ambient Soundscapes |
| 文字 | Zen Antique ＋ Cinzel |
| 仕組み | Mirror（またはNGO）＋ 自作のゲームルール |

- 費用の目安：約 $300（パック3つ）。**SyntyのStandard Subscription**の方が安くなる場合があります。
- 理由：同じ作者のパックなのでマテリアルと縮尺がそろっていて、3マップを並べても違和感がありません。**Synty Storeで直接買う**と、Unity用とUnreal用の両方のファイルがもらえます。

### セットB：リアル系（雰囲気重視・重い）
| 役割 | 素材 |
|---|---|
| マップ×2 | Victorian Mansion Environment ＋ Victorian Interior ＋ P3D Haunted Hospital |
| 地面・外の植物 | Megascans（Fab、無料） |
| ハンター | Horror Demon Creature v1（66アニメ） |
| サバイバー | Mixamoのキャラ ＋ Mixamoのモーション |
| 音 | Sonniss ＋ Ultimate Horror Game SFX |
| 仕組み | Horror Multiplayer Game Template（HDRP版） |

- 費用の目安：約 $270〜
- 注意：URPかHDRPのどちらかにそろえること。5人対戦なので負荷が大きく、LODとOcclusion Cullingを必ず設定する。

### セットC：無料だけ（CC0は使わない）
| 役割 | 素材 |
|---|---|
| 土台 | Multiplayer FPS Template（無料）＋ Mirror（MIT） |
| マップ | Megascans（Fab）＋ ProBuilderで自作した建物 |
| キャラ・モーション | Mixamo |
| 音 | Sonniss ＋ Freesound（CC-BY）＋ Kevin MacLeod（CC-BY） |
| 文字 | Google Fonts（OFL） |

- 費用：$0。ただし、**CC-BYのクレジット一覧を作る**手間がかかります。
- 試作品として遊べるか確かめるにはこれで十分です。あとでセットAかBの見た目に差し替えます。

### セットD：テンプレートを先に買う（最短で動かす）
- Horror Multiplayer Game Template（$59.99）でハンター・サバイバーの役割と同期を手に入れ、見た目はセットAかBに差し替えます。
- 注意：テンプレートの同期の仕組みに縛られます。自分のルール（解読・救助・脱出ゲートなど）を入れやすいか、**レビューとドキュメントを読んでから**買ってください。

---

## 3. 組み合わせるときの注意

- **Syntyのキャラ × Mixamo：** Synty側をHumanoidリグに設定すれば、Mixamoのアニメをそのまま流用できます（Syntyのキャラにはアニメが付いていません）。
- **Unity Asset Storeで買ったSynty：** Unity用のファイルだけです。Unrealでも使う可能性があるなら、Synty Storeで直接買う。
- **Megascans × Synty：** 画風が合わないので、セットAでは使わない。
- **テンプレート × UHFPS：** どちらもプレイヤー制御を持っているので、両方入れるとぶつかります。片方だけ使う。
- **クレジット画面：** CC-BYの素材（作者名・作品名・ライセンス・リンク）と、使ったフォント名を載せる。

## 4. 次にやること
1. エンジンを決める（Unity 6 URPがおすすめ）
2. セットCで試作する（1マップ・ハンター1・サバイバー2・解読装置3つ）
3. 面白さを確かめてから、セットAかBを買って見た目を差し替える
