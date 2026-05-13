import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Protocol } from '@reineke/shared';
import { api } from '../lib/ipc.js';

export function ProtocolPage(): JSX.Element {
  const { id } = useParams();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [view, setView] = useState<'rendered' | 'source'>('rendered');
  const [editedMarkdown, setEditedMarkdown] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api.protocol.get(id).then((p) => {
      setProtocol(p);
      if (p) setEditedMarkdown(p.markdown);
    });
  }, [id]);

  const handleSave = async (): Promise<void> => {
    if (!protocol) return;
    setSaving(true);
    await api.protocol.updateMarkdown(protocol.id, editedMarkdown);
    setProtocol({ ...protocol, markdown: editedMarkdown });
    setSaving(false);
  };

  const handleToggleTodo = async (todoId: string, done: boolean): Promise<void> => {
    await api.protocol.setTodoDone(todoId, done);
    if (id) {
      const p = await api.protocol.get(id);
      setProtocol(p);
    }
  };

  const handleExport = async (): Promise<void> => {
    if (!protocol) return;
    const result = await api.protocol.exportMarkdown(protocol.id);
    if (result) alert(`Protokoll exportiert: ${result.path}`);
  };

  if (!protocol)
    return (
      <div className="p-6">
        <Link to={`/meetings/${id}`} className="text-sm text-slate-500">
          ← Zurück
        </Link>
        <p className="text-slate-500 mt-4">Kein Protokoll vorhanden.</p>
      </div>
    );

  return (
    <div className="p-6 max-w-5xl">
      <Link to={`/meetings/${id}`} className="text-sm text-slate-500">
        ← Zum Meeting
      </Link>

      <div className="flex items-center justify-between mt-2 mb-4">
        <h2 className="text-2xl font-semibold text-slate-900">Protokoll</h2>
        <div className="flex gap-2">
          <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setView('rendered')}
              className={`px-3 py-1.5 ${view === 'rendered' ? 'bg-slate-900 text-white' : 'bg-white'}`}
            >
              Vorschau
            </button>
            <button
              type="button"
              onClick={() => setView('source')}
              className={`px-3 py-1.5 ${view === 'source' ? 'bg-slate-900 text-white' : 'bg-white'}`}
            >
              Markdown
            </button>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800"
          >
            Exportieren
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Erstellt mit {protocol.llmProvider} ({protocol.llmModel})
        {protocol.editedAt ? ' · zuletzt bearbeitet' : ''}
      </p>

      {view === 'rendered' ? (
        <>
          <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">Zusammenfassung</h3>
            <p className="whitespace-pre-wrap text-slate-800">{protocol.summary}</p>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">Teilnehmer</h3>
            {protocol.participants.length === 0 ? (
              <p className="text-slate-500 italic">Keine Teilnehmer erkannt.</p>
            ) : (
              <ul className="list-disc list-inside text-slate-800">
                {protocol.participants.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.role ? ` (${p.role})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">To-Dos</h3>
            {protocol.todos.length === 0 ? (
              <p className="text-slate-500 italic">Keine To-Dos.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {protocol.todos.map((t) => (
                  <li key={t.id} className="py-2 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => handleToggleTodo(t.id, e.target.checked)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className={t.done ? 'line-through text-slate-400' : 'text-slate-900'}>
                        {t.description}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {t.owner ?? 'kein Owner'} · {t.deadline ?? 'keine Deadline'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">Entscheidungen</h3>
            {protocol.decisions.length === 0 ? (
              <p className="text-slate-500 italic">Keine Entscheidungen.</p>
            ) : (
              <ul className="list-disc list-inside text-slate-800">
                {protocol.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-3">Diskussionspunkte</h3>
            {protocol.discussionPoints.length === 0 ? (
              <p className="text-slate-500 italic">Keine.</p>
            ) : (
              <ul className="list-disc list-inside text-slate-800">
                {protocol.discussionPoints.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <textarea
            value={editedMarkdown}
            onChange={(e) => setEditedMarkdown(e.target.value)}
            className="w-full h-[600px] font-mono text-sm border border-slate-200 rounded p-3"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || editedMarkdown === protocol.markdown}
            className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      )}
    </div>
  );
}
