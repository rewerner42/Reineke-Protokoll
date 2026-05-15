import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './LLMProvider.js';
import { LLMProviderError } from './LLMProvider.js';
import { systemPromptFor, buildProtocolUserPrompt } from './prompts.js';
import type { ProtocolInput, ProtocolOutput } from '../models/schemas.js';
import { PROTOCOL_JSON_SCHEMA, ProtocolOutputSchema } from '../models/schemas.js';

export interface ClaudeProviderOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  client?: Anthropic;
}

const TOOL_NAME = 'submit_protocol';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude' as const;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(opts: ClaudeProviderOptions) {
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  }

  async generateProtocol(input: ProtocolInput): Promise<ProtocolOutput> {
    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPromptFor(input.language),
        tools: [
          {
            name: TOOL_NAME,
            description: 'Übergibt das strukturierte Meeting-Protokoll.',
            input_schema: PROTOCOL_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildProtocolUserPrompt(input) }],
      });
    } catch (err) {
      throw new LLMProviderError(
        `Claude-Aufruf fehlgeschlagen: ${(err as Error).message}`,
        'claude',
        err,
      );
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      throw new LLMProviderError(
        'Claude hat kein tool_use-Block mit submit_protocol zurückgegeben',
        'claude',
      );
    }
    const parsed = ProtocolOutputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LLMProviderError(
        `Claude-Output verletzt Schema: ${parsed.error.message}`,
        'claude',
        parsed.error,
      );
    }
    return parsed.data;
  }
}
