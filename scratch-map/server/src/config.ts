/** 環境変数の読み込み。ホスト名だけが渡された場合は https:// を補う（Render の fromService: host 対策） */
function toOrigin(v: string | undefined, fallback: string): string {
  const s = (v ?? '').trim();
  if (!s) return fallback;
  const withScheme = /^https?:\/\//.test(s) ? s : `https://${s}`;
  return withScheme.replace(/\/+$/, '');
}

export interface Config {
  port: number;
  databaseUrl: string;
  /** フロント（Static Site）のオリジン。CORS・マジックリンク・WebAuthn に使う */
  appOrigin: string;
  /** API 自身の公開 URL。外部アプリ連携の URL 生成に使う */
  publicApiUrl: string;
  rpId: string;
  rpName: string;
  resendApiKey?: string;
  mailFrom: string;
  /** true ならマジックリンクを API レスポンスにも含める（ローカル開発用） */
  devMagicLink: boolean;
  sessionDays: number;
  /** 追加で CORS を許可するオリジン（カンマ区切り） */
  extraOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8787);
  const appOrigin = toOrigin(env.APP_ORIGIN, 'http://localhost:5173');
  const publicApiUrl = toOrigin(env.PUBLIC_API_URL ?? env.RENDER_EXTERNAL_URL, `http://localhost:${port}`);
  const isProd = env.NODE_ENV === 'production';
  return {
    port,
    databaseUrl: env.DATABASE_URL ?? 'postgres://localhost:5432/scratchmap',
    appOrigin,
    publicApiUrl,
    rpId: env.WEBAUTHN_RP_ID ?? new URL(appOrigin).hostname,
    rpName: env.WEBAUTHN_RP_NAME ?? '共同スクラッチマップ',
    resendApiKey: env.RESEND_API_KEY || undefined,
    mailFrom: env.MAIL_FROM ?? 'Scratch Map <onboarding@resend.dev>',
    // 危険: true だとメールを見なくてもログインできる。Render 上（RENDER=true）や本番では既定で無効
    devMagicLink: env.DEV_MAGIC_LINK ? env.DEV_MAGIC_LINK === 'true' : !isProd && !env.RENDER,
    sessionDays: Number(env.SESSION_DAYS ?? 90),
    extraOrigins: (env.CORS_EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
