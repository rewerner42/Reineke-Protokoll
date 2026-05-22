import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import type { LLMProviderName, AppSettings } from '@reineke/shared';
import { SecureStoreService } from '../src/services/SecureStoreService';
import { SettingsStore } from '../src/services/SettingsStore';

export default function SettingsScreen(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasClaude, setHasClaude] = useState(false);
  const [hasOpenai, setHasOpenai] = useState(false);
  const [claudeKey, setClaudeKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');

  useEffect(() => {
    void SettingsStore.get().then(setSettings);
    void SecureStoreService.hasApiKey('claude').then(setHasClaude);
    void SecureStoreService.hasApiKey('openai').then(setHasOpenai);
  }, []);

  const switchProvider = async (provider: LLMProviderName): Promise<void> => {
    const next = await SettingsStore.set({ llmProvider: provider });
    setSettings(next);
  };

  const saveKey = async (provider: LLMProviderName, key: string): Promise<void> => {
    if (!key.trim()) return;
    await SecureStoreService.setApiKey(provider, key.trim());
    if (provider === 'claude') {
      setHasClaude(true);
      setClaudeKey('');
    } else {
      setHasOpenai(true);
      setOpenaiKey('');
    }
    Alert.alert('Gespeichert', `${provider}-API-Key wurde im SecureStore abgelegt.`);
  };

  if (!settings) return <Text style={{ padding: 16 }}>Lade…</Text>;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.section}>KI-Anbieter</Text>
      <View style={styles.providerRow}>
        {(['claude', 'openai'] as LLMProviderName[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => switchProvider(p)}
            style={[styles.providerCard, settings.llmProvider === p && styles.providerActive]}
          >
            <Text style={styles.providerLabel}>{p === 'claude' ? 'Claude' : 'OpenAI'}</Text>
            <Text style={styles.providerSub}>
              {p === 'claude' ? 'Anthropic' : 'GPT-4o'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Claude API-Key {hasClaude ? '(✓)' : ''}</Text>
      <TextInput
        secureTextEntry
        value={claudeKey}
        onChangeText={setClaudeKey}
        placeholder="sk-ant-..."
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={() => saveKey('claude', claudeKey)}>
        <Text style={styles.buttonText}>Speichern</Text>
      </Pressable>

      <Text style={styles.section}>OpenAI API-Key {hasOpenai ? '(✓)' : ''}</Text>
      <TextInput
        secureTextEntry
        value={openaiKey}
        onChangeText={setOpenaiKey}
        placeholder="sk-..."
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={() => saveKey('openai', openaiKey)}>
        <Text style={styles.buttonText}>Speichern</Text>
      </Pressable>

      <Text style={styles.hint}>
        API-Keys werden lokal im Keychain bzw. EncryptedSharedPreferences gespeichert. Sie
        verlassen das Gerät nur, wenn du ein Protokoll erzeugst — dann wird der Key direkt an
        den gewählten Anbieter geschickt.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  container: { padding: 16 },
  section: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 12, marginBottom: 6 },
  providerRow: { flexDirection: 'row', gap: 8 },
  providerCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  providerActive: { borderColor: '#0f172a', backgroundColor: '#e0e7ff' },
  providerLabel: { fontWeight: '600', color: '#0f172a' },
  providerSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  button: { backgroundColor: '#0f172a', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  hint: { fontSize: 12, color: '#64748b', marginTop: 16, lineHeight: 18 },
});
