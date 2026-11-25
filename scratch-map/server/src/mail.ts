import type { Config } from './config.js';

export interface Mailer {
  sendMagicLink(to: string, link: string): Promise<void>;
}

/** RESEND_API_KEY があれば Resend で送信、無ければコンソールに出力する */
export function createMailer(cfg: Config): Mailer {
  return {
    async sendMagicLink(to, link) {
      if (!cfg.resendApiKey) {
        console.log(`[mail] magic link for ${to}: ${link}`);
        return;
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: cfg.mailFrom,
          to: [to],
          subject: '共同スクラッチマップへのログイン',
          text: `次のリンクを開くとログインできます（15分間有効・1回限り）。\n\n${link}\n\n心当たりがない場合はこのメールを破棄してください。`,
          html: `<p>次のボタンを押すとログインできます（15分間有効・1回限り）。</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111827;color:#fff;border-radius:8px;text-decoration:none">ログインする</a></p>
<p style="color:#6b7280;font-size:12px">心当たりがない場合はこのメールを破棄してください。</p>`,
        }),
      });
      if (!res.ok) throw new Error(`mail send failed: ${res.status} ${await res.text()}`);
    },
  };
}
