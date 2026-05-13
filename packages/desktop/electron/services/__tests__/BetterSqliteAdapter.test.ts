import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations, MeetingRepository } from '@reineke/shared';
import { BetterSqliteAdapter } from '../BetterSqliteAdapter.js';

describe('BetterSqliteAdapter (Integration)', () => {
  let adapter: BetterSqliteAdapter;

  beforeEach(() => {
    adapter = new BetterSqliteAdapter(':memory:');
    runMigrations(adapter);
  });

  afterEach(() => {
    adapter.close();
  });

  it('erlaubt CRUD-Operationen über die geteilten Repositories', () => {
    const meetings = new MeetingRepository(adapter);
    const m = meetings.create({ title: 'Integration-Test' });
    expect(meetings.get(m.id)?.title).toBe('Integration-Test');
  });

  it('aktiviert foreign_keys-Pragma', () => {
    const result = adapter.prepare<{ foreign_keys: number }>('PRAGMA foreign_keys').get();
    expect(result?.foreign_keys).toBe(1);
  });
});
