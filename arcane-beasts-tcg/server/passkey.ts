// ============================================================================
// Passkeys (WebAuthn): sign up / log in with the phone's face or fingerprint
// unlock. Nothing to set up outside this server — the page's own address is
// the "relying party". The passkey's public key is kept in the player record.
// ============================================================================
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

/** what the player record keeps per passkey */
export interface StoredPasskey {
  id: string; // base64url credential id
  publicKey: string; // base64url COSE key
  counter: number;
  transports?: string[];
  createdAt: number;
}

/** the parts the hub needs (tests replace them) */
export interface PasskeyService {
  registrationOptions(o: { rpID: string; userId: string; userName: string; exclude: string[] }): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyRegistration(o: { response: unknown; challenge: string; origin: string; rpID: string }): Promise<Omit<StoredPasskey, 'createdAt'> | null>;
  authenticationOptions(o: { rpID: string }): Promise<PublicKeyCredentialRequestOptionsJSON>;
  verifyAuthentication(o: { response: unknown; challenge: string; origin: string; rpID: string; passkey: StoredPasskey }): Promise<{ counter: number } | null>;
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

/** where a page may use passkeys from: https anywhere, plain http only on this machine */
export function passkeyOrigin(origin: string | undefined): { origin: string; rpID: string } | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !local) return null; // passkeys need a name, not an IP
    return { origin: u.origin, rpID: u.hostname };
  } catch {
    return null;
  }
}

export const webauthn: PasskeyService = {
  registrationOptions: ({ rpID, userId, userName, exclude }) =>
    generateRegistrationOptions({
      rpName: 'ARCANE BEASTS',
      rpID,
      userName,
      userDisplayName: userName,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      excludeCredentials: exclude.map((id) => ({ id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      timeout: 120_000,
    }),
  async verifyRegistration({ response, challenge, origin, rpID }) {
    try {
      const v = await verifyRegistrationResponse({ response: response as RegistrationResponseJSON, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!v.verified) return null;
      const c = v.registrationInfo.credential;
      return { id: c.id, publicKey: b64u(c.publicKey), counter: c.counter, transports: c.transports };
    } catch {
      return null;
    }
  },
  authenticationOptions: ({ rpID }) => generateAuthenticationOptions({ rpID, userVerification: 'preferred', timeout: 120_000 }),
  async verifyAuthentication({ response, challenge, origin, rpID, passkey }) {
    try {
      const v = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: { id: passkey.id, publicKey: fromB64u(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
      });
      return v.verified ? { counter: v.authenticationInfo.newCounter } : null;
    } catch {
      return null;
    }
  },
};
