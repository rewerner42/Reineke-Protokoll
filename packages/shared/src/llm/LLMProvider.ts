import type { ProtocolInput, ProtocolOutput } from '../models/schemas.js';
import type { LLMProviderName } from '../models/Protocol.js';

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  generateProtocol(input: ProtocolInput): Promise<ProtocolOutput>;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: LLMProviderName,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
