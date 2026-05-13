import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TranscriptSegment } from '@reineke/shared';
import { api } from '../lib/ipc.js';
import { useRecorder } from '../hooks/useRecorder.js';

export function RecordingPage(): JSX.Element {
  const navigate = useNavigate();
  const recorder = useRecorder();
  const [title, setTitle] = useState('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!meetingId) return;
    const unsubscribe = api.transcription.onSegment((segment) => {
      if (segment.meetingId !== meetingId) return;
      setSegments((prev) => mergeSegment(prev, segment));
    });
    return unsubscribe;
  }, [meetingId]);

  useEffect(() => {
    if (!recorder.isRecording) return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recorder.isRecording]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [segments]);

  const handleStart = async (): Promise<void> => {
    const finalTitle = title.trim() || `Meeting ${new Date().toLocaleString('de-DE')}`;
    const meeting = await api.meetings.create({ title: finalTitle });
    setMeetingId(meeting.id);
    setSegments([]);
    setElapsedSec(0);
    await recorder.start(meeting.id);
  };

  const handleStop = async (): Promise<void> => {
    await recorder.stop();
    if (meetingId) navigate(`/meetings/${meetingId}`);
  };

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-semibold text-slate-900 mb-4">Aufnahme</h2>

      {!recorder.isRecording && !meetingId && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <label className="block text-sm font-medium text-slate-700 mb-2" htmlFor="title">
            Titel des Meetings
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z.B. Wochen-Sync Engineering"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4"
          />
          <button
            type="button"
            onClick={handleStart}
            disabled={recorder.isPreparing}
            className="px-6 py-3 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {recorder.isPreparing ? 'Mikrofon wird vorbereitet …' : '● Aufnahme starten'}
          </button>
          {recorder.error && (
            <p className="text-red-600 text-sm mt-3">Fehler: {recorder.error}</p>
          )}
        </div>
      )}

      {recorder.isRecording && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-red-600 font-semibold flex items-center gap-2">
                <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse" /> Aufnahme läuft
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {formatTimer(elapsedSec)} · Pegel: {Math.round(recorder.level * 100)}%
              </div>
            </div>
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              ■ Stopp
            </button>
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, recorder.level * 100)}%` }}
            />
          </div>

          <div
            ref={scrollRef}
            className="h-96 overflow-auto bg-slate-50 border border-slate-200 rounded p-4 text-sm leading-relaxed"
          >
            {segments.length === 0 ? (
              <p className="text-slate-400 italic">Live-Transkript erscheint hier …</p>
            ) : (
              segments.map((s) => (
                <span
                  key={s.id}
                  className={s.isFinal ? 'text-slate-900' : 'text-slate-400 italic'}
                >
                  {s.text + ' '}
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function mergeSegment(prev: TranscriptSegment[], next: TranscriptSegment): TranscriptSegment[] {
  if (next.isFinal) {
    const filtered = prev.filter((s) => s.isFinal || s.endMs <= next.startMs);
    return [...filtered, next];
  }
  const finals = prev.filter((s) => s.isFinal);
  return [...finals, next];
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
