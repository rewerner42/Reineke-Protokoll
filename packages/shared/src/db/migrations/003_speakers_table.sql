-- Reineke-Protokoll v3: Mapping von Roh-Sprecher-Labels ("Sprecher 1") auf vom
-- Nutzer vergebene Anzeige-Namen ("Anna").

CREATE TABLE IF NOT EXISTS speakers (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  raw_label TEXT NOT NULL,
  display_name TEXT NOT NULL,
  PRIMARY KEY (meeting_id, raw_label)
);
