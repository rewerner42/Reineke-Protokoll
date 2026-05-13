# Architektur

## Übersicht

```
+----------------------------+        +----------------------------+
|  Renderer (React, Vite)    |  IPC   |  Main (Electron / Node)    |
|  - Pages, Components       |<------>|  - SQLite (better-sqlite3) |
|  - useRecorder (AudioCtx)  |        |  - Whisper-Worker          |
|  - window.api (preload)    |        |  - Keytar, FS, dialog      |
+----------------------------+        +----------------------------+
                                              |
                                              | importiert
                                              v
                              +---------------------------------+
                              |  @reineke/shared                |
                              |  - Modelle, Zod-Schemas         |
                              |  - SQLite-Migrations + Repos    |
                              |  - LLMProvider Interface        |
                              |    - ClaudeProvider (tool_use)  |
                              |    - OpenAIProvider (json_sch.) |
                              |  - ProtocolGenerator            |
                              |  - MarkdownRenderer             |
                              |  - chunking (Sliding-Window)    |
                              +---------------------------------+
                                              ^
                                              | importiert
                                              |
+----------------------------------+
|  Expo / React Native (mobile)    |
|  - ExpoSqliteAdapter             |
|  - SecureStoreService            |
|  - whisper.rn (TODO Phase 7)     |
+----------------------------------+
```

## Datenfluss bei Aufnahme

1. **Renderer**: `useRecorder` öffnet `getUserMedia`, AudioWorklet konvertiert
   auf 16 kHz Mono PCM16, alle 3 s wird ein `ArrayBuffer`-Chunk via IPC an Main
   gesendet.
2. **Main**: `WhisperService.pushChunk` hängt das PCM an einen Ring-Buffer,
   schreibt die letzten 30 s als WAV in den temp-Pfad und ruft
   `nodejs-whisper` mit Sprache `de` auf.
3. **Diff-Logik** (`shared/transcription/chunking.ts`): klassifiziert die
   Whisper-Segmente in *final* (vor dem Cutoff `windowMs - stepMs`) und
   *vorläufig*.
4. **Persistenz**: jedes emittierte Segment wird in `transcript_segments`
   abgelegt und per `transcription:segment` an den Renderer geschickt.
5. **Stop**: `WhisperService.stopMeeting` schreibt das gesamte PCM als WAV
   nach `userData/recordings/<meetingId>.wav`, der Meeting-Status wird auf
   `completed` gesetzt.

## Protokoll-Erzeugung

```
RecordingPage -> MeetingDetailPage -> "Protokoll erzeugen"
                                       |
                                       v
                          ipc: protocol:generate
                                       |
                                       v
                    SettingsService.getApiKey(provider)
                                       |
                                       v
                    createLLMProvider({name, apiKey, model})
                                       |
                                       v
                    ProtocolGenerator.generate(meetingId)
                       - finalText aus TranscriptRepository
                       - provider.generateProtocol(...)
                            - Claude: tool_use submit_protocol
                            - OpenAI: response_format json_schema strict
                       - Zod-Validierung
                       - MarkdownRenderer -> protocol.markdown
                       - ProtocolRepository.save (Tx)
                                       |
                                       v
                     ProtocolPage (Vorschau / Markdown-Editor / Export)
```

## Sicherheitsentscheidungen (Desktop)

- `contextIsolation: true`, `nodeIntegration: false`
- Preload exposiert ausschließlich getypte Funktionen über `contextBridge`
- API-Keys werden **niemals** an den Renderer geleakt. Renderer kann nur
  `hasApiKey(provider): boolean` abfragen; die Anfrage an die LLM-API läuft
  ausschließlich im Main-Process.
- CSP-Header in `index.html` schränkt Ressourcen-Quellen ein.

## IPC-Contract

Die typisierte Definition liegt in
[`packages/desktop/electron/types/ipc-contract.ts`](../packages/desktop/electron/types/ipc-contract.ts).
Diese Datei ist die Single Source of Truth zwischen Main und Renderer —
beide Seiten importieren dasselbe Interface (`IpcContract`).

## Plattform-Trennlinien

| Bereich               | Shared                                  | Desktop (Main)              | Mobile                          |
| --------------------- | --------------------------------------- | --------------------------- | ------------------------------- |
| Datenmodelle          | ✅ Source of Truth                       | importiert                  | importiert                      |
| SQLite-Schema         | ✅ `migrations/embedded.ts`              | `BetterSqliteAdapter`       | `ExpoSqliteAdapter`             |
| LLM-Provider          | ✅ Claude + OpenAI                       | nutzt direkt                | nutzt direkt                    |
| Audio-Aufnahme        | nur Chunking-Logik                      | `getUserMedia` + AudioCtx   | `expo-audio` (TODO Phase 7)     |
| Whisper-Inferenz      | nur Sliding-Window                      | `nodejs-whisper`            | `whisper.rn`                    |
| Secrets               | nur Interface                           | `keytar`                    | `expo-secure-store`             |
| Export                | `MarkdownRenderer`                      | `dialog.showSaveDialog`     | `expo-sharing`                  |

## Erweiterungspunkte

- **Speaker-Diarization**: bewusst ausgeklammert. Vorgesehen ist ein manueller
  „Sprecherwechsel"-Button, der ein `speakerLabel` an das nächste Segment
  hängt.
- **Map-Reduce für lange Transkripte**: aktuell wird der Volltext direkt an
  das LLM gegeben. Ab > 50 k Tokens sollte `ProtocolGenerator` das Transkript
  in Chunks aufteilen, einzeln zusammenfassen und am Ende die Zusammenfassungen
  mergen.
- **Cloud-Sync**: nicht im MVP. Da SQLite die Single-Source-of-Truth ist,
  kann später ein WebDAV- oder Supabase-Sync hinzugefügt werden.
