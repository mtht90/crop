import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { HTTPException } from 'hono/http-exception';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import type { Store, User, AppliedGroup } from './store.js';
import type { Bus, TicketBook } from './realtime.js';
import type { Mailer } from './mail.js';
import { parseOverland, parseOwnTracks } from './ingest/parse.js';
import { ingestBatches } from './ingest/service.js';
import { CELL_RES, isValidHit, type CellHit } from '../../shared/cells.js';
import { isValidCell, getResolution } from 'h3-js';

export interface Deps {
  cfg: Config;
  store: Store;
  bus: Bus;
  tickets: TicketBook;
  mailer: Mailer;
}

type Env = { Variables: { user: User | null } };

const MAX_HITS_PER_REQUEST = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bad = (msg: string, status: 400 | 401 | 403 | 404 | 409 | 429 = 400) => new HTTPException(status, { message: msg });

export function createApp(deps: Deps) {
  const { cfg, store, bus, tickets, mailer } = deps;
  const allowedOrigins = new Set([cfg.appOrigin, ...cfg.extraOrigins]);
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal_error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true, connections: bus.connectionCount() }));

  const publishApplied = (userId: string, applied: AppliedGroup[]) => {
    for (const a of applied) {
      if (a.cells.length) bus.publish({ type: 'cells', groupId: a.groupId, userId, cells: a.cells, newCells: a.newCells });
    }
  };

  // ================================================================ 外部アプリからの受信
  // トークンは URL に含まれる。ブラウザからは呼ばないので CORS は不要。
  const ingestLimit = bodyLimit({ maxSize: 5 * 1024 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) });

  const readJson = async (c: Context) => {
    try {
      return await c.req.json();
    } catch {
      return null;
    }
  };

  app.post('/ingest/overland/:token', ingestLimit, async (c) => {
    const userId = await store.findUserByIngestToken(c.req.param('token'));
    if (!userId) return c.json({ error: 'invalid_token' }, 401);
    const body = await readJson(c);
    if (!body || !Array.isArray(body.locations)) return c.json({ error: 'locations_required' }, 400);
    const r = await ingestBatches(store, userId, parseOverland(body));
    publishApplied(userId, r.applied);
    // Overland はこのレスポンスを受け取ると送信済みのバッファを消す
    return c.json({ result: 'ok' });
  });

  app.post('/ingest/owntracks/:token', ingestLimit, async (c) => {
    const userId = await store.findUserByIngestToken(c.req.param('token'));
    if (!userId) return c.json({ error: 'invalid_token' }, 401);
    const body = await readJson(c);
    if (body === null) return c.json({ error: 'invalid_json' }, 400);
    const device = c.req.header('X-Limit-D') ?? undefined;
    const r = await ingestBatches(store, userId, parseOwnTracks(body, device));
    publishApplied(userId, r.applied);
    // OwnTracks HTTP モードは JSON 配列（友達の位置など）を期待する。返すものは無いので空配列
    return c.json([]);
  });

  // ================================================================ アプリ用 API
  const api = new Hono<Env>();

  api.use(
    '*',
    cors({
      origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
      allowHeaders: ['Content-Type', 'Authorization', 'X-Invite-Token'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );
  api.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }));

  // 認証（任意）: Authorization: Bearer <session>
  api.use('*', async (c, next) => {
    const h = c.req.header('Authorization');
    const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
    c.set('user', token ? await store.getSessionUser(token) : null);
    await next();
  });

  const requireUser: MiddlewareHandler<Env> = async (c, next) => {
    if (!c.get('user')) throw bad('login_required', 401);
    await next();
  };
  const me = (c: Context<Env>) => c.get('user')!;

  const body = async <T = any>(c: Context): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      throw bad('invalid_json');
    }
  };

  const groupIdParam = (c: Context) => {
    const id = c.req.param('id') ?? '';
    if (!UUID_RE.test(id)) throw bad('not_found', 404);
    return id;
  };

  /** メンバー、またはそのグループの有効な招待トークンを持つ人だけ閲覧できる */
  const canView = async (c: Context<Env>, groupId: string) => {
    const u = c.get('user');
    if (u && (await store.isMember(groupId, u.id))) return { userId: u.id, isMember: true };
    const invite = c.req.header('X-Invite-Token');
    if (invite && (await store.getInviteGroupId(invite)) === groupId) return { userId: u?.id ?? null, isMember: false };
    throw bad('forbidden', 403);
  };

  const requireMember = async (c: Context<Env>, groupId: string) => {
    if (!(await store.isMember(groupId, me(c).id))) throw bad('forbidden', 403);
  };

  const sessionResponse = async (c: Context, user: User) => {
    const session = await store.createSession(user.id, cfg.sessionDays);
    return c.json({ session, user });
  };

  /** リクエスト元がフロントの許可オリジンならそれを使う（LAN の開発用 URL でも動くように） */
  const appOriginFor = (c: Context) => {
    const o = c.req.header('Origin');
    return o && allowedOrigins.has(o) ? o : cfg.appOrigin;
  };

  // ---------------------------------------------------------------- auth: magic link
  api.post('/auth/magic/request', async (c) => {
    const { email: raw } = await body<{ email?: string }>(c);
    const email = String(raw ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw bad('invalid_email');
    if ((await store.countRecentMagicLinks(email)) >= 5) throw bad('too_many_requests', 429);
    const token = await store.createMagicLink(email);
    const link = `${appOriginFor(c)}/auth/magic?token=${encodeURIComponent(token)}`;
    await mailer.sendMagicLink(email, link);
    return c.json({ sent: true, ...(cfg.devMagicLink ? { devLink: link } : {}) });
  });

  api.post('/auth/magic/verify', async (c) => {
    const { token } = await body<{ token?: string }>(c);
    const email = token ? await store.consumeMagicLink(String(token)) : null;
    if (!email) throw bad('invalid_or_expired', 401);
    return sessionResponse(c, await store.findOrCreateUserByEmail(email));
  });

  // ---------------------------------------------------------------- auth: passkeys
  const expectedOrigins = [...allowedOrigins];

  api.post('/auth/passkey/register/options', async (c) => {
    const u = c.get('user');
    const { displayName } = await body<{ displayName?: string }>(c).catch(() => ({ displayName: undefined }));
    const name = u ? u.email ?? u.displayName : String(displayName ?? '').trim();
    if (!name) throw bad('display_name_required');
    const existing = u ? await store.listPasskeys(u.id) : [];
    const options = await generateRegistrationOptions({
      rpName: cfg.rpName,
      rpID: cfg.rpId,
      userName: name.slice(0, 64),
      userDisplayName: (u?.displayName ?? name).slice(0, 64),
      userID: new Uint8Array(randomBytes(16)),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = await store.saveChallenge('register', options.challenge, u?.id ?? null, null);
    return c.json({ challengeId, options });
  });

  api.post('/auth/passkey/register/verify', async (c) => {
    const b = await body<{ challengeId?: string; response?: any; displayName?: string }>(c);
    if (!b.challengeId || !UUID_RE.test(b.challengeId) || !b.response) throw bad('invalid_request');
    const ch = await store.takeChallenge(b.challengeId, 'register');
    if (!ch) throw bad('challenge_expired', 401);
    const u = c.get('user');
    if (ch.userId && ch.userId !== u?.id) throw bad('forbidden', 403);
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: b.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: cfg.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      throw bad(`passkey_verification_failed: ${(e as Error).message}`);
    }
    if (!v.verified) throw bad('passkey_verification_failed');
    const cred = v.registrationInfo.credential;
    let user = u;
    if (!user) {
      const name = String(b.displayName ?? '').trim().slice(0, 30);
      if (!name) throw bad('display_name_required');
      user = await store.createUser(name);
    }
    await store.addPasskey(user.id, { id: cred.id, publicKey: cred.publicKey, counter: cred.counter, transports: cred.transports });
    if (u) return c.json({ user: u, added: true });
    return sessionResponse(c, user);
  });

  api.post('/auth/passkey/login/options', async (c) => {
    const options = await generateAuthenticationOptions({ rpID: cfg.rpId, userVerification: 'preferred' });
    const challengeId = await store.saveChallenge('login', options.challenge, null, null);
    return c.json({ challengeId, options });
  });

  api.post('/auth/passkey/login/verify', async (c) => {
    const b = await body<{ challengeId?: string; response?: any }>(c);
    if (!b.challengeId || !UUID_RE.test(b.challengeId) || !b.response?.id) throw bad('invalid_request');
    const ch = await store.takeChallenge(b.challengeId, 'login');
    if (!ch) throw bad('challenge_expired', 401);
    const pk = await store.getPasskey(String(b.response.id));
    if (!pk) throw bad('unknown_passkey', 401);
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: b.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: cfg.rpId,
        credential: { id: pk.id, publicKey: pk.publicKey, counter: pk.counter, transports: pk.transports },
        requireUserVerification: false,
      });
    } catch (e) {
      throw bad(`passkey_verification_failed: ${(e as Error).message}`, 401);
    }
    if (!v.verified) throw bad('passkey_verification_failed', 401);
    await store.touchPasskey(pk.id, v.authenticationInfo.newCounter);
    const user = await store.getUser(pk.userId);
    if (!user) throw bad('unknown_user', 401);
    return sessionResponse(c, user);
  });

  api.post('/auth/logout', async (c) => {
    const h = c.req.header('Authorization');
    if (h?.startsWith('Bearer ')) await store.deleteSession(h.slice(7));
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- me
  api.get('/me', requireUser, async (c) => {
    const u = me(c);
    const [groups, homeZones, ingest, passkeys] = await Promise.all([
      store.listUserGroups(u.id),
      store.listHomeZones(u.id),
      store.ingestTokenInfo(u.id),
      store.listPasskeys(u.id),
    ]);
    return c.json({ user: u, groups, homeZones, ingest, passkeyCount: passkeys.length });
  });

  api.patch('/me', requireUser, async (c) => {
    const { displayName } = await body<{ displayName?: string }>(c);
    const name = String(displayName ?? '').trim().slice(0, 30);
    if (!name) throw bad('display_name_required');
    const user = await store.updateUser(me(c).id, name);
    for (const g of await store.listUserGroups(user.id)) bus.publish({ type: 'members', groupId: g.id });
    return c.json({ user });
  });

  // ---------------------------------------------------------------- cells (スクラッチ散歩からのアップロード)
  api.post('/cells', requireUser, async (c) => {
    const { hits } = await body<{ hits?: unknown[] }>(c);
    if (!Array.isArray(hits)) throw bad('hits_required');
    if (hits.length > MAX_HITS_PER_REQUEST) throw bad('too_many_hits');
    const now = Date.now();
    const valid: CellHit[] = hits
      .filter((h) => isValidHit(h))
      .map((h) => ({ h3: (h as CellHit).h3, t: Math.min(Math.max((h as CellHit).t, now - 5 * 365 * 86400_000), now + 60_000) }));
    const applied = await store.applyHits(me(c).id, valid);
    publishApplied(me(c).id, applied);
    return c.json({
      accepted: valid.length,
      rejected: hits.length - valid.length,
      groups: applied.map((a) => ({ groupId: a.groupId, newCells: a.newCells.length })),
    });
  });

  // ---------------------------------------------------------------- groups
  api.post('/groups', requireUser, async (c) => {
    const { name } = await body<{ name?: string }>(c);
    const n = String(name ?? '').trim().slice(0, 40);
    if (!n) throw bad('name_required');
    const g = await store.createGroup(me(c).id, n);
    return c.json({ group: g });
  });

  api.get('/groups/:id', async (c) => {
    const id = groupIdParam(c);
    const v = await canView(c, id);
    const group = await store.getGroup(id);
    if (!group) throw bad('not_found', 404);
    return c.json({ group, members: await store.getMembers(id), viewer: v });
  });

  api.patch('/groups/:id', requireUser, async (c) => {
    const id = groupIdParam(c);
    const g = await store.getGroup(id);
    if (!g || g.ownerId !== me(c).id) throw bad('forbidden', 403);
    const { name } = await body<{ name?: string }>(c);
    const n = String(name ?? '').trim().slice(0, 40);
    if (!n) throw bad('name_required');
    await store.renameGroup(id, n);
    bus.publish({ type: 'members', groupId: id });
    return c.json({ ok: true });
  });

  api.get('/groups/:id/cells', async (c) => {
    const id = groupIdParam(c);
    const v = await canView(c, id);
    const [cells, mine] = await Promise.all([
      store.getCells(id),
      v.isMember && v.userId ? store.getMemberCellIds(id, v.userId) : Promise.resolve([]),
    ]);
    return c.json({ cells, mine });
  });

  api.get('/groups/:id/stats', async (c) => {
    const id = groupIdParam(c);
    await canView(c, id);
    const sinceQ = c.req.query('since');
    const since = sinceQ && Number.isFinite(Date.parse(sinceQ)) ? new Date(sinceQ) : new Date(Date.now() - 7 * 86400_000);
    return c.json(await store.stats(id, since));
  });

  api.patch('/groups/:id/members/me', requireUser, async (c) => {
    const id = groupIdParam(c);
    await requireMember(c, id);
    const b = await body<{ color?: string; shareEnabled?: boolean }>(c);
    if (b.color !== undefined && !COLOR_RE.test(b.color)) throw bad('invalid_color');
    if (b.shareEnabled !== undefined && typeof b.shareEnabled !== 'boolean') throw bad('invalid_share');
    await store.updateMember(id, me(c).id, { color: b.color, shareEnabled: b.shareEnabled });
    bus.publish({ type: 'members', groupId: id });
    return c.json({ ok: true });
  });

  api.delete('/groups/:id/members/me', requireUser, async (c) => {
    const id = groupIdParam(c);
    await requireMember(c, id);
    const g = await store.getGroup(id);
    if (g?.isPersonal) throw bad('cannot_leave_personal_map', 409);
    const purge = c.req.query('purge') === '1' || c.req.query('purge') === 'true';
    const r = await store.leaveGroup(id, me(c).id, purge);
    if (!r.groupDeleted) {
      bus.publish({ type: purge ? 'reload' : 'members', groupId: id });
      if (purge) bus.publish({ type: 'members', groupId: id });
    }
    return c.json({ ok: true, ...r });
  });

  // ---------------------------------------------------------------- invites
  api.post('/groups/:id/invites', requireUser, async (c) => {
    const id = groupIdParam(c);
    await requireMember(c, id);
    const g = await store.getGroup(id);
    if (g?.isPersonal) throw bad('personal_map_cannot_be_shared', 409);
    const token = await store.createInvite(id, me(c).id);
    return c.json({ token, url: `${appOriginFor(c)}/invite/${token}` });
  });

  api.get('/invites/:token', async (c) => {
    const groupId = await store.getInviteGroupId(c.req.param('token'));
    if (!groupId) throw bad('invite_invalid', 404);
    const group = await store.getGroup(groupId);
    const u = c.get('user');
    return c.json({
      group,
      members: await store.getMembers(groupId),
      alreadyMember: u ? await store.isMember(groupId, u.id) : false,
    });
  });

  api.post('/invites/:token/join', requireUser, async (c) => {
    const groupId = await store.getInviteGroupId(c.req.param('token'));
    if (!groupId) throw bad('invite_invalid', 404);
    const { bringHistory } = await body<{ bringHistory?: boolean }>(c).catch(() => ({ bringHistory: false }));
    const added = await store.addMember(groupId, me(c).id);
    let copied = 0;
    if (added && bringHistory) {
      copied = await store.copyPersonalHistory(me(c).id, groupId);
    }
    bus.publish({ type: 'members', groupId });
    if (copied) bus.publish({ type: 'reload', groupId });
    return c.json({ groupId, joined: added, copied });
  });

  // ---------------------------------------------------------------- home zones
  api.get('/home-zones', requireUser, async (c) => c.json({ zones: await store.listHomeZones(me(c).id) }));

  api.post('/home-zones', requireUser, async (c) => {
    const b = await body<{ h3?: string; radiusM?: number; label?: string; purge?: boolean }>(c);
    if (typeof b.h3 !== 'string' || !isValidCell(b.h3) || getResolution(b.h3) !== CELL_RES) throw bad('invalid_cell');
    const radiusM = Number(b.radiusM);
    if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 2000) throw bad('invalid_radius');
    const r = await store.addHomeZone(
      me(c).id,
      { h3: b.h3, radiusM: Math.round(radiusM), label: String(b.label ?? '自宅').slice(0, 20) },
      b.purge === true,
    );
    for (const g of r.touchedGroups) bus.publish({ type: 'reload', groupId: g });
    return c.json({ id: r.id, purgedGroups: r.touchedGroups.length });
  });

  api.delete('/home-zones/:zoneId', requireUser, async (c) => {
    const id = c.req.param('zoneId');
    if (!UUID_RE.test(id)) throw bad('not_found', 404);
    await store.deleteHomeZone(me(c).id, id);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- ingest token
  const ingestUrls = (token: string) => {
    const overland = `${cfg.publicApiUrl}/ingest/overland/${token}`;
    const owntracks = `${cfg.publicApiUrl}/ingest/owntracks/${token}`;
    const deviceId = 'phone';
    const setup = `overland://setup?url=${encodeURIComponent(overland)}&token=${encodeURIComponent(token)}&device_id=${deviceId}`;
    return { overlandUrl: overland, owntracksUrl: owntracks, overlandSetupLink: setup };
  };

  api.post('/ingest-token', requireUser, async (c) => {
    const token = await store.rotateIngestToken(me(c).id);
    return c.json({ token, ...ingestUrls(token) });
  });

  api.delete('/ingest-token', requireUser, async (c) => {
    await store.deleteIngestToken(me(c).id);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- realtime (SSE)
  api.post('/groups/:id/stream-ticket', async (c) => {
    const id = groupIdParam(c);
    const v = await canView(c, id);
    return c.json({ ticket: tickets.issue(id, v.userId) });
  });

  api.get('/stream', async (c) => {
    const t = tickets.take(c.req.query('ticket') ?? '');
    if (!t) throw bad('invalid_ticket', 401);
    return streamSSE(c, async (stream) => {
      let closed = false;
      const queue: string[] = [];
      let wake: (() => void) | null = null;
      const unsub = bus.subscribe(t.groupId, (e) => {
        queue.push(JSON.stringify(e));
        wake?.();
      });
      stream.onAbort(() => {
        closed = true;
        unsub();
        wake?.();
      });
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ groupId: t.groupId }) });
      while (!closed) {
        while (queue.length) await stream.writeSSE({ event: 'message', data: queue.shift()! });
        // 25秒ごとに ping（Render などのプロキシのアイドル切断対策）
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 25_000);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wake = null;
        if (!closed && !queue.length) await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      }
      unsub();
    });
  });

  app.route('/api', api);
  return app;
}
