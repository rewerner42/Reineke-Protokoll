export type MeetingStatus = 'recording' | 'completed' | 'archived';

export interface Meeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  status: MeetingStatus;
  audioPath: string | null;
  createdAt: string;
  updatedAt: string;
}
