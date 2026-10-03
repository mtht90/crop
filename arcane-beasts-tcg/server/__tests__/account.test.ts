import { afterEach, describe, expect, test } from 'vitest';
import { PROTOCOL, type ClientMsg, type ServerMsg } from '../../src/online/protocol';
import { AVATAR_MAX_CHARS, validAvatar } from '../../src/online/avatar';
import { googleVerifier, maskEmail, type GoogleIdentity } from '../google';
import { Hub } from '../hub';
import { PlayerStore } from '../players';

// a real 1x1 jpeg / png, padded so they pass the minimum-length check
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

class Client {
  msgs: ServerMsg[] = [];
  conn;
  constructor(hub: Hub) {
    this.conn = hub.connect({ send: (d) => this.msgs.push(JSON.parse(d)), close: () => undefined });
    this.hub = hub;
  }
  hub: Hub;
  say(m: ClientMsg) {
    this.hub.message(this.conn, JSON.stringify(m));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

const identities: Record<string, GoogleIdentity> = {
  tokA: { sub: 'sub-a', email: 'alice@example.com' },
  tokB: { sub: 'sub-b', email: 'bob@example.com' },
};
const verify = async (c: string) => identities[c] ?? null;

const hubs: Hub[] = [];
function setup(withGoogle = true) {
  const store = new PlayerStore(null);
  const hub = new Hub({ store, google: withGoogle ? { clientId: 'cid.apps.googleusercontent.com', verify } : undefined });
  hubs.push(hub);
  return { store, hub };
}
const hello = (c: Client, name = 'テスト') => {
  c.say({ t: 'hello', v: PROTOCOL, name });
  return c.last('welcome')!;
};
const settle = () => new Promise((r) => setTimeout(r, 5));
afterEach(() => hubs.splice(0).forEach((h) => h.close()));

describe('custom avatars', () => {
  test('validAvatar accepts small real images and nothing else', () => {
    expect(validAvatar(JPEG)).toBe(true);
    expect(validAvatar(PNG)).toBe(true);
    expect(validAvatar('humans/knight')).toBe(false);
    expect(validAvatar('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(validAvatar('data:image/jpeg;base64,' + btoa('not an image at all, just some text padding padding padding padding padding'))).toBe(false);
    expect(validAvatar(JPEG.replace('data:image/jpeg', 'data:image/png'))).toBe(false); // label does not match the bytes
    expect(validAvatar('data:image/jpeg;base64,' + '/9j/'.repeat(AVATAR_MAX_CHARS / 4))).toBe(false); // too long
    expect(validAvatar(123)).toBe(false);
  });

  test('the server stores a valid avatar as the portrait and refuses a bad one', () => {
    const { hub } = setup();
    const c = new Client(hub);
    hello(c);
    c.say({ t: 'rename', name: 'ユウ', portrait: JPEG });
    expect(c.last('renamed')!.profile.portrait).toBe(JPEG);
    c.say({ t: 'rename', name: 'ユウ', portrait: 'data:image/jpeg;base64,AAAA' });
    expect(c.last('error')).toMatchObject({ code: 'bad_image' });
    expect(c.last('renamed')!.profile.portrait).toBe(JPEG); // unchanged
    c.say({ t: 'rename', name: 'ユウ', portrait: 'humans/knight' });
    expect(c.last('renamed')!.profile.portrait).toBe('humans/knight');
  });
});

describe('google sign-in', () => {
  test('the welcome carries the client id only when Google is set up', () => {
    expect(hello(new Client(setup(true).hub)).googleClientId).toBe('cid.apps.googleusercontent.com');
    expect(hello(new Client(setup(false).hub)).googleClientId).toBeUndefined();
  });

  test('sign-up joins the account to the current player, login on another device switches to it', async () => {
    const { hub } = setup();
    const a1 = new Client(hub);
    const w1 = hello(a1, 'アリス');
    a1.say({ t: 'google', credential: 'tokA' });
    await settle();
    const first = a1.last('account')!;
    expect(first.mode).toBe('new');
    expect(first.profile.id).toBe(w1.profile.id);
    expect(first.profile.google).toBe('a***@example.com');

    // same account again on the same player
    a1.say({ t: 'google', credential: 'tokA' });
    await settle();
    expect(a1.last('account')!.mode).toBe('same');

    // a second device starts as a new anonymous player, then logs in
    const a2 = new Client(hub);
    const w2 = hello(a2, 'べつ');
    expect(w2.profile.id).not.toBe(w1.profile.id);
    a2.say({ t: 'google', credential: 'tokA' });
    await settle();
    const login = a2.last('account')!;
    expect(login.mode).toBe('login');
    expect(login.profile.id).toBe(w1.profile.id);
    expect(login.secret).toBeTruthy();

    // the secret it got works for a normal hello
    const a3 = new Client(hub);
    a3.say({ t: 'hello', v: PROTOCOL, id: login.profile.id, secret: login.secret });
    expect(a3.last('welcome')!.profile.id).toBe(w1.profile.id);
  });

  test('a player tied to one Google account cannot take a second one', async () => {
    const { hub } = setup();
    const c = new Client(hub);
    hello(c);
    c.say({ t: 'google', credential: 'tokA' });
    await settle();
    c.say({ t: 'google', credential: 'tokB' });
    await settle();
    expect(c.last('error')).toMatchObject({ code: 'busy' });
  });

  test('a token that does not verify, or Google being off, is an error', async () => {
    const c = new Client(setup().hub);
    hello(c);
    c.say({ t: 'google', credential: 'forged' });
    await settle();
    expect(c.last('error')).toMatchObject({ code: 'bad_code' });
    const off = new Client(setup(false).hub);
    hello(off);
    off.say({ t: 'google', credential: 'tokA' });
    await settle();
    expect(off.last('error')).toMatchObject({ code: 'bad_request' });
  });
});

describe('googleVerifier', () => {
  const jwt = 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc';
  const reply = (body: Record<string, string>, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
  const good = { aud: 'cid', iss: 'https://accounts.google.com', sub: '123', email: 'x@y.z', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) };
  test('accepts a matching token', async () => {
    expect(await googleVerifier('cid', reply(good))(jwt)).toEqual({ sub: '123', email: 'x@y.z' });
  });
  test.each([
    ['wrong audience', { ...good, aud: 'other' }],
    ['wrong issuer', { ...good, iss: 'evil.example' }],
    ['expired', { ...good, exp: '1000' }],
    ['unverified e-mail', { ...good, email_verified: 'false' }],
  ])('rejects %s', async (_n, body) => {
    expect(await googleVerifier('cid', reply(body))(jwt)).toBeNull();
  });
  test('rejects garbage, http errors and network failures', async () => {
    expect(await googleVerifier('cid', reply(good))('nope')).toBeNull();
    expect(await googleVerifier('cid', reply(good, false))(jwt)).toBeNull();
    expect(await googleVerifier('cid', (async () => { throw new Error('net'); }) as unknown as typeof fetch)(jwt)).toBeNull();
  });
  test('maskEmail', () => expect(maskEmail('alice@example.com')).toBe('a***@example.com'));
});
