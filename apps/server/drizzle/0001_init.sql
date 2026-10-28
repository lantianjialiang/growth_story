-- 0001_init.sql — 初始结构（M1/M2/M3/M4/M5 所需表）

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX users_email_uq ON users (email);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_media_id TEXT,
  birth_date TEXT,
  birth_precision TEXT NOT NULL DEFAULT 'day',
  death_date TEXT,
  death_precision TEXT NOT NULL DEFAULT 'day',
  attributes TEXT NOT NULL DEFAULT '{}',
  note TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX profiles_owner_idx ON profiles (owner_id);

CREATE TABLE profile_members (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  invited_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, user_id)
);
CREATE INDEX profile_members_user_idx ON profile_members (user_id);

CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'profile',
  event_id TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX share_links_token_uq ON share_links (token);
CREATE INDEX share_links_profile_idx ON share_links (profile_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  date TEXT NOT NULL,
  date_precision TEXT NOT NULL DEFAULT 'day',
  place_text TEXT,
  place_lat TEXT,
  place_lng TEXT,
  type TEXT NOT NULL DEFAULT 'daily',
  visibility TEXT NOT NULL DEFAULT 'inherit',
  cover_media_id TEXT,
  created_by TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX events_timeline_idx ON events (profile_id, date, id);
CREATE INDEX events_deleted_idx ON events (deleted_at);
CREATE INDEX events_type_idx ON events (profile_id, type);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX tags_profile_name_uq ON tags (profile_id, name);

CREATE TABLE event_tags (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);
CREATE INDEX event_tags_tag_idx ON event_tags (tag_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'image',
  original_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_sec INTEGER,
  taken_at TEXT,
  taken_tz_offset TEXT,
  sha256 TEXT NOT NULL,
  variants TEXT NOT NULL DEFAULT '{}',
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  uploaded_by TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX media_profile_idx ON media (profile_id);
CREATE INDEX media_event_idx ON media (event_id);
CREATE INDEX media_sha_idx ON media (profile_id, sha256);
CREATE INDEX media_deleted_idx ON media (deleted_at);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  file_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
