# Entwicklungs-Workflow

## Branches

- `main`: stabil, geschützt
- `claude/meeting-notes-ai-app-k03V6`: aktiver Entwicklungs-Branch dieser Feature-Iteration

## Skripte

```bash
pnpm install           # alle Workspaces installieren
pnpm lint              # ESLint (shared + desktop)
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest (alle Pakete)
pnpm build             # Shared lib + Electron-Build
pnpm dev:desktop       # Hot-Reload Electron + Vite
pnpm format            # Prettier auto-format
```

## Test-Strategie

| Bereich                                    | Framework | Wo                                              |
| ------------------------------------------ | --------- | ----------------------------------------------- |
| Repositories (CRUD)                        | Vitest    | `packages/shared/src/db/__tests__`              |
| LLM-Provider (SDK-Mock)                    | Vitest    | `packages/shared/src/llm/__tests__`             |
| MarkdownRenderer (Snapshot)                | Vitest    | `packages/shared/src/protocol/__tests__`        |
| ProtocolGenerator (gemockter Provider)     | Vitest    | `packages/shared/src/protocol/__tests__`        |
| Sliding-Window-Chunking                    | Vitest    | `packages/shared/src/transcription/__tests__`   |
| BetterSqliteAdapter (Integration)          | Vitest    | `packages/desktop/electron/services/__tests__`  |
| WhisperService (injected runner)           | Vitest    | `packages/desktop/electron/services/__tests__`  |

E2E-Tests via Playwright sind in Phase 7 vorgesehen, sobald die Aufnahme-UI
stabil ist.

## Definition of Done (Gegencheck pro Phase)

1. Alle Tests grün
2. `pnpm typecheck` und `pnpm lint` ohne Fehler
3. Manuelle Checks aus [`MANUAL_TESTS.md`](MANUAL_TESTS.md) für die jeweilige
   Phase erfolgreich durchlaufen
4. Code-Review (mind. Self-Review) abgeschlossen
5. Commit mit klarer Beschreibung gepusht

## Native-Module rebuilden

`better-sqlite3` und `keytar` brauchen native Builds, die an die jeweilige
Node-/Electron-Version gebunden sind:

```bash
pnpm rebuild better-sqlite3 keytar
```

Für Electron-Builds gilt `electron-rebuild` (wird beim ersten `pnpm build`
automatisch ausgeführt).

## Releasing

### Desktop (Mac / Windows / Linux)

Distribution via `electron-builder`. Konfiguration liegt im `build`-Block in
[`packages/desktop/package.json`](../packages/desktop/package.json).

```bash
# auf Mac (Apple Silicon + Intel als universal-style DMG)
pnpm --filter @reineke/desktop dist:mac

# auf Windows (NSIS-Installer)
pnpm --filter @reineke/desktop dist:win

# alle drei (geht nur auf dem jeweiligen Host)
pnpm --filter @reineke/desktop dist
```

Output landet in `packages/desktop/release/<version>/`.

**Voraussetzungen pro Plattform:**

- **macOS**: Xcode Command Line Tools, `cmake` (`brew install cmake`).
  Für signierte und notarisierte Builds: Apple-Developer-Account, Cert im
  Keychain, `CSC_LINK`/`CSC_KEY_PASSWORD` Env-Variablen für electron-builder.
  Unsignierte Builds laufen lokal, lassen sich aber von anderen Macs nur via
  Rechtsklick → Öffnen starten.
- **Windows**: Visual Studio Build Tools (für native Module),
  Python 3, `cmake` im PATH. Code-Signing optional via `CSC_LINK` (PFX).

**whisper.cpp wird beim ersten Start kompiliert.** Der Endbenutzer braucht
deshalb `cmake` auf seinem System. Wer das vermeiden will, kann
whisper.cpp + ein Modell vorab bauen und über `extraResources` mit-bundeln
(noch nicht eingerichtet).

### Mobile (iOS / Android) — TODO

Aktuell ist nur das Expo-Skeleton vorhanden
([`docs/MOBILE_SETUP.md`](MOBILE_SETUP.md)). Für ein produktionsreifes
Release fehlt:

- `expo prebuild` + native `whisper.rn` Integration
- App-Icons, Splash-Screens
- iOS: Bundle-ID, Provisioning-Profile, App-Store-Connect-Setup
- Android: Keystore, Play-Console-Setup
- Builds + Upload über EAS (`eas build --profile production`,
  `eas submit`)

Das ist eine eigene Iteration und nicht Teil dieses Releases.
