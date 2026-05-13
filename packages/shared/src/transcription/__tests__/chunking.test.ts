import { describe, expect, it } from 'vitest';
import { classifySegments, computeFinalUntilMs, DEFAULT_WINDOW } from '../chunking.js';

describe('classifySegments', () => {
  it('alle Segmente vor dem Cutoff sind final', () => {
    const segments = [
      { startMs: 0, endMs: 3000, text: 'A' },
      { startMs: 3000, endMs: 6000, text: 'B' },
    ];
    const result = classifySegments(segments, 10_000);
    expect(result.finals).toHaveLength(2);
    expect(result.provisional).toHaveLength(0);
  });

  it('alle Segmente nach dem Cutoff sind vorläufig', () => {
    const segments = [
      { startMs: 0, endMs: 3000, text: 'A' },
      { startMs: 3000, endMs: 6000, text: 'B' },
    ];
    const result = classifySegments(segments, 0);
    expect(result.finals).toHaveLength(0);
    expect(result.provisional).toHaveLength(2);
  });

  it('splittet Segmente an der Cutoff-Grenze korrekt', () => {
    const segments = [
      { startMs: 0, endMs: 3000, text: 'A' },
      { startMs: 3000, endMs: 6000, text: 'B' },
      { startMs: 6000, endMs: 9000, text: 'C' },
    ];
    const result = classifySegments(segments, 6000);
    expect(result.finals.map((s) => s.text)).toEqual(['A', 'B']);
    expect(result.provisional.map((s) => s.text)).toEqual(['C']);
  });
});

describe('computeFinalUntilMs', () => {
  it('gibt 0 zurück solange Aufnahme kürzer als (window - step)', () => {
    expect(computeFinalUntilMs(20_000, DEFAULT_WINDOW)).toBe(0);
    expect(computeFinalUntilMs(27_000, DEFAULT_WINDOW)).toBe(0);
  });

  it('beginnt zu finalisieren wenn Aufnahme länger ist', () => {
    expect(computeFinalUntilMs(30_000, DEFAULT_WINDOW)).toBe(3_000);
    expect(computeFinalUntilMs(60_000, DEFAULT_WINDOW)).toBe(33_000);
  });
});
