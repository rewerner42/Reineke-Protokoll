import { promises as fs } from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 16_000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * Schreibt PCM-Buffer als WAV-Datei (16 kHz Mono PCM16) — wird vom WhisperService
 * eingelesen.
 */
export class AudioFileService {
  constructor(private readonly outputDir: string) {}

  async writeWav(meetingId: string, pcmBuffer: Buffer): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });
    const file = path.join(this.outputDir, `${meetingId}.wav`);
    const wav = buildWavFile(pcmBuffer);
    await fs.writeFile(file, wav);
    return file;
  }
}

function buildWavFile(pcm: Buffer): Buffer {
  const byteRate = (SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
