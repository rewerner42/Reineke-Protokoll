import type { DatabaseAdapter } from './DatabaseAdapter.js';
import { nowIso } from '../utils/date.js';
import { migration001 } from './migrations/embedded.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: migration001 },
];

export function runMigrations(db: DatabaseAdapter): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = db
    .prepare<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')
    .all();
  const appliedVersions = new Set(applied.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        nowIso(),
      );
    });
  }
}
