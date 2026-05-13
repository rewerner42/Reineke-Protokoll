import type { DatabaseAdapter } from '../DatabaseAdapter.js';
import type { TranscriptSegment } from '../../models/TranscriptSegment.js';
import { newId } from '../../utils/id.js';
import { nowIso } from '../../utils/date.js';

interface SegmentRow {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  speaker_label: string | null;
  is_final: number;
  created_at: string;
}

function rowToSegment(row: SegmentRow): TranscriptSegment {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    speakerLabel: row.speaker_label,
    isFinal: row.is_final === 1,
    createdAt: row.created_at,
  };
}

export class TranscriptRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  insert(input: Omit<TranscriptSegment, 'id' | 'createdAt'>): TranscriptSegment {
    const segment: TranscriptSegment = {
      ...input,
      id: newId(),
      createdAt: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO transcript_segments
         (id, meeting_id, start_ms, end_ms, text, speaker_label, is_final, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        segment.id,
        segment.meetingId,
        segment.startMs,
        segment.endMs,
        segment.text,
        segment.speakerLabel,
        segment.isFinal ? 1 : 0,
        segment.createdAt,
      );
    return segment;
  }

  markFinal(id: string, text?: string): void {
    if (text !== undefined) {
      this.db
        .prepare('UPDATE transcript_segments SET is_final = 1, text = ? WHERE id = ?')
        .run(text, id);
    } else {
      this.db.prepare('UPDATE transcript_segments SET is_final = 1 WHERE id = ?').run(id);
    }
  }

  deleteProvisional(meetingId: string): number {
    const result = this.db
      .prepare('DELETE FROM transcript_segments WHERE meeting_id = ? AND is_final = 0')
      .run(meetingId);
    return result.changes;
  }

  listForMeeting(meetingId: string): TranscriptSegment[] {
    return this.db
      .prepare<SegmentRow>(
        'SELECT * FROM transcript_segments WHERE meeting_id = ? ORDER BY start_ms ASC',
      )
      .all(meetingId)
      .map(rowToSegment);
  }

  finalTextForMeeting(meetingId: string): string {
    return this.listForMeeting(meetingId)
      .filter((s) => s.isFinal)
      .map((s) => s.text.trim())
      .filter((t) => t.length > 0)
      .join(' ');
  }
}
