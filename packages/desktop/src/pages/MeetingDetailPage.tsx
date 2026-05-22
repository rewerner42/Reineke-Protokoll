import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Meeting, Protocol, SpeakerMapping, TranscriptSegment } from '@reineke/shared';
import { formatGermanDate, formatDuration } from '@reineke/shared';
import { api } from '../lib/ipc.js';

export function MeetingDetailPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = (): void => {
      void Promise.all([
        api.meetings.get(id),
        api.transcription.listForMeeting(id),
        api.protocol.get(id),
        api.speakers.listForMeeting(id),
      ]).then(([m, s, p, sp]) => {
        setMeeting(m);
        setSegments(s);
        setProtocol(p);
        setSpeakerMappings(sp);
      });
    };
    load();
    const unsubscribe = api.speakers.onDiarizationStatus((status) => {
      if (status.meetingId === id) load();
    });
    return unsubscribe;
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

  const rawSpeakerLabels = useMemo(() => {
    const set = new Set<string>();
    for (const s of segments) {
      if (s.speakerLabel) set.add(s.speakerLabel);
    }
    return Array.from(set).sort();
  }, [segments]);

  const displayNameFor = (rawLabel: string | null): string | null => {
    if (!rawLabel) return null;
    const mapping = speakerMappings.find((m) => m.rawLabel === rawLabel);
    return mapping?.displayName ?? rawLabel;
  };

  const handleRename = async (rawLabel: string, displayName: string): Promise<void> => {
    if (!id) return;
    await api.speakers.rename(id, rawLabel, displayName);
    setSpeakerMappings(await api.speakers.listForMeeting(id));
  };

  if (!meeting) return <div className="p-6 text-slate-500">Lade …</div>;

  const finalSegments = segments.filter((s) => s.isFinal);
  const isDiarizing = meeting.status === 'diarizing';

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/meetings" className="text-sm text-slate-500 hover:text-slate-900">
        ← Zur Liste
      </Link>
      <h2 className="text-2xl font-semibold text-slate-900 mt-2">{meeting.title}</h2>
      <p className="text-sm text-slate-500 mt-1">
        {formatGermanDate(meeting.startedAt)} · Dauer:{' '}
        {formatDuration(meeting.startedAt, meeting.endedAt)}
        {meeting.language && <> · Sprache: {meeting.language === 'de' ? 'Deutsch' : 'Englisch'}</>}
      </p>

      {isDiarizing && (
        <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2 text-sm">
          Sprecher-Erkennung läuft im Hintergrund … Das kann je nach Aufnahmelänge ein paar Minuten dauern.
        </div>
      )}

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
            disabled={generating || finalSegments.length === 0 || isDiarizing}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {generating ? 'Protokoll wird erstellt …' : '✨ Protokoll mit KI erzeugen'}
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-3">Fehler: {error}</p>}

      {meeting.audioPath && (
        <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Aufnahme</h3>
          <audio
            controls
            preload="metadata"
            src={`reineke-audio://meeting/${meeting.id}.wav`}
            className="w-full"
          />
        </div>
      )}

      {rawSpeakerLabels.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-slate-900 mt-8 mb-3">Sprecher</h3>
          <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
            {rawSpeakerLabels.map((rawLabel) => (
              <SpeakerEditor
                key={rawLabel}
                rawLabel={rawLabel}
                displayName={
                  speakerMappings.find((m) => m.rawLabel === rawLabel)?.displayName ?? ''
                }
                onSave={(name) => handleRename(rawLabel, name)}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-8 mb-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Transkript – <span className="text-slate-700 font-normal">{meeting.title}</span>
        </h3>
        {finalSegments.length > 0 && (
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
      {finalSegments.length === 0 ? (
        <p className="text-slate-500 italic">Kein Transkript vorhanden.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm leading-relaxed space-y-2">
          {groupBySpeaker(finalSegments).map((group, idx) => (
            <div key={idx}>
              {group.speakerLabel && (
                <span className="font-semibold text-slate-700 mr-2">
                  {displayNameFor(group.speakerLabel)}:
                </span>
              )}
              <span>{group.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeakerEditor(props: {
  rawLabel: string;
  displayName: string;
  onSave: (name: string) => Promise<void>;
}): JSX.Element {
  const [value, setValue] = useState(props.displayName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(props.displayName);
  }, [props.displayName]);

  const handleSave = async (): Promise<void> => {
    if (value === props.displayName) return;
    setSaving(true);
    try {
      await props.onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-20 shrink-0">{props.rawLabel}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Name eingeben …"
        className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm"
        disabled={saving}
      />
    </div>
  );
}

interface SpeakerGroup {
  speakerLabel: string | null;
  text: string;
}

function groupBySpeaker(segments: TranscriptSegment[]): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    const text = seg.text.trim();
    if (text.length === 0) continue;
    if (last && last.speakerLabel === seg.speakerLabel) {
      last.text = `${last.text} ${text}`;
    } else {
      groups.push({ speakerLabel: seg.speakerLabel, text });
    }
  }
  return groups;
}
