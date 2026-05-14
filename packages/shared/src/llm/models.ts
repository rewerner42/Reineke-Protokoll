import type { LLMProviderName } from '../models/Protocol.js';

export const LLM_MODELS: Record<LLMProviderName, { value: string; label: string }[]> = {
  claude: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (empfohlen)' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (höchste Qualität)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (schnell, günstig)' },
  ],
  openai: [
    { value: 'gpt-4o-2024-11-20', label: 'GPT-4o (empfohlen)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini (günstig)' },
  ],
  ollama: [],
};
