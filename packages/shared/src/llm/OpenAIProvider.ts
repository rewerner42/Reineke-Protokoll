import OpenAI from 'openai';
import type { LLMProvider } from './LLMProvider.js';
import { LLMProviderError } from './LLMProvider.js';
import { systemPromptFor, buildProtocolUserPrompt } from './prompts.js';
import type { ProtocolInput, ProtocolOutput } from '../models/schemas.js';
import { PROTOCOL_JSON_SCHEMA, ProtocolOutputSchema } from '../models/schemas.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  client?: OpenAI;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(opts: OpenAIProviderOptions) {
    this.model = opts.model;
    this.client = opts.client ?? new OpenAI({ apiKey: opts.apiKey });
  }

  async generateProtocol(input: ProtocolInput): Promise<ProtocolOutput> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPromptFor(input.language) },
          { role: 'user', content: buildProtocolUserPrompt(input) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'meeting_protocol',
            strict: true,
            schema: PROTOCOL_JSON_SCHEMA,
          },
        },
      });
    } catch (err) {
      throw new LLMProviderError(
        `OpenAI-Aufruf fehlgeschlagen: ${(err as Error).message}`,
        'openai',
        err,
      );
    }

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new LLMProviderError('OpenAI hat keinen Inhalt zurückgegeben', 'openai');
    }
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch (err) {
      throw new LLMProviderError(
        `OpenAI-Output ist kein gültiges JSON: ${(err as Error).message}`,
        'openai',
        err,
      );
    }
    const parsed = ProtocolOutputSchema.safeParse(json);
    if (!parsed.success) {
      throw new LLMProviderError(
        `OpenAI-Output verletzt Schema: ${parsed.error.message}`,
        'openai',
        parsed.error,
      );
    }
    return parsed.data;
  }
}
