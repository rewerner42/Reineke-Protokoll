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

- Versionierung über `package.json` in den jeweiligen Paketen
- Desktop-Distribution via `electron-builder` (Phase 7)
- Mobile-Distribution über EAS Build (Phase 7)
