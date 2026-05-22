-- Reineke-Protokoll v4: Status 'diarizing' für laufende Sprecher-Erkennung
-- nach dem Stop. SQLite erlaubt kein ALTER TABLE für CHECK-Constraints,
-- also bauen wir die Tabelle neu.

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
