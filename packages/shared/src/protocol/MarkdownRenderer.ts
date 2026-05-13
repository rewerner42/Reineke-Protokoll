import type { Meeting } from '../models/Meeting.js';
import type { Participant } from '../models/Participant.js';
import type { ToDo } from '../models/ToDo.js';
import { formatGermanDate, formatDuration } from '../utils/date.js';

export interface RenderableProtocol {
  summary: string;
  participants: Array<Pick<Participant, 'name' | 'role'>>;
  todos: Array<Pick<ToDo, 'description' | 'owner' | 'deadline'>>;
  decisions: string[];
  discussionPoints: string[];
}

function escapeCell(value: string | null | undefined): string {
  if (!value) return '–';
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim() || '–';
}

export function renderProtocolMarkdown(
  protocol: RenderableProtocol,
  meeting: Pick<Meeting, 'title' | 'startedAt' | 'endedAt'>,
): string {
  const lines: string[] = [];
  lines.push(`# Protokoll: ${meeting.title}`);
  lines.push('');
  lines.push(`**Datum:** ${formatGermanDate(meeting.startedAt)}  `);
  lines.push(`**Dauer:** ${formatDuration(meeting.startedAt, meeting.endedAt)}`);
  lines.push('');

  lines.push('## Zusammenfassung');
  lines.push('');
  lines.push(protocol.summary.trim() || '_Keine Zusammenfassung verfügbar._');
  lines.push('');

  lines.push('## Teilnehmer');
  lines.push('');
  if (protocol.participants.length === 0) {
    lines.push('_Keine Teilnehmer erkannt._');
  } else {
    for (const p of protocol.participants) {
      lines.push(`- ${p.name}${p.role ? ` _(${p.role})_` : ''}`);
    }
  }
  lines.push('');

  lines.push('## To-Dos');
  lines.push('');
  if (protocol.todos.length === 0) {
    lines.push('_Keine To-Dos identifiziert._');
  } else {
    lines.push('| Aufgabe | Verantwortlich | Deadline |');
    lines.push('|---------|----------------|----------|');
    for (const t of protocol.todos) {
      lines.push(`| ${escapeCell(t.description)} | ${escapeCell(t.owner)} | ${escapeCell(t.deadline)} |`);
    }
  }
  lines.push('');

  lines.push('## Entscheidungen');
  lines.push('');
  if (protocol.decisions.length === 0) {
    lines.push('_Keine expliziten Entscheidungen festgehalten._');
  } else {
    for (const d of protocol.decisions) {
      lines.push(`- ${d.trim()}`);
    }
  }
  lines.push('');

  lines.push('## Diskussionspunkte');
  lines.push('');
  if (protocol.discussionPoints.length === 0) {
    lines.push('_Keine weiteren Diskussionspunkte._');
  } else {
    for (const d of protocol.discussionPoints) {
      lines.push(`- ${d.trim()}`);
    }
  }

  return lines.join('\n') + '\n';
}
