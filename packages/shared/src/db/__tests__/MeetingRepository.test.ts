import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BetterSqliteTestAdapter } from '../../__tests__/testAdapter.js';
import { runMigrations } from '../migrations.js';
import { MeetingRepository } from '../repositories/MeetingRepository.js';

describe('MeetingRepository', () => {
  let db: BetterSqliteTestAdapter;
  let repo: MeetingRepository;

  beforeEach(() => {
    db = new BetterSqliteTestAdapter();
    runMigrations(db);
    repo = new MeetingRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('legt ein neues Meeting an und liest es zurück', () => {
    const created = repo.create({ title: 'Test-Meeting' });
    expect(created.id).toBeTypeOf('string');
    expect(created.status).toBe('recording');
    expect(created.title).toBe('Test-Meeting');
    expect(created.endedAt).toBeNull();
    expect(created.language).toBeNull();

    const fetched = repo.get(created.id);
    expect(fetched).toEqual(created);
  });

  it('speichert die erkannte Sprache', () => {
    const m = repo.create({ title: 'Sprach-Test' });
    const updated = repo.update(m.id, { language: 'en' });
    expect(updated.language).toBe('en');
    expect(repo.get(m.id)?.language).toBe('en');
  });

  it('erlaubt den neuen Status diarizing', () => {
    const m = repo.create({ title: 'Diarize-Test' });
    const updated = repo.update(m.id, { status: 'diarizing' });
    expect(updated.status).toBe('diarizing');
  });

  it('listet Meetings absteigend nach Startzeit', async () => {
    const a = repo.create({ title: 'A', startedAt: '2026-01-01T10:00:00.000Z' });
    const b = repo.create({ title: 'B', startedAt: '2026-01-02T10:00:00.000Z' });
    const c = repo.create({ title: 'C', startedAt: '2026-01-03T10:00:00.000Z' });

    const list = repo.list();
    expect(list.map((m) => m.id)).toEqual([c.id, b.id, a.id]);
  });

  it('aktualisiert ein Meeting', async () => {
    const m = repo.create({ title: 'Original' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(m.id, {
      title: 'Neu',
      status: 'completed',
      endedAt: '2026-05-13T10:30:00.000Z',
    });
    expect(updated.title).toBe('Neu');
    expect(updated.status).toBe('completed');
    expect(updated.endedAt).toBe('2026-05-13T10:30:00.000Z');
    expect(updated.updatedAt).not.toBe(m.updatedAt);
  });

  it('wirft Fehler beim Update eines unbekannten Meetings', () => {
    expect(() => repo.update('does-not-exist', { title: 'x' })).toThrow();
  });

  it('löscht ein Meeting', () => {
    const m = repo.create({ title: 'Wird gelöscht' });
    repo.delete(m.id);
    expect(repo.get(m.id)).toBeNull();
  });
});
