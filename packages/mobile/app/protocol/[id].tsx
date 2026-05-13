import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Switch } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import type { Protocol } from '@reineke/shared';
import { getAppContext } from '../../src/services/AppContext';

export default function ProtocolScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [protocol, setProtocol] = useState<Protocol | null>(null);

  useEffect(() => {
    if (!id) return;
    setProtocol(getAppContext().protocols.getByMeetingId(id));
  }, [id]);

  const handleToggle = (todoId: string, done: boolean): void => {
    const ctx = getAppContext();
    ctx.protocols.setTodoDone(todoId, done);
    if (id) setProtocol(ctx.protocols.getByMeetingId(id));
  };

  const handleShare = async (): Promise<void> => {
    if (!protocol) return;
    const file = `${FileSystem.documentDirectory ?? ''}protokoll-${protocol.id}.md`;
    await FileSystem.writeAsStringAsync(file, protocol.markdown);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file, { mimeType: 'text/markdown' });
    }
  };

  if (!protocol) return <Text style={{ padding: 16 }}>Kein Protokoll.</Text>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 16 }}>
      <Pressable style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareText}>Teilen / Exportieren</Text>
      </Pressable>

      <Section title="Zusammenfassung">
        <Text style={styles.body}>{protocol.summary}</Text>
      </Section>

      <Section title="Teilnehmer">
        {protocol.participants.map((p) => (
          <Text key={p.id} style={styles.body}>
            • {p.name}
            {p.role ? ` (${p.role})` : ''}
          </Text>
        ))}
      </Section>

      <Section title="To-Dos">
        {protocol.todos.map((t) => (
          <View key={t.id} style={styles.todoRow}>
            <Switch value={t.done} onValueChange={(v) => handleToggle(t.id, v)} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.body, t.done && styles.done]}>{t.description}</Text>
              <Text style={styles.meta}>
                {t.owner ?? 'kein Owner'} · {t.deadline ?? 'keine Deadline'}
              </Text>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Entscheidungen">
        {protocol.decisions.map((d, i) => (
          <Text key={i} style={styles.body}>
            • {d}
          </Text>
        ))}
      </Section>

      <Section title="Diskussionspunkte">
        {protocol.discussionPoints.map((d, i) => (
          <Text key={i} style={styles.body}>
            • {d}
          </Text>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shareButton: { backgroundColor: '#0f172a', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  shareText: { color: '#fff', fontWeight: '600' },
  section: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  body: { color: '#0f172a', lineHeight: 20 },
  done: { textDecorationLine: 'line-through', color: '#94a3b8' },
  meta: { fontSize: 12, color: '#64748b' },
  todoRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
});
