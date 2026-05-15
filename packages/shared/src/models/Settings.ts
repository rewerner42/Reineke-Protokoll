import type { LLMProviderName } from './Protocol.js';

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export type AppLanguage = 'auto' | 'de' | 'en';

export interface AppSettings {
  llmProvider: LLMProviderName;
  claudeModel: string;
  openaiModel: string;
  whisperModelSize: WhisperModelSize;
  language: AppLanguage;
  autoTranscribe: boolean;
  audioOutputDir: string | null;
  diarizationEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'claude',
  claudeModel: 'claude-sonnet-4-5-20250929',
  openaiModel: 'gpt-4o-2024-11-20',
  whisperModelSize: 'base',
  language: 'auto',
  autoTranscribe: true,
  audioOutputDir: null,
  diarizationEnabled: true,
};
