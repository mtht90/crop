import type pg from 'pg';
import { tx, type Db } from './db.js';
import { randomToken, sha256 } from './crypto.js';
import type { CellHit, HomeZone } from '../../shared/cells.js';
import { makeZoneExcluder } from '../../shared/cells.js';

export const MEMBER_COLORS = [
  '#ff5a5f', '#3b82f6', '#22c55e', '#ffb400', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
];

/** 同じ人が同じセルに再訪したとみなす最小間隔 */
const REVISIT_INTERVAL = "interval '30 minutes'";

export interface User {
  id: string;
  email: string | null;
  displayName: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  isPersonal: boolean;
  role: string;
  color: string;
  shareEnabled: boolean;
  memberCount: number;
  cellCount: number;
}

export interface Group {
  id: string;
  name: string;
  isPersonal: boolean;
  ownerId: string | null;
  mode: string;
}

export interface Member {
  userId: string;
  displayName: string;
  color: string;
  role: string;
  shareEnabled: boolean;
  joinedAt: number;
}

/** クライアントへ送るセル: [h3, 最初に塗った人, 最後に通った人, first_at(ms), last_at(ms), 訪問回数] */
export type CellTuple = [string, string | null, string | null, number, number, number];

export interface AppliedGroup {
  groupId: string;
  cells: CellTuple[];
  /** このバッチで初めて塗られたセル */
  newCells: string[];
}

export interface Stats {
  totalCells: number;
  newSince: number;
  since: number;
  members: { userId: string; displayName: string; color: string; pioneered: number; visited: number; newSince: number }[];
  formerMembersPioneered: number;
}

export interface PasskeyRow {
  id: string;
  userId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
}

const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);

function toUser(r: any): User {
  return { id: r.id, email: r.email, displayName: r.display_name };
}

function toTuple(r: any): CellTuple {
  return [r.h3, r.first_user_id, r.last_user_id, ms(r.first_at), ms(r.last_at), r.visit_count];
}

export class Store {
  constructor(readonly pool: pg.Pool) {}

