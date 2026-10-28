-- 0002 — 档案支持多个纪念日；事件类型支持档案级自定义

ALTER TABLE profiles ADD COLUMN anniversaries TEXT NOT NULL DEFAULT '[]';

CREATE TABLE event_types (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX event_types_profile_label_uq ON event_types (profile_id, label);
