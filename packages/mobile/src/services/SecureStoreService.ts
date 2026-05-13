import * as SecureStore from 'expo-secure-store';
import type { LLMProviderName } from '@reineke/shared';

const keyFor = (provider: LLMProviderName): string => `reineke-${provider}-api-key`;

export const SecureStoreService = {
  async setApiKey(provider: LLMProviderName, key: string): Promise<void> {
    await SecureStore.setItemAsync(keyFor(provider), key);
  },
  async getApiKey(provider: LLMProviderName): Promise<string | null> {
    return SecureStore.getItemAsync(keyFor(provider));
  },
  async hasApiKey(provider: LLMProviderName): Promise<boolean> {
    const v = await SecureStore.getItemAsync(keyFor(provider));
    return !!v && v.length > 0;
  },
};
