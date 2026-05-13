import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import type { LLMProviderName } from '@reineke/shared';
import { SecureStoreService } from '../src/services/SecureStoreService';

export default function SettingsScreen(): JSX.Element {
  const [hasClaude, setHasClaude] = useState(false);
  const [hasOpenai, setHasOpenai] = useState(false);
  const [claudeKey, setClaudeKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');

  useEffect(() => {
    void SecureStoreService.hasApiKey('claude').then(setHasClaude);
    void SecureStoreService.hasApiKey('openai').then(setHasOpenai);
  }, []);

  const save = async (provider: LLMProviderName, key: string): Promise<void> => {
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

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#f8fafc' }}>
      <Text style={styles.section}>Claude API-Key {hasClaude ? '(✓)' : ''}</Text>
      <TextInput
        secureTextEntry
        value={claudeKey}
        onChangeText={setClaudeKey}
        placeholder="sk-ant-..."
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={() => save('claude', claudeKey)}>
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
      <Pressable style={styles.button} onPress={() => save('openai', openaiKey)}>
        <Text style={styles.buttonText}>Speichern</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 12, marginBottom: 6 },
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
});
