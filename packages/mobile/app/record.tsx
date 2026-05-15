import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { TranscriptSegment, WhisperModelSize } from '@reineke/shared';
import { getAppContext } from '../src/services/AppContext';
import { getWhisperService } from '../src/services/WhisperRnService';
import { ensureMicrophonePermission } from '../src/services/AudioPermissions';

const DEFAULT_MODEL: WhisperModelSize = 'tiny';

type Phase = 'idle' | 'preparing' | 'recording' | 'stopping';

export default function RecordScreen(): JSX.Element {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const meetingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const whisper = getWhisperService();
    const unsubscribe = whisper.onSegment((segment) => {
      const ctx = getAppContext();
      if (segment.isFinal) {
        ctx.transcripts.insert({
          meetingId: segment.meetingId,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          speakerLabel: segment.speakerLabel,
          isFinal: true,
        });
      }
      setSegments((prev) => mergeSegment(prev, segment));
    });
    return unsubscribe;
  }, []);

  const handleStart = async (): Promise<void> => {
    setError(null);
    const ok = await ensureMicrophonePermission();
    if (!ok) {
      Alert.alert(
        'Mikrofon-Zugriff fehlt',
        'Bitte erlaube Reineke den Zugriff auf das Mikrofon in den Einstellungen.',
      );
      return;
    }

    const finalTitle = title.trim() || `Meeting ${new Date().toLocaleString('de-DE')}`;
    const meeting = getAppContext().meetings.create({ title: finalTitle });
    meetingIdRef.current = meeting.id;
    setSegments([]);
    setPhase('preparing');

    try {
      const whisper = getWhisperService();
      await whisper.init(DEFAULT_MODEL, (p) => setProgress(p));
      setProgress(null);
      await whisper.startRealtime(meeting.id, 'auto');
      setPhase('recording');
    } catch (err) {
      setError((err as Error).message);
      setPhase('idle');
    }
  };

  const handleStop = async (): Promise<void> => {
    setPhase('stopping');
    try {
      await getWhisperService().stop();
      const meetingId = meetingIdRef.current;
      if (meetingId) {
        getAppContext().meetings.update(meetingId, {
          status: 'completed',
          endedAt: new Date().toISOString(),
        });
        router.replace(`/meeting/${meetingId}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPhase('idle');
      meetingIdRef.current = null;
    }
  };

  if (phase === 'idle') {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Titel</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="z.B. Sprint-Planning"
          style={styles.input}
        />
        <Pressable style={styles.recordButton} onPress={handleStart}>
          <Text style={styles.recordButtonText}>● Aufnahme starten</Text>
        </Pressable>
        <Text style={styles.hint}>
          Beim ersten Start wird ein Whisper-Modell (~39 MB) heruntergeladen.
        </Text>
        {error && <Text style={styles.error}>Fehler: {error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {phase === 'preparing' && (
        <View>
          <Text style={styles.statusLine}>
            {progress
              ? `Modell wird geladen … ${Math.round((progress.received / Math.max(progress.total, 1)) * 100)}%`
              : 'Whisper wird vorbereitet …'}
          </Text>
        </View>
      )}

      {(phase === 'recording' || phase === 'stopping') && (
        <View style={styles.recordingBox}>
          <Text style={styles.recordingHeader}>● Aufnahme läuft</Text>
          <ScrollView style={styles.transcript}>
            {segments.length === 0 ? (
              <Text style={styles.placeholderText}>
                Live-Transkript erscheint hier, sobald die ersten Worte gesprochen werden …
              </Text>
            ) : (
              segments.map((s) => (
                <Text
                  key={s.id}
                  style={[styles.segment, !s.isFinal && styles.segmentProvisional]}
                >
                  {s.text + ' '}
                </Text>
              ))
            )}
          </ScrollView>
          <Pressable
            style={styles.stopButton}
            onPress={handleStop}
            disabled={phase === 'stopping'}
          >
            <Text style={styles.stopButtonText}>
              {phase === 'stopping' ? 'Stoppe …' : '■ Stopp'}
            </Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>Fehler: {error}</Text>}
    </View>
  );
}

function mergeSegment(prev: TranscriptSegment[], next: TranscriptSegment): TranscriptSegment[] {
  if (next.isFinal) {
    const finals = prev.filter((s) => s.isFinal && s.endMs < next.startMs);
    const stillProvisional = prev.filter((s) => !s.isFinal && s.startMs >= next.endMs);
    return [...finals, next, ...stillProvisional];
  }
  const finals = prev.filter((s) => s.isFinal);
  return [...finals, next];
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
  recordButton: {
    backgroundColor: '#dc2626',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 12 },
  statusLine: { color: '#0f172a', fontSize: 16, textAlign: 'center', marginTop: 32 },
  recordingBox: { flex: 1 },
  recordingHeader: { color: '#dc2626', fontWeight: '700', fontSize: 16, marginBottom: 12 },
  transcript: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  placeholderText: { color: '#94a3b8', fontStyle: 'italic' },
  segment: { color: '#0f172a', lineHeight: 22 },
  segmentProvisional: { color: '#94a3b8', fontStyle: 'italic' },
  stopButton: {
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#b91c1c', marginTop: 12, fontSize: 14 },
});
