import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AppSettings, LLMProviderName, Protocol } from '@reineke/shared';
import { LLM_MODELS } from '@reineke/shared';
import { api } from '../lib/ipc.js';

export function ProtocolPage(): JSX.Element {
  const { id } = useParams();
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [view, setView] = useState<'rendered' | 'source'>('rendered');
  const [editedMarkdown, setEditedMarkdown] = useState('');
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [regenProvider, setRegenProvider] = useState<LLMProviderName | null>(null);
  const [regenModel, setRegenModel] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.protocol.get(id).then((p) => {
      setProtocol(p);
      if (p) setEditedMarkdown(p.markdown);
    });
    void api.settings.get().then(setSettings);
  }, [id]);

  useEffect(() => {
    if (regenProvider === 'ollama' && settings) {
      void api.ollama.listModels(settings.ollamaBaseUrl).then(setOllamaModels).catch(() => setOllamaModels([]));
    }
  }, [regenProvider, settings]);

  useEffect(() => {
    if (!regenProvider || !settings) return;
    if (regenProvider === 'claude') setRegenModel(settings.claudeModel);
    else if (regenProvider === 'openai') setRegenModel(settings.openaiModel);
    else setRegenModel(settings.ollamaModel);
  }, [regenProvider, settings]);

  const handleRegenerate = async (): Promise<void> => {
    if (!id || !regenProvider) return;
    setRegenError(null);
    setRegenerating(true);
    try {
      const p = await api.protocol.generate(id, {
        provider: regenProvider,
        model: regenModel,
      });
      setProtocol(p);
      setEditedMarkdown(p.markdown);
      setRegenProvider(null);
    } catch (err) {
      setRegenError((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

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

  const [exporting, setExporting] = useState<'md' | 'pdf' | null>(null);

  const handleExportMd = async (): Promise<void> => {
    if (!protocol) return;
    setExporting('md');
    try {
      const result = await api.protocol.exportMarkdown(protocol.id);
      if (result) alert(`Protokoll exportiert: ${result.path}`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async (): Promise<void> => {
    if (!id) return;
    setExporting('pdf');
    try {
      const result = await api.pdf.exportProtocol(id);
      if (result) alert(`Protokoll als PDF exportiert: ${result.path}`);
    } catch (err) {
      alert(`PDF-Export fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
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
            onClick={handleExportMd}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-900 text-sm rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting === 'md' ? '…' : 'Markdown'}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Erzeuge PDF …' : 'PDF'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500">
          Erstellt mit {protocol.llmProvider} ({protocol.llmModel})
          {protocol.editedAt ? ' · zuletzt bearbeitet' : ''}
        </p>
        <button
          type="button"
          onClick={() => setRegenProvider((p) => (p ? null : protocol.llmProvider))}
          className="text-xs text-slate-600 hover:text-slate-900 underline"
        >
          {regenProvider ? 'Abbrechen' : '↻ Neu erzeugen …'}
        </button>
      </div>

      {regenProvider && settings && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-amber-900 mb-2">Protokoll neu erzeugen</h4>
          <p className="text-xs text-amber-800 mb-3">
            Ersetzt das aktuelle Protokoll. Lokale Änderungen am Markdown gehen verloren.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(['claude', 'openai', 'ollama'] as LLMProviderName[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRegenProvider(p)}
                className={`px-2 py-1.5 text-sm rounded border ${
                  regenProvider === p
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p === 'claude' ? 'Claude' : p === 'openai' ? 'OpenAI' : 'Ollama'}
              </button>
            ))}
          </div>
          <label className="block text-xs text-amber-900 mb-1">Modell</label>
          {regenProvider === 'ollama' ? (
            ollamaModels.length > 0 ? (
              <select
                value={regenModel}
                onChange={(e) => setRegenModel(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-3"
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {!ollamaModels.includes(regenModel) && (
                  <option value={regenModel}>{regenModel} (manuell)</option>
                )}
              </select>
            ) : (
              <input
                type="text"
                value={regenModel}
                onChange={(e) => setRegenModel(e.target.value)}
                placeholder="z.B. llama3.1"
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-3 font-mono"
              />
            )
          ) : (
            <select
              value={regenModel}
              onChange={(e) => setRegenModel(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-3"
            >
              {LLM_MODELS[regenProvider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {regenError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
              {regenError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || !regenModel}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
          >
            {regenerating ? 'Erzeuge …' : '✨ Neu erzeugen'}
          </button>
        </div>
      )}

      {view === 'rendered' ? (
        <>
          <section className="bg-white border border-slate-200 rounded-lg px-6 py-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Teilnehmer
            </h3>
            {protocol.participants.length === 0 ? (
              <p className="text-slate-500 italic text-sm">Keine Teilnehmer erkannt.</p>
            ) : (
              <p className="text-slate-800 leading-relaxed">
                {protocol.participants.map((p, i) => (
                  <span key={p.id}>
                    <span className="font-medium">{p.name}</span>
                    {p.role && <span className="text-slate-500"> ({p.role})</span>}
                    {i < protocol.participants.length - 1 && (
                      <span className="text-slate-400 mx-1">·</span>
                    )}
                  </span>
                ))}
              </p>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-semibold mb-3">Zusammenfassung</h3>
            <p className="whitespace-pre-wrap text-slate-800">{protocol.summary}</p>
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
