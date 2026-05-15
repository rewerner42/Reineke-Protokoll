export const migration001 = `
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('recording','completed','archived')),
  audio_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at DESC);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  speaker_label TEXT,
  is_final INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments(meeting_id, start_ms);

CREATE TABLE IF NOT EXISTS protocols (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  discussion_points_json TEXT NOT NULL,
  markdown TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  edited_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  protocol_id TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  owner TEXT,
  deadline TEXT,
  done INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_todos_protocol ON todos(protocol_id);
`;

export const migration002 = `
ALTER TABLE meetings ADD COLUMN language TEXT;
`;

export const migration003 = `
CREATE TABLE IF NOT EXISTS speakers (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  raw_label TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (meeting_id, raw_label)
);
`;

// SQLite kann CHECK-Constraints nicht per ALTER ändern → Tabelle neu bauen.
export const migration004 = `
CREATE TABLE meetings_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('recording','diarizing','completed','archived')),
  audio_path TEXT,
  language TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO meetings_new (id, title, started_at, ended_at, status, audio_path, language, created_at, updated_at)
SELECT id, title, started_at, ended_at, status, audio_path, language, created_at, updated_at FROM meetings;

DROP TABLE meetings;
ALTER TABLE meetings_new RENAME TO meetings;

CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at DESC);
`;
