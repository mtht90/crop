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
import { CardFace } from '../ui/Card';
import { judgeName } from '../online/names';
import { fileToAvatar } from '../online/avatarFile';
import { isAvatarUrl } from '../online/avatar';
import { AccountBox, AccountSheet, markAskedToSignUp, shouldAskToSignUp } from './AccountBox';
import { RankEmblem } from '../ui/RankEmblem';
import { Icon } from '../ui/Icon';
import { RANKS } from '../state/ranked';
import { isRegistered, PORTRAITS, type MatchKind } from '../online/protocol';
import { online, onlineSupported, serverUrl, setServerAddress, useOnline } from '../online/client';
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
  const pick = useRef<HTMLInputElement>(null);
  // the first time the lobby opens, offer to sign up (once per device)
  const [askSignUp, setAskSignUp] = useState(false);
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

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
    if (st.profile && !isRegistered(st.profile) && shouldAskToSignUp()) {
      markAskedToSignUp();
      setAskSignUp(true);
    }
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
  const syncRank = useStore((s) => s.syncOnlineRank);
  useEffect(() => {
    if (rank) syncRank({ rank: rank.rank, pts: rank.pts, best: rank.best });
  }, [rank?.rank, rank?.pts, rank?.best, syncRank]); // eslint-disable-line react-hooks/exhaustive-deps
  /** the small panels opened from the main screen */
  const [sheet, setSheet] = useState<null | 'friend' | 'watch' | 'profile'>(null);
  const [mode, setMode] = useState<'make' | 'join'>('make');

  if (!supported)
    return (
      <div className="screen">
        <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/p-mountains')})` }} />
        <div className="screen-shade" />
        <div className="stage">
          <TopBar title="フレンド対戦" back="arena" />
          <div className="panel lb-unsupported">
            <h2>この画面ではオンライン対戦を使えません</h2>
            <p>オンライン対戦は、専用サーバーにつないだ版でだけ遊べます。サーバーが配信しているゲームのURLを開いてください。</p>
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
  const close = () => setSheet(null);
  const play = (what: () => void) => {
    sfx('expand', 0.5);
    what();
    // once a room or a queue starts, the panel it came from is done
    if (sheet === 'friend' && mode === 'make') setSheet(null);
    if (sheet === 'friend' && mode === 'join') setSheet(null);
  };
  const addr = serverUrl().replace(/^wss?:\/\//, '').replace(/\/ws$/, '');

  const tiles = [
    {
      key: 'friend',
      title: '友達と対戦',
      sub: 'QRで招待',
      bg: 'story/p-summer',
      fig: 'humans/paladin',
      icon: 'person',
      onClick: () => (setMode('make'), setSheet('friend')),
    },
    {
      key: 'random',
      title: 'ランダム',
      sub: 'すぐ対戦',
      bg: 'story/p-mountains',
      fig: 'humans/duelist',
      icon: 'swords',
      onClick: () => online.queue('random', deck!.cards),
    },
    {
      key: 'ranked',
      title: 'ランク',
      sub: rank ? RANKS[rank.rank] : '昇級・昇段',
      bg: 'story/landscape-castle',
      fig: 'humans/marshal',
      icon: 'crown',
      onClick: () => online.queue('ranked', deck!.cards),
    },
    // a slot kept for a mode that does not exist yet
    {
      key: 'soon',
      title: 'いつか空く',
      sub: '近日解放',
      bg: 'story/landscape-lava',
      fig: 'monsters/fire-dragon',
      icon: 'lock',
      soon: true,
      onClick: () => {},
    },
  ];

  return (
    <div className="screen lobby">
      <div className="screen-bg" style={{ backgroundImage: `url(${artUrl('story/p-mountains')})` }} />
      <div className="screen-shade" />
      <div className="stage">
        <TopBar
          title="フレンド対戦"
          back="arena"
          right={
            <span className="lb-online" title={addr}>
              <i className={`lb-dot ${st.status}`} />
              {st.status === 'open' ? `${st.online}人` : st.status === 'connecting' ? '接続中…' : '未接続'}
            </span>
          }
        />

        {/* ------------------------------ the ways to play ------------------------------ */}
        <div className="lb-tiles">
          {tiles.map((t, i) => (
            <motion.div
              key={t.key}
              className={`tile ${t.soon ? 'soon' : ready ? '' : 'off'}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * i, type: 'spring', stiffness: 220, damping: 24 }}
              onMouseEnter={() => ready && !t.soon && foley.hover()}
              onClick={() => ready && !t.soon && play(t.onClick)}
            >
              <img className="bg" src={artUrl(t.bg)} alt="" />
              <div className="shade" />
              <img className="fig" src={artUrl(t.fig)} alt="" />
              <div className="label">
                <div className="ico">
                  <Icon name={t.icon} />
                </div>
                <h2>{t.title}</h2>
                <p>{t.sub}</p>
              </div>
            </motion.div>
          ))}
          {st.status !== 'open' && (
            <div className="lb-veil">
              <div className="lb-spinner small" />
              <b>{st.failed ? 'サーバーにつながりません' : 'サーバーに接続しています…'}</b>
            </div>
          )}
        </div>

        {/* ------------------------------ you ------------------------------ */}
        <div className="lb-side">
          <motion.div className="panel lb-me" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
            {st.profile ? (
              <>
                <img src={artUrl(st.profile.portrait)} alt="" />
                <div className="lb-me-info">
                  <b>{st.profile.name}</b>
                  <div className="lb-rank">
                    <RankEmblem rank={rank!.rank} size="calc(var(--u) * 3.4)" />
                    <span>{RANKS[rank!.rank]}</span>
                  </div>
                  <small>
                    今月 {rank!.wins}勝 {rank!.losses}敗
                  </small>
                </div>
                <button className="icon-btn lb-edit" title="プロフィール" onClick={() => setSheet('profile')}>
                  <Icon name="gear" />
                </button>
              </>
            ) : (
              <div className="lb-dim">接続するとここに表示されます</div>
            )}
          </motion.div>

          <motion.div className="panel lb-deckbox" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.06 }}>
            {deck && <CardFace cid={deck.cover} />}
            <div>
              <h4>使用デッキ</h4>
              <div className="dname">{deck?.name ?? '―'}</div>
              <button className="btn small" onClick={() => go('deck')}>
                変更
              </button>
              {deckErr && <div className="warn">{deckErr}</div>}
            </div>
          </motion.div>

          <motion.button className="btn lb-watch-btn" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.12 }} onClick={() => setSheet('watch')}>
            <Icon name="crystal-ball" /> 観戦
            <span className="lb-badge">{st.live.length}</span>
          </motion.button>
        </div>

        {/* ------------------------------ small panels ------------------------------ */}
        <AnimatePresence>
          {sheet && !busy && (
            <motion.div className="lb-back" key="sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
              <motion.div className={`panel lb-sheet ${sheet === 'profile' ? 'wide' : ''}`} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.35, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn close" title="閉じる" onClick={close}>
                  <Icon name="close" />
                </button>

                {sheet === 'friend' && (
                  <>
                    <h3>友達と対戦</h3>
                    <div className="seg lb-seg">
                      <button className={mode === 'make' ? 'on' : ''} onClick={() => setMode('make')}>
                        部屋をつくる
                      </button>
                      <button className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>
                        コードで入る
                      </button>
                    </div>
                    {mode === 'make' ? (
                      <button className="btn big gold-btn" disabled={!ready} onClick={() => play(() => online.createRoom(deck!.cards))}>
                        <Icon name="swords" /> 部屋をつくる
                      </button>
                    ) : (
                      <div className="lb-codebox">
                        <input autoFocus placeholder="ABCD" value={codeIn} maxLength={4} onChange={(e) => setCodeIn(e.target.value.toUpperCase())} />
                        <button className="btn big" disabled={!ready || codeIn.length < 4} onClick={() => play(() => online.joinRoom(codeIn, deck!.cards))}>
                          入る
                        </button>
                      </div>
                    )}
                  </>
                )}

                {sheet === 'watch' && (
                  <>
                    <h3>観戦</h3>
                    <div className="lb-live">
                      {st.live.length === 0 && <div className="lb-empty">いま観戦できる試合はありません</div>}
                      {st.live.map((g) => (
                        <button key={g.code} className="lb-game" onClick={() => online.watch(g.code)}>
                          <span className={`lb-kind ${g.kind}`}>{KIND_LABEL[g.kind]}</span>
                          <span className="lb-vs">
                            {g.players[0]} <small>{g.ranks[0]}</small>
                            <i>vs</i>
                            {g.players[1]} <small>{g.ranks[1]}</small>
                          </span>
                          <small>
                            ターン{Math.max(1, g.turn)}・{g.spectators}人
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className="lb-codebox">
                      <input placeholder="コード" value={watchIn} maxLength={4} onChange={(e) => setWatchIn(e.target.value.toUpperCase())} />
                      <button className="btn" disabled={watchIn.length < 4 || st.status !== 'open'} onClick={() => online.watch(watchIn)}>
                        観戦
                      </button>
                    </div>
                  </>
                )}

                {sheet === 'profile' && st.profile && (
                  <>
                    <h3>プロフィール</h3>
                    <div className="lb-prof">
                    <div className="lb-prof-left">
                    <img className="lb-prof-av" src={artUrl(st.profile.portrait)} alt="" />
                    <input
                      className="lb-name"
                      value={name}
                      maxLength={12}
                      placeholder="なまえ"
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => {
                        if (!name.trim() || name === st.profile!.name) return;
                        const v = judgeName(name);
                        if (!v.ok) {
                          setToast(v.message);
                          setTimeout(() => setToast(null), 2600);
                          setName(st.profile!.name);
                          return;
                        }
                        online.rename(v.name);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    {rank && (
                      <div className="lb-prof-rank">
                        <RankEmblem rank={rank.rank} size="calc(var(--u) * 2.6)" />
                        <b>{RANKS[rank.rank]}</b>
                        <small>
                          今月 {rank.wins}勝 {rank.losses}敗
                        </small>
                      </div>
                    )}
                    </div>
                    <div className="lb-prof-right">
                    <h4>アイコン</h4>
                    <div className="lb-portraits">
                      {isAvatarUrl(st.profile.portrait) && (
                        <button className="on" title="いまのアイコン">
                          <img src={st.profile.portrait} alt="" />
                        </button>
                      )}
                      <button
                        className="lb-upload"
                        title="自分の画像をアイコンにする"
                        onClick={() => pick.current?.click()}
                      >
                        <i className="lb-plus">＋</i>
                        <span>自分の画像</span>
                      </button>
                      <input
                        ref={pick}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          fileToAvatar(f).then(
                            (url) => online.rename(name.trim() && judgeName(name).ok ? name : st.profile!.name, url),
                            (err: Error) => flash(err.message),
                          );
                        }}
                      />
                      {PORTRAITS.map((p) => (
                        <button key={p} className={p === st.profile!.portrait ? 'on' : ''} onClick={() => online.rename(name || st.profile!.name, p)}>
                          <img src={artUrl(p)} alt="" />
                        </button>
                      ))}
                    </div>
                    <div className="lb-acct">
                      <h4>アカウント</h4>
                      <AccountBox />
                    </div>
                    </div>
                    </div>
                    <button className="lb-link" onClick={() => setShowXfer((v) => !v)}>
                      {showXfer ? '▾' : '▸'} 引き継ぎ・サーバー
                    </button>
                    {showXfer && (
                      <div className="lb-xfer">
                        <button className="btn small" onClick={() => online.requestTransfer()}>
                          引き継ぎコードを発行
                        </button>
                        {st.transfer && (
                          <div className="lb-code" onClick={() => copy(st.transfer!.code)} title="タップでコピー">
                            {st.transfer.code.slice(0, 4)} {st.transfer.code.slice(4)}
                            <small>10分間・1回だけ</small>
                          </div>
                        )}
                        <div className="lb-join">
                          <input placeholder="他の端末のコード" value={link} maxLength={9} onChange={(e) => setLink(e.target.value.toUpperCase())} />
                          <button className="btn small ghost" disabled={link.replace(/\W/g, '').length < 8} onClick={() => (online.link(link), setLink(''))}>
                            引き継ぐ
                          </button>
                        </div>
                        <button
                          className="textbtn lb-server"
                          onClick={() => {
                            const v = window.prompt('サーバーのアドレス（例: xxxx.trycloudflare.com）\n空にするとこのページと同じ場所に戻します', addr);
                            if (v === null) return;
                            setServerAddress(v);
                            online.disconnect();
                            online.connect();
                          }}
                        >
                          サーバー変更（{addr}）
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* waiting for a friend / for an opponent */}
          {busy && (
            <motion.div className="lb-back" key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="panel lb-sheet lb-wait">
                {waitingRoom ? (
                  <>
                    <div className="lb-room-code">{waitingRoom.code}</div>
                    {inviteUrl ? (
                      <div className="lb-qr">{qr ? <img src={qr} alt="招待QRコード" /> : <div className="lb-spinner small dark" />}</div>
                    ) : (
                      <div className="lb-qr-missing">
                        <b>QRコードの宛先がありません</b>
                        <p>このアドレス（{location.host}）は同じパソコンの中でしか開けません。公開URLを入力してください。</p>
                        <div className="lb-join">
                          <input style={{ width: 'calc(var(--u) * 19)', textTransform: 'none', letterSpacing: 0 }} placeholder="https://…" value={baseIn} onChange={(e) => setBaseIn(e.target.value)} />
                          <button className="btn small" disabled={!baseIn.trim()} onClick={() => setBase(baseIn)}>
                            設定
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="lb-pulse">友達を待っています…</div>
                    <div className="lb-row">
                      <button className="btn small ghost" disabled={!inviteUrl} onClick={() => copy(inviteUrl!)}>
                        <Icon name="scroll-quill" /> リンクをコピー
                      </button>
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          sfx('contract', 0.5);
                          online.cancel();
                        }}
                      >
                        やめる
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lb-spinner" />
                    <div className="lb-pulse">{st.queued === 'ranked' ? 'ランクの相手をさがしています…' : '相手をさがしています…'}</div>
                    <small className="lb-dim">{st.waiting}人が待っています</small>
                    <button className="btn small ghost" onClick={() => online.cancel()}>
                      やめる
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {toast && (
            <motion.div className="lb-toast" key="toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>{askSignUp && <AccountSheet first onClose={() => setAskSignUp(false)} />}</AnimatePresence>
    </div>
  );
}
