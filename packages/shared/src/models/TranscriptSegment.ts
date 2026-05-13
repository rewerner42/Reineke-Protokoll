export interface TranscriptSegment {
  id: string;
  meetingId: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel: string | null;
  isFinal: boolean;
  createdAt: string;
}
