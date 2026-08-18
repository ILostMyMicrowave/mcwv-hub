-- MCWV Hub stability hardening prerequisite
-- Run once in the Supabase SQL editor before deploying the 2026-08-18 release.
-- Idempotent: safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS leaderboard_badge_presets (
  id BIGSERIAL PRIMARY KEY,
  badge_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  emoji TEXT,
  color TEXT NOT NULL DEFAULT '#34d399',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE leaderboard_badge_presets
  ADD COLUMN IF NOT EXISTS badge_key TEXT,
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS emoji TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#34d399',
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS created_by INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS linked_discord_role_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_discord_role_name TEXT,
  ADD COLUMN IF NOT EXISTS exclusive_tier BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_badge_presets_key_idx
  ON leaderboard_badge_presets (badge_key);
CREATE INDEX IF NOT EXISTS leaderboard_badge_presets_enabled_order_idx
  ON leaderboard_badge_presets (enabled, sort_order, label);

CREATE TABLE IF NOT EXISTS user_profile_styles (
  roblox_id TEXT PRIMARY KEY,
  user_id INTEGER,
  background_url TEXT,
  background_type TEXT,
  background_preset TEXT NOT NULL DEFAULT 'default',
  accent_color TEXT NOT NULL DEFAULT '#34d399',
  frame_preset TEXT NOT NULL DEFAULT 'none',
  frame_primary_color TEXT NOT NULL DEFAULT '#34d399',
  frame_secondary_color TEXT NOT NULL DEFAULT '#38bdf8',
  frame_emoji TEXT NOT NULL DEFAULT '',
  font_preset TEXT NOT NULL DEFAULT 'default',
  bio TEXT,
  badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_profile_styles
  ADD COLUMN IF NOT EXISTS roblox_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS background_url TEXT,
  ADD COLUMN IF NOT EXISTS background_type TEXT,
  ADD COLUMN IF NOT EXISTS background_preset TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#34d399',
  ADD COLUMN IF NOT EXISTS frame_preset TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS frame_primary_color TEXT NOT NULL DEFAULT '#34d399',
  ADD COLUMN IF NOT EXISTS frame_secondary_color TEXT NOT NULL DEFAULT '#38bdf8',
  ADD COLUMN IF NOT EXISTS frame_emoji TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS font_preset TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_styles_roblox_id_key
  ON user_profile_styles (roblox_id);

CREATE TABLE IF NOT EXISTS player_leaderboard_history (
  id BIGSERIAL PRIMARY KEY,
  battle_id TEXT,
  roblox_id TEXT NOT NULL,
  username TEXT,
  rank INTEGER,
  points BIGINT,
  pph NUMERIC,
  change_5m BIGINT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE player_leaderboard_history
  ADD COLUMN IF NOT EXISTS battle_id TEXT,
  ADD COLUMN IF NOT EXISTS roblox_id TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS rank INTEGER,
  ADD COLUMN IF NOT EXISTS points BIGINT,
  ADD COLUMN IF NOT EXISTS pph NUMERIC,
  ADD COLUMN IF NOT EXISTS change_5m BIGINT,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS player_leaderboard_history_roblox_time_idx
  ON player_leaderboard_history (roblox_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS player_leaderboard_history_battle_idx
  ON player_leaderboard_history (battle_id);

CREATE TABLE IF NOT EXISTS leaderboard_badge_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leaderboard_badge_meta_updated_at_idx
  ON leaderboard_badge_meta (updated_at);

-- Preserve the production marker previously created by the request-time
-- migration. This release deliberately never clears badges during requests.
INSERT INTO leaderboard_badge_meta (key, value, updated_at)
VALUES ('legacy_badges_cleared', 'true', NOW())
ON CONFLICT (key) DO NOTHING;

-- Remove any abandoned synchronization lease. The next scheduled/manual run
-- atomically creates a new owner-token lease.
DELETE FROM leaderboard_badge_meta WHERE key = 'role_sync_lock';

COMMIT;
