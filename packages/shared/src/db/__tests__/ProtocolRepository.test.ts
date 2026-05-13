import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BetterSqliteTestAdapter } from '../../__tests__/testAdapter.js';
import { runMigrations } from '../migrations.js';
import { MeetingRepository } from '../repositories/MeetingRepository.js';
import { ProtocolRepository } from '../repositories/ProtocolRepository.js';

describe('ProtocolRepository', () => {
  let db: BetterSqliteTestAdapter;
  let meetings: MeetingRepository;
  let protocols: ProtocolRepository;
  let meetingId: string;

  beforeEach(() => {
    db = new BetterSqliteTestAdapter();
    runMigrations(db);
    meetings = new MeetingRepository(db);
    protocols = new ProtocolRepository(db);
    meetingId = meetings.create({ title: 'Strategie-Meeting' }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('speichert ein Protokoll mit Teilnehmern und To-Dos', () => {
    const protocol = protocols.save({
      meetingId,
      summary: 'Wir haben über die Roadmap gesprochen.',
      participants: [
        { name: 'Alice', role: 'PM' },
        { name: 'Bob', role: null },
      ],
      todos: [
        { description: 'Mockups erstellen', owner: 'Bob', deadline: '2026-06-01' },
        { description: 'Budget freigeben', owner: 'Alice', deadline: null },
      ],
      decisions: ['Mit Phase 1 starten'],
      discussionPoints: ['Marketing-Budget'],
      markdown: '# Protokoll',
      llmProvider: 'claude',
      llmModel: 'claude-sonnet-4-5-20250929',
    });

    expect(protocol.participants).toHaveLength(2);
    expect(protocol.todos).toHaveLength(2);
    expect(protocol.summary).toContain('Roadmap');

    const fetched = protocols.getByMeetingId(meetingId);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(protocol.id);
    expect(fetched?.decisions).toEqual(['Mit Phase 1 starten']);
    expect(fetched?.discussionPoints).toEqual(['Marketing-Budget']);
    expect(fetched?.todos.map((t) => t.description).sort()).toEqual([
      'Budget freigeben',
      'Mockups erstellen',
    ]);
  });

  it('ersetzt ein bestehendes Protokoll beim erneuten Save', () => {
    protocols.save({
      meetingId,
      summary: 'Erste Version',
      participants: [{ name: 'Alice', role: null }],
      todos: [],
      decisions: [],
      discussionPoints: [],
      markdown: 'v1',
      llmProvider: 'claude',
      llmModel: 'claude-sonnet-4-5-20250929',
    });
    protocols.save({
      meetingId,
      summary: 'Zweite Version',
      participants: [{ name: 'Bob', role: 'Dev' }],
      todos: [{ description: 'Refactoring', owner: 'Bob', deadline: null }],
      decisions: [],
      discussionPoints: [],
      markdown: 'v2',
      llmProvider: 'openai',
      llmModel: 'gpt-4o-2024-11-20',
    });

    const current = protocols.getByMeetingId(meetingId);
    expect(current?.summary).toBe('Zweite Version');
    expect(current?.markdown).toBe('v2');
    expect(current?.llmProvider).toBe('openai');
    expect(current?.participants).toHaveLength(1);
    expect(current?.todos).toHaveLength(1);
  });

  it('updateMarkdown setzt editedAt', () => {
    const p = protocols.save({
      meetingId,
      summary: 'x',
      participants: [],
      todos: [],
      decisions: [],
      discussionPoints: [],
      markdown: 'alt',
      llmProvider: 'claude',
      llmModel: 'claude-sonnet-4-5-20250929',
    });
    expect(p.editedAt).toBeNull();
    protocols.updateMarkdown(p.id, 'neu');
    const fetched = protocols.getByMeetingId(meetingId);
    expect(fetched?.markdown).toBe('neu');
    expect(fetched?.editedAt).not.toBeNull();
  });

  it('setTodoDone togglt den done-Status', () => {
    const p = protocols.save({
      meetingId,
      summary: 'x',
      participants: [],
      todos: [{ description: 'Aufgabe', owner: null, deadline: null }],
      decisions: [],
      discussionPoints: [],
      markdown: '',
      llmProvider: 'claude',
      llmModel: 'claude-sonnet-4-5-20250929',
    });
    const todoId = p.todos[0]!.id;
    protocols.setTodoDone(todoId, true);
    expect(protocols.getByMeetingId(meetingId)?.todos[0]?.done).toBe(true);
    protocols.setTodoDone(todoId, false);
    expect(protocols.getByMeetingId(meetingId)?.todos[0]?.done).toBe(false);
  });
});
