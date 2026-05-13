# Mobile-Setup (Expo / React Native)

Das Mobile-Paket ist **nicht** Teil des pnpm-Workspaces — Expo/Metro
arbeiten mit einer eigenen Bundler-Pipeline. `@reineke/shared` wird über
einen relativen `file:`-Link aus dem Mobile-Paket geladen, das funktioniert
sowohl mit `npm` als auch mit `yarn`.

Die App kann **nicht** in **Expo Go** laufen — `whisper.rn` ist eine native
Library, die in einem eigenen Dev-Client gebaut werden muss. Dafür gibt es
zwei Wege:

- **A) Lokal bauen** (Mac mit Xcode für iOS, Android Studio für Android)
- **B) EAS Build** (Cloud-Build, du brauchst nur ein kostenloses
  Expo-Konto + ein Gerät zum Installieren)

## Voraussetzungen

- Node.js `>= 20.11`
- Mac mit Xcode 15+ **oder** Linux/Mac/Windows mit Android Studio (Android SDK 34+)
- Optional für EAS: `npm install -g eas-cli` und ein
  [Expo-Account](https://expo.dev/signup)

## Schritt 1: Dependencies installieren

```bash
# Im Repo-Root
pnpm install

# Im Mobile-Verzeichnis
cd packages/mobile
npm install
```

`npm install` zieht alle Expo-/RN-Dependencies. `@reineke/shared` wird via
`file:../shared` auf die Quelldateien gelinkt — kein vorheriger Build nötig,
weil `shared/package.json` direkt auf `./src/index.ts` zeigt.

## Schritt 2: Native-Projekte generieren

```bash
npx expo prebuild --clean
```

Erzeugt die `ios/` und `android/` Projekte mit allen nativen Modulen
(inkl. `whisper.rn`).

## Schritt 3a: Lokal auf iOS-Simulator

```bash
npx expo run:ios
```

Beim ersten Start lädt die App das Whisper-Modell `tiny` (~39 MB) nach
`FileSystem.documentDirectory/whisper-models/`. Das kann 30-60 s dauern.

## Schritt 3b: Lokal auf echtem iPhone (per Kabel)

```bash
npx expo run:ios --device
```

Apple verlangt:
- Ein Apple-ID (Free Provisioning reicht für 7 Tage Testbuild)
- In Xcode: Signing-Team auswählen (öffne `ios/Reineke-Protokoll.xcworkspace`)

## Schritt 3c: Lokal auf Android-Emulator/Gerät

```bash
# Emulator muss laufen ODER Gerät per USB angeschlossen sein
npx expo run:android
```

## Schritt 4: EAS-Build (empfohlen für echte Geräte)

```bash
cd packages/mobile

# Einmalig:
eas login
eas build:configure   # falls eas.json noch nicht initialisiert

# iOS-Dev-Client (für Internal Test, ohne App Store)
eas build --profile development --platform ios

# Android-Dev-Client (APK zum direkten Installieren)
eas build --profile development --platform android
```

EAS gibt dir am Ende einen Download-Link bzw. einen QR-Code. iPhone-Build
braucht ein Apple-Developer-Account ($99/Jahr) — für reines Sideloading
auf eigene Geräte reicht ein Free Account, aber EAS bevorzugt ein bezahltes.

**Android-Tipp:** Profil `preview` baut eine APK, die du einfach per
WhatsApp / E-Mail aufs Handy schickst und dort öffnest (vorher unter
*Einstellungen → Sicherheit → Unbekannte Apps* erlauben).

## Schritt 5: API-Key hinterlegen

In der App: *Einstellungen* → Claude- oder OpenAI-API-Key eintippen → speichern.
Der Key wird in `expo-secure-store` abgelegt (iOS-Keychain bzw.
Android-EncryptedSharedPreferences).

## Schritt 6: Aufnehmen!

*Aufnahme starten* → Mikrofon-Permission erlauben → sprechen.
Beim Stopp landest du in der Meeting-Detail-Ansicht; Button
*„Protokoll erzeugen"* ruft die KI auf und persistiert das Markdown-Protokoll.

## Whisper-Modell wechseln

Der Default ist `tiny` (~39 MB, schnell, brauchbar). Für höhere Qualität:
in `packages/mobile/app/record.tsx` die Konstante `DEFAULT_MODEL` auf
`base` (~74 MB) oder `small` (~244 MB) umstellen und App neu builden.
Geräte ab iPhone 13 / Pixel 7 verkraften `base` ohne Probleme.

## Bekannte Einschränkungen

- **Hintergrund-Aufnahme** ist in `app.json` via `UIBackgroundModes: audio`
  freigeschaltet, aber nicht ausgiebig getestet — bei langen Calls mit
  gesperrtem Bildschirm bitte aufmerksam beobachten.
- **`whisper.rn`** läuft nur auf realen Geräten / Simulatoren mit
  ARM64-Architektur. Auf x86-Android-Emulatoren kann es zu Crashes kommen.
- **iOS-Permissions** für „Mikrofon im Hintergrund" müssen ggf. unter
  *Einstellungen → Reineke-Protokoll* manuell erteilt werden.
- **Cloud-Sync** ist nicht implementiert — Meetings + Protokolle bleiben
  auf dem Gerät.

## Troubleshooting

| Problem                                              | Lösung                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `expo prebuild` schlägt mit Symlink-Fehler fehl      | `rm -rf node_modules ios android && npm install && npx expo prebuild --clean` |
| iOS-Build hängt bei „Installing pods"                | `cd ios && pod install --repo-update`                               |
| Android-Build: „NDK not found"                       | Android Studio → SDK Manager → NDK (Side by side) installieren      |
| Whisper hängt nach 5-10 s ohne Transkript            | Modell-Datei korrupt → App-Daten löschen, neu starten               |
| `@reineke/shared` nicht gefunden                     | `cd packages/mobile && rm -rf node_modules && npm install`         |
