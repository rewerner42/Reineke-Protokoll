import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Meeting, Protocol, TranscriptSegment } from '@reineke/shared';
import { formatGermanDate, formatDuration } from '@reineke/shared';
import { api } from '../lib/ipc.js';

export function MeetingDetailPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void Promise.all([
      api.meetings.get(id),
      api.transcription.listForMeeting(id),
      api.protocol.get(id),
    ]).then(([m, s, p]) => {
      setMeeting(m);
      setSegments(s);
      setProtocol(p);
    });
  }, [id]);

  const handleGenerate = async (): Promise<void> => {
    if (!id) return;
    setGenerating(true);
    setError(null);
    try {
      const p = await api.protocol.generate(id);
      setProtocol(p);
      navigate(`/meetings/${id}/protocol`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  if (!meeting) return <div className="p-6 text-slate-500">Lade …</div>;

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/meetings" className="text-sm text-slate-500 hover:text-slate-900">
        ← Zur Liste
      </Link>
      <h2 className="text-2xl font-semibold text-slate-900 mt-2">{meeting.title}</h2>
      <p className="text-sm text-slate-500 mt-1">
        {formatGermanDate(meeting.startedAt)} · Dauer:{' '}
        {formatDuration(meeting.startedAt, meeting.endedAt)}
      </p>

      <div className="mt-6 flex gap-3">
        {protocol ? (
          <Link
            to={`/meetings/${meeting.id}/protocol`}
            className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
          >
            Protokoll anzeigen
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || segments.filter((s) => s.isFinal).length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {generating ? 'Protokoll wird erstellt …' : '✨ Protokoll mit KI erzeugen'}
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-3">Fehler: {error}</p>}

      <div className="flex items-center justify-between mt-8 mb-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Transkript – <span className="text-slate-700 font-normal">{meeting.title}</span>
        </h3>
        {segments.filter((s) => s.isFinal).length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!id) return;
                const r = await api.transcript.exportMarkdown(id);
                if (r) alert(`Transkript exportiert: ${r.path}`);
              }}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-900 text-sm rounded-md hover:bg-slate-50"
            >
              Markdown
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!id) return;
                try {
                  const r = await api.pdf.exportTranscript(id);
                  if (r) alert(`Transkript als PDF exportiert: ${r.path}`);
                } catch (err) {
                  alert(`PDF-Export fehlgeschlagen: ${(err as Error).message}`);
                }
              }}
              className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800"
            >
              PDF
            </button>
          </div>
        )}
      </div>
      {segments.length === 0 ? (
        <p className="text-slate-500 italic">Kein Transkript vorhanden.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm leading-relaxed">
          {segments
            .filter((s) => s.isFinal)
            .map((s) => (
              <span key={s.id}>{s.text + ' '}</span>
            ))}
        </div>
      )}
    </div>
  );
}
