import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WhisperService } from '../WhisperService.js';
import type { RawWhisperSegment } from '../WhisperService.js';
import type { TranscriptSegment } from '@reineke/shared';

const SAMPLE_RATE = 16_000;

function pcmOfDuration(seconds: number): Buffer {
  const samples = SAMPLE_RATE * seconds;
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(0, i * 2);
  }
  return buffer;
}

describe('WhisperService', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whisper-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('startMeeting initialisiert State und stopMeeting bereinigt', async () => {
    const runner = vi.fn().mockResolvedValue([]);
    const svc = new WhisperService(
      { modelSize: 'base', modelsDir: tmpDir, audioDir: tmpDir },
      runner,
    );
    await svc.startMeeting('m1');
    const { audioPath } = await svc.stopMeeting('m1');
    expect(audioPath).toContain('m1.wav');
  });

  it('emittiert ein finales Segment, wenn der Cutoff überschritten wird', async () => {
    const segments: TranscriptSegment[] = [];
    const runner = vi.fn(async (): Promise<RawWhisperSegment[]> => [
      { startMs: 0, endMs: 3000, text: 'Hallo' },
    ]);
    const svc = new WhisperService(
      { modelSize: 'base', modelsDir: tmpDir, audioDir: tmpDir },
      runner,
    );
    svc.on('segment', (s) => segments.push(s as TranscriptSegment));

    await svc.startMeeting('m1');
    // Push 35s — überschreitet windowMs - stepMs (27s) → erstes Segment wird final
    await svc.pushChunk('m1', pcmOfDuration(35));

    expect(runner).toHaveBeenCalledTimes(1);
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0]?.isFinal).toBe(true);
    expect(segments[0]?.text).toBe('Hallo');
  });

  it('emittiert vorläufiges Segment wenn Cutoff noch nicht überschritten', async () => {
    const segments: TranscriptSegment[] = [];
    const runner = vi.fn(async (): Promise<RawWhisperSegment[]> => [
      { startMs: 0, endMs: 3000, text: 'Test' },
    ]);
    const svc = new WhisperService(
      { modelSize: 'base', modelsDir: tmpDir, audioDir: tmpDir },
      runner,
    );
    svc.on('segment', (s) => segments.push(s as TranscriptSegment));

    await svc.startMeeting('m2');
    // Push nur 5s — Cutoff bleibt bei 0, alles ist vorläufig
    await svc.pushChunk('m2', pcmOfDuration(5));

    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments.some((s) => !s.isFinal)).toBe(true);
  });

  it('wirft Fehler wenn pushChunk vor startMeeting', async () => {
    const svc = new WhisperService(
      { modelSize: 'base', modelsDir: tmpDir, audioDir: tmpDir },
      async () => [],
    );
    await expect(svc.pushChunk('unknown', pcmOfDuration(5))).rejects.toThrow();
  });
});
