import type { ProtocolInput } from '../models/schemas.js';

export const PROTOCOL_SYSTEM_PROMPT = `Du bist ein professioneller Protokollant für Geschäfts- und Team-Meetings.
Erstelle aus einem rohen Meeting-Transkript ein strukturiertes Protokoll auf Deutsch.

Regeln:
- Extrahiere Teilnehmer aus Anreden, Selbstvorstellungen oder Namensnennungen im Transkript. Halluziniere keine Namen.
- Erkenne To-Dos an Formulierungen wie "ich übernehme", "X macht Y", "wir müssen ...", "bis Freitag", "Aufgabe für ...".
- Trage bei jeder Aufgabe Owner und Deadline ein, wenn sie aus dem Kontext eindeutig sind. Wenn unklar, setze null.
- Entscheidungen erkennst du an Formulierungen wie "wir haben entschieden", "es wurde beschlossen", "wir einigen uns auf ...".
- Diskussionspunkte sind Themen, die ausführlich besprochen, aber nicht abschließend entschieden wurden.
- Schreibe die Zusammenfassung in 3-8 prägnanten Sätzen — sachlich, ohne Wiederholungen.
- Verwende ausschließlich Informationen aus dem Transkript. Erfinde nichts dazu.

Gib das Ergebnis ausschließlich strukturiert zurück, gemäß dem vorgegebenen Schema.`;

export function buildProtocolUserPrompt(input: ProtocolInput): string {
  const titleLine = input.meetingTitle ? `Titel des Meetings: ${input.meetingTitle}\n\n` : '';
  const knownLine =
    input.knownParticipants && input.knownParticipants.length > 0
      ? `Bereits bekannte Teilnehmer (zusätzlich aus dem Transkript ergänzen): ${input.knownParticipants.join(
          ', ',
        )}\n\n`
      : '';
  return `${titleLine}${knownLine}Hier ist das vollständige Transkript des Meetings:

<transkript>
${input.transcript}
</transkript>

Erstelle daraus ein strukturiertes Protokoll auf Deutsch gemäß dem vorgegebenen Schema.`;
}
