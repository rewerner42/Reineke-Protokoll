import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { WhisperModelSize, TranscriptSegment } from '@reineke/shared';
import {
  classifySegments,
  computeFinalUntilMs,
  DEFAULT_WINDOW,
  newId,
  nowIso,
} from '@reineke/shared';

// nodejs-whisper hat keine offiziellen Typen; wir laden es dynamisch.
type WhisperFn = (input: string, opts: WhisperOptions) => Promise<unknown>;
interface WhisperOptions {
  modelName: string;
  autoDownloadModelName?: string;
  whisperOptions?: {
    outputInJson?: boolean;
    outputInText?: boolean;
    outputInSrt?: boolean;
    outputInVtt?: boolean;
    translateToEnglish?: boolean;
    wordTimestamps?: boolean;
    language?: string;
  };
}

const SAMPLE_RATE = 16_000;

export interface WhisperPartialSegment {
  meetingId: string;
  segment: TranscriptSegment;
}

export interface WhisperServiceOptions {
  modelSize: WhisperModelSize;
  modelsDir: string;
  audioDir: string;
  language?: 'de' | 'en';
}

const MODEL_NAME = {
  tiny: 'tiny',
  base: 'base',
  small: 'small',
  medium: 'medium',
} as const satisfies Record<WhisperModelSize, string>;

interface MeetingState {
  meetingId: string;
  pcm: Buffer;
  lastFinalUntilMs: number;
  emittedSegmentIds: Map<string, string>;
  audioPath: string;
  inferenceInFlight: boolean;
}

/**
 * Hält pro Meeting einen wachsenden PCM-Buffer (16 kHz Mono PCM16) und führt
 * nach jedem neuen Chunk Whisper auf den letzten 30 s aus. Emittiert sowohl
 * vorläufige als auch finale Segmente.
 *
 * Die tatsächliche Whisper-Inferenz ist durch `runWhisper()` gekapselt — in
 * Tests kann ein Test-Double injiziert werden.
 */
export class WhisperService extends EventEmitter {
  private readonly meetings = new Map<string, MeetingState>();

  constructor(
    private readonly opts: WhisperServiceOptions,
    private readonly whisperRunner?: (audioPath: string) => Promise<RawWhisperSegment[]>,
  ) {
    super();
  }

  async startMeeting(meetingId: string): Promise<void> {
    await fs.mkdir(this.opts.audioDir, { recursive: true });
    this.meetings.set(meetingId, {
      meetingId,
      pcm: Buffer.alloc(0),
      lastFinalUntilMs: 0,
      emittedSegmentIds: new Map(),
      audioPath: path.join(this.opts.audioDir, `${meetingId}.wav`),
      inferenceInFlight: false,
    });
  }

  async pushChunk(meetingId: string, pcm: Buffer): Promise<void> {
    const state = this.meetings.get(meetingId);
    if (!state) throw new Error(`Whisper-State für ${meetingId} fehlt`);
    state.pcm = Buffer.concat([state.pcm, pcm]);

    const currentMs = pcmDurationMs(state.pcm);
    if (currentMs < 3000) return;
    if (state.inferenceInFlight) return;

    state.inferenceInFlight = true;
    try {
      await this.runInferenceForWindow(state, currentMs);
    } finally {
      state.inferenceInFlight = false;
    }
  }

  private async runInferenceForWindow(state: MeetingState, currentMs: number): Promise<void> {
    const windowPcm = sliceTrailingWindow(state.pcm, DEFAULT_WINDOW.windowMs);
    const windowStartMs = currentMs - pcmDurationMs(windowPcm);
    const wavPath = await this.writeTempWav(state, windowPcm);

    const rawSegments = await this.runInference(wavPath);
    const offsetSegments = rawSegments.map((s) => ({
      startMs: s.startMs + windowStartMs,
      endMs: s.endMs + windowStartMs,
      text: s.text,
    }));

    const finalUntilMs = computeFinalUntilMs(currentMs);
    const { finals, provisional } = classifySegments(offsetSegments, finalUntilMs);

    for (const seg of finals) {
      const key = `${seg.startMs}-${seg.endMs}`;
      const id = state.emittedSegmentIds.get(key) ?? newId();
      state.emittedSegmentIds.set(key, id);
      const segment: TranscriptSegment = {
        id,
        meetingId: state.meetingId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text.trim(),
        speakerLabel: null,
        isFinal: true,
        createdAt: nowIso(),
      };
      this.emit('segment', segment);
    }
    for (const seg of provisional) {
      const segment: TranscriptSegment = {
        id: newId(),
        meetingId: state.meetingId,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text.trim(),
        speakerLabel: null,
        isFinal: false,
        createdAt: nowIso(),
      };
      this.emit('segment', segment);
    }

    state.lastFinalUntilMs = finalUntilMs;
  }

