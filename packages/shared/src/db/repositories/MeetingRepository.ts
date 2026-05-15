import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { Meeting, MeetingStatus, DetectedLanguage } from '../../models/Meeting.js';
import { newId } from '../../utils/id.js';
import { nowIso } from '../../utils/date.js';

interface MeetingRow {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  status: MeetingStatus;
  audio_path: string | null;
  language: DetectedLanguage | null;
  created_at: string;
  updated_at: string;
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    audioPath: row.audio_path,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MeetingRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  create(input: { title: string; startedAt?: string }): Meeting {
    const now = nowIso();
    const meeting: Meeting = {
      id: newId(),
      title: input.title,
      startedAt: input.startedAt ?? now,
      endedAt: null,
      status: 'recording',
      audioPath: null,
      language: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO meetings (id, title, started_at, ended_at, status, audio_path, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meeting.id,
        meeting.title,
        meeting.startedAt,
        meeting.endedAt,
        meeting.status,
        meeting.audioPath,
        meeting.language,
        meeting.createdAt,
        meeting.updatedAt,
      );
    return meeting;
  }

  get(id: string): Meeting | null {
    const row = this.db
      .prepare<MeetingRow>('SELECT * FROM meetings WHERE id = ?')
      .get(id);
    return row ? rowToMeeting(row) : null;
  }

  list(): Meeting[] {
    return this.db
      .prepare<MeetingRow>('SELECT * FROM meetings ORDER BY started_at DESC')
      .all()
      .map(rowToMeeting);
  }

  update(id: string, patch: Partial<Omit<Meeting, 'id' | 'createdAt'>>): Meeting {
    const current = this.get(id);
    if (!current) throw new Error(`Meeting ${id} nicht gefunden`);
    const updated: Meeting = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `UPDATE meetings
         SET title = ?, started_at = ?, ended_at = ?, status = ?, audio_path = ?, language = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.startedAt,
        updated.endedAt,
        updated.status,
        updated.audioPath,
        updated.language,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
  }
}
