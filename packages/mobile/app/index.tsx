import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { formatGermanDate, formatDuration, type Meeting } from '@reineke/shared';
import { getAppContext } from '../src/services/AppContext';

export default function MeetingListScreen(): JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    setMeetings(getAppContext().meetings.list());
  }, []);

  return (
    <View style={styles.container}>
      <Link href="/record" asChild>
        <Pressable style={styles.recordButton}>
          <Text style={styles.recordText}>● Neue Aufnahme starten</Text>
        </Pressable>
      </Link>
      <Link href="/settings" asChild>
        <Pressable style={styles.linkRow}>
          <Text style={styles.linkText}>⚙ Einstellungen</Text>
        </Pressable>
      </Link>
      <FlatList
        data={meetings}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={
          <Text style={styles.empty}>Noch keine Meetings aufgenommen.</Text>
        }
        renderItem={({ item }) => (
          <Link href={`/meeting/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {formatGermanDate(item.startedAt)} · {formatDuration(item.startedAt, item.endedAt)}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  recordButton: {
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  recordText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  linkRow: { padding: 12, marginBottom: 12 },
  linkText: { color: '#0f172a' },
  row: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontWeight: '600', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
});