  async stopMeeting(
    meetingId: string,
  ): Promise<{ audioPath: string | null; finalSegments: RawWhisperSegment[] }> {
    const inflightState = this.meetings.get(meetingId);
    if (inflightState?.inferenceInFlight) {
      const start = Date.now();
      while (inflightState.inferenceInFlight && Date.now() - start < 30_000) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const state = this.meetings.get(meetingId);
    if (!state) return { audioPath: null, finalSegments: [] };
    const audioPath = state.audioPath;
    await this.writeFullWav(audioPath, state.pcm);

    let finalSegments: RawWhisperSegment[] = [];
    if (state.pcm.length > 0) {
      try {
        finalSegments = await this.runInference(audioPath);
      } catch (err) {
        console.error('[Whisper] Final transcription failed:', err);
      }
    }
    this.meetings.delete(meetingId);
    return { audioPath, finalSegments };
  }

  private async writeTempWav(state: MeetingState, pcm: Buffer): Promise<string> {
    const tmp = path.join(this.opts.audioDir, `${state.meetingId}-window.wav`);
    await this.writeFullWav(tmp, pcm);
    return tmp;
  }

  private async writeFullWav(filePath: string, pcm: Buffer): Promise<void> {
    const wav = buildWavBuffer(pcm);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, wav);
  }

  private async runInference(audioPath: string): Promise<RawWhisperSegment[]> {
    if (this.whisperRunner) return this.whisperRunner(audioPath);
    return runWithNodejsWhisper(audioPath, this.opts);
  }
}

export interface RawWhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

function pcmDurationMs(pcm: Buffer): number {
  return Math.floor((pcm.length / 2 / SAMPLE_RATE) * 1000);
}

function sliceTrailingWindow(pcm: Buffer, windowMs: number): Buffer {
  const bytesPerMs = (SAMPLE_RATE * 2) / 1000;
  const windowBytes = Math.floor(windowMs * bytesPerMs);
  if (pcm.length <= windowBytes) return pcm;
  return pcm.subarray(pcm.length - windowBytes);
}

function buildWavBuffer(pcm: Buffer): Buffer {
  const byteRate = SAMPLE_RATE * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function runWithNodejsWhisper(
  audioPath: string,
  opts: WhisperServiceOptions,
): Promise<RawWhisperSegment[]> {
  const mod = (await import('nodejs-whisper')) as unknown as { nodewhisper: WhisperFn };
  await mod.nodewhisper(audioPath, {
    modelName: MODEL_NAME[opts.modelSize],
    autoDownloadModelName: MODEL_NAME[opts.modelSize],
    whisperOptions: {
      outputInJson: true,
      outputInText: false,
      outputInSrt: false,
      outputInVtt: false,
      language: opts.language ?? 'de',
      wordTimestamps: false,
    },
  });

  const jsonPath = `${audioPath}.json`;
  const raw = await fs.readFile(jsonPath, 'utf8').catch(() => null);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return extractSegments(parsed);
}

interface JsonSegment {
  timestamps?: { from?: string; to?: string };
  offsets?: { from?: number; to?: number };
  from?: string;
  to?: string;
  start?: string | number;
  end?: string | number;
  speech?: string;
  text?: string;
}

function extractSegments(result: unknown): RawWhisperSegment[] {
  if (!result) return [];
  const segs: JsonSegment[] = Array.isArray(result)
    ? (result as JsonSegment[])
    : ((result as { transcription?: JsonSegment[] }).transcription ?? []);
  return segs
    .map((s) => ({
      startMs:
        s.offsets?.from ??
        parseTimestampMs(s.timestamps?.from ?? s.from ?? s.start ?? 0),
      endMs:
        s.offsets?.to ??
        parseTimestampMs(s.timestamps?.to ?? s.to ?? s.end ?? 0),
      text: (s.text ?? s.speech ?? '').toString().trim(),
    }))
    .filter((s) => s.text.length > 0)
    .filter((s) => !isHallucination(s.text));
}

const HALLUCINATION_PATTERN =
  /^[\s[(*]*(musik|music|motor|applaus|applause|geräusche?|noise|silence|stille|undeutlich|inaudible|piept?|hupe|laughter|lachen|♪|♫)[\s[\])(*.,!?_-]*$/i;

function isHallucination(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length === 0) return true;
  if (HALLUCINATION_PATTERN.test(cleaned)) return true;
  if (/^[[(*][^a-zA-Z0-9äöüÄÖÜß]{0,40}[\])*]$/.test(cleaned)) return true;
  return false;
}

function parseTimestampMs(value: string | number): number {
  if (typeof value === 'number') return Math.round(value * 1000);
  const m = /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
  if (!m) return 0;
  const [, h, mm, ss, ms] = m;
  return (
    parseInt(h!, 10) * 3_600_000 +
    parseInt(mm!, 10) * 60_000 +
    parseInt(ss!, 10) * 1_000 +
    parseInt(ms!, 10)
  );
}
