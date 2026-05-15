export interface DiarizationSpan {
  startMs: number;
  endMs: number;
  speakerIndex: number;
}

export interface TimedSegment {
  startMs: number;
  endMs: number;
}

const MIN_OVERLAP_MS = 200;

export function assignSpeakerToSegment(
  segment: TimedSegment,
  spans: DiarizationSpan[],
): number | null {
  if (spans.length === 0) return null;
  let bestIdx: number | null = null;
  let bestOverlap = 0;
  for (const span of spans) {
    const overlap = Math.max(0, Math.min(segment.endMs, span.endMs) - Math.max(segment.startMs, span.startMs));
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIdx = span.speakerIndex;
    }
  }
  if (bestOverlap < MIN_OVERLAP_MS) return null;
  return bestIdx;
}

export function labelForSpeakerIndex(idx: number): string {
  return `Sprecher ${idx + 1}`;
}

export function assignSpeakerLabels<T extends TimedSegment & { id: string }>(
  segments: T[],
  spans: DiarizationSpan[],
): { segmentId: string; speakerLabel: string | null }[] {
  return segments.map((seg) => {
    const idx = assignSpeakerToSegment(seg, spans);
    return {
      segmentId: seg.id,
      speakerLabel: idx === null ? null : labelForSpeakerIndex(idx),
    };
  });
}
