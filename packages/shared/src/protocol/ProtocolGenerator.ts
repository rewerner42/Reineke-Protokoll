import type { LLMProvider } from '../llm/LLMProvider.js';
import type { Meeting, DetectedLanguage } from '../models/Meeting.js';
import type { Protocol } from '../models/Protocol.js';
import type { TranscriptSegment } from '../models/TranscriptSegment.js';
import type { MeetingRepository } from '../db/repositories/MeetingRepository.js';
import type { TranscriptRepository } from '../db/repositories/TranscriptRepository.js';
import type { ProtocolRepository } from '../db/repositories/ProtocolRepository.js';
import type { SpeakerRepository, SpeakerMapping } from '../db/repositories/SpeakerRepository.js';
import { renderProtocolMarkdown } from './MarkdownRenderer.js';

export interface ProtocolGeneratorDeps {
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  protocols: ProtocolRepository;
  provider: LLMProvider;
  speakers?: SpeakerRepository;
  fallbackLanguage?: DetectedLanguage;
  knownParticipants?: string[];
}

export class ProtocolGenerator {
  constructor(private readonly deps: ProtocolGeneratorDeps) {}

  async generate(meetingId: string): Promise<Protocol> {
    const meeting = this.deps.meetings.get(meetingId);
    if (!meeting) throw new Error(`Meeting ${meetingId} nicht gefunden`);

    const segments = this.deps.transcripts
      .listForMeeting(meetingId)
      .filter((s) => s.isFinal);
    if (segments.length === 0 || segments.every((s) => s.text.trim().length === 0)) {
      throw new Error('Transkript ist leer — kann kein Protokoll erzeugen');
    }

    const speakerMappings = this.deps.speakers?.listForMeeting(meetingId) ?? [];
    const { transcript, speakerAnnotated } = buildTranscriptText(segments, speakerMappings);

    const language: DetectedLanguage =
      meeting.language ?? this.deps.fallbackLanguage ?? 'de';

    const output = await this.deps.provider.generateProtocol({
      transcript,
      language,
      meetingTitle: meeting.title,
      knownParticipants: this.deps.knownParticipants,
      speakerAnnotated,
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

function buildTranscriptText(
  segments: TranscriptSegment[],
  speakers: SpeakerMapping[],
): { transcript: string; speakerAnnotated: boolean } {
  const nameByRawLabel = new Map(speakers.map((s) => [s.rawLabel, s.displayName]));
  const hasSpeakerLabels = segments.some((s) => s.speakerLabel !== null);

  if (!hasSpeakerLabels) {
    return {
      transcript: segments
        .map((s) => s.text.trim())
        .filter((t) => t.length > 0)
        .join(' '),
      speakerAnnotated: false,
    };
  }

  const lines: string[] = [];
  let lastLabel: string | null | undefined = undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    const text = buffer.join(' ').trim();
    if (text.length === 0) {
      buffer = [];
      return;
    }
    const display = lastLabel ? (nameByRawLabel.get(lastLabel) ?? lastLabel) : 'Unbekannt';
    lines.push(`[${display}] ${text}`);
    buffer = [];
  };

  for (const seg of segments) {
    const text = seg.text.trim();
    if (text.length === 0) continue;
    if (seg.speakerLabel !== lastLabel) {
      flush();
      lastLabel = seg.speakerLabel;
    }
    buffer.push(text);
  }
  flush();

  return {
    transcript: lines.join('\n'),
    speakerAnnotated: true,
  };
}
