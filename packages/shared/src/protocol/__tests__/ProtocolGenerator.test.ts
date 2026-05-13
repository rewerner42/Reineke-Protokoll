import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetterSqliteTestAdapter } from '../../__tests__/testAdapter.js';
import { runMigrations } from '../../db/migrations.js';
import { MeetingRepository } from '../../db/repositories/MeetingRepository.js';
import { TranscriptRepository } from '../../db/repositories/TranscriptRepository.js';
import { ProtocolRepository } from '../../db/repositories/ProtocolRepository.js';
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
  let meetingId: string;

  beforeEach(() => {
    db = new BetterSqliteTestAdapter();
    runMigrations(db);
    meetings = new MeetingRepository(db);
    transcripts = new TranscriptRepository(db);
    protocols = new ProtocolRepository(db);
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
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, provider });
    const protocol = await gen.generate(meetingId);

    expect(provider.generateProtocol).toHaveBeenCalledWith({
      transcript: 'Hallo zusammen. Lass uns starten.',
      language: 'de',
      meetingTitle: 'Meeting',
    });
    expect(protocol.summary).toBe('Zusammenfassung');
    expect(protocol.markdown).toContain('# Protokoll: Meeting');
    expect(protocol.markdown).toContain('Alice');
    expect(protocols.getByMeetingId(meetingId)?.id).toBe(protocol.id);
  });

  it('wirft Fehler bei leerem Transkript', async () => {
    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, provider });
    await expect(gen.generate(meetingId)).rejects.toThrow(/leer/);
  });

  it('wirft Fehler bei unbekanntem Meeting', async () => {
    const provider = mockProvider();
    const gen = new ProtocolGenerator({ meetings, transcripts, protocols, provider });
    await expect(gen.generate('unknown')).rejects.toThrow(/nicht gefunden/);
  });
});
