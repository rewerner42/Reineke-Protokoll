import * as SQLite from 'expo-sqlite';
import type { DatabaseAdapter, PreparedStatement, RunResult } from '@reineke/shared';

/**
 * SQLite-Adapter für Expo basierend auf expo-sqlite v15 (synchrone API).
 * Wird beim App-Start mit dem Pfad zur Datenbank instanziiert.
 */
export class ExpoSqliteAdapter implements DatabaseAdapter {
  private readonly db: SQLite.SQLiteDatabase;

  constructor(dbName = 'reineke.sqlite') {
    this.db = SQLite.openDatabaseSync(dbName);
    this.db.execSync('PRAGMA foreign_keys = ON');
  }

  exec(sql: string): void {
    this.db.execSync(sql);
  }

  prepare<T = unknown>(sql: string): PreparedStatement<T> {
    const stmt = this.db.prepareSync(sql);
    return {
      run(...params: unknown[]): RunResult {
        const r = stmt.executeSync(params as never[]);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowId };
      },
      get(...params: unknown[]): T | undefined {
        const r = stmt.executeSync(params as never[]);
        const rows = r.getAllSync() as T[];
        return rows[0];
      },
      all(...params: unknown[]): T[] {
        const r = stmt.executeSync(params as never[]);
        return r.getAllSync() as T[];
      },
    };
  }

  transaction<T>(fn: () => T): T {
    let result!: T;
    this.db.withTransactionSync(() => {
      result = fn();
    });
    return result;
  }

  close(): void {
    this.db.closeSync();
  }
}
