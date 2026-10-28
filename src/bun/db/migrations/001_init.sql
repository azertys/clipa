-- Clipa schema v1. All instants are INTEGER epoch ms (UTC). All ids are UUIDv7.

-- syncable
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL
);
CREATE UNIQUE INDEX tags_name ON tags(name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,                 -- NULL = timer is running
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX time_entries_range ON time_entries(started_at, ended_at);
CREATE UNIQUE INDEX one_running ON time_entries((ended_at IS NULL))
  WHERE ended_at IS NULL AND deleted_at IS NULL;

CREATE TABLE entry_tags (
  entry_id TEXT NOT NULL REFERENCES time_entries(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX entry_tags_tag ON entry_tags(tag_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  color TEXT,
  starts_at INTEGER NOT NULL,       -- first occurrence, UTC ms
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  all_day INTEGER NOT NULL DEFAULT 0,
  tzid TEXT NOT NULL,               -- IANA zone, e.g. Europe/Bucharest
  rrule TEXT,                       -- RFC 5545 RRULE body, NULL = one-off
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL
);
CREATE INDEX events_start ON events(starts_at);

CREATE TABLE event_exceptions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  original_start INTEGER NOT NULL,  -- start of the generated occurrence
  kind TEXT NOT NULL CHECK (kind IN ('cancelled', 'modified')),
  new_starts_at INTEGER,
  new_duration_ms INTEGER,
  new_title TEXT,
  new_notes TEXT,                   -- NULL = keep series value
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL
);
CREATE UNIQUE INDEX event_exceptions_occ ON event_exceptions(event_id, original_start)
  WHERE deleted_at IS NULL;

-- local-only
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  platform_key TEXT NOT NULL UNIQUE, -- bundle id on macOS
  display_name TEXT NOT NULL
);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES time_entries(id),
  app_id TEXT NOT NULL REFERENCES apps(id),
  window_title TEXT,                -- NULL if titles are off or not allowed
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX activity_entry ON activity(entry_id, started_at);

-- ended_at is NULL while the period is pending,
-- because the end is not known until input starts again.
CREATE TABLE idle_periods (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES time_entries(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  resolution TEXT NOT NULL CHECK (resolution IN ('pending', 'kept', 'discarded'))
);

CREATE TABLE timer_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  entry_id TEXT,
  heartbeat_at INTEGER
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
