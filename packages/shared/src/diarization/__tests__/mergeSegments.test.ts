import { describe, expect, it } from 'vitest';
import {
  assignSpeakerToSegment,
  assignSpeakerLabels,
  labelForSpeakerIndex,
} from '../mergeSegments.js';

describe('assignSpeakerToSegment', () => {
  it('liefert null bei leerem Span-Array', () => {
    expect(assignSpeakerToSegment({ startMs: 0, endMs: 1000 }, [])).toBeNull();
  });

  it('wählt vollständig enthaltene Spans', () => {
    const spans = [
      { startMs: 0, endMs: 5000, speakerIndex: 0 },
      { startMs: 5000, endMs: 10000, speakerIndex: 1 },
    ];
    expect(assignSpeakerToSegment({ startMs: 1000, endMs: 3000 }, spans)).toBe(0);
    expect(assignSpeakerToSegment({ startMs: 6000, endMs: 9000 }, spans)).toBe(1);
  });

  it('wählt bei partial overlap den Span mit größerem Overlap', () => {
    const spans = [
      { startMs: 0, endMs: 3000, speakerIndex: 0 },
      { startMs: 3000, endMs: 10000, speakerIndex: 1 },
    ];
    expect(assignSpeakerToSegment({ startMs: 2000, endMs: 6000 }, spans)).toBe(1);
  });

  it('liefert null wenn der Overlap unter dem Schwellwert liegt', () => {
    const spans = [{ startMs: 0, endMs: 1000, speakerIndex: 0 }];
    expect(assignSpeakerToSegment({ startMs: 900, endMs: 1000 }, spans)).toBeNull();
  });

  it('liefert null wenn gar kein Overlap besteht', () => {
    const spans = [{ startMs: 0, endMs: 1000, speakerIndex: 0 }];
    expect(assignSpeakerToSegment({ startMs: 5000, endMs: 6000 }, spans)).toBeNull();
  });
});

describe('assignSpeakerLabels', () => {
  it('mappt Segmente auf Sprecher-Labels', () => {
    const segments = [
      { id: 'a', startMs: 0, endMs: 2000 },
      { id: 'b', startMs: 4000, endMs: 6000 },
      { id: 'c', startMs: 20000, endMs: 22000 },
    ];
    const spans = [
      { startMs: 0, endMs: 3000, speakerIndex: 0 },
      { startMs: 3000, endMs: 10000, speakerIndex: 1 },
    ];
    expect(assignSpeakerLabels(segments, spans)).toEqual([
      { segmentId: 'a', speakerLabel: 'Sprecher 1' },
      { segmentId: 'b', speakerLabel: 'Sprecher 2' },
      { segmentId: 'c', speakerLabel: null },
    ]);
  });
});

describe('labelForSpeakerIndex', () => {
  it('nummeriert ab 1', () => {
    expect(labelForSpeakerIndex(0)).toBe('Sprecher 1');
    expect(labelForSpeakerIndex(2)).toBe('Sprecher 3');
  });
});
