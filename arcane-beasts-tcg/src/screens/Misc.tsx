import { errorLog } from '../ui/ErrorBoundary';
import { useEffect, useState } from 'react';
import { DEV_CODE, enterDevMode, grantAllCards, useStore } from '../state/store';
import { CHAPTERS } from '../story';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { CardFace, EnergySymbol } from '../ui/Card';
import { byName } from '../engine/cards';
import { playMusic, sfx } from '../audio/audio';
import { askConfirm } from '../ui/Confirm';
import { canVibrate, liteFx, resetAutoFx, type FxLevel } from '../lib/fx';
import { startGyro } from '../lib/gyro';
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall, pwaAvailable } from '../lib/pwa';
import { backupText, codeTransferSupported, issueCode, prettyCode, redeemCode, restoreBackup } from '../lib/transfer';
import { PORTRAITS } from '../online/protocol';
import { forgetOnlineIdentity, online, useOnline } from '../online/client';

export function Settings() {
  const settings = useStore((s) => s.save.settings);
  const update = useStore((s) => s.update);
  const reset = useStore((s) => s.reset);
  useEffect(() => playMusic('menu'), []);
  const set = (k: 'music' | 'sfx' | 'speed', v: number) => update((s) => void (s.settings[k] = v));
  const avatar = useStore((s) => s.save.avatar);
  return (
    <div className="screen">
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="設定" back="more" />
        <div className="box page-inner settings3">
          <div className="set-row set-avatar">
            <label>アイコン</label>
            <div className="lb-portraits">
              {PORTRAITS.map((p) => (
                <button
                  key={p}
                  className={p === (avatar ?? PORTRAITS[0]) ? 'on' : ''}
                  onClick={() => {
                    sfx('button', 0.5);
                    update((s) => void (s.avatar = p));
                    // keep the online profile in step (when connected)
                    const prof = useOnline.getState().profile;
                    if (prof && useOnline.getState().status === 'open') online.rename(prof.name, p);
                  }}
                >
                  <img src={artUrl(p)} alt="" />
                </button>
              ))}
            </div>
          </div>
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
            <label>ほかのアプリの音と一緒に流す</label>
            <div className="seg">
              {[true, false].map((v) => (
                <button key={String(v)} className={(settings.mixAudio !== false) === v ? 'on' : ''} onClick={() => update((s) => void (s.settings.mixAudio = v))}>
                  {v ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
          </div>
          {settings.mixAudio !== false && <div className="set-note">ONのとき、iPhoneの消音モードではゲームの音が鳴りません</div>}
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
          <div className="set-row">
            <label>手札の並び</label>
            <div className="seg">
              {[true, false].map((v) => (
                <button key={String(v)} className={(settings.handSort !== false) === v ? 'on' : ''} onClick={() => update((s) => void (s.settings.handSort = v))}>
                  {v ? '自動で整理' : '引いた順'}
                </button>
              ))}
            </div>
          </div>
          <TransferRows />
          <InstallRow />
          <DevRow />
          <PurchaseLog />
          <ErrorLogRow />
          <div className="set-row danger">
            <label>セーブデータ</label>
            <button
              className="btn red small"
              onClick={async () => {
                if (await askConfirm('すべてのカード・ジェム・デッキと、オンラインの名前・ランクが消去されます。本当にリセットしますか？', 'リセットする', true)) {
                  forgetOnlineIdentity();
                  reset();
                }
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

/** 開発者モード: a code unlocks everything (story cleared, endless coins and shards) */
function DevRow() {
  const dev = useStore((s) => !!s.save.dev);
  const update = useStore((s) => s.update);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  if (dev)
    return (
      <>
        <div className="set-row dev-on">
          <label>開発者モード</label>
          <span className="dev-badge">ON</span>
          <button
            className="btn small"
            onClick={() => {
              update((s) => grantAllCards(s));
              sfx('gold', 0.6);
              setMsg('すべてのカードを4枚ずつ追加しました');
            }}
          >
            全カードを入手
          </button>
          <button className="btn ghost small" onClick={() => update((s) => void (s.dev = false))}>
            オフにする
          </button>
        </div>
        <div className="set-note">{msg || '全クリア・全カード・ランクマッチはマスター。ジェムは減りません'}</div>
      </>
    );
  const submit = () => {
    if (code.trim().toUpperCase() !== DEV_CODE) {
      sfx('miss-2', 0.5);
      setMsg('コードがちがいます');
      return;
    }
    update((s) => enterDevMode(s, CHAPTERS.map((c) => c.id)));
    online.devRank();
    sfx('fanfare-short', 0.6);
    setCode('');
    setMsg('');
  };
  return (
    <>
      <div className="set-row">
        <label>開発者コード</label>
        <input className="dev-input" value={code} placeholder="コードを入力" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn small" disabled={!code.trim()} onClick={submit}>
          決定
        </button>
      </div>
      {msg && <div className="set-note">{msg}</div>}
    </>
  );
}

/** copy text, falling back to a hidden textarea where the clipboard API is not allowed */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  }
}

/** 引き継ぎ: a code through the server, or a backup text where there is none */
function TransferRows() {
  const [mode, setMode] = useState<null | 'issue' | 'enter' | 'backup' | 'restore'>(null);
  const [issued, setIssued] = useState<{ code: string; expires: number } | null>(null);
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const viaCode = codeTransferSupported();
  const fail = (e: unknown) => setMsg(e instanceof Error ? e.message : String(e));
  const confirmOverwrite = () => askConfirm('この端末のカード・ジェム・デッキ・ストーリーの進み具合は、引き継いだデータで上書きされます。よろしいですか？', '引き継ぐ', true);

  const issue = async () => {
    setMode('issue');
    setMsg('');
    setBusy(true);
    try {
      setIssued(await issueCode());
      sfx('receive', 0.6);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const redeem = async () => {
    if (!(await confirmOverwrite())) return;
    setBusy(true);
    setMsg('');
    try {
      await redeemCode(code);
      sfx('fanfare-short', 0.6);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!(await confirmOverwrite())) return;
    try {
      restoreBackup(text);
      sfx('fanfare-short', 0.6);
    } catch (e) {
      fail(e);
    }
  };
  const left = issued ? Math.max(0, Math.round((issued.expires - Date.now()) / 60000)) : 0;

  return (
    <>
      <div className="set-row">
        <label>引き継ぎ</label>
        {viaCode ? (
          <>
            <button className={`btn small ${mode === 'issue' ? 'blue' : ''}`} disabled={busy} onClick={() => void issue()}>
              コードを発行
            </button>
            <button className={`btn small ${mode === 'enter' ? 'blue' : ''}`} onClick={() => (setMode('enter'), setMsg(''))}>
              コードを入力
            </button>
          </>
        ) : (
          <>
            <button className={`btn small ${mode === 'backup' ? 'blue' : ''}`} onClick={() => (setMode('backup'), setMsg(''), setText(backupText()))}>
              バックアップを書き出す
            </button>
            <button className={`btn small ${mode === 'restore' ? 'blue' : ''}`} onClick={() => (setMode('restore'), setMsg(''), setText(''))}>
              バックアップから復元
            </button>
          </>
        )}
      </div>
      {mode === 'issue' && issued && (
        <div className="set-xfer">
          <button className="xfer-code" onClick={() => void copyText(issued.code).then((ok) => setMsg(ok ? 'コピーしました' : ''))} title="タップでコピー">
            {prettyCode(issued.code)}
          </button>
          <div className="set-note">新しい端末の「設定 → 引き継ぎ → コードを入力」で入れてください。有効期限はあと約{left}分、1回だけ使えます。この端末のデータはそのまま残ります。</div>
        </div>
      )}
      {mode === 'enter' && (
        <div className="set-xfer">
          <input className="dev-input xfer-input" value={code} placeholder="XXXX-XXXX" maxLength={9} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && void redeem()} />
          <button className="btn small gold-btn" disabled={busy || code.replace(/[^0-9A-Z]/gi, '').length !== 8} onClick={() => void redeem()}>
            引き継ぐ
          </button>
        </div>
      )}
      {mode === 'backup' && (
        <div className="set-xfer">
          <textarea className="xfer-text" readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn small" onClick={() => void copyText(text).then((ok) => setMsg(ok ? 'コピーしました。メモ帳などに保存してください' : '文字列を長押しして、すべて選択 → コピーしてください'))}>
            コピー
          </button>
        </div>
      )}
      {mode === 'restore' && (
        <div className="set-xfer">
          <textarea className="xfer-text" value={text} placeholder="AB1: で始まる文字列を貼り付け" onChange={(e) => setText(e.target.value)} />
          <button className="btn small gold-btn" disabled={!text.trim()} onClick={() => void restore()}>
            復元する
          </button>
        </div>
      )}
      {msg && <div className="set-note">{msg}</div>}
      {!mode && <div className="set-note">{viaCode ? '機種変更のときは、古い端末でコードを発行して、新しい端末で入力します' : 'このページでは、文字列のバックアップで別の端末に移せます'}</div>}
    </>
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
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-castle')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="あそびかた" back="more" />
        <div className="box page-inner doc3">
          <h2>勝利条件</h2>
          <ul>
            <li>相手のモンスターを1匹きぜつさせるごとにサイドを1枚（★4・★5のカードなら2枚）とり、<b>6枚</b>すべてとる</li>
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
            </ul>
          </div>
          <h2>レアリティ（★）</h2>
          <p>
            カードの★は<b>レア度</b>です。同じカードでも、特別な絵柄（★3の全面絵・★4・★5）は<b>性能も上がります</b>。
          </p>
          <ul>
            <li>
              <b>★1・★2</b> … 基本のカード。パックによく入っている
            </li>
            <li>
              <b>★3</b> … 主力になる強いカードと、絵が全面に広がるカード
            </li>
            <li>
              <b>★4</b> … 迫力の一枚絵と、銀色のカード。かなりレア
            </li>
            <li>
              <b>★5</b> … 金色のカードだけ。伝説級のレア
            </li>
            <li>
              <b>強化の目安</b>：モンスターは 全面絵 HP+10・ワザ+10 ／ ★4 HP+30・ワザ+20 ／ ★5 HP+50・ワザ+30。サポーターやグッズは、引く枚数・回復量などが増える（カードに書かれた数字のとおり）。光るカード（ミラー）は通常版と同じ性能
            </li>
            <li>パックを開けるとき、光の色で中身が分かる：★1 灰・★2 青・★3 金・★4 虹・★5 虹金</li>
            <li>同じカードは10枚まで持てる。11枚目以降はジェムに変わる</li>
          </ul>
          <h2>ジェム</h2>
          <ul>
            <li>ゲーム内のお金は<b>ジェム</b>ひとつだけ。バトル・ミッション・ログイン・レベルアップ・イベント・ボスレイドでもらえる</li>
            <li>パックを開ける、ワードローブと交換する、の両方に使う</li>
            <li>通常パックは1日2回まで無料。2回目は1回目の4時間後から</li>
            <li>ジェムで買えるのはレアパック。1回500ジェム、10連は4,500ジェム</li>
            <li>負けたとき・降参したときは報酬なし。勝てば少しジェムがもらえ、その日の初勝利はさらに多い</li>
            <li>大きく稼げるのは、ストーリーなどの初回クリア、イベント、ボスレイド</li>
          </ul>
          <h2>イベント</h2>
          <ul>
            <li>2週間ごとに新しいイベントが始まる。全15ステージのマップを進み、ステージごとに変則ルールがある</li>
            <li>1-5・2-5・3-5はボス。勝つたびにジェム、はじめてクリアしたステージはさらにジェムがもらえる</li>
            <li>勝つたびに「イベントのかけら」がときどき手に入り、交換所で限定カードやジェムと交換できる</li>
            <li>3-5のボスに勝つと、まれに限定カードが手に入る</li>
          </ul>
          <h2>ボスレイド</h2>
          <ul>
            <li>不定期に開催。開催していないときは、バトルメニューのレイドが暗くなる</li>
            <li>ボスのHPはバトルをまたいで残る。何度も挑んで削り、HPを0にすると討伐。ボスは強くなって復活する</li>
            <li>1回目は無料、2回目からはジェム50個。倒すと3,000ジェム（2回目5,000、3回目から2,500）。まれにレイドカード</li>
          </ul>
          <h2>特別なカード</h2>
          <ul>
            <li>レイドカードとイベントの限定カードは、パックからは出ない。コレクションの「その他」で見られる</li>
          </ul>
          <h2>スタジアム</h2>
          <ul>
            <li>スタジアムカードを出すと、場の景色と天気が変わる</li>
            <li>タイプのスタジアムは、あるタイプのワザを<b>+30</b>強くし、別のタイプを<b>-20</b>弱くする。どのタイプにも得意なスタジアムがある</li>
            <li>ほかにも、回復・ドロー・特殊状態の無効・ベンチの守りなど、試合の流れを変えるスタジアムがある。「毎番1回」と書かれた効果は、スタジアムをタップして使う</li>
            <li>出ているスタジアムの効果は、画面上の帯にいつでも表示される</li>
            <li>新しいスタジアムを出すと、前のスタジアムはトラッシュされる</li>
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
            <li>ワザを使うと自動で番が終わる。ワザを使わずに<b>ターン終了</b>してもよい</li>
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
            <li>手札のカードを<b>ドラッグ</b>して場に出す、または<b>タップ</b>で選んでから出し先をタップ</li>
            <li>自分のモンスターをタップすると、ワザ・特性・にげるのメニューが開く</li>
            <li>カードを長押し（PCはマウスを乗せる）と拡大表示。右上の本アイコンでバトルログ</li>
            <li>トラッシュの山をタップすると中身を確認できる</li>
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
      <div className="page-bg" style={{ backgroundImage: `url(${artUrl('story/landscape-bridge_sun')})` }} />
      <div className="page-shade" />
      <div className="page">
        <TopBar title="クレジット" back="more" />
        <div className="box page-inner doc3">
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
            <a href="https://game-icons.net/" target="_blank" rel="noreferrer">game-icons.net</a>（Lorc、Delapouite ほか）— CC BY 3.0 ／ コインとジェムの絵は <a href="https://github.com/googlefonts/noto-emoji" target="_blank" rel="noreferrer">Noto Emoji</a>（Google）— Apache 2.0 ／ レイドカードの光の素材は <a href="https://kenney.nl/assets/particle-pack" target="_blank" rel="noreferrer">Kenney Particle Pack</a> — CC0 ／ カードや画面の効果音は Kenney（Casino Audio・Interface Sounds・Sci-Fi Sounds）と OpenGameArt の rubberduck — CC0 ／ ランクの紋章は <a href="https://rhosgfx.itch.io/vector-ranks" target="_blank" rel="noreferrer">Vector Ranks</a> by RhosGFX — CC0
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

/** copy the device's error log, to paste into a bug report */
function ErrorLogRow() {
  const [msg, setMsg] = useState('');
  const n = errorLog().length;
  return (
    <>
      <div className="set-row">
        <label>不具合の記録</label>
        <button
          className="btn small"
          onClick={async () => {
            const text = [`ARCANE BEASTS ${navigator.userAgent}`, ...errorLog()].join('\n\n');
            try {
              await navigator.clipboard.writeText(text);
              setMsg(n ? `${n}件の記録をコピーしました。不具合の報告に貼り付けてください` : 'エラーの記録はありません');
            } catch {
              setMsg('コピーできませんでした');
            }
          }}
        >
          記録をコピー{n ? `（${n}件）` : ''}
        </button>
      </div>
      {msg && <div className="set-note">{msg}</div>}
    </>
  );
}

/** 購入履歴: every payment, newest first */
function PurchaseLog() {
  const list = useStore((s) => s.save.purchases ?? []);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="set-row">
        <label>購入履歴</label>
        <button className="btn small ghost" onClick={() => setOpen((v) => !v)}>
          {open ? '閉じる' : `見る（${list.length}件）`}
        </button>
      </div>
      {open && (
        <ul className="buy-log">
          {list.length === 0 && <li className="lb-dim">まだありません</li>}
          {list.map((p, i) => {
            const d = new Date(p.at);
            return (
              <li key={i}>
                <span className="buy-at">{`${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`}</span>
                <span className="buy-what">{p.label}</span>
                <b>{p.tickets ? `チケット ${p.tickets}枚` : `${p.gems.toLocaleString()} ジェム`}</b>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
