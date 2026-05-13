import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/ipc.js';

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 3;
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;

export interface UseRecorderResult {
  isRecording: boolean;
  isPreparing: boolean;
  level: number;
  error: string | null;
  start(meetingId: string): Promise<void>;
  stop(): Promise<void>;
}

export function useRecorder(): UseRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunkBufferRef = useRef<Float32Array[]>([]);
  const chunkSamplesRef = useRef(0);
  const meetingIdRef = useRef<string | null>(null);

  const flushChunk = useCallback(async () => {
    const meetingId = meetingIdRef.current;
    if (!meetingId) return;
    const float = mergeFloat32(chunkBufferRef.current, chunkSamplesRef.current);
    chunkBufferRef.current = [];
    chunkSamplesRef.current = 0;
    const pcm16 = floatToPcm16(float);
    await api.recording.pushAudioChunk(meetingId, pcm16.buffer);
  }, []);

  const start = useCallback(
    async (meetingId: string) => {
      setError(null);
      setIsPreparing(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        const AudioContextCtor =
          (window.AudioContext as typeof AudioContext | undefined) ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        meetingIdRef.current = meetingId;
        await api.recording.start(meetingId);

        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          const input = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          chunkBufferRef.current.push(copy);
          chunkSamplesRef.current += copy.length;

          let peak = 0;
          for (let i = 0; i < input.length; i++) {
            const v = Math.abs(input[i] ?? 0);
            if (v > peak) peak = v;
          }
          setLevel(peak);

          if (chunkSamplesRef.current >= CHUNK_SAMPLES) {
            void flushChunk();
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        setIsRecording(true);
        setIsPreparing(false);
      } catch (err) {
        setError((err as Error).message);
        setIsPreparing(false);
      }
    },
    [flushChunk],
  );

  const stop = useCallback(async () => {
    if (chunkSamplesRef.current > 0) {
      await flushChunk();
    }
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await audioCtxRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    const meetingId = meetingIdRef.current;
    meetingIdRef.current = null;
    setIsRecording(false);
    setLevel(0);
    if (meetingId) await api.recording.stop(meetingId);
  }, [flushChunk]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  useEffect(() => {
    return () => {
      void stopRef.current();
    };
  }, []);

  return { isRecording, isPreparing, level, error, start, stop };
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
