import { useEffect } from 'react';
import { useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { CardFace, EnergySymbol } from '../ui/Card';
import { byName } from '../engine/cards';
import { playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';

export function Settings() {
  const settings = useStore((s) => s.save.settings);
  const update = useStore((s) => s.update);
  const reset = useStore((s) => s.reset);
  useEffect(() => playMusic('menu'), []);
  const set = (k: 'music' | 'sfx' | 'speed', v: number) => update((s) => void (s.settings[k] = v));
  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="設定" />
        <div className="panel settings-box">
          <div className="set-row">
            <label>BGM 音量</label>
            <input type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(e) => set('music', Number(e.target.value))} />
            <span>{Math.round(settings.music * 100)}</span>
          </div>
          <div className="set-row">
            <label>効果音 音量</label>
            <input type="range" min={0} max={1} step={0.05} value={settings.sfx} onChange={(e) => set('sfx', Number(e.target.value))} onMouseUp={() => sfx('bell', 0.7)} />
            <span>{Math.round(settings.sfx * 100)}</span>
          </div>
          <div className="set-row">
            <label>演出スピード</label>
            <div className="seg">
              {[0.75, 1, 1.5, 2, 3].map((v) => (
                <button key={v} className={settings.speed === v ? 'on' : ''} onClick={() => set('speed', v)}>
                  ×{v}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row danger">
            <label>セーブデータ</label>
            <button
              className="btn red small"
              onClick={async () => {
                if (await askConfirm('すべてのカード・コイン・デッキが消去されます。本当にリセットしますか？', 'リセットする', true)) reset();
              }}
            >
              データをリセット
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Rules() {
  useEffect(() => playMusic('menu'), []);
  const sample = byName('ヒオネコ').id;
  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="あそびかた" />
        <div className="panel doc">
          <h2>勝利条件</h2>
          <ul>
            <li>相手のモンスターをきぜつさせてサイドを<b>6枚</b>すべてとる（Ωモンスターをきぜつさせると2枚）</li>
            <li>相手の場のモンスターをすべていなくする</li>
            <li>相手が自分の番のはじめに山札を引けなくなる</li>
          </ul>
          <h2>カードの見かた</h2>
          <div className="row">
            <CardFace cid={sample} />
            <ul>
              <li>左上は進化段階（たね／1進化／2進化）、右上はHPとタイプ</li>
              <li>ワザの左のマークは必要なエネルギー。<EnergySymbol type="colorless" size="1.1em" />（無色）はどのエネルギーでも払える</li>
              <li>下段は弱点（ダメージ×2）・抵抗力（-30）・にげるためのエネルギー</li>
              <li>名前の横に<b>Ω</b>があるカードは強力だが、きぜつするとサイドを2枚とられる</li>
            </ul>
          </div>
          <h2>準備</h2>
          <ul>
            <li>60枚のデッキをシャッフルし7枚引く。たねモンスターがいなければ引き直し（相手は1枚多く引ける）</li>
            <li>たねモンスターをバトル場に1匹、ベンチに5匹まで出し、山札の上から6枚をサイドに置く</li>
            <li>コイントスの勝者が先攻・後攻を選ぶ。先攻の最初の番はワザとサポーターが使えない</li>
          </ul>
          <h2>自分の番にできること</h2>
          <ul>
            <li>山札を1枚引く（自動）</li>
            <li>たねモンスターをベンチに出す（何回でも・ベンチは5匹まで）</li>
            <li>進化させる（出したばかりのモンスターやお互いの最初の番は不可）</li>
            <li>エネルギーを1枚つける（1回だけ）</li>
            <li>トレーナーズを使う：アイテム（何枚でも）・サポーター（1枚だけ）・スタジアム（1枚だけ）・どうぐ（1匹に1枚）</li>
            <li>特性を使う／バトルモンスターをにげる（エネルギーをトラッシュして入れ替え・1回だけ）</li>
            <li>最後にワザを使うと番が終わる。ワザを使わずに<b>ターン終了</b>してもよい</li>
          </ul>
          <h2>特殊状態（チェックタイム：番と番の間に処理）</h2>
          <ul>
            <li><b>どく</b>：チェックタイムごとに10ダメージ</li>
            <li><b>やけど</b>：チェックタイムごとに20ダメージ、その後コインでオモテなら回復</li>
            <li><b>ねむり</b>：ワザもにげるも不可。チェックタイムにコインでオモテなら回復</li>
            <li><b>マヒ</b>：ワザもにげるも不可。自分の次の番の終わりに回復</li>
            <li><b>こんらん</b>：ワザを使うときコインでウラなら失敗し、自分に30ダメージ</li>
            <li>ベンチに下がる・進化すると特殊状態は回復する</li>
          </ul>
          <h2>操作</h2>
          <ul>
            <li>手札のカードを<b>ドラッグ</b>して場に出す、または<b>クリック</b>で選んでから出し先をクリック</li>
            <li>自分のモンスターをクリックすると、ワザ・特性・にげるのメニューが開く</li>
            <li>カードにマウスを乗せると右側に拡大表示。右上の本アイコンでバトルログ</li>
            <li>トラッシュの山をクリックすると中身を確認できる</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Credits() {
  useEffect(() => playMusic('menu'), []);
  return (
    <div className="screen">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-bridge_sun')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="クレジット" />
        <div className="panel doc">
          <h2>ARCANE BEASTS</h2>
          <p>ゲームデザイン・プログラム：オリジナル。カード名・テキスト・ルールエンジンは本作のために書き下ろしました。</p>
          <h2>イラスト・効果音・BGM</h2>
          <p>
            モンスター／人物のポートレート、背景画、エフェクト素材、効果音、音楽は <a href="https://www.wesnoth.org/" target="_blank" rel="noreferrer">Battle for Wesnoth</a>{' '}
            プロジェクトの作品を使用しています（GNU GPL v2 以降、一部 CC BY-SA 4.0）。各ファイルの作者とライセンスはリポジトリの CREDITS.md に記載しています。
          </p>
          <p>ポートレート・背景画は Wesnoth アートチームによるものです。音楽：Aleksi Aubry-Carlson、Timothy Pinkham、Doug Kaufman、Mattias Westlund、Stephen Rozanc、Gianmarco Leone。</p>
          <h2>アイコン</h2>
          <p>
            <a href="https://game-icons.net/" target="_blank" rel="noreferrer">game-icons.net</a>（Lorc、Delapouite ほか）— CC BY 3.0
          </p>
          <h2>フォント</h2>
          <p>Dela Gothic One、M PLUS Rounded 1c、M PLUS 1p、Cinzel — SIL Open Font License 1.1</p>
          <h2>ライブラリ</h2>
          <p>React、Motion、Zustand、Howler.js、Vite</p>
          <h2>ライセンス</h2>
          <p>本作は GPL v2 以降のアセットを含むため、ゲーム全体を GNU GPL v2 以降で配布します。</p>
        </div>
      </div>
    </div>
  );
}
