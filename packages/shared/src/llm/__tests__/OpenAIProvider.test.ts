import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../OpenAIProvider.js';
import { LLMProviderError } from '../LLMProvider.js';

interface FakeClient {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
}

function fakeClient(create: FakeClient['chat']['completions']['create']): FakeClient {
  return { chat: { completions: { create } } };
}

const validOutput = {
  summary: 'Zusammenfassung',
  participants: [{ name: 'Alice', role: 'PM' }],
  todos: [{ description: 'Aufgabe', owner: 'Alice', deadline: null }],
  decisions: ['Entscheidung 1'],
  discussionPoints: [],
};

describe('OpenAIProvider', () => {
  it('nutzt json_schema strict und parst das Ergebnis', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validOutput) } }],
    });
    const provider = new OpenAIProvider({
      apiKey: 'test',
      model: 'gpt-4o-2024-11-20',
      client: fakeClient(create) as never,
    });

    const out = await provider.generateProtocol({ transcript: 'Test', language: 'de' });

    const call = create.mock.calls[0]![0];
    expect(call.model).toBe('gpt-4o-2024-11-20');
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[0].content).toContain('Protokollant');

    expect(out.summary).toBe('Zusammenfassung');
  });

  it('wirft LLMProviderError bei ungültigem JSON', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{ invalid json' } }],
    });
    const provider = new OpenAIProvider({
      apiKey: 'test',
      model: 'gpt-4o-2024-11-20',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toBeInstanceOf(LLMProviderError);
  });

  it('wirft LLMProviderError bei Schema-Verletzung', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ summary: '' }) } }],
    });
    const provider = new OpenAIProvider({
      apiKey: 'test',
      model: 'gpt-4o-2024-11-20',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toBeInstanceOf(LLMProviderError);
  });

  it('wirft LLMProviderError bei leerer Antwort', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: null } }] });
    const provider = new OpenAIProvider({
      apiKey: 'test',
      model: 'gpt-4o-2024-11-20',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toBeInstanceOf(LLMProviderError);
  });
});
