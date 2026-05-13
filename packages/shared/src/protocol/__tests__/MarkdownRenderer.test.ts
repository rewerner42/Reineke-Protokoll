import { describe, expect, it } from 'vitest';
import { renderProtocolMarkdown } from '../MarkdownRenderer.js';

const meeting = {
  title: 'Strategie-Workshop',
  startedAt: '2026-05-13T09:00:00.000Z',
  endedAt: '2026-05-13T10:30:00.000Z',
};

describe('renderProtocolMarkdown', () => {
  it('rendert ein vollständiges Protokoll mit allen Sektionen', () => {
    const md = renderProtocolMarkdown(
      {
        summary: 'Wir haben die Roadmap für Q3 abgestimmt und Verantwortlichkeiten verteilt.',
        participants: [
          { name: 'Alice Müller', role: 'Produkt' },
          { name: 'Bob Schmidt', role: null },
        ],
        todos: [
          { description: 'Spec finalisieren', owner: 'Alice Müller', deadline: '2026-06-01' },
          { description: 'Mockups bauen', owner: 'Bob Schmidt', deadline: null },
        ],
        decisions: ['Wir starten mit Modul A', 'Externer Designer wird beauftragt'],
        discussionPoints: ['Pricing-Modell für Enterprise', 'Onboarding-Flow'],
      },
      meeting,
    );

    expect(md).toContain('# Protokoll: Strategie-Workshop');
    expect(md).toContain('## Zusammenfassung');
    expect(md).toContain('## Teilnehmer');
    expect(md).toContain('## To-Dos');
    expect(md).toContain('## Entscheidungen');
    expect(md).toContain('## Diskussionspunkte');
    expect(md).toContain('Alice Müller');
    expect(md).toContain('| Spec finalisieren | Alice Müller | 2026-06-01 |');
    expect(md).toContain('| Mockups bauen | Bob Schmidt | – |');
    expect(md).toContain('- Wir starten mit Modul A');
  });

  it('zeigt Platzhalter für leere Sektionen', () => {
    const md = renderProtocolMarkdown(
      {
        summary: '',
        participants: [],
        todos: [],
        decisions: [],
        discussionPoints: [],
      },
      meeting,
    );

    expect(md).toContain('_Keine Zusammenfassung verfügbar._');
    expect(md).toContain('_Keine Teilnehmer erkannt._');
    expect(md).toContain('_Keine To-Dos identifiziert._');
    expect(md).toContain('_Keine expliziten Entscheidungen festgehalten._');
    expect(md).toContain('_Keine weiteren Diskussionspunkte._');
  });

  it('escaped Pipe-Zeichen in To-Do-Zellen', () => {
    const md = renderProtocolMarkdown(
      {
        summary: 'x',
        participants: [],
        todos: [{ description: 'A | B', owner: 'X', deadline: null }],
        decisions: [],
        discussionPoints: [],
      },
      meeting,
    );
    expect(md).toContain('| A \\| B | X | – |');
  });

  it('snapshot eines kompletten Protokolls bleibt stabil', () => {
    const md = renderProtocolMarkdown(
      {
        summary: 'Kurze Zusammenfassung.',
        participants: [{ name: 'Alice', role: 'PM' }],
        todos: [{ description: 'Task', owner: 'Alice', deadline: '2026-06-01' }],
        decisions: ['Entscheidung X'],
        discussionPoints: ['Punkt Y'],
      },
      meeting,
    );
    expect(md).toMatchSnapshot();
  });
});
