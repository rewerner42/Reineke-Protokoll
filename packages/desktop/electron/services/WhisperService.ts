import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type {
  WhisperModelSize,
  TranscriptSegment,
  AppLanguage,
  DetectedLanguage,
} from '@reineke/shared';
import {
  classifySegments,
  computeFinalUntilMs,
  DEFAULT_WINDOW,
  newId,
  nowIso,
} from '@reineke/shared';

const require_ = createRequire(import.meta.url);
function getWhisperCppPath(): string {
  const pkgEntry = require_.resolve('nodejs-whisper');
  return path.join(path.dirname(pkgEntry), '..', 'cpp', 'whisper.cpp');
}

const MODEL_FILE_NAMES: Record<WhisperModelSize, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
  'large-v3-turbo': 'ggml-large-v3-turbo.bin',
};

const MODEL_APPROX_MB: Record<WhisperModelSize, number> = {
  tiny: 75,
  base: 142,
  small: 466,
  medium: 1462,
  'large-v3-turbo': 1624,
};

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
  language?: AppLanguage;
}

const MODEL_NAME = {
  tiny: 'tiny',
  base: 'base',
  small: 'small',
  medium: 'medium',
  'large-v3-turbo': 'large-v3-turbo',
} as const satisfies Record<WhisperModelSize, string>;

interface MeetingState {
  meetingId: string;
  pcm: Buffer;
  lastFinalUntilMs: number;
  emittedSegmentIds: Map<string, string>;
  audioPath: string;
  inferenceInFlight: boolean;
  detectedLanguage: DetectedLanguage | null;
}

export interface StopMeetingResult {
  audioPath: string | null;
  detectedLanguage: DetectedLanguage | null;
  finalSegments: RawWhisperSegment[];
}

export type WhisperRunner = (audioPath: string) => Promise<WhisperRunResult>;

export interface WhisperRunResult {
  segments: RawWhisperSegment[];
  detectedLanguage: DetectedLanguage | null;
}

/**
 * Hält pro Meeting einen wachsenden PCM-Buffer (16 kHz Mono PCM16) und führt
 * nach jedem neuen Chunk Whisper auf den letzten 30 s aus. Emittiert sowohl
 * vorläufige als auch finale Segmente.
 */
export class WhisperService extends EventEmitter {
  private readonly meetings = new Map<string, MeetingState>();
  private downloadInFlight: Map<WhisperModelSize, Promise<void>> = new Map();

  constructor(
    private readonly opts: WhisperServiceOptions,
    private readonly whisperRunner?: WhisperRunner,
  ) {
    super();
  }

  setModelSize(size: WhisperModelSize): void {
    this.opts.modelSize = size;
  }

  setLanguage(language: AppLanguage): void {
    this.opts.language = language;
  }

  isModelAvailable(size: WhisperModelSize): boolean {
    const modelsDir = path.join(getWhisperCppPath(), 'models');
    return existsSync(path.join(modelsDir, MODEL_FILE_NAMES[size]));
  }

  async downloadModel(size: WhisperModelSize): Promise<void> {
    if (this.isModelAvailable(size)) return;
    const existing = this.downloadInFlight.get(size);
    if (existing) return existing;
    const p = this.runDownload(size).finally(() => {
      this.downloadInFlight.delete(size);
    });
    this.downloadInFlight.set(size, p);
    return p;
  }

