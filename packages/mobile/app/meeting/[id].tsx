import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  formatGermanDate,
  formatDuration,
  type Meeting,
  type TranscriptSegment,
  type Protocol,
  ProtocolGenerator,
  createLLMProvider,
} from '@reineke/shared';
import { getAppContext } from '../../src/services/AppContext';
import { SecureStoreService } from '../../src/services/SecureStoreService';
import { DEFAULT_SETTINGS } from '@reineke/shared';

export default function MeetingDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const ctx = getAppContext();
    setMeeting(ctx.meetings.get(id));
    setSegments(ctx.transcripts.listForMeeting(id));
    setProtocol(ctx.protocols.getByMeetingId(id));
  }, [id]);

  const generate = async (): Promise<void> => {
    if (!meeting) return;
    setBusy(true);
    try {
      const settings = DEFAULT_SETTINGS;
      const apiKey = await SecureStoreService.getApiKey(settings.llmProvider);
      if (!apiKey) {
        Alert.alert('API-Key fehlt', 'Bitte einen API-Key in den Einstellungen hinterlegen.');
        return;
      }
      const provider = createLLMProvider({
        name: settings.llmProvider,
        apiKey,
        model:
          settings.llmProvider === 'claude' ? settings.claudeModel : settings.openaiModel,
      });
      const ctx = getAppContext();
      const gen = new ProtocolGenerator({
        meetings: ctx.meetings,
        transcripts: ctx.transcripts,
        protocols: ctx.protocols,
        provider,
      });
      const p = await gen.generate(meeting.id);
      setProtocol(p);
      router.push(`/protocol/${meeting.id}`);
    } catch (err) {
      Alert.alert('Fehler', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!meeting) return <Text style={{ padding: 16 }}>Lade…</Text>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{meeting.title}</Text>
      <Text style={styles.meta}>
        {formatGermanDate(meeting.startedAt)} · {formatDuration(meeting.startedAt, meeting.endedAt)}
      </Text>

      {protocol ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push(`/protocol/${meeting.id}`)}
        >
          <Text style={styles.primaryButtonText}>Protokoll öffnen</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.primaryButton} onPress={generate} disabled={busy}>
          <Text style={styles.primaryButtonText}>
            {busy ? 'Generiere…' : '✨ Protokoll erzeugen'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.section}>Transkript</Text>
      {segments.filter((s) => s.isFinal).length === 0 ? (
        <Text style={styles.empty}>Kein Transkript vorhanden.</Text>
      ) : (
        segments
          .filter((s) => s.isFinal)
          .map((s) => (
            <Text key={s.id} style={styles.segment}>
              {s.text}
            </Text>
          ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#059669',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginTop: 8, marginBottom: 8 },
  empty: { color: '#64748b', fontStyle: 'italic' },
  segment: { color: '#0f172a', marginBottom: 4, lineHeight: 20 },
});
