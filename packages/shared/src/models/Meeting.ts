export type MeetingStatus = 'recording' | 'diarizing' | 'completed' | 'archived';

export type DetectedLanguage = 'de' | 'en';

export interface Meeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  status: MeetingStatus;
  audioPath: string | null;
  language: DetectedLanguage | null;
  createdAt: string;
  updatedAt: string;
}