  // ------------------------------------------------------------------ users / sessions
  async createUser(displayName: string, email: string | null = null, db: Db = this.pool): Promise<User> {
    const r = await db.query('INSERT INTO users(display_name, email) VALUES ($1, $2) RETURNING *', [displayName, email]);
    const user = toUser(r.rows[0]);
    await this.createGroup(user.id, 'マイマップ', true, db);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    const r = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async findOrCreateUserByEmail(email: string): Promise<User> {
    return tx(this.pool, async (c) => {
      const r = await c.query('SELECT * FROM users WHERE email = $1', [email]);
      if (r.rows[0]) return toUser(r.rows[0]);
      return this.createUser(email.split('@')[0].slice(0, 30) || 'ユーザー', email, c);
    });
  }

  async updateUser(id: string, displayName: string): Promise<User> {
    const r = await this.pool.query('UPDATE users SET display_name = $2 WHERE id = $1 RETURNING *', [id, displayName]);
    return toUser(r.rows[0]);
  }

  async createSession(userId: string, days: number): Promise<string> {
    const token = randomToken();
    await this.pool.query(
      `INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [sha256(token), userId, days],
    );
    return token;
  }

  async getSessionUser(token: string): Promise<User | null> {
    const r = await this.pool.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }

  async createMagicLink(email: string, minutes = 15): Promise<string> {
    const token = randomToken();
    await this.pool.query(
      `INSERT INTO magic_links(token_hash, email, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [sha256(token), email, minutes],
    );
    return token;
  }

  async countRecentMagicLinks(email: string): Promise<number> {
    const r = await this.pool.query(
      `SELECT count(*)::int n FROM magic_links WHERE email = $1 AND created_at > now() - interval '10 minutes'`,
      [email],
    );
    return r.rows[0].n;
  }

  /** 1回限り。成功したらメールアドレスを返す */
  async consumeMagicLink(token: string): Promise<string | null> {
    const r = await this.pool.query(
      `UPDATE magic_links SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING email`,
      [sha256(token)],
    );
    return r.rows[0]?.email ?? null;
  }

  // ------------------------------------------------------------------ passkeys
  async saveChallenge(kind: 'register' | 'login', challenge: string, userId: string | null, webauthnUserId: string | null) {
    await this.pool.query(`DELETE FROM webauthn_challenges WHERE expires_at < now()`);
    const r = await this.pool.query(
      `INSERT INTO webauthn_challenges(kind, challenge, user_id, webauthn_user_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '5 minutes') RETURNING id`,
      [kind, challenge, userId, webauthnUserId],
    );
    return r.rows[0].id as string;
  }

  async takeChallenge(id: string, kind: string) {
    const r = await this.pool.query(
      `DELETE FROM webauthn_challenges WHERE id = $1 AND kind = $2 AND expires_at > now() RETURNING *`,
      [id, kind],
    );
    const row = r.rows[0];
    return row ? { challenge: row.challenge as string, userId: row.user_id as string | null } : null;
  }

  async addPasskey(userId: string, p: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }) {
    await this.pool.query(
      `INSERT INTO passkeys(id, user_id, public_key, counter, transports) VALUES ($1, $2, $3, $4, $5)`,
      [p.id, userId, Buffer.from(p.publicKey), p.counter, p.transports ?? []],
    );
  }

  async getPasskey(id: string): Promise<PasskeyRow | null> {
    const r = await this.pool.query('SELECT * FROM passkeys WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      publicKey: new Uint8Array(row.public_key) as Uint8Array<ArrayBuffer>,
      counter: Number(row.counter),
      transports: row.transports,
    };
  }

  async listPasskeys(userId: string) {
    const r = await this.pool.query('SELECT id, transports, created_at FROM passkeys WHERE user_id = $1', [userId]);
    return r.rows.map((x) => ({ id: x.id as string, transports: x.transports as string[], createdAt: ms(x.created_at) }));
  }

  async touchPasskey(id: string, counter: number) {
    await this.pool.query('UPDATE passkeys SET counter = $2, last_used_at = now() WHERE id = $1', [id, counter]);
  }

  // ------------------------------------------------------------------ groups
  async createGroup(ownerId: string, name: string, personal = false, db: Db = this.pool): Promise<Group> {
    const r = await db.query(
      'INSERT INTO groups(name, owner_id, is_personal) VALUES ($1, $2, $3) RETURNING *',
      [name, ownerId, personal],
    );
    await db.query(
      `INSERT INTO group_members(group_id, user_id, color, role) VALUES ($1, $2, $3, 'owner')`,
      [r.rows[0].id, ownerId, MEMBER_COLORS[0]],
    );
    return this.toGroup(r.rows[0]);
  }

  private toGroup(r: any): Group {
    return { id: r.id, name: r.name, isPersonal: r.is_personal, ownerId: r.owner_id, mode: r.mode };
  }

  async getGroup(id: string): Promise<Group | null> {
    const r = await this.pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    return r.rows[0] ? this.toGroup(r.rows[0]) : null;
  }

  async renameGroup(id: string, name: string) {
    await this.pool.query('UPDATE groups SET name = $2 WHERE id = $1', [id, name]);
  }

  async listUserGroups(userId: string): Promise<GroupSummary[]> {
    const r = await this.pool.query(
      `SELECT g.id, g.name, g.is_personal, m.role, m.color, m.share_enabled,
              (SELECT count(*)::int FROM group_members x WHERE x.group_id = g.id) AS member_count,
              (SELECT count(*)::int FROM cells c WHERE c.group_id = g.id) AS cell_count
       FROM group_members m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = $1
       ORDER BY g.is_personal DESC, m.joined_at`,
      [userId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      name: x.name,
      isPersonal: x.is_personal,
      role: x.role,
      color: x.color,
      shareEnabled: x.share_enabled,
      memberCount: x.member_count,
      cellCount: x.cell_count,
    }));
  }

