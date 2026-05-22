import type { LLMProvider } from './LLMProvider.js';
import { LLMProviderError } from './LLMProvider.js';
import { PROTOCOL_SYSTEM_PROMPT, buildProtocolUserPrompt } from './prompts.js';
import type { ProtocolInput, ProtocolOutput } from '../models/schemas.js';
import { PROTOCOL_JSON_SCHEMA, ProtocolOutputSchema } from '../models/schemas.js';

const REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama' as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(opts: OllamaProviderOptions) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async generateProtocol(input: ProtocolInput): Promise<ProtocolOutput> {
    let response: Response;
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), this.requestTimeoutMs);
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: abort.signal,
        // @ts-expect-error undici-only options for long-running model calls
        dispatcher: getLongTimeoutDispatcher(),
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
      clearTimeout(abortTimer);
    } catch (err) {
      clearTimeout(abortTimer);
      const msg = (err as Error).message ?? String(err);
      const isTimeout =
        /HeadersTimeoutError|BodyTimeoutError|abort/i.test(msg) ||
        (err as Error).name === 'AbortError';
      throw new LLMProviderError(
        isTimeout
          ? `Ollama-Aufruf hat zu lange gedauert (>${Math.round(this.requestTimeoutMs / 60000)} min). Das Modell ${this.model} ist für die Transkript-Länge wahrscheinlich zu langsam — probier ein kleineres Modell oder Claude/OpenAI.`
          : `Ollama-Aufruf fehlgeschlagen (${this.baseUrl} nicht erreichbar?): ${msg}`,
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

let cachedDispatcher: unknown = null;
let dispatcherAttempted = false;
function getLongTimeoutDispatcher(): unknown {
  if (dispatcherAttempted) return cachedDispatcher;
  dispatcherAttempted = true;
  try {
    // Lazy CJS-require via createRequire — undici is built into Node/Electron.
    // The Browser code path never calls this function.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require('node:module') as {
      createRequire: (url: string) => NodeJS.Require;
    };
    const req = createRequire(import.meta.url);
    const undici = req('undici') as {
      Agent: new (opts: Record<string, unknown>) => unknown;
    };
    cachedDispatcher = new undici.Agent({
      // Reasoning models like gpt-oss can think for >5 min before the first
      // byte. Node's default headersTimeout is 300 s, which kills the
      // request. We give them up to an hour for both the header and the
      // body, plus generous keep-alive so the socket survives.
      headersTimeout: 60 * 60 * 1000,
      bodyTimeout: 60 * 60 * 1000,
      keepAliveTimeout: 60 * 60 * 1000,
      keepAliveMaxTimeout: 60 * 60 * 1000,
    });
  } catch {
    cachedDispatcher = null;
  }
  return cachedDispatcher;
}
