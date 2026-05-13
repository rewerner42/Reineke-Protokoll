# Reineke-Protokoll

Plattformübergreifende Meeting-Aufzeichnungs- und Protokoll-App.

- Live-Spracherkennung mit **lokalem Whisper** (keine Cloud-Uploads für Audio)
- Strukturiertes KI-Protokoll mit Zusammenfassung, Teilnehmern, To-Dos, Entscheidungen und Diskussionspunkten
- LLM-Anbieter wählbar zwischen **Claude (Anthropic)** und **OpenAI**
- **Desktop** (Electron) und **Mobile** (Expo / React Native)
- Lokale SQLite-Datenbank, API-Keys im OS-Keychain

## Monorepo-Struktur

```
packages/
├── shared/   # Geteilte Geschäftslogik (Modelle, DB, LLM-Provider, Markdown-Renderer)
├── desktop/  # Electron + React + Vite (Hauptanwendung)
└── mobile/   # Expo / React Native (siehe docs/MOBILE_SETUP.md)
```

`shared` ist die Single Source of Truth für Datenmodelle, das SQLite-Schema und
die LLM-Integration. Die Plattform-Pakete implementieren nur jeweils einen
`DatabaseAdapter` und plattform-spezifische I/O (Audio, Keychain, FS).

## Voraussetzungen

- Node.js `>=20.11`
- pnpm `10.33.x`
- Linux: `libsecret-1-dev` (für `keytar`)
- macOS: Xcode Command Line Tools
- Windows: Build-Tools für `better-sqlite3`

## Setup

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Das installiert `packages/shared` und `packages/desktop`. Für Mobile siehe
[`docs/MOBILE_SETUP.md`](docs/MOBILE_SETUP.md).

## Desktop-App starten

```bash
pnpm dev:desktop
```

Beim ersten Start lädt die App das Whisper-Modell `base` (~74 MB) automatisch
herunter. Über *Einstellungen* lässt sich auf `tiny`, `small` oder `medium`
wechseln.

### API-Keys hinterlegen

Öffne *Einstellungen* in der App und füge entweder einen
Anthropic- oder OpenAI-API-Key ein. Die Keys werden im System-Keychain
(macOS Keychain / Windows Credential Vault / libsecret) abgelegt — niemals in
den Renderer-Prozess geleakt.

## Mobile-App

Das `packages/mobile`-Verzeichnis enthält das Expo-Skeleton inklusive aller
Screens, des `ExpoSqliteAdapter` und der `SecureStoreService`-Integration.
Aufgrund nativer Module (`whisper.rn`) ist ein Dev-Client mit `expo prebuild`
nötig — siehe [`docs/MOBILE_SETUP.md`](docs/MOBILE_SETUP.md).

## Tests

| Bereich                | Command                                            |
| ---------------------- | -------------------------------------------------- |
| Shared-Unit-Tests      | `pnpm --filter @reineke/shared test`               |
| Desktop-Integration    | `pnpm --filter @reineke/desktop test`              |
| Lint                   | `pnpm lint`                                        |
| Typecheck              | `pnpm typecheck`                                   |
| Vollständiger Build    | `pnpm build`                                       |

Aktuell laufen **40 Tests** über die Geschäftslogik: SQLite-Repositories,
LLM-Provider-Schemas, Markdown-Renderer, Whisper-Sliding-Window und der
ProtocolGenerator mit gemocktem LLM.

Die vollständige manuelle Test-Checkliste findet sich in
[`docs/MANUAL_TESTS.md`](docs/MANUAL_TESTS.md).

## Architektur-Details

Siehe [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) für Datenfluss,
IPC-Contracts und Plattform-Trennlinien.