  async getMembers(groupId: string): Promise<Member[]> {
    const r = await this.pool.query(
      `SELECT m.*, u.display_name FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 ORDER BY m.joined_at`,
      [groupId],
    );
    return r.rows.map((x) => ({
      userId: x.user_id,
      displayName: x.display_name,
      color: x.color,
      role: x.role,
      shareEnabled: x.share_enabled,
      joinedAt: ms(x.joined_at),
    }));
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const r = await this.pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    return r.rowCount! > 0;
  }

  /** メンバー追加。既にメンバーなら何もしない。空いている色を割り当てる */
  async addMember(groupId: string, userId: string): Promise<boolean> {
    return tx(this.pool, async (c) => {
      await c.query('SELECT 1 FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
      const exists = await c.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
      if (exists.rowCount) return false;
      const used = new Set((await c.query('SELECT color FROM group_members WHERE group_id = $1', [groupId])).rows.map((x) => x.color));
      const color = MEMBER_COLORS.find((col) => !used.has(col)) ?? MEMBER_COLORS[used.size % MEMBER_COLORS.length];
      await c.query('INSERT INTO group_members(group_id, user_id, color) VALUES ($1, $2, $3)', [groupId, userId, color]);
      return true;
    });
  }

  async updateMember(groupId: string, userId: string, patch: { color?: string; shareEnabled?: boolean }) {
    await this.pool.query(
      `UPDATE group_members SET color = COALESCE($3, color), share_enabled = COALESCE($4, share_enabled)
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId, patch.color ?? null, patch.shareEnabled ?? null],
    );
  }

  /** 個人マップ（マイマップ）の記録を別グループへ持ち込む */
  async copyPersonalHistory(userId: string, toGroupId: string): Promise<number> {
    return tx(this.pool, async (c) => {
      const p = await c.query(
        `SELECT g.id FROM groups g JOIN group_members m ON m.group_id = g.id
         WHERE g.is_personal AND m.user_id = $1 LIMIT 1`,
        [userId],
      );
      if (!p.rows[0]) return 0;
      const src = await c.query(
        `SELECT h3, first_at, last_at FROM member_cells WHERE group_id = $1 AND user_id = $2`,
        [p.rows[0].id, userId],
      );
      const zones = await this.listHomeZones(userId, c);
      const exclude = makeZoneExcluder(zones);
      const rows = src.rows.filter((r) => !exclude?.(r.h3));
      const hits: CellHit[] = rows.map((r) => ({ h3: r.h3, t: ms(r.first_at) }));
      if (!hits.length) return 0;
      await this.upsertCells(c, userId, [toGroupId], hits);
      return hits.length;
    });
  }

  /**
   * グループから退出。purge=true なら自分の寄与を消し、残りのメンバーの記録からセルを再計算する。
   * 最後の1人が抜けたらグループごと削除。オーナーが抜けたら最古参に引き継ぐ。
   */
  async leaveGroup(groupId: string, userId: string, purge: boolean): Promise<{ groupDeleted: boolean }> {
    return tx(this.pool, async (c) => {
      if (purge) await this.purgeMemberCells(c, groupId, userId);
      await c.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
      const rest = await c.query('SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY joined_at', [groupId]);
      if (!rest.rowCount) {
        await c.query('DELETE FROM groups WHERE id = $1', [groupId]);
        return { groupDeleted: true };
      }
      const g = await c.query('SELECT owner_id FROM groups WHERE id = $1', [groupId]);
      if (g.rows[0].owner_id === userId) {
        const next = rest.rows[0].user_id;
        await c.query('UPDATE groups SET owner_id = $2 WHERE id = $1', [groupId, next]);
        await c.query(`UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [groupId, next]);
      }
      return { groupDeleted: false };
    });
  }

  private async purgeMemberCells(c: Db, groupId: string, userId: string, onlyH3?: string[]) {
    const del = await c.query(
      onlyH3
        ? 'DELETE FROM member_cells WHERE group_id = $1 AND user_id = $2 AND h3 = ANY($3) RETURNING h3'
        : 'DELETE FROM member_cells WHERE group_id = $1 AND user_id = $2 RETURNING h3',
      onlyH3 ? [groupId, userId, onlyH3] : [groupId, userId],
    );
    const h3s = del.rows.map((r) => r.h3 as string);
    if (h3s.length) await this.recomputeCells(c, groupId, h3s);
    return h3s;
  }

  /** member_cells からセルの集計値を作り直す（寄与が無くなったセルは消える） */
  private async recomputeCells(c: Db, groupId: string, h3s: string[]) {
    await c.query(
      `DELETE FROM cells c WHERE c.group_id = $1 AND c.h3 = ANY($2)
         AND NOT EXISTS (SELECT 1 FROM member_cells m WHERE m.group_id = c.group_id AND m.h3 = c.h3)`,
      [groupId, h3s],
    );
    await c.query(
      `UPDATE cells c SET first_user_id = f.user_id, first_at = f.first_at,
              last_user_id = l.user_id, last_at = l.last_at, visit_count = GREATEST(s.v, 1)
       FROM unnest($2::text[]) AS x(h3)
       CROSS JOIN LATERAL (SELECT user_id, first_at FROM member_cells m WHERE m.group_id = $1 AND m.h3 = x.h3 ORDER BY first_at LIMIT 1) f
       CROSS JOIN LATERAL (SELECT user_id, last_at FROM member_cells m WHERE m.group_id = $1 AND m.h3 = x.h3 ORDER BY last_at DESC LIMIT 1) l
       CROSS JOIN LATERAL (SELECT sum(visit_count)::int AS v FROM member_cells m WHERE m.group_id = $1 AND m.h3 = x.h3) s
       WHERE c.group_id = $1 AND c.h3 = x.h3`,
      [groupId, h3s],
    );
  }

  async getCells(groupId: string): Promise<CellTuple[]> {
    const r = await this.pool.query(
      'SELECT h3, first_user_id, last_user_id, first_at, last_at, visit_count FROM cells WHERE group_id = $1',
      [groupId],
    );
    return r.rows.map(toTuple);
  }

  async getMemberCellIds(groupId: string, userId: string): Promise<string[]> {
    const r = await this.pool.query('SELECT h3 FROM member_cells WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    return r.rows.map((x) => x.h3);
  }

  async stats(groupId: string, since: Date): Promise<Stats> {
    const total = await this.pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE first_at >= $2)::int AS new_since FROM cells WHERE group_id = $1`,
      [groupId, since],
    );
    const per = await this.pool.query(
      `SELECT m.user_id, u.display_name, m.color,
         (SELECT count(*)::int FROM cells c WHERE c.group_id = m.group_id AND c.first_user_id = m.user_id) AS pioneered,
         (SELECT count(*)::int FROM cells c WHERE c.group_id = m.group_id AND c.first_user_id = m.user_id AND c.first_at >= $2) AS new_since,
         (SELECT count(*)::int FROM member_cells x WHERE x.group_id = m.group_id AND x.user_id = m.user_id) AS visited
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY pioneered DESC, m.joined_at`,
      [groupId, since],
    );
    const members = per.rows.map((x) => ({
      userId: x.user_id,
      displayName: x.display_name,
      color: x.color,
      pioneered: x.pioneered,
      visited: x.visited,
      newSince: x.new_since,
    }));
    const pioneeredByMembers = members.reduce((s, m) => s + m.pioneered, 0);
    return {
      totalCells: total.rows[0].total,
      newSince: total.rows[0].new_since,
      since: since.getTime(),
      members,
      formerMembersPioneered: total.rows[0].total - pioneeredByMembers,
    };
  }

  // ------------------------------------------------------------------ invites
  async createInvite(groupId: string, by: string, days = 30): Promise<string> {
    const token = randomToken(18);
    await this.pool.query(
      `INSERT INTO invites(token, group_id, created_by, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
      [token, groupId, by, days],
    );
    return token;
  }

  async getInviteGroupId(token: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT group_id FROM invites WHERE token = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
      [token],
    );
    return r.rows[0]?.group_id ?? null;
  }

  // ------------------------------------------------------------------ cells
  /** 自分の足跡を反映するグループ（share_enabled のもの。マイマップは常に対象） */
  async shareTargets(userId: string, db: Db = this.pool): Promise<string[]> {
    const r = await db.query(
      `SELECT m.group_id FROM group_members m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = $1 AND (m.share_enabled OR g.is_personal)`,
      [userId],
    );
    return r.rows.map((x) => x.group_id);
  }

  /**
   * セルを自分が所属する（反映オンの）全グループに反映する。
   * 自宅ゾーン内のセルはここでも必ず落とす（クライアントを信用しない）。
   */
  async applyHits(userId: string, hits: CellHit[]): Promise<AppliedGroup[]> {
    if (!hits.length) return [];
    return tx(this.pool, async (c) => {
      const exclude = makeZoneExcluder(await this.listHomeZones(userId, c));
      const filtered = exclude ? hits.filter((h) => !exclude(h.h3)) : hits;
      const groups = await this.shareTargets(userId, c);
      if (!filtered.length || !groups.length) return [];
      return this.upsertCells(c, userId, groups, filtered);
    });
  }

  private async upsertCells(c: Db, userId: string, groupIds: string[], hits: CellHit[]): Promise<AppliedGroup[]> {
    // 同一セルはまとめる（最初と最後の時刻）
    const agg = new Map<string, { first: number; last: number }>();
    for (const h of hits) {
      const a = agg.get(h.h3);
      if (!a) agg.set(h.h3, { first: h.t, last: h.t });
      else {
        a.first = Math.min(a.first, h.t);
        a.last = Math.max(a.last, h.t);
      }
    }
    const entries = [...agg.entries()];
    const out = new Map<string, AppliedGroup>(groupIds.map((g) => [g, { groupId: g, cells: [], newCells: [] }]));
    const CHUNK = 2000;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const part = entries.slice(i, i + CHUNK);
      const h3s = part.map(([h]) => h);
      const firsts = part.map(([, v]) => new Date(v.first));
      const lasts = part.map(([, v]) => new Date(v.last));
      const r = await c.query(
        `WITH input AS (
           SELECT g.group_id, h.h3, h.first_at, h.last_at
           FROM unnest($2::uuid[]) AS g(group_id)
           CROSS JOIN unnest($3::text[], $4::timestamptz[], $5::timestamptz[]) AS h(h3, first_at, last_at)
         ), mc AS (
           INSERT INTO member_cells(group_id, user_id, h3, first_at, last_at, visit_count)
           SELECT group_id, $1, h3, first_at, last_at, 1 FROM input
           ON CONFLICT (group_id, user_id, h3) DO UPDATE SET
             first_at = LEAST(member_cells.first_at, EXCLUDED.first_at),
             last_at = GREATEST(member_cells.last_at, EXCLUDED.last_at),
             visit_count = member_cells.visit_count
               + CASE WHEN EXCLUDED.last_at > member_cells.last_at + ${REVISIT_INTERVAL} THEN 1 ELSE 0 END
         )
         INSERT INTO cells(group_id, h3, first_user_id, first_at, last_user_id, last_at, visit_count)
         SELECT group_id, h3, $1, first_at, $1, last_at, 1 FROM input
         ON CONFLICT (group_id, h3) DO UPDATE SET
           first_user_id = CASE WHEN EXCLUDED.first_at < cells.first_at THEN EXCLUDED.first_user_id ELSE cells.first_user_id END,
           first_at = LEAST(cells.first_at, EXCLUDED.first_at),
           last_user_id = CASE WHEN EXCLUDED.last_at >= cells.last_at THEN EXCLUDED.last_user_id ELSE cells.last_user_id END,
           last_at = GREATEST(cells.last_at, EXCLUDED.last_at),
           visit_count = cells.visit_count
             + CASE WHEN EXCLUDED.last_at > cells.last_at + ${REVISIT_INTERVAL} THEN 1 ELSE 0 END
         RETURNING group_id, h3, first_user_id, last_user_id, first_at, last_at, visit_count, (xmax = 0) AS inserted`,
        [userId, groupIds, h3s, firsts, lasts],
      );
      for (const row of r.rows) {
        const g = out.get(row.group_id)!;
        g.cells.push(toTuple(row));
        if (row.inserted) g.newCells.push(row.h3);
      }
    }
    return [...out.values()];
  }

  // ------------------------------------------------------------------ home zones
  async listHomeZones(userId: string, db: Db = this.pool): Promise<(HomeZone & { id: string; label: string })[]> {
    const r = await db.query('SELECT id, h3, radius_m, label FROM home_zones WHERE user_id = $1 ORDER BY created_at', [userId]);
    return r.rows.map((x) => ({ id: x.id, h3: x.h3, radiusM: x.radius_m, label: x.label }));
  }

  /** 自宅ゾーンを追加。purge=true なら既存の記録からもゾーン内のセルを消す。影響したグループ ID を返す */
  async addHomeZone(userId: string, zone: HomeZone & { label?: string }, purge: boolean) {
    return tx(this.pool, async (c) => {
      const r = await c.query(
        'INSERT INTO home_zones(user_id, h3, radius_m, label) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, zone.h3, zone.radiusM, zone.label ?? '自宅'],
      );
      // ゾーンをまたいだ補間を防ぐため、外部ロガーの直前セルも破棄
      await c.query('DELETE FROM ingest_state WHERE user_id = $1', [userId]);
      const touched: string[] = [];
      if (purge) {
        const exclude = makeZoneExcluder([zone])!;
        const mine = await c.query('SELECT group_id, h3 FROM member_cells WHERE user_id = $1', [userId]);
        const byGroup = new Map<string, string[]>();
        for (const row of mine.rows) {
          if (!exclude(row.h3)) continue;
          (byGroup.get(row.group_id) ?? byGroup.set(row.group_id, []).get(row.group_id)!).push(row.h3);
        }
        for (const [g, h3s] of byGroup) {
          await this.purgeMemberCells(c, g, userId, h3s);
          touched.push(g);
        }
      }
      return { id: r.rows[0].id as string, touchedGroups: touched };
    });
  }

  async deleteHomeZone(userId: string, id: string) {
    await this.pool.query('DELETE FROM home_zones WHERE user_id = $1 AND id = $2', [userId, id]);
  }

  // ------------------------------------------------------------------ ingest
  async rotateIngestToken(userId: string): Promise<string> {
    const token = randomToken(24);
    await this.pool.query(
      `INSERT INTO ingest_tokens(user_id, token_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = now(), last_used_at = NULL`,
      [userId, sha256(token)],
    );
    return token;
  }

  async deleteIngestToken(userId: string) {
    await this.pool.query('DELETE FROM ingest_tokens WHERE user_id = $1', [userId]);
  }

  async ingestTokenInfo(userId: string) {
    const r = await this.pool.query('SELECT created_at, last_used_at FROM ingest_tokens WHERE user_id = $1', [userId]);
    const x = r.rows[0];
    return x ? { createdAt: ms(x.created_at), lastUsedAt: x.last_used_at ? ms(x.last_used_at) : null } : null;
  }

  async findUserByIngestToken(token: string): Promise<string | null> {
    const r = await this.pool.query(
      'UPDATE ingest_tokens SET last_used_at = now() WHERE token_hash = $1 RETURNING user_id',
      [sha256(token)],
    );
    return r.rows[0]?.user_id ?? null;
  }

  async getIngestState(userId: string, device: string) {
    const r = await this.pool.query('SELECT last_h3, last_at FROM ingest_state WHERE user_id = $1 AND device = $2', [userId, device]);
    return r.rows[0] ? { h3: r.rows[0].last_h3 as string, t: ms(r.rows[0].last_at) } : null;
  }

  async setIngestState(userId: string, device: string, anchor: { h3: string; t: number } | null) {
    if (!anchor) {
      await this.pool.query('DELETE FROM ingest_state WHERE user_id = $1 AND device = $2', [userId, device]);
      return;
    }
    await this.pool.query(
      `INSERT INTO ingest_state(user_id, device, last_h3, last_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device) DO UPDATE SET last_h3 = EXCLUDED.last_h3, last_at = EXCLUDED.last_at
       WHERE ingest_state.last_at <= EXCLUDED.last_at`,
      [userId, device, anchor.h3, new Date(anchor.t)],
    );
  }
}
