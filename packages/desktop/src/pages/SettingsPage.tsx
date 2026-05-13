import { useEffect, useState } from 'react';
import type { AppSettings, LLMProviderName, WhisperModelSize } from '@reineke/shared';
import { LLM_MODELS } from '@reineke/shared';
import { api } from '../lib/ipc.js';

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [claudeKeyInput, setClaudeKeyInput] = useState('');
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void api.settings.get().then(setSettings);
    void api.settings.hasApiKey('claude').then(setHasClaudeKey);
    void api.settings.hasApiKey('openai').then(setHasOpenaiKey);
  }, []);

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await api.settings.set(patch);
    setSettings(next);
    flash('Gespeichert.');
  };

  const saveKey = async (provider: LLMProviderName, key: string): Promise<void> => {
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
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['claude', 'openai'] as LLMProviderName[]).map((p) => (
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
                {p === 'claude' ? 'Anthropic Claude' : 'OpenAI GPT'}
              </div>
            </button>
          ))}
        </div>

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
