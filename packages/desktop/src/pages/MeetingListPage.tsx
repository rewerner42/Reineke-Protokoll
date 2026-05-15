import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Meeting } from '@reineke/shared';
import { api } from '../lib/ipc.js';
import { formatGermanDate, formatDuration } from '@reineke/shared';

export function MeetingListPage(): JSX.Element {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = (): void => {
      api.meetings
        .list()
        .then((m) => {
          setMeetings(m);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    refresh();
    const unsubscribe = api.speakers.onDiarizationStatus(() => refresh());
    return unsubscribe;
  }, []);

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('Meeting wirklich löschen?')) return;
    await api.meetings.delete(id);
    setMeetings(await api.meetings.list());
  };

  if (loading) return <div className="p-6 text-slate-500">Lade …</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Meetings</h2>
        <Link
          to="/record"
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800"
        >
          + Neue Aufnahme
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-lg p-12 text-center text-slate-500">
          <p>Noch keine Meetings aufgenommen.</p>
          <Link to="/record" className="text-slate-900 font-medium underline mt-2 inline-block">
            Erste Aufnahme starten
          </Link>
        </div>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0"
            >
              <Link to={`/meetings/${m.id}`} className="flex-1">
                <div className="font-medium text-slate-900">{m.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatGermanDate(m.startedAt)} · Dauer: {formatDuration(m.startedAt, m.endedAt)} ·{' '}
                  <StatusBadge status={m.status} />
                </div>
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Meeting['status'] }): JSX.Element {
  const label =
    status === 'recording'
      ? 'läuft'
      : status === 'diarizing'
        ? 'Sprecher werden erkannt …'
        : status === 'completed'
          ? 'abgeschlossen'
          : 'archiviert';
  const color =
    status === 'recording'
      ? 'text-red-600'
      : status === 'diarizing'
        ? 'text-amber-600'
        : status === 'completed'
          ? 'text-green-700'
          : 'text-slate-500';
  return <span className={color}>{label}</span>;
}
