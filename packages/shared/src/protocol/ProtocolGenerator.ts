import type { LLMProvider } from '../llm/LLMProvider.js';
import type { Meeting } from '../models/Meeting.js';
import type { Protocol } from '../models/Protocol.js';
import type { MeetingRepository } from '../db/repositories/MeetingRepository.js';
import type { TranscriptRepository } from '../db/repositories/TranscriptRepository.js';
import type { ProtocolRepository } from '../db/repositories/ProtocolRepository.js';
import { renderProtocolMarkdown } from './MarkdownRenderer.js';

export interface ProtocolGeneratorDeps {
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
  provider: LLMProvider;
}

export class ProtocolGenerator {
  constructor(private readonly deps: ProtocolGeneratorDeps) {}

  async generate(meetingId: string): Promise<Protocol> {
    const meeting = this.deps.meetings.get(meetingId);
    if (!meeting) throw new Error(`Meeting ${meetingId} nicht gefunden`);

    const transcript = this.deps.transcripts.finalTextForMeeting(meetingId);
    if (transcript.trim().length === 0) {
      throw new Error('Transkript ist leer — kann kein Protokoll erzeugen');
    }

    const output = await this.deps.provider.generateProtocol({
      transcript,
      language: 'de',
      meetingTitle: meeting.title,
    });

    const markdown = renderProtocolMarkdown(
      {
        summary: output.summary,
        participants: output.participants,
        todos: output.todos,
        decisions: output.decisions,
        discussionPoints: output.discussionPoints,
      },
      meeting,
    );

    return this.deps.protocols.save({
      meetingId,
      summary: output.summary,
      participants: output.participants,
      todos: output.todos,
      decisions: output.decisions,
      discussionPoints: output.discussionPoints,
      markdown,
      llmProvider: this.deps.provider.name,
      llmModel: this.deps.provider.model,
    });
  }

  rerender(meeting: Meeting, protocol: Protocol): string {
    return renderProtocolMarkdown(
      {
        summary: protocol.summary,
        participants: protocol.participants,
        todos: protocol.todos,
        decisions: protocol.decisions,
        discussionPoints: protocol.discussionPoints,
      },
      meeting,
    );
  }
}
