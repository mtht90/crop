# 効果音の入れ方（効果音ラボ）

効果音は [効果音ラボ](https://soundeffect-lab.info/) の素材を使う。
商用利用・クレジット表記は不要。ただし**直リンクと再配布が禁止**されているため、`npm run fetch-assets` では自動ダウンロードしない。
下の表のファイルをサイトから手で保存し、`capball/sounds-local/` に**元のファイル名のまま**置いてから `npm run fetch-assets` を実行すると、ゲーム内の名前に揃えて取り込まれる。
置かなかった音は鳴らないだけで、ゲームはそのまま遊べる。

| ゲーム内の名前 | 使いどころ | 効果音ラボでの名前 | ファイル名 | ページ |
|---|---|---|---|---|
| hit_light | 普通の打球音 | テニスラケットで打つ2 | tennis-racket2.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| hit_hard | 芯で捉えた打球音 | 金属バットで打つ2 | metal-bat2.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| hit_homerun | （予備）大きな当たり | 金属バットで打つ1 | metal-bat1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| catch | 捕球 | ボールをミットでキャッチ1 | ball-mitt-catch1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| catch_fast | 速球の捕球 | ボールをミットでキャッチ2 | ball-mitt-catch2.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| swing | スイング | 剣の素振り2 | sword-gesture2.mp3 | [戦闘](https://soundeffect-lab.info/sound/battle/) |
| throw | 投球・送球 | 鞭を振り回す1 | whip-gesture1.mp3 | [戦闘](https://soundeffect-lab.info/sound/battle/) |
| bounce | キャップが跳ねる | 卓球のピンポン玉が跳ねる1 | table-tennis-ball1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| slide | スライディング | スライディング1 | sliding1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| run | 走る | 土の上を走る | dash-soil1.mp3 | [生活1](https://soundeffect-lab.info/sound/various/) |
| cheer | 歓声（ヒット・得点） | 歓声 | cheer1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| cheer_big | 大歓声（ホームラン・勝利） | スタジアムの歓声 | people-stadium-cheer1.mp3 | [声素材](https://soundeffect-lab.info/sound/voice/game.html) |
| clap | 拍手 | 大勢で拍手 | clapping-hands1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| whistle | 試合開始・終了 | 警官のホイッスル1 | police-whistle1.mp3 | [生活3](https://soundeffect-lab.info/sound/various/various3.html) |
| ambience | 空き地の環境音（夏・風鈴とセミ） | 風鈴が鳴る家2 | furin-house2.mp3 | [環境音](https://soundeffect-lab.info/sound/environment/) |
| sad | 三振（打者側） | チーン1 | tin1.mp3 | [演出・アニメ](https://soundeffect-lab.info/sound/anime/) |
| shakin | 三振を奪った | シャキーン3 | shakin3.mp3 | [演出・アニメ](https://soundeffect-lab.info/sound/anime/) |
| ui_ok | 決定 | 決定ボタンを押す3 | decision3.mp3 | [ボタン・システム音](https://soundeffect-lab.info/sound/button/) |
| ui_move | 選択 | カーソル移動7 | cursor7.mp3 | [ボタン・システム音](https://soundeffect-lab.info/sound/button/) |
| ui_cancel | 取り消し | キャンセル3 | cancel3.mp3 | [ボタン・システム音](https://soundeffect-lab.info/sound/button/) |
| chime | チェンジ | 学校のチャイム | school-chime1.mp3 | [演出・アニメ](https://soundeffect-lab.info/sound/anime/) |

ページ内の位置は変わることがあるので、見つからないときはサイト内検索で名前を探す。
