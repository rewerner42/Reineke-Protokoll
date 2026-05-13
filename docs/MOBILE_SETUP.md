# Mobile-Setup (Expo / React Native)

Die Mobile-App ist **nicht** Teil des pnpm-Workspaces — Expo und React Native
nutzen eigene Bundler-Konventionen (Metro), die mit `pnpm`-Symlinks nur mit
besonderer Konfiguration zusammenspielen. Stattdessen wird das Paket separat
installiert.

## Voraussetzungen

- Node.js `>=20.11`
- macOS für iOS-Build (Xcode 15+), Android Studio für Android-Build
- Expo CLI: keine globale Installation nötig, wird via `npx` aufgerufen

## Erstes Setup

```bash
# 1. Shared-Paket bauen (wird via npm-Pfad referenziert)
pnpm --filter @reineke/shared build

# 2. In Mobile wechseln und Dependencies installieren
cd packages/mobile
npm install

# 3. Native Projekte generieren (notwendig für whisper.rn)
npx expo prebuild --clean

# 4. iOS-Run
npx expo run:ios

# 5. Android-Run (Emulator muss laufen)
npx expo run:android
```

## Metro-Konfiguration

`metro.config.js` ist bereits so eingerichtet, dass es das Workspace-Root als
`watchFolder` einschließt — Änderungen in `packages/shared/dist/` werden vom
Metro Bundler erkannt.

Falls Änderungen am Shared-Paket nicht aufgenommen werden:

```bash
pnpm --filter @reineke/shared build
cd packages/mobile && npx expo start --clear
```

## Whisper-Modell auf dem Gerät

`whisper.rn` lädt das gewählte GGML-Modell beim ersten Start herunter und
speichert es nach `FileSystem.documentDirectory + 'models/'`.

Empfehlung pro Gerät:

| Gerät                         | Modell  | Bemerkung                       |
| ----------------------------- | ------- | ------------------------------- |
| iPhone 11+, neuere Android    | `tiny`  | Standard, schnell, akzeptabel   |
| iPhone 14+, Pixel 7+          | `base`  | bessere Qualität                |
| iPad Pro M1+, hochwert. Android | `small` | nur wenn Akku/Hitze ok ist      |

## API-Keys auf dem Gerät

API-Keys werden in `expo-secure-store` (Keychain auf iOS, EncryptedSharedPreferences auf Android) abgelegt — siehe `src/services/SecureStoreService.ts`.

## Bekannte Einschränkungen (MVP)

- **Aufnahme-Hook**: das `RecordScreen` legt aktuell nur das Meeting an. Die
  Verkabelung von `expo-audio` mit `whisper.rn` (Streaming-Chunks) ist als
  TODO in `app/record.tsx` markiert und sollte in Phase 7 nachgezogen werden.
- **Hintergrund-Aufnahme**: erfordert auf iOS den `audio`-Background-Mode in
  `app.json` (noch zu ergänzen).
- **App Store Review**: für die Veröffentlichung muss die
  `NSMicrophoneUsageDescription` ggf. ausführlicher beschrieben werden.
