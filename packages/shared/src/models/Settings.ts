import type { LLMProviderName } from './Protocol.js';

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export type PdfClassification =
  | 'none'
  | 'oeffentlich'
  | 'intern'
  | 'vertraulich'
  | 'streng-vertraulich';

export const CLASSIFICATION_LABELS: Record<PdfClassification, string> = {
  none: 'Keine Angabe',
  oeffentlich: 'Öffentlich',
  intern: 'Intern',
  vertraulich: 'Vertraulich',
  'streng-vertraulich': 'Streng vertraulich',
};

export interface AppSettings {
  llmProvider: LLMProviderName;
  claudeModel: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  whisperModelSize: WhisperModelSize;
  language: 'de' | 'en';
  autoTranscribe: boolean;
  audioOutputDir: string | null;
  pdfPrimaryColor: string;
  pdfLogoPath: string | null;
  pdfCompanyName: string;
  pdfClassification: PdfClassification;
  exportDir: string | null;
  lastExportDir: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'claude',
  claudeModel: 'claude-sonnet-4-5-20250929',
  openaiModel: 'gpt-4o-2024-11-20',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  whisperModelSize: 'tiny',
  language: 'de',
  autoTranscribe: true,
  audioOutputDir: null,
  pdfPrimaryColor: '#0f172a',
  pdfLogoPath: null,
  pdfCompanyName: '',
  pdfClassification: 'intern',
  exportDir: null,
  lastExportDir: null,
};
