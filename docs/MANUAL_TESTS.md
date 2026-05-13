# Manuelle Test-Checkliste

Diese Liste ergänzt die automatisierten Tests. Sie muss vor jedem Release
manuell durchlaufen werden.

## Desktop

### Aufnahme & Transkription
- [ ] App startet ohne Konsolenfehler (`pnpm dev:desktop`)
- [ ] Beim ersten Start: Mikrofon-Permission wird abgefragt
- [ ] AudioLevelMeter reagiert beim Sprechen
- [ ] Timer läuft sichtbar weiter
- [ ] Live-Transkript erscheint < 8 s nach den ersten Worten (deutsch)
- [ ] Vorläufige Segmente werden grau/italic dargestellt
- [ ] Finale Segmente werden in normaler Farbe dargestellt und ersetzen vorläufige korrekt
- [ ] Stop persistiert das Meeting (sichtbar in Meeting-Liste)
- [ ] Status wechselt von `recording` zu `completed`

### Persistenz
- [ ] Meeting-Liste sortiert absteigend nach Startzeit
- [ ] Detail-Seite zeigt alle finalen Segmente
- [ ] App-Neustart: Meetings, Settings, API-Keys sind alle vorhanden
- [ ] Löschen eines Meetings entfernt auch Transkript-Segmente und Protokoll (Cascade)

### Protokoll-Generierung
- [ ] „Protokoll erzeugen" mit Claude liefert Output < 30 s (bei ~10 min Transkript)
- [ ] Wechsel auf OpenAI → erneute Generierung liefert ähnliche Struktur
- [ ] Protokoll-Markdown enthält alle 5 Sektionen: Zusammenfassung, Teilnehmer, To-Dos, Entscheidungen, Diskussionspunkte
- [ ] Teilnehmer-Liste enthält keine erfundenen Namen
- [ ] To-Dos haben Owner und Deadline, wenn im Transkript erkennbar; sonst leer
- [ ] Markdown-Editor: Inline-Edit + Save persistiert und setzt `editedAt`
- [ ] Checkbox-Toggle für To-Dos persistiert über App-Neustart
- [ ] Export öffnet System-Save-Dialog und schreibt eine valide `.md`-Datei

### Einstellungen
- [ ] LLM-Provider-Wechsel persistiert
- [ ] Whisper-Modellgröße kann geändert werden (Hinweis: Re-Download beim nächsten Start)
- [ ] API-Key-Eingabefeld zeigt Passwort-Maskierung
- [ ] Nach Speichern: Indikator „(✓ hinterlegt)" erscheint
- [ ] Key-Eingabe ist leer nach Speichern (kein Leak)
- [ ] Settings-JSON enthält **keine** API-Keys (manuell prüfen unter
      `~/.config/Reineke-Protokoll/settings.json`)

### Sicherheit
- [ ] Renderer kann **nicht** auf `require('keytar')` o.ä. zugreifen
- [ ] DevTools im Production-Build deaktiviert
- [ ] CSP-Verstoß: externe Scripts (`<script src="https://...">`) werden blockiert

## Mobile

(setzt voraus, dass `docs/MOBILE_SETUP.md` erfolgreich durchlaufen wurde)

- [ ] Audio-Permission wird abgefragt
- [ ] 5-minütige Aufnahme funktioniert ohne App-Crash
- [ ] Whisper-Transkription läuft, auch wenn der Bildschirm gesperrt ist
- [ ] API-Keys werden in `expo-secure-store` persistiert (kein Plaintext in
      AsyncStorage)
- [ ] Auf iOS-Simulator UND Android-Emulator getestet
- [ ] Share-Sheet öffnet sich beim Export

## Edge-Cases

- [ ] Aufnahme starten ohne Mikrofon → klare Fehlermeldung
- [ ] Protokoll-Generierung ohne API-Key → klare Fehlermeldung (kein Crash)
- [ ] Protokoll-Generierung bei leerem Transkript → klare Fehlermeldung
- [ ] LLM-API antwortet mit ungültigem Schema → `LLMProviderError` mit
      hilfreicher Beschreibung
- [ ] Sehr lange Aufnahme (> 2 h) → keine Memory-Probleme (Ring-Buffer hält nur 30 s)
- [ ] Whisper-Modell-Download bricht ab → Retry möglich

## Definition of Done

Eine Phase darf erst als abgeschlossen markiert werden, wenn:

1. Alle automatisierten Tests grün sind (`pnpm test`)
2. `pnpm typecheck` und `pnpm lint` ohne Fehler durchlaufen
3. Alle Punkte oben für diese Phase abgehakt sind
4. Branch ist gepusht (`claude/meeting-notes-ai-app-k03V6`)
