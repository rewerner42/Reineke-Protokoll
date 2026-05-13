import Database from 'better-sqlite3';
import type { DatabaseAdapter, PreparedStatement, RunResult } from '@reineke/shared';

export class BetterSqliteAdapter implements DatabaseAdapter {
  private readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare<T = unknown>(sql: string): PreparedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      run(...params: unknown[]): RunResult {
        const r = stmt.run(...(params as never[]));
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
      },
      get(...params: unknown[]): T | undefined {
        return stmt.get(...(params as never[])) as T | undefined;
      },
      all(...params: unknown[]): T[] {
        return stmt.all(...(params as never[])) as T[];
      },
    };
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
