import type {
  Meeting,
  TranscriptSegment,
  Protocol,
  AppSettings,
  LLMProviderName,
  WhisperModelSize,
  SpeakerMapping,
} from '@reineke/shared';

export interface WhisperModelInfo {
  size: WhisperModelSize;
  downloaded: boolean;
  filePath: string | null;
  approxMb: number;
}

export interface DownloadProgress {
  size: WhisperModelSize;
  percent: number;
}

export interface DiarizationStatus {
  meetingId: string;
  state: 'started' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface IpcContract {
  meetings: {
    create(input: { title: string }): Promise<Meeting>;
    list(): Promise<Meeting[]>;
    get(id: string): Promise<Meeting | null>;
    delete(id: string): Promise<void>;
  };
  recording: {
    start(meetingId: string): Promise<void>;
    pushAudioChunk(meetingId: string, pcm16: ArrayBuffer): Promise<void>;
    stop(meetingId: string): Promise<{ audioPath: string | null }>;
  };
  transcription: {
    listForMeeting(meetingId: string): Promise<TranscriptSegment[]>;
    onSegment(cb: (segment: TranscriptSegment) => void): () => void;
  };
  speakers: {
    listForMeeting(meetingId: string): Promise<SpeakerMapping[]>;
    rename(meetingId: string, rawLabel: string, displayName: string): Promise<void>;
    onDiarizationStatus(cb: (status: DiarizationStatus) => void): () => void;
  };
  protocol: {
    generate(meetingId: string): Promise<Protocol>;
    get(meetingId: string): Promise<Protocol | null>;
    updateMarkdown(protocolId: string, markdown: string): Promise<void>;
    setTodoDone(todoId: string, done: boolean): Promise<void>;
    exportMarkdown(protocolId: string): Promise<{ path: string } | null>;
  };
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
    setApiKey(provider: LLMProviderName, key: string): Promise<void>;
    hasApiKey(provider: LLMProviderName): Promise<boolean>;
  };
  whisperModel: {
    list(): Promise<WhisperModelInfo[]>;
    download(size: WhisperModelSize): Promise<void>;
    onDownloadProgress(cb: (progress: DownloadProgress) => void): () => void;
  };
}
