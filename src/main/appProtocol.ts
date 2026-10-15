// アプリ本体の UI を folio://app/ から配信する。
// - file:// は Electron では権限が広いため使わない (公式のセキュリティチェックリスト #18)
// - UI 専用のセッションにだけ登録するので、Web ページからは folio:// を読み込めない
// - UI セッションからの外部ネットワーク通信はすべて遮断する
import { net, protocol, session } from 'electron';
import type { Session } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_SCHEME = 'folio';
export const APP_ORIGIN = 'folio://app';
export const UI_PARTITION = 'folio-ui';

/** app の ready 前に呼ぶ */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  ]);
}

let uiSession: Session | null = null;

/** UI 用のセッション (ready 後に呼ぶ) */
export function getUiSession(): Session {
  if (uiSession) return uiSession;
  const ses = session.fromPartition(UI_PARTITION, { cache: false });
  const root = path.join(__dirname, '../renderer');

  ses.protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const relative = decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(root, relative));
    // ディレクトリの外 (../ など) は配信しない
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  // UI は外部へ通信しない (ファビコンなどはメインプロセスが取得して data: URL で渡す)
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) =>
    callback({ cancel: true }),
  );
  // UI に権限 (カメラ・通知など) は一切与えない
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  uiSession = ses;
  return ses;
}

/** IPC の送り主が Folio の UI のフレームか (origin で確認する) */
export function isAppFrameUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    // Node の URL では独自スキームの origin が "null" になるため、スキームとホストで比べる
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === 'app';
  } catch {
    return false;
  }
}
