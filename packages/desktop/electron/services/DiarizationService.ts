import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DiarizationSpan } from '@reineke/shared';

export interface DiarizationServiceOptions {
  modelsDir: string;
}

export type DiarizationRunner = (audioPath: string) => Promise<DiarizationSpan[]>;

interface SherpaSegment {
  start: number;
  end: number;
  speaker: number;
}

interface SherpaDiarization {
  process(samples: Float32Array): SherpaSegment[];
}

type SherpaModule = {
  OfflineSpeakerDiarization: new (config: unknown) => SherpaDiarization;
  readWave?: (path: string) => { samples: Float32Array; sampleRate: number };
};

/**
 * Lokale Sprecher-Diarization via sherpa-onnx. Modelle werden aus `modelsDir`
 * geladen. Falls die Library oder Modelle fehlen, wirft `diarize()` mit
 * sprechender Meldung — der Aufrufer entscheidet, wie er damit umgeht.
 */
export class DiarizationService {
  private cached: SherpaDiarization | null = null;
  private cachedSherpa: SherpaModule | null = null;

  constructor(
    private readonly opts: DiarizationServiceOptions,
    private readonly runner?: DiarizationRunner,
  ) {}

  async isAvailable(): Promise<boolean> {
    if (this.runner) return true;
    try {
      await this.ensureModelFiles();
      await this.loadSherpa();
      return true;
    } catch {
      return false;
    }
  }

  async diarize(audioPath: string): Promise<DiarizationSpan[]> {
    if (this.runner) return this.runner(audioPath);

    const sherpa = await this.loadSherpa();
    const diarization = await this.loadModel(sherpa);
    const { samples } = await readWav(audioPath);
    const segments = diarization.process(samples);
    return segments.map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      speakerIndex: s.speaker,
    }));
  }

  private async ensureModelFiles(): Promise<{ segmentation: string; embedding: string }> {
    const segmentation = path.join(this.opts.modelsDir, 'segmentation.onnx');
    const embedding = path.join(this.opts.modelsDir, 'embedding.onnx');
    await fs.access(segmentation);
    await fs.access(embedding);
    return { segmentation, embedding };
  }

  private async loadSherpa(): Promise<SherpaModule> {
    if (this.cachedSherpa) return this.cachedSherpa;
    try {
      // Indirekter Import, damit TypeScript das Modul nicht zur Compile-Zeit
      // auflösen muss — die Library ist eine optionale Native-Dependency.
      const moduleName = 'sherpa-onnx-node';
      const mod = (await import(moduleName)) as unknown as SherpaModule;
      this.cachedSherpa = mod;
      return mod;
    } catch (err) {
      throw new Error(
        `sherpa-onnx-node ist nicht installiert. Installation: 'pnpm add sherpa-onnx-node' im desktop-Package. (${(err as Error).message})`,
      );
    }
  }

  private async loadModel(sherpa: SherpaModule): Promise<SherpaDiarization> {
    if (this.cached) return this.cached;
    const { segmentation, embedding } = await this.ensureModelFiles();
    const config = {
      segmentation: { pyannote: { model: segmentation } },
      embedding: { model: embedding },
      clustering: { numClusters: -1, threshold: 0.5 },
      minDurationOn: 0.3,
      minDurationOff: 0.5,
    };
    this.cached = new sherpa.OfflineSpeakerDiarization(config);
    return this.cached;
  }
}

async function readWav(audioPath: string): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buffer = await fs.readFile(audioPath);
  // Minimaler WAV-Parser für 16-bit PCM Mono (das Format, das WhisperService schreibt).
  if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error(`WAV-Datei ${audioPath} hat keinen RIFF-Header`);
  }
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (bitsPerSample !== 16) {
    throw new Error(`Erwarte 16-bit PCM, gefunden ${bitsPerSample}-bit`);
  }
  const dataOffset = findDataChunkOffset(buffer);
  const pcm = buffer.subarray(dataOffset);
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE(i * 2) / 32768;
  }
  return { samples, sampleRate };
}

function findDataChunkOffset(buffer: Buffer): number {
  let offset = 12;
  while (offset < buffer.length - 8) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return offset + 8;
    offset += 8 + size;
  }
  throw new Error('WAV: data-Chunk nicht gefunden');
}
