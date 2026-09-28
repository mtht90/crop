import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { CardFace, EnergySymbol } from '../ui/Card';
import { byName } from '../engine/cards';
import { playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';
import { canVibrate, liteFx, resetAutoFx, type FxLevel } from '../lib/fx';
import { startGyro } from '../lib/gyro';
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall, pwaAvailable } from '../lib/pwa';

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
          <div className="set-row">
            <label>演出の強さ</label>
            <div className="seg">
              {(
                [
                  ['auto', '自動'],
                  ['full', 'フル'],
                  ['lite', '軽量'],
                ] as [FxLevel, string][]
              ).map(([v, l]) => (
                <button
                  key={v}
                  className={settings.fx === v ? 'on' : ''}
                  onClick={() => {
                    if (v === 'auto') resetAutoFx();
                    update((s) => void (s.settings.fx = v));
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="set-note">
            自動：端末の速さを計って、重いときは自動で軽量にします
            {settings.fx === 'auto' && liteFx() ? '（現在：軽量）' : ''}
          </div>
          <div className="set-row">
            <label>振動</label>
            <div className="seg">
              {[true, false].map((v) => (
                <button key={String(v)} className={settings.vibrate === v ? 'on' : ''} onClick={() => update((s) => void (s.settings.vibrate = v))}>
                  {v ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
          </div>
          {!canVibrate() && <div className="set-note">この端末・ブラウザは振動に対応していません</div>}
          <div className="set-row">
            <label>傾きでカードが光る</label>
            <div className="seg">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  className={settings.gyro === v ? 'on' : ''}
                  onClick={() => {
                    update((s) => void (s.settings.gyro = v));
                    if (v) void startGyro();
                  }}
                >
                  {v ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
          </div>
          <InstallRow />
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

/** アプリとして追加 (only on the standalone site; the Artifact frame cannot install) */
function InstallRow() {
  const [, bump] = useState(0);
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []);
  if (!pwaAvailable()) return null;
  return (
    <>
      <div className="set-row">
        <label>アプリとして追加</label>
        {isInstalled() ? (
          <span className="set-ok">追加済み</span>
        ) : canPromptInstall() ? (
          <button className="btn small gold-btn" onClick={() => void promptInstall()}>
            ホーム画面に追加
          </button>
        ) : (
          <span className="set-ok">{isIOS() ? '共有ボタン →「ホーム画面に追加」' : 'ブラウザのメニューから「アプリをインストール」'}</span>
        )}
      </div>
      <div className="set-note">追加すると全画面で起動し、一度読み込んだ画像や音はオフラインでも使えます</div>
    </>
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
            <li>相手のモンスターをきぜつさせてサイドを<b>6枚</b>すべてとる（Ωモンスターをきぜつさせると2枚、EXモンスターなら3枚）</li>
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
              <li>第2弾から登場した<b>EX</b>はさらに強力。そのかわり、きぜつするとサイドを<b>3枚</b>とられる</li>
            </ul>
          </div>
          <h2>レアリティとモデル</h2>
          <p>カードには<b>レアリティ</b>（出にくさ・6段階）と<b>モデル</b>（絵柄や加工の種類）があります。性能はモデルが違っても同じです。</p>
          <ul>
            <li>
              <b>◇ ◇◇ ◇◇◇</b> … コモン・アンコモン・レア。まれに光沢加工の<b>ミラー</b>モデルがある
            </li>
            <li>
              <b>◇◇◇◇</b> … ダブルレア。<b>Ω</b>モデルと<b>EX</b>モデル
            </li>
            <li>
              <b>☆</b> … スター。絵が全面に広がる<b>イラスト</b>、ΩやEX・サポーターの<b>フルアート</b>、色違いの<b>シャイニー</b>
            </li>
            <li>
              <b>♛</b> … クラウン。一枚絵の<b>イラスト</b>と<b>ゴールド</b>。最高レアリティ
            </li>
            <li>☆以上のカードはウラ向きで出てくる。パックのオーラの色で、中に何があるかが分かることも…</li>
          </ul>
          <h2>かけらと交換所</h2>
          <ul>
            <li>同じカードは10枚まで持てる。11枚目以降は、そのカードのレアリティの<b>かけら</b>になる</li>
            <li>かけらを集めると、<b>かけら交換所</b>（コレクション画面から）で同じレアリティの好きなカードと交換できる</li>
          </ul>
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
