// Sign up / log in: a passkey (the phone's face or fingerprint unlock) or a
// Google account. Drawn plainly, like the sign-in screens people already know,
// rather than in the game's fantasy style. Shown in the lobby's profile, the
// first time the lobby opens, and from the small chip on the home screen.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { online, onlineSupported, useOnline } from '../online/client';
import { renderGoogleButton } from '../online/google';
import { isRegistered } from '../online/protocol';
import './account.css';

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

/** a key with a person: the usual passkey mark */
function PasskeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="9" cy="7" r="4" fill="currentColor" />
      <path d="M2 20c0-3.6 3.1-6 7-6 1.3 0 2.5.3 3.5.8V20H2z" fill="currentColor" />
      <circle cx="18" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M18 13v8m0-3h2.5m-2.5 2h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GoogleButton({ text }: { text: 'signup_with' | 'signin_with' }) {
  const clientId = useOnline((s) => s.googleClientId);
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!clientId || !box.current) return;
    let alive = true;
    const el = box.current;
    void renderGoogleButton(el, clientId, (cred) => online.googleSignIn(cred), el.clientWidth || 300, text).then((ok) => alive && setFailed(!ok));
    return () => {
      alive = false;
    };
  }, [clientId, text]);
  if (!clientId) return null;
  return failed ? <p className="ac-note err">Googleのボタンを読み込めませんでした</p> : <div ref={box} className="ac-google" />;
}

/** the sign-in card itself */
export function AccountBox() {
  const st = useOnline();
  const reg = isRegistered(st.profile);
  const pk = passkeysUsable();
  const open = st.status === 'open' && !!st.profile;

  // challenges ready before the tap (Safari needs the passkey call to start inside the tap)
  useEffect(() => {
    if (!open || !pk) return;
    online.preparePasskeys();
    const t = setInterval(() => online.preparePasskeys(), 3 * 60_000);
    return () => clearInterval(t);
  }, [open, pk, st.profile?.id]);

  if (!open) {
    return (
      <div className="ac-card">
        <p className="ac-note">{st.failed ? 'サーバーにつながりません' : 'サーバーに接続しています…'}</p>
      </div>
    );
  }
  if (reg) {
    return (
      <div className="ac-card">
        <div className="ac-done">
          <span className="ac-check">✓</span>
          <div>
            <b>登録済み</b>
            <small>{[st.profile!.google && `Google（${st.profile!.google}）`, st.profile!.passkeys ? `パスキー ${st.profile!.passkeys}個` : null].filter(Boolean).join('・')}</small>
          </div>
        </div>
        {pk && (
          <button className="ac-btn outline" onClick={() => void online.passkey('register')}>
            <PasskeyIcon />
            この端末のパスキーを追加
          </button>
        )}
        {!st.profile!.google && <GoogleButton text="signup_with" />}
      </div>
    );
  }
  return (
    <div className="ac-card">
      <div className="ac-sec">新規登録</div>
      {pk && (
        <button className="ac-btn dark" onClick={() => void online.passkey('register')}>
          <PasskeyIcon />
          パスキーで新規登録
        </button>
      )}
      <GoogleButton text="signup_with" />
      {pk && <p className="ac-note">パスキー: 顔・指紋・画面ロックで登録。パスワードは不要です。</p>}

      <div className="ac-or">
        <span>すでにアカウントをお持ちの方</span>
      </div>
      {pk && (
        <button className="ac-btn outline" onClick={() => void online.passkey('login')}>
          <PasskeyIcon />
          パスキーでログイン
        </button>
      )}
      <GoogleButton text="signin_with" />
      {!pk && !st.googleClientId && <p className="ac-note err">このブラウザでは登録できません（https のページで開いてください）</p>}
    </div>
  );
}

/** a sheet over any screen; connects to the server while it is open */
export function AccountSheet({ onClose }: { onClose: () => void; first?: boolean }) {
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
  // errors are shown here, then cleared
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => useOnline.setState({ error: null }), 4000);
    return () => clearTimeout(t);
  }, [error]);
  return (
    <motion.div className="ac-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="ac-sheet" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25 }} onClick={(e) => e.stopPropagation()}>
        <button className="ac-x" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
        <h3>{reg ? '登録が完了しました' : 'アカウント'}</h3>
        {!reg && <p className="ac-lead">登録すると、機種変更しても名前・アイコン・ランクを引き継げます。</p>}
        <AccountBox />
        <AnimatePresence>
          {error && (
            <motion.p className="ac-note err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
