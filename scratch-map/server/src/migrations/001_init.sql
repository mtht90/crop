-- 共同スクラッチマップ 初期スキーマ
-- 生の緯度経度を保持するカラムは一切ない（位置はすべて H3 解像度10のセル ID）。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE,
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash    text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE magic_links (
  token_hash    text PRIMARY KEY,
  email         text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);

CREATE TABLE passkeys (
  id            text PRIMARY KEY,               -- credential ID (base64url)
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    bytea NOT NULL,
  counter       bigint NOT NULL DEFAULT 0,
  transports    text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX passkeys_user_idx ON passkeys(user_id);

CREATE TABLE webauthn_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge     text NOT NULL,
  kind          text NOT NULL,                  -- 'register' | 'login'
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  webauthn_user_id text,
  expires_at    timestamptz NOT NULL
);

CREATE TABLE groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  owner_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  is_personal   boolean NOT NULL DEFAULT false,  -- 自分専用の「マイマップ」
  mode          text NOT NULL DEFAULT 'scratch', -- 将来: 'territory'（陣取り）など
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color         text NOT NULL,
  role          text NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
  share_enabled boolean NOT NULL DEFAULT true,   -- 自分の足跡（散歩・外部アプリ）をこのグループに反映するか
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members(user_id);

-- グループ全体の塗り状態（1セル1行）
CREATE TABLE cells (
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  h3            text NOT NULL,
  first_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  first_at      timestamptz NOT NULL,
  last_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  last_at       timestamptz NOT NULL,
  visit_count   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (group_id, h3)
);
CREATE INDEX cells_group_first_at_idx ON cells(group_id, first_at);

-- メンバーごとの寄与（「自分だけ」表示・退出時の寄与削除・メンバー別統計に使う）
CREATE TABLE member_cells (
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  h3            text NOT NULL,
  first_at      timestamptz NOT NULL,
  last_at       timestamptz NOT NULL,
  visit_count   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (group_id, user_id, h3)
);
CREATE INDEX member_cells_group_h3_idx ON member_cells(group_id, h3);

CREATE TABLE invites (
  token         text PRIMARY KEY,
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX invites_group_idx ON invites(group_id);

CREATE TABLE ingest_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

-- 外部ロガーのバッチをまたいで塗りを途切れさせないための「直前セル」。生座標は持たない。
CREATE TABLE ingest_state (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device        text NOT NULL,
  last_h3       text NOT NULL,
  last_at       timestamptz NOT NULL,
  PRIMARY KEY (user_id, device)
);

-- 自宅ゾーン（中心はセル ID のみ）
CREATE TABLE home_zones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  h3            text NOT NULL,
  radius_m      integer NOT NULL,
  label         text NOT NULL DEFAULT '自宅',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_zones_user_idx ON home_zones(user_id);
