import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useRecorderStore } from '../hooks/useRecorderStore.js';

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`;

export function AppShell(): JSX.Element {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-slate-100 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-lg font-semibold text-slate-900">Reineke-Protokoll</h1>
          <p className="text-xs text-slate-500 mt-1">Meetings · Transkripte · KI-Protokolle</p>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          <NavLink to="/meetings" className={linkClass}>
            Meetings
          </NavLink>
          <NavLink to="/record" className={linkClass}>
            Aufnehmen
          </NavLink>
          <NavLink to="/settings" className={linkClass}>
            Einstellungen
          </NavLink>
        </nav>
        <RecordingIndicator />
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function RecordingIndicator(): JSX.Element | null {
  const navigate = useNavigate();
  const isRecording = useRecorderStore((s) => s.isRecording);
  const meetingId = useRecorderStore((s) => s.meetingId);
  const meetingTitle = useRecorderStore((s) => s.meetingTitle);
  const startedAt = useRecorderStore((s) => s.startedAt);
  const level = useRecorderStore((s) => s.level);
  const stop = useRecorderStore((s) => s.stop);
  const segmentsCount = useRecorderStore((s) => s.segments.length);

  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isRecording || !startedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = (): void => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRecording, startedAt]);

  if (!isRecording) return null;

  const handleStop = async (): Promise<void> => {
    const id = await stop();
    if (id) navigate(`/meetings/${id}`);
  };

  return (
    <div className="mt-auto p-3 border-t border-slate-200">
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-700 text-sm font-semibold mb-1">
          <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" /> Aufnahme läuft
        </div>
        {meetingTitle && (
          <div className="text-xs text-slate-700 truncate mb-1" title={meetingTitle}>
            {meetingTitle}
          </div>
        )}
        <div className="text-xs text-slate-500 mb-2 tabular-nums">
          {formatTimer(elapsedSec)} · {segmentsCount} Segmente
        </div>
        <div className="h-1 bg-slate-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${Math.min(100, level * 100)}%` }}
          />
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => meetingId && navigate('/record')}
            className="flex-1 px-2 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs rounded hover:bg-slate-50"
          >
            Öffnen
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="flex-1 px-2 py-1.5 bg-slate-900 text-white text-xs rounded hover:bg-slate-800"
          >
            ■ Stopp
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
