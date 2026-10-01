// ============================================================================
// オンライン対戦ロビー: friend rooms (code + QR), random and ranked matches,
// watching live games, and the player's online profile / transfer code.
// ============================================================================
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { activeDeck, useStore } from '../state/store';
import { validateDeck } from '../engine/decks';
import { artUrl } from '../lib/assets';
import { TopBar } from '../ui/TopBar';
import { RankEmblem } from '../ui/RankEmblem';
import { Icon } from '../ui/Icon';
import { RANKS } from '../state/ranked';
import { PORTRAITS, type MatchKind } from '../online/protocol';
import { online, onlineSupported, serverUrl, useOnline } from '../online/client';
import { foley, playMusic, sfx } from '../audio/audio';
import './lobby.css';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const KIND_LABEL: Record<MatchKind, string> = { friend: 'フレンド', random: 'ランダム', ranked: 'ランク' };

const PUBLIC_KEY = 'arcane-beasts-public-url';
const isLocalHost = (h: string) => /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(h) || h.endsWith('.local');

/**
 * the address other people open: the server's PUBLIC_URL, one pasted by the
 * host, or this page's own address (unless that is only reachable from here)
 */
function usePublicBase(): [string | null, (v: string) => void] {
  const [info, setInfo] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PUBLIC_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    void fetch('/api/info')
      .then((r) => r.json())
      .then((j: { publicUrl?: string | null }) => setInfo(j.publicUrl ?? null))
      .catch(() => undefined);
  }, []);
  const own = isLocalHost(location.hostname) ? null : `${location.origin}${location.pathname}`;
  const set = (v: string) => {
    const t = v.trim();
    try {
      if (t) localStorage.setItem(PUBLIC_KEY, t);
      else localStorage.removeItem(PUBLIC_KEY);
    } catch {
      /* ignore */
    }
    setSaved(t || null);
  };
  return [info ?? saved ?? own, set];
}

function shareUrl(base: string | null, param: 'room' | 'watch', code: string) {
  if (!base) return null;
  try {
    const u = new URL(/^https?:\/\//.test(base) ? base : `https://${base}`);
    u.search = '';
    u.hash = '';
    u.searchParams.set(param, code);
    return u.toString();
  } catch {
    return null;
  }
}

function useQr(text: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!text) {
      setSrc(null);
      return;
    }
    void import('qrcode').then((Q) =>
      Q.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#0b1026', light: '#ffffff' } }).then((url) => {
        if (live) setSrc(url);
      }),
    );
    return () => {
      live = false;
    };
  }, [text]);
  return src;
}

