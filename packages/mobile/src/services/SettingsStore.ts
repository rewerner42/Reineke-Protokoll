import * as SecureStore from 'expo-secure-store';
import type { AppSettings, LLMProviderName } from '@reineke/shared';
import { DEFAULT_SETTINGS } from '@reineke/shared';

const SETTINGS_KEY = 'reineke-app-settings';

export const SettingsStore = {
  async get(): Promise<AppSettings> {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  async set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(next));
    return next;
  },
  async setProvider(provider: LLMProviderName): Promise<void> {
    await this.set({ llmProvider: provider });
  },
};
