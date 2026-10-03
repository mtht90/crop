// The "Google account" part of the profile sheet: sign up / log in with Google,
// so the name, avatar and rank can be picked up again on any device.
import { useEffect, useRef, useState } from 'react';
import { online, useOnline } from '../online/client';
import { renderGoogleButton } from '../online/google';

export function GoogleBox() {
  const clientId = useOnline((s) => s.googleClientId);
  const linked = useOnline((s) => s.profile?.google);
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let alive = true;
    const el = box.current;
    void renderGoogleButton(el, clientId, (cred) => online.googleSignIn(cred), el.clientWidth).then((ok) => alive && setFailed(!ok));
    return () => {
      alive = false;
    };
  }, [clientId, linked]);

  if (!clientId) return null;
  return (
    <div className="lb-google">
      {linked ? (
        <p className="lb-google-on">
          <b>Googleアカウントと連携中</b>
          <span>{linked}</span>
          <small>別の端末でも、Googleでログインすると、名前・アイコン・ランクを引き継げます</small>
        </p>
      ) : (
        <p className="lb-google-hint">
          Googleアカウントで<b>ログイン / 新規登録</b>
          <small>登録すると、端末をかえても名前・アイコン・ランクが残ります。すでに登録済みのGoogleなら、そのアカウントに切り替わります。</small>
        </p>
      )}
      {failed ? <p className="lb-google-err">Googleのボタンを読み込めませんでした。通信環境を確認してください</p> : <div ref={box} className="lb-google-btn" />}
    </div>
  );
}
