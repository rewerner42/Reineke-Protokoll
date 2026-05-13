export interface WhisperRawSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ChunkResult {
  finals: WhisperRawSegment[];
  provisional: WhisperRawSegment[];
}

export interface SlidingWindowOptions {
  windowMs: number;
  stepMs: number;
}

export const DEFAULT_WINDOW: SlidingWindowOptions = {
  windowMs: 30_000,
  stepMs: 3_000,
};

/**
 * Klassifiziert die Whisper-Segmente eines Sliding-Window-Pass.
 *
 * Segmente, die vollständig vor `finalUntilMs` enden, gelten als final.
 * Segmente, die danach enden, sind vorläufig — sie können sich beim nächsten
 * Whisper-Lauf noch ändern, wenn sich der Kontext erweitert.
 */
export function classifySegments(
  segments: WhisperRawSegment[],
  finalUntilMs: number,
): ChunkResult {
  const finals: WhisperRawSegment[] = [];
  const provisional: WhisperRawSegment[] = [];
  for (const seg of segments) {
    if (seg.endMs <= finalUntilMs) {
      finals.push(seg);
    } else {
      provisional.push(seg);
    }
  }
  return { finals, provisional };
}

/**
 * Berechnet den Zeitstempel, bis zu dem Segmente als final gelten.
 * Alles, was länger als `windowMs - stepMs` zurückliegt, wird nicht
 * mehr vom Whisper-Sliding-Window berührt.
 */
export function computeFinalUntilMs(
  currentRecordingMs: number,
  opts: SlidingWindowOptions = DEFAULT_WINDOW,
): number {
  return Math.max(0, currentRecordingMs - (opts.windowMs - opts.stepMs));
}
