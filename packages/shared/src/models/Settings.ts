import type { LLMProviderName } from './Protocol.js';

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export interface AppSettings {
  llmProvider: LLMProviderName;
  claudeModel: string;
  openaiModel: string;
  whisperModelSize: WhisperModelSize;
  language: 'de' | 'en';
  autoTranscribe: boolean;
  audioOutputDir: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'claude',
  claudeModel: 'claude-sonnet-4-5-20250929',
  openaiModel: 'gpt-4o-2024-11-20',
  whisperModelSize: 'base',
  language: 'de',
  autoTranscribe: true,
  audioOutputDir: null,
};
