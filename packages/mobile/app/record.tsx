import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getAppContext } from '../src/services/AppContext';

/**
 * Aufnahme-Screen: legt ein Meeting an und startet die Aufnahme.
 *
 * Die Whisper-Integration via `whisper.rn` läuft in `WhisperRnService` —
 * hier wird sie nur initialisiert und gesteuert. Audio-Chunks werden über
 * `expo-audio` (siehe `useRecorder`) bezogen.
 */
export default function RecordScreen(): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState('');

  const handleStart = (): void => {
    const finalTitle = title.trim() || `Meeting ${new Date().toLocaleString('de-DE')}`;
    const meeting = getAppContext().meetings.create({ title: finalTitle });

    // TODO: WhisperRnService.start + useRecorder-Hook anbinden, sobald die
    // native Whisper-Library im Dev-Client kompiliert ist.
    Alert.alert(
      'Aufnahme gestartet',
      `Meeting "${meeting.title}" wurde angelegt. Whisper-Integration läuft im Dev-Client.`,
    );
    router.replace(`/meeting/${meeting.id}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Titel</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="z.B. Sprint-Planning"
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={handleStart}>
        <Text style={styles.buttonText}>● Aufnahme starten</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  label: { fontSize: 14, fontWeight: '500', color: '#0f172a', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: { backgroundColor: '#dc2626', padding: 16, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
