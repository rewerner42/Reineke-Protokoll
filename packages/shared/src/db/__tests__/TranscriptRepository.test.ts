import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BetterSqliteTestAdapter } from '../../__tests__/testAdapter.js';
import { runMigrations } from '../migrations.js';
import { MeetingRepository } from '../repositories/MeetingRepository.js';
import { TranscriptRepository } from '../repositories/TranscriptRepository.js';

describe('TranscriptRepository', () => {
  let db: BetterSqliteTestAdapter;
  let meetings: MeetingRepository;
  let transcripts: TranscriptRepository;
  let meetingId: string;

  beforeEach(() => {
    db = new BetterSqliteTestAdapter();
    runMigrations(db);
    meetings = new MeetingRepository(db);
    transcripts = new TranscriptRepository(db);
    meetingId = meetings.create({ title: 'Test' }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('fügt Segmente ein und liest sie zeitlich geordnet zurück', () => {
    transcripts.insert({
      meetingId,
      startMs: 3000,
      endMs: 6000,
      text: 'Zweites Segment',
      speakerLabel: null,
      isFinal: true,
    });
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Erstes Segment',
      speakerLabel: 'Speaker 1',
      isFinal: true,
    });

    const list = transcripts.listForMeeting(meetingId);
    expect(list).toHaveLength(2);
    expect(list[0]?.text).toBe('Erstes Segment');
    expect(list[1]?.text).toBe('Zweites Segment');
  });

  it('markiert ein Segment als final und kann den Text ersetzen', () => {
    const seg = transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Vorläufig',
      speakerLabel: null,
      isFinal: false,
    });
    transcripts.markFinal(seg.id, 'Endgültig');

    const list = transcripts.listForMeeting(meetingId);
    expect(list[0]?.isFinal).toBe(true);
    expect(list[0]?.text).toBe('Endgültig');
  });

  it('löscht vorläufige Segmente', () => {
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Final A',
      speakerLabel: null,
      isFinal: true,
    });
    transcripts.insert({
      meetingId,
      startMs: 3000,
      endMs: 6000,
      text: 'Vorläufig B',
      speakerLabel: null,
      isFinal: false,
    });
    transcripts.insert({
      meetingId,
      startMs: 6000,
      endMs: 9000,
      text: 'Vorläufig C',
      speakerLabel: null,
      isFinal: false,
    });

    const deleted = transcripts.deleteProvisional(meetingId);
    expect(deleted).toBe(2);
    const remaining = transcripts.listForMeeting(meetingId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.text).toBe('Final A');
  });

  it('konkateniert nur finale Segmente in finalTextForMeeting', () => {
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Hallo Welt',
      speakerLabel: null,
      isFinal: true,
    });
    transcripts.insert({
      meetingId,
      startMs: 3000,
      endMs: 6000,
      text: 'Vorläufig',
      speakerLabel: null,
      isFinal: false,
    });
    transcripts.insert({
      meetingId,
      startMs: 6000,
      endMs: 9000,
      text: 'Tschüss',
      speakerLabel: null,
      isFinal: true,
    });

    expect(transcripts.finalTextForMeeting(meetingId)).toBe('Hallo Welt Tschüss');
  });

  it('löscht Segmente kaskadierend wenn Meeting gelöscht wird', () => {
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Test',
      speakerLabel: null,
      isFinal: true,
    });
    meetings.delete(meetingId);
    expect(transcripts.listForMeeting(meetingId)).toEqual([]);
  });
});
