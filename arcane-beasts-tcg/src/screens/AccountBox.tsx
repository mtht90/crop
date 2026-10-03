// Sign up / log in: a passkey (the phone's face or fingerprint unlock) or a
// Google account. Either one lets the player pick up their name, avatar and
// rank again on another device. Shown in the lobby's profile, the first time
// the lobby opens, and from the small chip on the home screen.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { online, onlineSupported, useOnline } from '../online/client';
import { renderGoogleButton } from '../online/google';
import { isRegistered } from '../online/protocol';
import { Icon } from '../ui/Icon';
import './account.css';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const ASKED_KEY = 'arcane-beasts-account-asked';

/** should the lobby show the sign-up sheet by itself? (once per device) */
export function shouldAskToSignUp(): boolean {
  try {
    return !localStorage.getItem(ASKED_KEY);
  } catch {
    return false;
  }
}
export function markAskedToSignUp() {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

const passkeysUsable = () => typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext;

function GoogleButton() {
  const clientId = useOnline((s) => s.googleClientId);
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!clientId || !box.current) return;
    let alive = true;
    const el = box.current;
    void renderGoogleButton(el, clientId, (cred) => online.googleSignIn(cred), el.clientWidth || 280).then((ok) => alive && setFailed(!ok));
    return () => {
      alive = false;
    };
  }, [clientId]);
  if (!clientId) return null;
  return failed ? <p className="ac-err">Googleのボタンを読み込めませんでした</p> : <div ref={box} className="ac-google" />;
}

/** the buttons themselves (no frame) */
export function AccountBox({ compact = false }: { compact?: boolean }) {
  const st = useOnline();
  const [busy, setBusy] = useState(false);
  const reg = isRegistered(st.profile);
  const pk = passkeysUsable();
  const run = (mode: 'register' | 'login') => {
    setBusy(true);
    online.passkey(mode).finally(() => setTimeout(() => setBusy(false), 600));
  };
  if (st.status !== 'open' || !st.profile) {
    return (
      <div className="ac-box">
        <p className="ac-wait">{st.failed ? 'サーバーにつながりません' : 'サーバーに接続しています…'}</p>
      </div>
    );
  }
  if (reg) {
    return (
      <div className="ac-box">
        <div className="ac-done">
          <Icon name="check" />
          <div>
            <b>登録済み</b>
            <small>
              {[st.profile.google && `Google（${st.profile.google}）`, st.profile.passkeys ? `パスキー ${st.profile.passkeys}個` : null].filter(Boolean).join('・')}
            </small>
          </div>
        </div>
        {!compact && pk && (
          <button className="ac-sub" disabled={busy} onClick={() => run('register')}>
            この端末のパスキーも追加する
          </button>
        )}
        {!compact && !st.profile.google && <GoogleButton />}
      </div>
    );
  }
  return (
    <div className="ac-box">
      {pk && (
        <button className="ac-main" disabled={busy} onClick={() => run('register')}>
          <Icon name="pendant-key" />
          <span>
            <b>パスキーで登録</b>
            <small>顔・指紋・画面ロックで、パスワード不要</small>
          </span>
        </button>
      )}
      <GoogleButton />
      {pk && (
        <button className="ac-sub" disabled={busy} onClick={() => run('login')}>
          登録済みの方は <b>パスキーでログイン</b>
        </button>
      )}
      {!pk && !st.googleClientId && <p className="ac-err">このブラウザでは登録できません（https のページで開いてください）</p>}
    </div>
  );
}

/** a sheet over any screen; connects to the server while it is open */
export function AccountSheet({ onClose, first = false }: { onClose: () => void; first?: boolean }) {
  const profile = useOnline((s) => s.profile);
  const error = useOnline((s) => s.error);
  const reg = isRegistered(profile);
  const wasReg = useRef(reg);
  useEffect(() => {
    if (!onlineSupported()) return;
    const had = !!online.ws;
    online.connect();
    return () => {
      if (!had && !useOnline.getState().match) online.disconnect();
    };
  }, []);
  // close a moment after signing up
  useEffect(() => {
    if (reg && !wasReg.current) {
      const t = setTimeout(onClose, 1400);
      return () => clearTimeout(t);
    }
  }, [reg, onClose]);
  return (
    <motion.div className="ac-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel ac-sheet" initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: 0.4, ease: EASE_OUT }} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="ac-kick">{first ? 'WELCOME' : 'ACCOUNT'}</div>
        <h3>{reg ? '登録できました' : 'アカウント登録'}</h3>
        {!reg && <p className="ac-lead">登録すると、機種変更しても名前・アイコン・ランクを引き継げます。1分で終わります。</p>}
        <AccountBox compact />
        <AnimatePresence>
          {error && (
            <motion.p className="ac-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {!reg && (
          <button className="ac-later" onClick={onClose}>
            あとで
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
