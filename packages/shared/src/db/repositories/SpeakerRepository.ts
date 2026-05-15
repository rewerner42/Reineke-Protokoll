import type { DatabaseAdapter } from '../DatabaseAdapter.js';

export interface SpeakerMapping {
  meetingId: string;
  rawLabel: string;
  displayName: string;
}

interface SpeakerRow {
  meeting_id: string;
  raw_label: string;
  display_name: string;
}

function rowToSpeaker(row: SpeakerRow): SpeakerMapping {
  return {
    meetingId: row.meeting_id,
    rawLabel: row.raw_label,
    displayName: row.display_name,
  };
}

export class SpeakerRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  listForMeeting(meetingId: string): SpeakerMapping[] {
    return this.db
      .prepare<SpeakerRow>(
        'SELECT * FROM speakers WHERE meeting_id = ? ORDER BY raw_label ASC',
      )
      .all(meetingId)
      .map(rowToSpeaker);
  }

  upsert(meetingId: string, rawLabel: string, displayName: string): void {
    this.db
      .prepare(
        `INSERT INTO speakers (meeting_id, raw_label, display_name)
         VALUES (?, ?, ?)
         ON CONFLICT(meeting_id, raw_label) DO UPDATE SET display_name = excluded.display_name`,
      )
      .run(meetingId, rawLabel, displayName);
  }

  delete(meetingId: string, rawLabel: string): void {
    this.db
      .prepare('DELETE FROM speakers WHERE meeting_id = ? AND raw_label = ?')
      .run(meetingId, rawLabel);
  }
}
