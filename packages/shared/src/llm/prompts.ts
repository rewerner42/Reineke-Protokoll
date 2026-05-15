import type { ProtocolInput } from '../models/schemas.js';

export const PROTOCOL_SYSTEM_PROMPT_DE = `Du bist ein professioneller Protokollant für Geschäfts- und Team-Meetings.
Erstelle aus einem rohen Meeting-Transkript ein strukturiertes Protokoll auf Deutsch.

Regeln:
- Extrahiere Teilnehmer aus Anreden, Selbstvorstellungen oder Namensnennungen im Transkript. Halluziniere keine Namen.
- Wenn das Transkript Sprecher-Markierungen wie [Sprecher 1], [Anna] usw. enthält, nutze sie, um Aussagen korrekt zuzuordnen.
- Erkenne To-Dos an Formulierungen wie "ich übernehme", "X macht Y", "wir müssen ...", "bis Freitag", "Aufgabe für ...".
- Trage bei jeder Aufgabe Owner und Deadline ein, wenn sie aus dem Kontext eindeutig sind. Wenn unklar, setze null.
- Entscheidungen erkennst du an Formulierungen wie "wir haben entschieden", "es wurde beschlossen", "wir einigen uns auf ...".
- Diskussionspunkte sind Themen, die ausführlich besprochen, aber nicht abschließend entschieden wurden.
- Schreibe die Zusammenfassung in 3-8 prägnanten Sätzen — sachlich, ohne Wiederholungen.
- Verwende ausschließlich Informationen aus dem Transkript. Erfinde nichts dazu.

Gib das Ergebnis ausschließlich strukturiert zurück, gemäß dem vorgegebenen Schema.`;

export const PROTOCOL_SYSTEM_PROMPT_EN = `You are a professional meeting minutes writer for business and team meetings.
Given a raw meeting transcript, produce a structured protocol in English.

Rules:
- Extract participants from greetings, self-introductions, or names mentioned in the transcript. Do not invent names.
- If the transcript contains speaker markers like [Speaker 1], [Anna], etc., use them to attribute statements correctly.
- Detect to-dos from phrases like "I'll take care of", "X will do Y", "we need to ...", "by Friday", "task for ...".
- For each task, fill in owner and deadline if clearly inferable from context. Otherwise set null.
- Decisions are recognized by phrases like "we decided", "it was agreed", "we'll go with ...".
- Discussion points are topics that were discussed in depth without a final decision.
- Write the summary in 3-8 concise sentences — factual, no repetition.
- Use only information from the transcript. Do not add anything.

Return the result strictly in the structured format defined by the schema.`;

/** Kept for backward compatibility — defaults to the German prompt. */
export const PROTOCOL_SYSTEM_PROMPT = PROTOCOL_SYSTEM_PROMPT_DE;

export function systemPromptFor(language: 'de' | 'en'): string {
  return language === 'en' ? PROTOCOL_SYSTEM_PROMPT_EN : PROTOCOL_SYSTEM_PROMPT_DE;
}

export function buildProtocolUserPrompt(input: ProtocolInput): string {
  return input.language === 'en' ? buildEnglishUserPrompt(input) : buildGermanUserPrompt(input);
}

function buildGermanUserPrompt(input: ProtocolInput): string {
  const titleLine = input.meetingTitle ? `Titel des Meetings: ${input.meetingTitle}\n\n` : '';
  const knownLine =
    input.knownParticipants && input.knownParticipants.length > 0
      ? `Bereits bekannte Teilnehmer (zusätzlich aus dem Transkript ergänzen): ${input.knownParticipants.join(
          ', ',
        )}\n\n`
      : '';
  const speakerHint = input.speakerAnnotated
    ? 'Das Transkript enthält Sprecher-Markierungen in eckigen Klammern. Nutze sie, um Aussagen, To-Dos und Entscheidungen den richtigen Personen zuzuordnen.\n\n'
    : '';
  return `${titleLine}${knownLine}${speakerHint}Hier ist das vollständige Transkript des Meetings:

<transkript>
${input.transcript}
</transkript>

Erstelle daraus ein strukturiertes Protokoll auf Deutsch gemäß dem vorgegebenen Schema.`;
}

function buildEnglishUserPrompt(input: ProtocolInput): string {
  const titleLine = input.meetingTitle ? `Meeting title: ${input.meetingTitle}\n\n` : '';
  const knownLine =
    input.knownParticipants && input.knownParticipants.length > 0
      ? `Known participants (extend from the transcript if needed): ${input.knownParticipants.join(
          ', ',
        )}\n\n`
      : '';
  const speakerHint = input.speakerAnnotated
    ? 'The transcript contains speaker markers in square brackets. Use them to attribute statements, to-dos, and decisions to the right people.\n\n'
    : '';
  return `${titleLine}${knownLine}${speakerHint}Here is the full meeting transcript:

<transcript>
${input.transcript}
</transcript>

Produce a structured protocol in English following the provided schema.`;
}
