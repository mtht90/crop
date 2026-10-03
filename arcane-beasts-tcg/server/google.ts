// ============================================================================
// Google sign-in: checks the ID token the browser got from Google Identity
// Services. The token is verified by Google's own endpoint (no extra package),
// then audience, issuer, expiry and e-mail status are checked here.
// ============================================================================

export interface GoogleIdentity {
  /** Google's permanent id for the account */
  sub: string;
  email: string;
}

export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity | null>;

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/** a verifier for one OAuth client id (`fetchImpl` is replaceable for tests) */
export function googleVerifier(clientId: string, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): GoogleVerifier {
  return async (credential) => {
    if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential)) return null;
    let info: Record<string, string>;
    try {
      const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      info = (await res.json()) as Record<string, string>;
    } catch {
      return null;
    }
    if (info.aud !== clientId || !ISSUERS.includes(info.iss) || !info.sub) return null;
    if (Number(info.exp) * 1000 < now()) return null;
    if (String(info.email_verified) !== 'true' || !info.email) return null;
    return { sub: String(info.sub), email: String(info.email) };
  };
}

/** a***@gmail.com — enough to recognise the account, not enough to publish it */
export function maskEmail(email: string): string {
  const [u, d = ''] = email.split('@');
  return `${u.slice(0, 1)}***@${d}`;
}
