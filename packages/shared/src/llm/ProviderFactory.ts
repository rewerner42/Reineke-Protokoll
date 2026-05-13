import type { LLMProvider } from './LLMProvider.js';
import { ClaudeProvider } from './ClaudeProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import type { LLMProviderName } from '../models/Protocol.js';

export interface LLMProviderConfig {
  name: LLMProviderName;
  apiKey: string;
  model: string;
}

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.name) {
    case 'claude':
      return new ClaudeProvider({ apiKey: config.apiKey, model: config.model });
    case 'openai':
      return new OpenAIProvider({ apiKey: config.apiKey, model: config.model });
  }
}
