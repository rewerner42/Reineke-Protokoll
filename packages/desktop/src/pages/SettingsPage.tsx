import { useEffect, useState } from 'react';
import type {
  AppSettings,
  LLMProviderName,
  PdfClassification,
  WhisperModelSize,
} from '@reineke/shared';
import { CLASSIFICATION_LABELS, LLM_MODELS } from '@reineke/shared';
import { api } from '../lib/ipc.js';
import { extractDominantColorFromDataUrl } from '../lib/extractDominantColor.js';

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [claudeKeyInput, setClaudeKeyInput] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void api.settings.get().then(setSettings);
    void api.settings.hasApiKey('claude').then(setHasClaudeKey);
    void api.settings.hasApiKey('openai').then(setHasOpenaiKey);
  }, []);

  const refreshOllamaModels = async (baseUrl: string): Promise<void> => {
    setOllamaError(null);
    try {
      const models = await api.ollama.listModels(baseUrl);
      setOllamaModels(models);
    } catch (err) {
      setOllamaModels([]);
      setOllamaError((err as Error).message);
    }
  };

  useEffect(() => {
    if (settings?.llmProvider === 'ollama' && ollamaModels === null) {
      void refreshOllamaModels(settings.ollamaBaseUrl);
    }
  }, [settings?.llmProvider, settings?.ollamaBaseUrl, ollamaModels]);

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await api.settings.set(patch);
    setSettings(next);
    flash('Gespeichert.');
  };

  const saveKey = async (provider: 'claude' | 'openai', key: string): Promise<void> => {
    if (!key.trim()) return;
    await api.settings.setApiKey(provider, key.trim());
    if (provider === 'claude') {
      setHasClaudeKey(true);
      setClaudeKeyInput('');
    } else {
      setHasOpenaiKey(true);
      setOpenaiKeyInput('');
    }
    flash(`${provider}-API-Key gespeichert.`);
  };

  const flash = (msg: string): void => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  if (!settings) return <div className="p-6 text-slate-500">Lade …</div>;

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-2xl font-semibold text-slate-900 mb-6">Einstellungen</h2>

      {saved && (
        <div className="bg-green-100 border border-green-300 text-green-800 rounded px-3 py-2 text-sm mb-4">
          {saved}
        </div>
      )}

      <Section title="KI-Anbieter">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(['claude', 'openai', 'ollama'] as LLMProviderName[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => update({ llmProvider: p })}
              className={`border rounded-lg p-4 text-left ${
                settings.llmProvider === p
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="font-semibold capitalize">{p}</div>
              <div className="text-xs text-slate-500 mt-1">
                {p === 'claude'
                  ? 'Anthropic Claude'
                  : p === 'openai'
                    ? 'OpenAI GPT'
                    : 'Lokal via Ollama'}
              </div>
            </button>
          ))}
        </div>

        {settings.llmProvider === 'claude' && (
          <Field label="Claude-Modell">
            <select
              value={settings.claudeModel}
              onChange={(e) => update({ claudeModel: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            >
              {LLM_MODELS.claude.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {settings.llmProvider === 'openai' && (
          <Field label="OpenAI-Modell">
            <select
              value={settings.openaiModel}
              onChange={(e) => update({ openaiModel: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            >
              {LLM_MODELS.openai.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {settings.llmProvider === 'ollama' && (
          <>
            <Field label="Ollama-Server-URL">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.ollamaBaseUrl}
                  onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="flex-1 border border-slate-300 rounded-md px-3 py-2 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => void refreshOllamaModels(settings.ollamaBaseUrl)}
                  className="px-3 py-2 bg-slate-200 text-slate-900 rounded-md hover:bg-slate-300 text-sm"
                >
                  Modelle laden
                </button>
              </div>
            </Field>

            <Field label="Ollama-Modell">
              {ollamaModels === null ? (
                <div className="text-sm text-slate-500">Lade Modelle …</div>
              ) : ollamaModels.length > 0 ? (
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => update({ ollamaModel: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!ollamaModels.includes(settings.ollamaModel) && (
                    <option value={settings.ollamaModel}>{settings.ollamaModel} (manuell)</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings.ollamaModel}
                  onChange={(e) => update({ ollamaModel: e.target.value })}
                  placeholder="z.B. llama3.1, qwen2.5, mistral"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono text-sm"
                />
              )}
            </Field>

            {ollamaError && (
              <p className="text-xs text-red-600 mt-1">
                Verbindungsfehler: {ollamaError} — Läuft Ollama? Installation:{' '}
                <code>brew install ollama</code>, starten mit <code>ollama serve</code>, dann
                <code> ollama pull llama3.1</code>.
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Empfohlen für JSON-Output: Modelle ≥ 7B mit guter Instruction-Tuning, z.B.
              <code> llama3.1:8b</code>, <code>qwen2.5:7b</code>, <code>mistral:7b</code>.
              Ollama braucht Version ≥ 0.5 für strukturierten JSON-Output.
            </p>
          </>
        )}
      </Section>

      <Section title="API-Keys">
        <ApiKeyRow
          label="Anthropic Claude API-Key"
          hasKey={hasClaudeKey}
          value={claudeKeyInput}
          onChange={setClaudeKeyInput}
          onSave={() => saveKey('claude', claudeKeyInput)}
        />
        <ApiKeyRow
          label="OpenAI API-Key"
          hasKey={hasOpenaiKey}
          value={openaiKeyInput}
          onChange={setOpenaiKeyInput}
          onSave={() => saveKey('openai', openaiKeyInput)}
        />
        <p className="text-xs text-slate-500 mt-3">
          Keys werden ausschließlich lokal im System-Keychain gespeichert (keytar) und nie an den
          Renderer weitergegeben.
        </p>
      </Section>

      <Section title="PDF-Export · Branding">
        <Field label="Firmenname (optional, erscheint im Kopf der PDF)">
          <input
            type="text"
            value={settings.pdfCompanyName}
            onChange={(e) => update({ pdfCompanyName: e.target.value })}
            placeholder="z.B. Reineke Technik GmbH"
            className="w-full border border-slate-300 rounded-md px-3 py-2"
          />
        </Field>

        <Field label="Primärfarbe (Überschriften, Trennlinien, Klassifizierungs-Badge)">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.pdfPrimaryColor}
              onChange={(e) => update({ pdfPrimaryColor: e.target.value })}
              className="w-14 h-10 border border-slate-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={settings.pdfPrimaryColor}
              onChange={(e) => update({ pdfPrimaryColor: e.target.value })}
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 font-mono text-sm"
              placeholder="#0f172a"
            />
            <button
              type="button"
              disabled={!settings.pdfLogoPath}
              onClick={async () => {
                const dataUrl = await api.settings.getLogoDataUrl();
                if (!dataUrl) {
                  flash('Kein Logo zum Auswerten hinterlegt.');
                  return;
                }
                try {
                  const hex = await extractDominantColorFromDataUrl(dataUrl);
                  await update({ pdfPrimaryColor: hex });
                  flash(`Farbe ${hex} aus Logo übernommen.`);
                } catch (err) {
                  flash(`Farbe konnte nicht ermittelt werden: ${(err as Error).message}`);
                }
              }}
              title={
                settings.pdfLogoPath
                  ? 'Dominante saturierte Farbe aus dem Logo verwenden'
                  : 'Lade zuerst ein Logo hoch'
              }
              className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              🎨 Aus Logo
            </button>
          </div>
        </Field>

        <Field label="Firmenlogo (PNG, JPG oder SVG)">
          <div className="flex items-center gap-3">
            {settings.pdfLogoPath ? (
              <>
                <div className="flex-1 text-sm text-slate-700 truncate" title={settings.pdfLogoPath}>
                  ✓ Logo hinterlegt — {settings.pdfLogoPath.split('/').pop()}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.settings.removeLogo();
                    const next = await api.settings.get();
                    setSettings(next);
                    flash('Logo entfernt.');
                  }}
                  className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md hover:bg-red-100"
                >
                  Entfernen
                </button>
              </>
            ) : (
              <div className="flex-1 text-sm text-slate-500 italic">Kein Logo hinterlegt.</div>
            )}
            <button
              type="button"
              onClick={async () => {
                const r = await api.settings.uploadLogo();
                if (r) {
                  const next = await api.settings.get();
                  setSettings(next);
                  flash('Logo gespeichert.');
                }
              }}
              className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800"
            >
              {settings.pdfLogoPath ? 'Ersetzen …' : 'Hochladen …'}
            </button>
          </div>
        </Field>

        <Field label="Vertraulichkeitsstufe (Badge oben rechts auf jeder PDF-Seite)">
          <select
            value={settings.pdfClassification}
            onChange={(e) =>
              update({ pdfClassification: e.target.value as PdfClassification })
            }
            className="w-full border border-slate-300 rounded-md px-3 py-2"
          >
            {(Object.keys(CLASSIFICATION_LABELS) as PdfClassification[]).map((k) => (
              <option key={k} value={k}>
                {CLASSIFICATION_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Standard-Speicherordner für Exporte (optional)">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-slate-700 truncate font-mono">
              {settings.exportDir ? (
                <span title={settings.exportDir}>{settings.exportDir}</span>
              ) : settings.lastExportDir ? (
                <span className="text-slate-500" title={settings.lastExportDir}>
                  zuletzt benutzt: {settings.lastExportDir}
                </span>
              ) : (
                <span className="text-slate-400 italic">
                  Speicherort wird bei jedem Export abgefragt (Vorschlag: Dokumente)
                </span>
              )}
            </div>
            {settings.exportDir && (
              <button
                type="button"
                onClick={() => update({ exportDir: null })}
                className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md hover:bg-red-100"
              >
                Zurücksetzen
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                const r = await api.settings.pickExportDir();
                if (r) {
                  const next = await api.settings.get();
                  setSettings(next);
                  flash('Standard-Speicherordner gesetzt.');
                }
              }}
              className="px-3 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-800"
            >
              {settings.exportDir ? 'Ändern …' : 'Wählen …'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Ist ein Ordner gesetzt, wird er beim Speichern als Vorschlag verwendet — der
            System-Dialog erscheint aber weiterhin, du kannst pro Datei anders entscheiden.
          </p>
        </Field>
      </Section>

      <Section title="Whisper-Modell">
        <Field label="Modellgröße">
          <select
            value={settings.whisperModelSize}
            onChange={(e) => update({ whisperModelSize: e.target.value as WhisperModelSize })}
            className="w-full border border-slate-300 rounded-md px-3 py-2"
          >
            <option value="tiny">tiny (~39 MB, sehr schnell, geringere Qualität)</option>
            <option value="base">base (~74 MB, empfohlen)</option>
            <option value="small">small (~244 MB, höhere Qualität)</option>
            <option value="medium">medium (~769 MB, beste Qualität)</option>
          </select>
        </Field>
        <p className="text-xs text-slate-500 mt-1">
          Modelle werden beim ersten Aufnahmestart automatisch heruntergeladen.
        </p>
      </Section>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-6 mb-4">
      <h3 className="text-lg font-semibold mb-3">{props.title}</h3>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-slate-700 mb-1">{props.label}</label>
      {props.children}
    </div>
  );
}

function ApiKeyRow(props: {
  label: string;
  hasKey: boolean;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}): JSX.Element {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {props.label}{' '}
        {props.hasKey && (
          <span className="text-xs text-green-700 font-normal">(✓ hinterlegt)</span>
        )}
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.hasKey ? 'Neuen Key eingeben, um zu ersetzen' : 'sk-...'}
          className="flex-1 border border-slate-300 rounded-md px-3 py-2"
        />
        <button
          type="button"
          onClick={props.onSave}
          disabled={!props.value.trim()}
          className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}
