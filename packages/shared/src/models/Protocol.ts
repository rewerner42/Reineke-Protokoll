import type { Participant } from './Participant.js';
import type { ToDo } from './ToDo.js';

export type LLMProviderName = 'claude' | 'openai' | 'ollama';

export interface Protocol {
  id: string;
  meetingId: string;
  summary: string;
  participants: Participant[];
  todos: ToDo[];
  decisions: string[];
  discussionPoints: string[];
  markdown: string;
  llmProvider: LLMProviderName;
  llmModel: string;
  generatedAt: string;
  editedAt: string | null;
}
