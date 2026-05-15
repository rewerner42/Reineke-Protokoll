import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetterSqliteTestAdapter } from '../../__tests__/testAdapter.js';
import { runMigrations } from '../../db/migrations.js';
import { MeetingRepository } from '../../db/repositories/MeetingRepository.js';
import { TranscriptRepository } from '../../db/repositories/TranscriptRepository.js';
import { ProtocolRepository } from '../../db/repositories/ProtocolRepository.js';
import { SpeakerRepository } from '../../db/repositories/SpeakerRepository.js';
import { ProtocolGenerator } from '../ProtocolGenerator.js';
import type { LLMProvider } from '../../llm/LLMProvider.js';

function mockProvider(): LLMProvider {
  return {
    name: 'claude',
    model: 'claude-sonnet-4-5-20250929',
    generateProtocol: vi.fn().mockResolvedValue({
      summary: 'Zusammenfassung',
      participants: [{ name: 'Alice', role: 'PM' }],
      todos: [{ description: 'Aufgabe', owner: 'Alice', deadline: null }],
      decisions: ['Entscheidung 1'],
      discussionPoints: ['Punkt 1'],
    }),
  };
}

describe('ProtocolGenerator', () => {
  let db: BetterSqliteTestAdapter;
  let meetings: MeetingRepository;
  let transcripts: TranscriptRepository;
  let protocols: ProtocolRepository;
  let speakers: SpeakerRepository;
  let meetingId: string;

  beforeEach(() => {
    db = new BetterSqliteTestAdapter();
    runMigrations(db);
    meetings = new MeetingRepository(db);
    transcripts = new TranscriptRepository(db);
    protocols = new ProtocolRepository(db);
    speakers = new SpeakerRepository(db);
    meetingId = meetings.create({ title: 'Meeting' }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('erzeugt aus finalen Segmenten ein Protokoll und persistiert es', async () => {
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Hallo zusammen.',
      speakerLabel: null,
      isFinal: true,
    });
    transcripts.insert({
      meetingId,
      startMs: 3000,
      endMs: 6000,
      text: 'Lass uns starten.',
      speakerLabel: null,
      isFinal: true,
    });

    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, speakers, provider });
    const protocol = await gen.generate(meetingId);

    expect(provider.generateProtocol).toHaveBeenCalledWith({
      transcript: 'Hallo zusammen. Lass uns starten.',
      language: 'de',
      meetingTitle: 'Meeting',
      knownParticipants: undefined,
      speakerAnnotated: false,
    });
    expect(protocol.summary).toBe('Zusammenfassung');
    expect(protocol.markdown).toContain('# Protokoll: Meeting');
    expect(protocol.markdown).toContain('Alice');
    expect(protocols.getByMeetingId(meetingId)?.id).toBe(protocol.id);
  });

  it('nutzt die erkannte Sprache aus dem Meeting', async () => {
    meetings.update(meetingId, { language: 'en' });
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Hello everyone.',
      speakerLabel: null,
      isFinal: true,
    });

    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, speakers, provider });
    await gen.generate(meetingId);

    expect(provider.generateProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en' }),
    );
  });

  it('formatiert Transkript mit Sprecher-Annotation, wenn Labels vorhanden sind', async () => {
    transcripts.insert({
      meetingId,
      startMs: 0,
      endMs: 3000,
      text: 'Guten Morgen.',
      speakerLabel: 'Sprecher 1',
      isFinal: true,
    });
    transcripts.insert({
      meetingId,
      startMs: 3000,
      endMs: 6000,
      text: 'Hallo zurück.',
      speakerLabel: 'Sprecher 2',
      isFinal: true,
    });
    speakers.upsert(meetingId, 'Sprecher 1', 'Anna');

    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, speakers, provider });
    await gen.generate(meetingId);

    expect(provider.generateProtocol).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: '[Anna] Guten Morgen.\n[Sprecher 2] Hallo zurück.',
        speakerAnnotated: true,
      }),
    );
  });

  it('wirft Fehler bei leerem Transkript', async () => {
    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, speakers, provider });
    await expect(gen.generate(meetingId)).rejects.toThrow(/leer/);
  });

  it('wirft Fehler bei unbekanntem Meeting', async () => {
    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, speakers, provider });
    await expect(gen.generate('unknown')).rejects.toThrow(/nicht gefunden/);
  });
});
