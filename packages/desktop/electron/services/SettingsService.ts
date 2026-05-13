import { promises as fs } from 'node:fs';
import path from 'node:path';
import keytar from 'keytar';
import type { AppSettings, LLMProviderName } from '@reineke/shared';
import { DEFAULT_SETTINGS } from '@reineke/shared';

const KEYTAR_SERVICE = 'Reineke-Protokoll';

function accountFor(provider: LLMProviderName): string {
  return `${provider}-api-key`;
}

export class SettingsService {
  private cached: AppSettings | null = null;

  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    if (this.cached) return this.cached;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      this.cached = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      this.cached = { ...DEFAULT_SETTINGS };
      await this.persist();
    }
    return this.cached;
  }

  async set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    this.cached = { ...current, ...patch };
    await this.persist();
    return this.cached;
  }

  async setApiKey(provider: LLMProviderName, key: string): Promise<void> {
    await keytar.setPassword(KEYTAR_SERVICE, accountFor(provider), key);
  }

  async hasApiKey(provider: LLMProviderName): Promise<boolean> {
    const value = await keytar.getPassword(KEYTAR_SERVICE, accountFor(provider));
    return !!value && value.length > 0;
  }

  async getApiKey(provider: LLMProviderName): Promise<string | null> {
    return keytar.getPassword(KEYTAR_SERVICE, accountFor(provider));
  }

  private async persist(): Promise<void> {
    if (!this.cached) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.cached, null, 2), 'utf8');
  }
}
