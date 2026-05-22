import { create } from 'zustand';
import type { TranscriptSegment } from '@reineke/shared';
import { api } from '../lib/ipc.js';

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 3;
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;

interface AudioPipeline {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
}

interface RecorderState {
  isRecording: boolean;
  isPreparing: boolean;
  level: number;
  error: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  segments: TranscriptSegment[];
  startedAt: number | null;
  start(meetingId: string, title: string): Promise<void>;
  stop(): Promise<string | null>;
}

let pipeline: AudioPipeline | null = null;
let chunkBuffer: Float32Array[] = [];
let chunkSamples = 0;
let unsubscribeSegment: (() => void) | null = null;
let activeMeetingId: string | null = null;

async function flushChunk(): Promise<void> {
  if (!activeMeetingId) return;
  if (chunkSamples === 0) return;
  const float = mergeFloat32(chunkBuffer, chunkSamples);
  chunkBuffer = [];
  chunkSamples = 0;
  const pcm16 = floatToPcm16(float);
  try {
    await api.recording.pushAudioChunk(activeMeetingId, pcm16.buffer);
  } catch (err) {
    console.error('pushAudioChunk failed', err);
  }
}

export const useRecorderStore = create<RecorderState>((set, get) => ({
  isRecording: false,
  isPreparing: false,
  level: 0,
  error: null,
  meetingId: null,
  meetingTitle: null,
  segments: [],
  startedAt: null,

  start: async (meetingId, title) => {
    if (get().isRecording || get().isPreparing) return;
    set({ error: null, isPreparing: true, segments: [], meetingId, meetingTitle: title });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const AudioCtxCtor =
        (window.AudioContext as typeof AudioContext | undefined) ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxCtor({ sampleRate: SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      activeMeetingId = meetingId;
      await api.recording.start(meetingId);

      unsubscribeSegment = api.transcription.onSegment((segment) => {
        if (segment.meetingId !== activeMeetingId) return;
        set((state) => ({ segments: mergeSegment(state.segments, segment) }));
      });

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunkBuffer.push(copy);
        chunkSamples += copy.length;

        let peak = 0;
        for (let i = 0; i < input.length; i++) {
          const v = Math.abs(input[i] ?? 0);
          if (v > peak) peak = v;
        }
        set({ level: peak });

        if (chunkSamples >= CHUNK_SAMPLES) {
          void flushChunk();
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      pipeline = { stream, ctx, source, processor };

      set({ isRecording: true, isPreparing: false, startedAt: Date.now() });
    } catch (err) {
      set({ error: (err as Error).message, isPreparing: false, meetingId: null });
      activeMeetingId = null;
    }
  },

  stop: async () => {
    const meetingId = activeMeetingId;
    if (chunkSamples > 0) await flushChunk();
    if (pipeline) {
      pipeline.processor.disconnect();
      pipeline.source.disconnect();
      pipeline.stream.getTracks().forEach((t) => t.stop());
      await pipeline.ctx.close();
      pipeline = null;
    }
    unsubscribeSegment?.();
    unsubscribeSegment = null;
    activeMeetingId = null;
    set({
      isRecording: false,
      isPreparing: false,
      level: 0,
      meetingId: null,
      meetingTitle: null,
      startedAt: null,
    });
    if (meetingId) {
      try {
        await api.recording.stop(meetingId);
      } catch (err) {
        console.error('recording.stop failed', err);
      }
    }
    return meetingId;
  },
}));

function mergeSegment(prev: TranscriptSegment[], next: TranscriptSegment): TranscriptSegment[] {
  if (next.isFinal) {
    const filtered = prev.filter((s) => s.isFinal || s.endMs <= next.startMs);
    return [...filtered, next];
  }
  const finals = prev.filter((s) => s.isFinal);
  return [...finals, next];
}

function mergeFloat32(buffers: Float32Array[], totalSamples: number): Float32Array {
  const out = new Float32Array(totalSamples);
  let offset = 0;
  for (const buf of buffers) {
    out.set(buf, offset);
    offset += buf.length;
  }
  return out;
}

function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
