import type { LLMProvider } from './LLMProvider.js';
import { LLMProviderError } from './LLMProvider.js';
import { PROTOCOL_SYSTEM_PROMPT, buildProtocolUserPrompt } from './prompts.js';
import type { ProtocolInput, ProtocolOutput } from '../models/schemas.js';
import { PROTOCOL_JSON_SCHEMA, ProtocolOutputSchema } from '../models/schemas.js';

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OllamaProviderOptions) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generateProtocol(input: ProtocolInput): Promise<ProtocolOutput> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: PROTOCOL_SYSTEM_PROMPT },
            { role: 'user', content: buildProtocolUserPrompt(input) },
          ],
          format: PROTOCOL_JSON_SCHEMA,
          stream: false,
          options: { temperature: 0.2 },
        }),
      });
    } catch (err) {
      throw new LLMProviderError(
        `Ollama-Aufruf fehlgeschlagen (${this.baseUrl} nicht erreichbar?): ${(err as Error).message}`,
        'ollama',
        err,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LLMProviderError(
        `Ollama HTTP ${response.status}: ${body.slice(0, 500)}`,
        'ollama',
      );
    }

    let payload: { message?: { content?: string }; error?: string };
    try {
      payload = (await response.json()) as typeof payload;
    } catch (err) {
      throw new LLMProviderError(
        `Ollama hat kein JSON zurückgegeben: ${(err as Error).message}`,
        'ollama',
        err,
      );
    }
    if (payload.error) {
      throw new LLMProviderError(`Ollama-Fehler: ${payload.error}`, 'ollama');
    }
    const content = payload.message?.content;
    if (!content) {
      throw new LLMProviderError('Ollama hat keinen Inhalt zurückgegeben', 'ollama');
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch (err) {
      throw new LLMProviderError(
        `Ollama-Output ist kein gültiges JSON: ${(err as Error).message}. Erste 200 Zeichen: ${content.slice(0, 200)}`,
        'ollama',
        err,
      );
    }
    const parsed = ProtocolOutputSchema.safeParse(json);
    if (!parsed.success) {
      throw new LLMProviderError(
        `Ollama-Output verletzt Schema: ${parsed.error.message}`,
        'ollama',
        parsed.error,
      );
    }
    return parsed.data;
  }
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ollama /api/tags HTTP ${res.status}`);
  const data = (await res.json()) as { models?: { name?: string }[] };
  return (data.models ?? []).map((m) => m.name ?? '').filter((n) => n.length > 0);
}
