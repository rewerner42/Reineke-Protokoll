import { describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from '../ClaudeProvider.js';
import { LLMProviderError } from '../LLMProvider.js';

interface FakeClient {
  messages: {
    create: ReturnType<typeof vi.fn>;
  };
}

function fakeClient(create: FakeClient['messages']['create']): FakeClient {
  return { messages: { create } };
}

describe('ClaudeProvider', () => {
  it('ruft die Claude-API mit dem submit_protocol-Tool auf und parst den Output', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'submit_protocol',
          id: 'toolu_1',
          input: {
            summary: 'Zusammenfassung des Meetings.',
            participants: [{ name: 'Alice', role: 'PM' }],
            todos: [{ description: 'Aufgabe', owner: 'Alice', deadline: null }],
            decisions: ['Entscheidung X'],
            discussionPoints: ['Punkt Y'],
          },
        },
      ],
    });
    const provider = new ClaudeProvider({
      apiKey: 'test',
      model: 'claude-sonnet-4-5-20250929',
      client: fakeClient(create) as unknown as ConstructorParameters<typeof ClaudeProvider>[0]['client'],
    });

    const out = await provider.generateProtocol({
      transcript: 'Test',
      language: 'de',
      meetingTitle: 'Test-Meeting',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0]![0];
    expect(call.model).toBe('claude-sonnet-4-5-20250929');
    expect(call.tools[0].name).toBe('submit_protocol');
    expect(call.tool_choice).toEqual({ type: 'tool', name: 'submit_protocol' });
    expect(call.system).toContain('Protokollant');
    expect(call.messages[0].content).toContain('Test-Meeting');

    expect(out.summary).toBe('Zusammenfassung des Meetings.');
    expect(out.participants).toHaveLength(1);
  });

  it('wirft LLMProviderError wenn kein tool_use-Block zurückkommt', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'oops' }],
    });
    const provider = new ClaudeProvider({
      apiKey: 'test',
      model: 'claude-sonnet-4-5-20250929',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toBeInstanceOf(LLMProviderError);
  });

  it('wirft LLMProviderError wenn der Output das Schema verletzt', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'submit_protocol',
          id: 'toolu_x',
          input: { summary: '', participants: [], todos: [], decisions: [], discussionPoints: [] },
        },
      ],
    });
    const provider = new ClaudeProvider({
      apiKey: 'test',
      model: 'claude-sonnet-4-5-20250929',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toBeInstanceOf(LLMProviderError);
  });

  it('wirft LLMProviderError bei API-Fehler', async () => {
    const create = vi.fn().mockRejectedValue(new Error('Rate limit'));
    const provider = new ClaudeProvider({
      apiKey: 'test',
      model: 'claude-sonnet-4-5-20250929',
      client: fakeClient(create) as never,
    });
    await expect(
      provider.generateProtocol({ transcript: 'x', language: 'de' }),
    ).rejects.toThrow(/Rate limit/);
  });
});
