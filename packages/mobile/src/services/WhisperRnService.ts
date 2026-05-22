import * as FileSystem from 'expo-file-system';
import { initWhisper } from 'whisper.rn';
import type { AppLanguage, TranscriptSegment, WhisperModelSize } from '@reineke/shared';
import { newId, nowIso } from '@reineke/shared';

const MODEL_FILENAMES: Record<WhisperModelSize, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
};

const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

export type SegmentListener = (segment: TranscriptSegment) => void;
export type ProgressListener = (progress: { received: number; total: number }) => void;

interface WhisperContext {
  transcribeRealtime: (options: {
    language?: string;
    realtimeAudioSec?: number;
    realtimeAudioSliceSec?: number;
  }) => Promise<{
    stop: () => Promise<void>;
    subscribe: (cb: (event: RealtimeEvent) => void) => void;
  }>;
  release?: () => Promise<void>;
}

interface RealtimeEvent {
  isCapturing: boolean;
  data?: {
    result?: string;
    segments?: { text: string; t0: number; t1: number }[];
  };
  recordingTime?: number;
}

/**
 * Service zum Verwalten des `whisper.rn`-Lebenszyklus auf Mobilgeräten.
 * - Lädt das gewünschte GGML-Modell beim ersten Aufruf nach
 *   `FileSystem.documentDirectory/whisper-models/`.
 * - Initialisiert den Whisper-Context.
 * - Startet/stoppt die Realtime-Transkription und emittiert die erkannten
 *   Segmente als `TranscriptSegment` (passend zum geteilten Datenmodell).
 */
export class WhisperRnService {
  private context: WhisperContext | null = null;
  private stopFn: (() => Promise<void>) | null = null;
  private listeners = new Set<SegmentListener>();
  private currentMeetingId: string | null = null;
  private lastEmittedEndMs = 0;

  private get modelDir(): string {
    const dir = FileSystem.documentDirectory;
    if (!dir) throw new Error('FileSystem.documentDirectory ist nicht verfügbar');
    return `${dir}whisper-models/`;
  }

  async ensureModel(size: WhisperModelSize, onProgress?: ProgressListener): Promise<string> {
    await FileSystem.makeDirectoryAsync(this.modelDir, { intermediates: true });
    const filename = MODEL_FILENAMES[size];
    const localPath = `${this.modelDir}${filename}`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && 'size' in info && info.size && info.size > 1_000_000) {
      return localPath;
    }
    const downloadable = FileSystem.createDownloadResumable(
      `${MODEL_BASE_URL}/${filename}`,
      localPath,
      {},
      (p) => {
        onProgress?.({
          received: p.totalBytesWritten,
          total: p.totalBytesExpectedToWrite,
        });
      },
    );
    const result = await downloadable.downloadAsync();
    if (!result?.uri) throw new Error('Modell-Download fehlgeschlagen');
    return result.uri;
  }

  async init(size: WhisperModelSize, onProgress?: ProgressListener): Promise<void> {
    if (this.context) return;
    const modelPath = await this.ensureModel(size, onProgress);
    this.context = (await initWhisper({ filePath: modelPath })) as unknown as WhisperContext;
  }

  async startRealtime(meetingId: string, language: AppLanguage = 'auto'): Promise<void> {
    if (!this.context) throw new Error('Whisper-Context nicht initialisiert');
    this.currentMeetingId = meetingId;
    this.lastEmittedEndMs = 0;

    const { stop, subscribe } = await this.context.transcribeRealtime({
      language,
      realtimeAudioSec: 60,
      realtimeAudioSliceSec: 25,
    });
    this.stopFn = stop;
    subscribe((event) => this.handleEvent(event));
  }

  async stop(): Promise<void> {
    if (!this.stopFn) return;
    await this.stopFn();
    this.stopFn = null;
    this.currentMeetingId = null;
  }

  async release(): Promise<void> {
    await this.stop();
    await this.context?.release?.();
    this.context = null;
  }

  onSegment(cb: SegmentListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private handleEvent(event: RealtimeEvent): void {
    const meetingId = this.currentMeetingId;
    if (!meetingId) return;
    const segments = event.data?.segments ?? [];
    const recordingTime = event.recordingTime ?? 0;

    for (const s of segments) {
      const startMs = Number(s.t0) || 0;
      const endMs = Number(s.t1) || 0;
      if (endMs <= this.lastEmittedEndMs) continue;

      const isFinal = !event.isCapturing || endMs < recordingTime - 3000;
      const segment: TranscriptSegment = {
        id: newId(),
        meetingId,
        startMs,
        endMs,
        text: String(s.text ?? '').trim(),
        speakerLabel: null,
        isFinal,
        createdAt: nowIso(),
      };
      if (isFinal) this.lastEmittedEndMs = endMs;
      for (const l of this.listeners) l(segment);
    }
  }
}

let cachedInstance: WhisperRnService | null = null;
export function getWhisperService(): WhisperRnService {
  if (!cachedInstance) cachedInstance = new WhisperRnService();
  return cachedInstance;
}