  private async runDownload(size: WhisperModelSize): Promise<void> {
    const cppPath = getWhisperCppPath();
    const script =
      process.platform === 'win32'
        ? 'download-ggml-model.cmd'
        : './download-ggml-model.sh';
    const totalBytes = MODEL_APPROX_MB[size] * 1024 * 1024;
    this.emit('modelDownloadProgress', { size, percent: 0 });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(script, [MODEL_NAME[size]], {
        cwd: path.join(cppPath, 'models'),
        env: process.env,
      });
      let stderr = '';
      child.stderr?.on('data', (buf: Buffer) => {
        const s = buf.toString('utf8');
        stderr += s;
        // wget writes progress to stderr like "  50%[==========>"
        const m = /(\d{1,3})%/.exec(s);
        if (m) {
          const percent = Math.min(100, Math.max(0, parseInt(m[1]!, 10)));
          this.emit('modelDownloadProgress', { size, percent });
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0 && this.isModelAvailable(size)) {
          this.emit('modelDownloadProgress', { size, percent: 100 });
          resolve();
        } else {
          reject(
            new Error(
              `Whisper-Modell-Download für "${size}" fehlgeschlagen (exit ${code}, ${formatMb(totalBytes)}).\n${stderr.slice(-400)}`,
            ),
          );
        }
      });
    });
  }

  async ensureModelAvailable(): Promise<void> {
    if (!this.isModelAvailable(this.opts.modelSize)) {
      await this.downloadModel(this.opts.modelSize);
    }
  }

  async startMeeting(meetingId: string): Promise<void> {
    await this.ensureModelAvailable();
    await fs.mkdir(this.opts.audioDir, { recursive: true });
    this.meetings.set(meetingId, {
      meetingId,
      pcm: Buffer.alloc(0),
      lastFinalUntilMs: 0,
      emittedSegmentIds: new Map(),
      audioPath: path.join(this.opts.audioDir, `${meetingId}.wav`),
      inferenceInFlight: false,
      detectedLanguage: null,
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

    const inference = await this.runInference(wavPath);
    if (inference.detectedLanguage && state.detectedLanguage === null) {
      state.detectedLanguage = inference.detectedLanguage;
      this.emit('language-detected', {
        meetingId: state.meetingId,
        language: inference.detectedLanguage,
      });
    }
    const offsetSegments = inference.segments.map((s) => ({
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

  async stopMeeting(meetingId: string): Promise<StopMeetingResult> {
    const inflightState = this.meetings.get(meetingId);
    if (inflightState?.inferenceInFlight) {
      const start = Date.now();
      while (inflightState.inferenceInFlight && Date.now() - start < 30_000) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const state = this.meetings.get(meetingId);
    if (!state) {
      return { audioPath: null, detectedLanguage: null, finalSegments: [] };
    }
    const audioPath = state.audioPath;
    await this.writeFullWav(audioPath, state.pcm);

    let finalSegments: RawWhisperSegment[] = [];
    let detectedLanguage = state.detectedLanguage;
    if (state.pcm.length > 0) {
      try {
        const result = await this.runInference(audioPath);
        finalSegments = result.segments;
        if (result.detectedLanguage) detectedLanguage = result.detectedLanguage;
      } catch (err) {
        console.error('[Whisper] Final transcription failed:', err);
      }
    }
    this.meetings.delete(meetingId);
    return { audioPath, detectedLanguage, finalSegments };
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

  private async runInference(audioPath: string): Promise<WhisperRunResult> {
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
): Promise<WhisperRunResult> {
  const mod = (await import('nodejs-whisper')) as unknown as { nodewhisper: WhisperFn };
  const requestedLanguage = opts.language ?? 'auto';
  // bewusst KEIN autoDownloadModelName — der Download-Pfad in nodejs-whisper
  // crasht im pnpm-Symlink-Setup (shelljs.exec returns undefined).
  // WhisperService.ensureModelAvailable() lädt das Modell stattdessen über
  // direktes spawn() im startMeeting().
  await mod.nodewhisper(audioPath, {
    modelName: MODEL_NAME[opts.modelSize],
    whisperOptions: {
      outputInJson: true,
      outputInText: false,
      outputInSrt: false,
      outputInVtt: false,
      language: requestedLanguage,
      wordTimestamps: false,
    },
  });

  const jsonPath = `${audioPath}.json`;
  const raw = await fs.readFile(jsonPath, 'utf8').catch(() => null);
  if (!raw) return { segments: [], detectedLanguage: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { segments: [], detectedLanguage: null };
  }
  return {
    segments: extractSegments(parsed),
    detectedLanguage: extractDetectedLanguage(parsed, requestedLanguage),
  };
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

function formatMb(bytes: number): string {
  return `~${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function extractDetectedLanguage(
  result: unknown,
  requested: string,
): DetectedLanguage | null {
  // Wenn der Nutzer explizit DE/EN gewählt hat, ist das die Sprache.
  if (requested === 'de' || requested === 'en') return requested;
  // Bei 'auto' sucht whisper.cpp die Sprache und legt sie unter `language` ab.
  if (!result || typeof result !== 'object') return null;
  const candidate = result as { language?: unknown; result?: { language?: unknown } };
  const lang =
    typeof candidate.language === 'string'
      ? candidate.language
      : typeof candidate.result === 'object' &&
          candidate.result !== null &&
          typeof candidate.result.language === 'string'
        ? candidate.result.language
        : null;
  if (lang === 'de' || lang === 'en') return lang;
  return null;
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