export function Lobby() {
  const supported = onlineSupported();
  const go = useStore((s) => s.go);
  const save = useStore((s) => s.save);
  const st = useOnline();
  const deck = activeDeck(save);
  const deckErr = deck ? validateDeck(deck.cards)[0] : 'デッキがありません';
  const [codeIn, setCodeIn] = useState('');
  const [watchIn, setWatchIn] = useState('');
  const [name, setName] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [showXfer, setShowXfer] = useState(false);
  const invite = useRef<{ room?: string; watch?: string }>({});

  useEffect(() => playMusic('menu'), []);

  // connect while this screen is open; leave the socket alone once a game starts
  useEffect(() => {
    if (!supported) return;
    const q = new URLSearchParams(location.search);
    invite.current = { room: q.get('room')?.toUpperCase() ?? undefined, watch: q.get('watch')?.toUpperCase() ?? undefined };
    online.connect();
    return () => {
      if (!useOnline.getState().match) online.disconnect();
    };
  }, [supported]);

  useEffect(() => {
    if (st.profile) setName((n) => n || st.profile!.name);
  }, [st.profile]);

  // invitation links (?room=ABCD joins, ?watch=ABCD spectates) are used once the profile is ready
  useEffect(() => {
    if (st.status !== 'open' || !deck || deckErr) return;
    const inv = invite.current;
    if (inv.watch) {
      online.watch(inv.watch);
      invite.current = {};
    } else if (inv.room) {
      setCodeIn(inv.room);
      online.joinRoom(inv.room, deck.cards);
      invite.current = {};
    }
  }, [st.status, deck, deckErr]);

  useEffect(() => {
    if (!st.error) return;
    setToast(st.error);
    useOnline.setState({ error: null });
    foley.tick();
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [st.error]);

  // keep the watch list fresh
  useEffect(() => {
    if (st.status !== 'open') return;
    online.refreshLive();
    const iv = setInterval(() => online.refreshLive(), 8000);
    return () => clearInterval(iv);
  }, [st.status]);

  const waitingRoom = st.room && st.room.state === 'waiting' ? st.room : null;
  const [base, setBase] = usePublicBase();
  const [baseIn, setBaseIn] = useState('');
  const inviteUrl = waitingRoom ? shareUrl(base, 'room', waitingRoom.code) : null;
  const qr = useQr(inviteUrl);
  const ready = st.status === 'open' && !!deck && !deckErr;
  const busy = !!st.queued || !!waitingRoom;
  const rank = st.profile?.rank;

  if (!supported)
    return (
      <div className="screen">
        <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/p-mountains')})` }} />
        <div className="screen-shade" />
        <div className="stage">
          <TopBar title="オンライン対戦" />
          <div className="panel lb-unsupported">
            <h2>この画面ではオンライン対戦を使えません</h2>
            <p>オンライン対戦は、自宅のパソコンで動かす専用サーバーにつないで遊びます。サーバーが配信しているゲームのURLを開いてください。</p>
            <p className="lb-dim">（claude.aiのアーティファクト内からは外部のサーバーにつなげないため、CPU対戦のみ遊べます）</p>
          </div>
        </div>
      </div>
    );

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setToast('コピーしました'),
      () => setToast('コピーできませんでした'),
    );
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="screen lobby">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/p-mountains')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar title="オンライン対戦" />
        <div className="lb-status">
          <span className={`lb-dot ${st.status}`} />
          {st.status === 'open' ? `接続中　オンライン ${st.online}人 ・ マッチ待ち ${st.waiting}人` : st.status === 'connecting' ? (st.failed ? 'サーバーにつながりません。再接続しています…' : 'サーバーに接続しています…') : '未接続'}
          <small>{serverUrl().replace(/^wss?:\/\//, '').replace(/\/ws$/, '')}</small>
        </div>

        {/* ------------------------------ profile ------------------------------ */}
        <motion.div className="lb-col lb-profile panel" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
          <h3>プレイヤー</h3>
          {st.profile ? (
            <>
              <div className="lb-me">
                <img src={artUrl(st.profile.portrait)} alt="" />
                <div>
                  <input
                    className="lb-name"
                    value={name}
                    maxLength={12}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name.trim() && name !== st.profile!.name && online.rename(name)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <div className="lb-rank">
                    <RankEmblem rank={rank!.rank} size="calc(var(--u) * 3)" />
                    <b>{RANKS[rank!.rank]}</b>
                    <small>{rank!.rank >= 20 ? `${rank!.pts}pt` : `${rank!.pts}/100`}</small>
                  </div>
                  <div className="lb-rec">
                    今月 {rank!.wins}勝 {rank!.losses}敗 ・ 通算 {st.profile.games}戦
                  </div>
                </div>
              </div>
              <div className="lb-portraits">
                {PORTRAITS.map((p) => (
                  <button key={p} className={p === st.profile!.portrait ? 'on' : ''} onClick={() => online.rename(name || st.profile!.name, p)}>
                    <img src={artUrl(p)} alt="" />
                  </button>
                ))}
              </div>
              <div className="lb-deck">
                使用デッキ：<b>{deck?.name ?? '―'}</b>
                <button className="btn small ghost" onClick={() => go('deck')}>
                  変更
                </button>
              </div>
              {deckErr && <div className="warn">{deckErr}</div>}
              <button className="lb-link" onClick={() => setShowXfer((v) => !v)}>
                {showXfer ? '▾' : '▸'} 引き継ぎ（機種変更・他の端末で遊ぶ）
              </button>
              {showXfer && (
                <div className="lb-xfer">
                  <button className="btn small" onClick={() => online.requestTransfer()}>
                    引き継ぎコードを発行
                  </button>
                  {st.transfer && (
                    <div className="lb-code" onClick={() => copy(st.transfer!.code)} title="タップでコピー">
                      {st.transfer.code.slice(0, 4)} {st.transfer.code.slice(4)}
                      <small>10分間・1回だけ使えます</small>
                    </div>
                  )}
                  <div className="lb-join">
                    <input placeholder="他の端末のコード" value={link} maxLength={9} onChange={(e) => setLink(e.target.value.toUpperCase())} />
                    <button className="btn small ghost" disabled={link.replace(/\W/g, '').length < 8} onClick={() => (online.link(link), setLink(''))}>
                      引き継ぐ
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="lb-dim">接続するとプレイヤー情報が表示されます</div>
          )}
        </motion.div>

        {/* ------------------------------- modes ------------------------------- */}
        <motion.div className="lb-col lb-modes panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.05 }}>
          <AnimatePresence mode="wait">
            {waitingRoom ? (
              <motion.div key="room" className="lb-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h3>フレンド対戦の部屋</h3>
                <div className="lb-room-code">{waitingRoom.code}</div>
                {inviteUrl ? (
                  <div className="lb-qr">{qr ? <img src={qr} alt="招待QRコード" /> : <span className="lb-dim">QRコードを作っています…</span>}</div>
                ) : (
                  <div className="lb-qr-missing">
                    <b>QRコードの宛先がありません</b>
                    <p>このアドレス（{location.host}）は同じパソコンの中でしか開けません。公開URL（トンネルのアドレス）を入力するか、公開URLでゲームを開き直してください。</p>
                    <div className="lb-join">
                      <input style={{ width: 'calc(var(--u) * 19)', textTransform: 'none', letterSpacing: 0 }} placeholder="https://xxxx.trycloudflare.com" value={baseIn} onChange={(e) => setBaseIn(e.target.value)} />
                      <button className="btn small" disabled={!baseIn.trim()} onClick={() => setBase(baseIn)}>
                        設定
                      </button>
                    </div>
                  </div>
                )}
                <p className="lb-dim">相手にこのQRコードをスマホで読み取ってもらうか、コードを伝えてください</p>
                <div className="lb-row">
                  <button className="btn small ghost" disabled={!inviteUrl} onClick={() => copy(inviteUrl!)}>
                    招待リンクをコピー
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => {
                      sfx('contract', 0.5);
                      online.cancel();
                    }}
                  >
                    部屋をとじる
                  </button>
                </div>
                <div className="lb-dim lb-pulse">相手を待っています…</div>
              </motion.div>
            ) : st.queued ? (
              <motion.div key="queue" className="lb-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h3>{st.queued === 'ranked' ? 'ランクマッチ' : 'ランダムマッチ'}</h3>
                <div className="lb-spinner" />
                <div className="lb-pulse">対戦相手を探しています…</div>
                <p className="lb-dim">マッチ待ち {st.waiting}人{st.queued === 'ranked' ? '　近いランクの相手を探し、時間がたつと範囲が広がります' : ''}</p>
                <button className="btn small ghost" onClick={() => online.cancel()}>
                  やめる
                </button>
              </motion.div>
            ) : (
              <motion.div key="modes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h3>対戦する</h3>
                <div className="lb-mode">
                  <div className="lb-mode-head">
                    <b>フレンド対戦</b>
                    <small>部屋を作ってQRコードで友達を呼ぶ</small>
                  </div>
                  <div className="lb-row">
                    <button
                      className="btn gold-btn"
                      disabled={!ready}
                      onClick={() => {
                        sfx('button', 0.6);
                        online.createRoom(deck!.cards);
                      }}
                    >
                      部屋を作る
                    </button>
                    <div className="lb-join">
                      <input placeholder="部屋コード" value={codeIn} maxLength={4} onChange={(e) => setCodeIn(e.target.value.toUpperCase())} />
                      <button className="btn ghost" disabled={!ready || codeIn.length < 4} onClick={() => online.joinRoom(codeIn, deck!.cards)}>
                        入る
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lb-mode">
                  <div className="lb-mode-head">
                    <b>ランダムマッチ</b>
                    <small>待っている誰かとすぐ対戦（勝ち 60コイン）</small>
                  </div>
                  <button className="btn" disabled={!ready} onClick={() => online.queue('random', deck!.cards)}>
                    <Icon name="swords" /> 相手をさがす
                  </button>
                </div>
                <div className="lb-mode ranked">
                  <div className="lb-mode-head">
                    <b>オンラインランク</b>
                    <small>人どうしで昇級・昇段。月ごとのシーズン制</small>
                  </div>
                  <button className="btn red" disabled={!ready} onClick={() => online.queue('ranked', deck!.cards)}>
                    <Icon name="swords" /> ランクマッチ
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ------------------------------- watch ------------------------------- */}
        <motion.div className="lb-col lb-watch panel" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.1 }}>
          <h3>観戦</h3>
          <div className="lb-live">
            {st.live.length === 0 && <div className="lb-dim">いま観戦できる試合はありません</div>}
            {st.live.map((g) => (
              <button key={g.code} className="lb-game" disabled={busy} onClick={() => online.watch(g.code)}>
                <span className={`lb-kind ${g.kind}`}>{KIND_LABEL[g.kind]}</span>
                <span className="lb-vs">
                  {g.players[0]} <small>{g.ranks[0]}</small>
                  <i>vs</i>
                  {g.players[1]} <small>{g.ranks[1]}</small>
                </span>
                <small>
                  ターン{Math.max(1, g.turn)} ・ 観戦{g.spectators}人
                </small>
              </button>
            ))}
          </div>
          <div className="lb-join">
            <input placeholder="部屋コードで観戦" value={watchIn} maxLength={4} onChange={(e) => setWatchIn(e.target.value.toUpperCase())} />
            <button className="btn small ghost" disabled={busy || watchIn.length < 4 || st.status !== 'open'} onClick={() => online.watch(watchIn)}>
              観戦
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {toast && (
            <motion.div className="lb-toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

